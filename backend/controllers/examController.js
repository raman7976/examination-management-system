import ExcelJS from 'exceljs';
import db from '../config/mysql.js';
import { runSeatingAlgorithm } from '../utils/seatingAlgorithm.js';

// ── Colour constants (ARGB) ────────────────────────────────────────────────────
const COLORS = {
    purple:      'FFD9D2E9',
    green:       'FFD9EAD3',
    yellow:      'FFFFF2CC',
    roomHeader:  'FFFCE5CD',
    courseCell:  'FFFFF2CC',
    mainHeader:  'FFEA9999',
    slotHeader:  'FF333333',
    keyRow:      'FFF0F0F0',
    border:      'FFBBBBBB',
};

const LANE_LABEL = { P: 'Purple', G: 'Green', Y: 'Yellow' };
const LANE_COLOR = { P: COLORS.purple, G: COLORS.green, Y: COLORS.yellow };
const FIXED_COLS = 4; // exam_id | course_name | instructor_name | total

// ═════════════════════════════════════════════════════════════════════════════
//  EXISTING PHASE 1 & 2 CONTROLLERS (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

export const addBatchExamSlots = async (req, res) => {
    const { slots } = req.body;
    if (!slots || !Array.isArray(slots) || slots.length === 0)
        return res.status(400).json({ message: 'No slots provided for generation.' });
    try {
        const values = slots.map(s => [s.date, s.day, s.startTime, s.endTime]);
        const [result] = await db.query(
            'INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time) VALUES ?',
            [values]
        );
        res.status(201).json({ message: `Successfully generated ${result.affectedRows} exam slots!` });
    } catch (error) {
        console.error('Batch insert error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const updateExamSlot = async (req, res) => {
    const { id } = req.params;
    const { exam_date, exam_day, start_time, end_time } = req.body;
    if (!exam_date || !exam_day || !start_time || !end_time)
        return res.status(400).json({ message: 'All fields are required (exam_date, exam_day, start_time, end_time).' });
    try {
        const [result] = await db.execute(
            'UPDATE exam_slots SET exam_date = ?, exam_day = ?, start_time = ?, end_time = ? WHERE id = ?',
            [exam_date, exam_day, start_time, end_time, id]
        );
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Slot not found.' });
        res.json({ message: 'Slot updated successfully.' });
    } catch (error) {
        console.error('Update slot error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const deleteExamSlot = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute('DELETE FROM exam_slots WHERE id = ?', [id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Slot not found.' });
        res.json({ message: 'Slot deleted successfully.' });
    } catch (error) {
        console.error('Delete slot error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const deleteAllExamSlots = async (req, res) => {
    try {
        const [result] = await db.execute('DELETE FROM exam_slots');
        res.json({ message: `All exam slots deleted (${result.affectedRows} removed).` });
    } catch (error) {
        console.error('Delete all slots error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const getAvailableSlots = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM exam_slots ORDER BY exam_date, start_time');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

export const scheduleBatchExams = async (req, res) => {
    const { courses } = req.body;
    if (!courses || !Array.isArray(courses) || courses.length === 0)
        return res.status(400).json({ message: 'No courses provided to schedule.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // ── HARD RESET: Wipe all previous course & seating data ──
        // Order matters: seating_allocations has FK → scheduled_exams
        const [deletedAllocations] = await conn.query('DELETE FROM seating_allocations');
        const [deletedCourses]     = await conn.query('DELETE FROM scheduled_exams');

        // ── Insert the fresh course data ──
        // New schema: scheduled_exams only stores (slot_id, course_code)
        const values = courses.map(c => [c.slotId, c.courseCode]);
        const [result] = await conn.query(
            'INSERT INTO scheduled_exams (slot_id, course_code) VALUES ?',
            [values]
        );

        await conn.commit();

        res.status(201).json({
            message: `Fresh start! Cleared ${deletedCourses.affectedRows} old courses & ${deletedAllocations.affectedRows} old allocations. Scheduled ${result.affectedRows} new courses.`,
            cleared: {
                old_courses:     deletedCourses.affectedRows,
                old_allocations: deletedAllocations.affectedRows,
            },
            new_courses: result.affectedRows,
        });
    } catch (error) {
        await conn.rollback();
        console.error('Batch schedule error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 3: CLASSROOMS
// ═════════════════════════════════════════════════════════════════════════════

export const getClassrooms = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM classrooms ORDER BY location_order');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

export const addClassroom = async (req, res) => {
    const { room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type } = req.body;
    if (!room_name) return res.status(400).json({ message: 'room_name is required.' });
    try {
        const [result] = await db.execute(
            `INSERT INTO classrooms (room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [room_name, cap_purple ?? 0, cap_green ?? 0, cap_yellow ?? 0,
             priority ?? 99, location_order ?? 999, type ?? 'main']
        );
        res.status(201).json({ id: result.insertId, message: 'Classroom added.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 4A: SEATING STATUS  –  GET /api/exams/seating-status
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a summary of every slot: how many courses, and whether a seating
 * plan has already been saved to the DB (i.e. the Excel has been reviewed &
 * uploaded).
 */
export const getSeatingStatus = async (req, res) => {
    try {
        // Auto-create seating_allocations if migration hasn't been run yet on the cloud DB
        
        const [rows] = await db.execute(`
            SELECT
                es.id                               AS slot_id,
                es.exam_date,
                es.exam_day,
                es.start_time,
                es.end_time,
                COUNT(DISTINCT se.id)               AS exam_count,
                COUNT(DISTINCT sa.id)               AS allocation_count
            FROM       exam_slots          es
            LEFT JOIN  scheduled_exams     se  ON se.slot_id            = es.id
            LEFT JOIN  seating_allocations sa  ON sa.scheduled_exam_id  = se.id
            GROUP BY   es.id
            ORDER BY   es.exam_date, es.start_time
        `);

        res.status(200).json(
            rows.map(r => ({
                ...r,
                has_seating:  Number(r.allocation_count) > 0,
                exam_count:   Number(r.exam_count),
                exam_date:    r.exam_date,
            }))
        );
    } catch (error) {
        console.error('getSeatingStatus error:', error.message);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 4B: GENERATE & EXPORT ALL SLOTS  –  POST /api/exams/generate-export
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Body:
 * {
 *   "slotRoomConfig": {          ← per-slot room selections (keyed by slot id)
 *     "1": [1, 2, 5, 9, 10],
 *     "2": [1, 2, 9, 10, 14, 15]
 *   },
 *   "defaultRoomIds": [1, 2, 9]  ← fallback used for any slot not in slotRoomConfig
 *                                   (optional; if omitted, ALL rooms are used as fallback)
 * }
 *
 * Runs the algorithm for EVERY slot that has at least one scheduled exam, then
 * streams back a single .xlsx workbook.  Nothing is written to the DB yet —
 * the Excel is the "draft" for human review.
 *
 * Excel structure per sheet:
 *   Row 1 – Slot metadata (merged, dark header)
 *   Row 2 – Room name headers (merged per room, colour-coded)
 *   Row 3 – KEY ROW  ← machine-readable, parsed on upload
 *            Format: "exam_id" | "course_name" | "instructor_name" | "total"
 *                    | "LH-1|P" | "LH-9|G" | "LH-9|Y" | ...
 *   Row 4 – Lane sub-headers (Purple / Green / Yellow)
 *   Row 5+ – Data rows (one per scheduled_exam)
 *
 * Sheet names use the format `slot_<id>` so the upload parser can identify them.
 */
export const generateAndExportAllSeating = async (req, res) => {
    try {
        const { slotRoomConfig = {}, defaultRoomIds } = req.body || {};

        // 1. Load ALL classrooms once (algorithm filters by enabled IDs per slot)
        const [allRooms] = await db.execute('SELECT * FROM classrooms ORDER BY location_order');
        if (!allRooms.length)
            return res.status(404).json({ message: 'No classrooms found.' });

        // Fallback room IDs: explicit defaultRoomIds → or every room in DB
        const fallbackIds = Array.isArray(defaultRoomIds) && defaultRoomIds.length > 0
            ? defaultRoomIds
            : allRooms.map(r => r.id);

        // 2. Load all slots that have at least one scheduled exam
        const [slots] = await db.execute(`
            SELECT es.*
            FROM   exam_slots es
            WHERE  EXISTS (SELECT 1 FROM scheduled_exams se WHERE se.slot_id = es.id)
            ORDER  BY es.exam_date, es.start_time
        `);

        if (!slots.length)
            return res.status(404).json({ message: 'No slots with scheduled exams found.' });


        // Load all scheduled exams with course data joined from courses table
        const [allCourses] = await db.execute(`
            SELECT se.id, se.slot_id, se.course_code,
                   c.course_name, c.total_students AS student_count,
                   GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructor_name
            FROM   scheduled_exams se
            JOIN   courses c ON se.course_code = c.course_code
            LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
            LEFT JOIN users u ON ci.user_id = u.id
            GROUP BY se.id
            ORDER BY c.total_students DESC
        `);

        const coursesBySlot = allCourses.reduce((acc, course) => {
            if (!acc[course.slot_id]) acc[course.slot_id] = [];
            acc[course.slot_id].push(course);
            return acc;
        }, {});




      /*

        // Validate: every slot with an explicit config must have ≥ 1 room
        for (const [slotId, ids] of Object.entries(slotRoomConfig)) {
            if (!Array.isArray(ids) || ids.length === 0)
                return res.status(400).json({
                    message: `slotRoomConfig for slot ${slotId} must be a non-empty array.`
                });
        }
    
    */

        // 3. Build workbook — each slot uses its own room list
        const workbook = new ExcelJS.Workbook();
        workbook.creator  = 'Exam Seating System';
        workbook.created  = new Date();
        const summaries   = [];

        for (const slot of slots) {
            const courses = coursesBySlot[slot.id] || [];
                /*await db.execute(
                'SELECT * FROM scheduled_exams WHERE slot_id = ? ORDER BY student_count DESC',
                [slot.id]*/
            
            if (!courses.length) continue;

            // Per-slot room IDs: use explicit config if provided, else fallback
            const enabledIds = slotRoomConfig[slot.id] ?? slotRoomConfig[String(slot.id)] ?? fallbackIds;

            const { allocations, summary } = runSeatingAlgorithm(allRooms, courses, enabledIds);
            summaries.push({ slot_id: slot.id, ...summary });

            _buildExcelSheet(workbook, slot, courses, allocations, allRooms, enabledIds);
        }

        if (!workbook.worksheets.length)
            return res.status(404).json({ message: 'No data to export.' });

        // 4. Stream response
        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition',
            `attachment; filename="seating_plan_${dateStr}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Export error:', error);
        // Can't send JSON if headers already sent, so just end
        if (!res.headersSent)
            res.status(500).json({ message: 'Export failed', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 4C: UPLOAD & SAVE  –  POST /api/exams/upload-seating
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Accepts the reviewed .xlsx file (multipart field name: "seatingFile").
 * Parses each `slot_<id>` sheet using the KEY ROW (row 3) as the column map,
 * then overwrites seating_allocations for all affected exams.
 */
export const uploadAndSaveSeating = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: 'No file uploaded. Use field name "seatingFile".' });

    try {
        // 1. Load classroom lookup  (room_name → id)
        const [classrooms] = await db.execute('SELECT id, room_name FROM classrooms');
        const roomLookup = Object.fromEntries(classrooms.map(c => [c.room_name, c.id]));

        // 2. Parse all sheets (synchronous pass – collect data first)
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const parsedAllocations = []; // [{scheduled_exam_id, classroom_id, lane, student_count, room_mode}]
        const affectedExamIds   = new Set();
        const parseErrors       = [];

        workbook.eachSheet(worksheet => {
            // Only process sheets whose name contains slot_<id>
            if (!/slot_\d+/.test(worksheet.name)) return;

            // ── Build column map from KEY ROW (row 3) ────────────────────────
            // Format: "LH-1|P", "LH-9|G", "LH-9|Y"
            const colMap = {}; // colNumber → { roomName, lane }
            const keyRow = worksheet.getRow(3);
            keyRow.eachCell((cell, colNumber) => {
                const val = String(cell.value ?? '').trim();
                if (val.includes('|')) {
                    const [roomName, lane] = val.split('|');
                    colMap[colNumber] = { roomName: roomName.trim(), lane: lane.trim() };
                }
            });

            if (Object.keys(colMap).length === 0) {
                parseErrors.push(`Sheet "${worksheet.name}": key row not found.`);
                return;
            }

            // ── Read data rows (row 5+) ───────────────────────────────────────
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber <= 4) return; // skip headers

                const rawId  = row.getCell(1).value;
                const examId = Number(rawId);
                if (!examId || isNaN(examId)) return;

                affectedExamIds.add(examId);

                Object.entries(colMap).forEach(([colStr, { roomName, lane }]) => {
                    const colNumber   = Number(colStr);
                    const rawCount    = row.getCell(colNumber).value;
                    const count       = Number(rawCount);
                    const classroomId = roomLookup[roomName];

                    if (!classroomId) {
                        parseErrors.push(`Unknown room "${roomName}" (exam ${examId})`);
                        return;
                    }
                    if (count > 0) {
                        parsedAllocations.push({
                            scheduled_exam_id: examId,
                            classroom_id:      classroomId,
                            lane,
                            student_count:     count,
                            room_mode:         lane === 'P' ? 'P' : 'S',
                        });
                    }
                });
            });
        });

        if (affectedExamIds.size === 0)
            return res.status(400).json({
                message: 'No valid data found. Ensure the file has sheets named "slot_<id>".',
                errors:  parseErrors,
            });

        // 3. Persist in a transaction — HARD RESET: wipe ALL old allocations
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // ── HARD RESET: Delete ALL previous seating allocations ──
            // Not just affected exams — wipe everything so no stale data remains
            const [deletedAllocations] = await conn.query('DELETE FROM seating_allocations');

            // Bulk insert new allocations
            if (parsedAllocations.length > 0) {
                const values = parsedAllocations.map(a => [
                    a.scheduled_exam_id,
                    a.classroom_id,
                    a.lane,
                    a.student_count,
                    a.room_mode,
                ]);
                await conn.query(
                    `INSERT INTO seating_allocations
                         (scheduled_exam_id, classroom_id, lane, student_count, room_mode)
                     VALUES ?`,
                    [values]
                );
            }

            await conn.commit();

            res.status(200).json({
                message:           'Fresh start! Seating plan saved successfully.',
                exams_processed:   affectedExamIds.size,
                allocations_saved: parsedAllocations.length,
                old_allocations_cleared: deletedAllocations.affectedRows,
                warnings:          parseErrors,
            });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Server Error during upload', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 4D: RETRIEVE SAVED SEATING  –  GET /api/exams/slots/:slotId/seating
// ═════════════════════════════════════════════════════════════════════════════

export const getSeatingPlan = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                 sa.id,
                 co.course_name,
                 GROUP_CONCAT(DISTINCT COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructor_name,
                 co.total_students,
                 cl.room_name,
                 sa.lane,
                 sa.student_count            AS seated,
                 sa.room_mode,
                 es.exam_date,
                 es.start_time,
                 es.end_time
             FROM   seating_allocations  sa
             JOIN   scheduled_exams      se ON sa.scheduled_exam_id = se.id
             JOIN   courses              co ON se.course_code       = co.course_code
             LEFT JOIN course_instructors ci ON co.course_code      = ci.course_code
             LEFT JOIN users             u  ON ci.user_id           = u.id
             JOIN   classrooms           cl ON sa.classroom_id      = cl.id
             JOIN   exam_slots           es ON se.slot_id           = es.id
             WHERE  se.slot_id = ?
             GROUP BY sa.id
             ORDER  BY cl.location_order, sa.lane, co.course_name`,
            [req.params.slotId]
        );
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PRIVATE: Excel sheet builder
// ═════════════════════════════════════════════════════════════════════════════

function _buildExcelSheet(workbook, slot, courses, allocations, allRooms, enabledRoomIds) {
    // Build a human-readable sheet name: "Mon 21-04 9:00-12:00 (slot_1)"
    const fmtSheetDate = (d) => {
        if (d instanceof Date) return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return String(d).slice(5, 10).split('-').reverse().join('-');
    };
    const fmtTime = (t) => String(t).slice(0, 5).replace(/:/g, '.'); // "09:00:00" → "09.00"
    const dayStr   = slot.exam_day ? `${slot.exam_day.slice(0,3)} ` : '';
    const dateStr  = fmtSheetDate(slot.exam_date);
    const timeStr  = `${fmtTime(slot.start_time)}-${fmtTime(slot.end_time)}`;
    // Excel sheet names max 31 chars; keep slot_id for upload parser
    let sheetName  = `${dayStr}${dateStr} ${timeStr} (slot_${slot.id})`;
    if (sheetName.length > 31) sheetName = `${dateStr} ${timeStr} (slot_${slot.id})`;
    const ws = workbook.addWorksheet(sheetName);

    // All enabled rooms for this slot, sorted by location_order.
    // We show ALL rooms whether or not the algorithm assigned students to them.
    const enabledSet = new Set(enabledRoomIds);
    const slotRooms  = allRooms
        .filter(r => enabledSet.has(r.id))
        .sort((a, b) => a.location_order - b.location_order);

    // Always 3 lanes per room: P, G, Y — value is 0 if nothing was assigned.
    // This gives the human reviewer full visibility over every cell.
    const colDefs = [];
    slotRooms.forEach(room => {
        colDefs.push({ room, lane: 'P' });
        colDefs.push({ room, lane: 'G' });
        colDefs.push({ room, lane: 'Y' });
    });

    const totalCols = FIXED_COLS + colDefs.length;
    const thinBorder = { style: 'thin', color: { argb: COLORS.border } };
    const allBorder  = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

    const applyBorder = (cell) => { cell.border = allBorder; };

    const fmtDate = (d) => {
        if (d instanceof Date) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        return String(d).slice(0, 10);
    };

    // ── ROW 1: Slot metadata ────────────────────────────────────────────────
    const examDay = slot.exam_day || '';
    ws.addRow([
        `Slot ${slot.id}  ·  ${fmtDate(slot.exam_date)}  ${examDay ? `(${examDay})  ·  ` : '·  '}` +
        `${slot.start_time} – ${slot.end_time}  ·  ${courses.length} courses  ·  ` +
        `${courses.reduce((s, c) => s + c.student_count, 0)} students`
    ]);
    ws.mergeCells(1, 1, 1, totalCols);
    const r1c1 = ws.getCell(1, 1);
    r1c1.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slotHeader } };
    r1c1.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    r1c1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    // ── ROW 2: Room name headers ─────────────────────────────────────────────
    ws.addRow(new Array(totalCols).fill(''));
    // Fixed-column labels
    ['#', 'Course Name', 'Instructor', 'Total'].forEach((label, i) => {
        const cell    = ws.getCell(2, i + 1);
        cell.value    = label;
        cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.mainHeader } };
        cell.font     = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        applyBorder(cell);
    });

    // Room headers — always 3 sub-cols (P|G|Y) per room, merged under room name
    let col = FIXED_COLS + 1;
    slotRooms.forEach(room => {
        const laneCols   = colDefs.filter(cd => cd.room.id === room.id);
        const endCol     = col + laneCols.length - 1;
        const totalSeats = `P:${room.cap_purple} G:${room.cap_green} Y:${room.cap_yellow}`;

        ws.getCell(2, col).value = `${room.room_name}\n(${totalSeats})`;
        if (laneCols.length > 1) ws.mergeCells(2, col, 2, endCol);

        for (let c = col; c <= endCol; c++) {
            const cell    = ws.getCell(2, c);
            cell.fill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.roomHeader } };
            cell.font     = { bold: true, size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            applyBorder(cell);
        }
        col += laneCols.length;
    });
    ws.getRow(2).height = 28;

    // ── ROW 3: KEY ROW (machine-readable column map) ─────────────────────────
    const keyValues = ['exam_id', 'course_name', 'instructor_name', 'total'];
    colDefs.forEach(cd => keyValues.push(`${cd.room.room_name}|${cd.lane}`));
    ws.addRow(keyValues);

    ws.getRow(3).eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.keyRow } };
        cell.font      = { color: { argb: 'FF999999' }, size: 8, italic: true };
        cell.alignment = { horizontal: 'center' };
        applyBorder(cell);
    });
    ws.getRow(3).height = 14;

    // ── ROW 4: Lane sub-headers ──────────────────────────────────────────────
    const subValues = ['', '', '', ''];
    colDefs.forEach(cd => subValues.push(LANE_LABEL[cd.lane]));
    ws.addRow(subValues);

    let subCol = FIXED_COLS + 1;
    colDefs.forEach(cd => {
        const cell     = ws.getCell(4, subCol);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LANE_COLOR[cd.lane] } };
        cell.font      = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        applyBorder(cell);
        subCol++;
    });
    ws.getRow(4).height = 16;

    // ── ROWS 5+: Data rows ────────────────────────────────────────────────────
    courses.forEach(course => {
        const rowValues = [
            course.id,
            course.course_name,
            course.instructor_name || '',
            course.student_count,
        ];

        colDefs.forEach(cd => {
            const alloc = allocations.find(
                a => a.scheduled_exam_id === course.id
                  && a.classroom_id      === cd.room.id
                  && a.lane              === cd.lane
            );
            rowValues.push(alloc ? alloc.student_count : 0);
        });

        ws.addRow(rowValues);
        const dataRowNum = ws.lastRow.number;
        ws.getRow(dataRowNum).height = 18;

        // Style fixed columns
        ws.getCell(dataRowNum, 1).alignment = { horizontal: 'center' };
        ws.getCell(dataRowNum, 2).fill  = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.courseCell }
        };
        ws.getCell(dataRowNum, 2).font  = { bold: true };
        ws.getCell(dataRowNum, 4).alignment = { horizontal: 'center' };

        // Style lane cells
        let dCol = FIXED_COLS + 1;
        colDefs.forEach(cd => {
            const cell  = ws.getCell(dataRowNum, dCol);
            const count = cell.value;
            cell.alignment = { horizontal: 'center' };
            if (count > 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LANE_COLOR[cd.lane] } };
                cell.font = { bold: true };
            }
            applyBorder(cell);
            dCol++;
        });

        // Borders on fixed columns
        [1, 2, 3, 4].forEach(c => applyBorder(ws.getCell(dataRowNum, c)));
    });

    // ── Column widths ──────────────────────────────────────────────────────────
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 26;
    ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 7;
    for (let c = FIXED_COLS + 1; c <= totalCols; c++) ws.getColumn(c).width = 9;

    // ── Freeze top 4 rows + left 4 columns ────────────────────────────────────
    ws.views = [{ state: 'frozen', xSplit: FIXED_COLS, ySplit: 4 }];
}

// ═════════════════════════════════════════════════════════════════════════════
//  PHASE 4E: PREVIEW SEATING FOR ONE SLOT  –  POST /api/exams/slots/:slotId/preview
//  Runs the algorithm for a single slot and returns per-room seat counts.
//  Nothing is written to the DB.
// ═════════════════════════════════════════════════════════════════════════════
export const previewSlotSeating = async (req, res) => {
    const slotId       = Number(req.params.slotId);
    const { enabledRoomIds } = req.body;

    if (!Array.isArray(enabledRoomIds) || enabledRoomIds.length === 0)
        return res.status(400).json({ message: 'enabledRoomIds must be a non-empty array.' });

    try {
        const [courses] = await db.execute(
            `SELECT se.id, se.slot_id, se.course_code,
                    c.course_name, c.total_students AS student_count,
                    GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructor_name
             FROM   scheduled_exams se
             JOIN   courses c ON se.course_code = c.course_code
             LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
             LEFT JOIN users u ON ci.user_id = u.id
             WHERE  se.slot_id = ?
             GROUP BY se.id
             ORDER BY c.total_students DESC`,
            [slotId]
        );
        if (!courses.length)
            return res.status(404).json({ message: 'No courses found for this slot.' });

        const ph = enabledRoomIds.map(() => '?').join(', ');
        const [rooms] = await db.query(
            `SELECT * FROM classrooms WHERE id IN (${ph})`, enabledRoomIds
        );

        const { allocations, summary } = runSeatingAlgorithm(rooms, courses, enabledRoomIds);

        // Build a per-room summary: { roomId -> { room_name, mode, green, yellow, purple, total } }
        const roomSummary = {};
        rooms.forEach(r => {
            roomSummary[r.id] = {
                classroom_id: r.id,
                room_name:    r.room_name,
                mode:         'P',
                green:        0,
                yellow:       0,
                purple:       0,
                total:        0,
            };
        });
        allocations.forEach(a => {
            const rs = roomSummary[a.classroom_id];
            if (!rs) return;
            rs.mode = a.room_mode;
            if (a.lane === 'G') rs.green  += a.student_count;
            if (a.lane === 'Y') rs.yellow += a.student_count;
            if (a.lane === 'P') rs.purple += a.student_count;
            rs.total += a.student_count;
        });

        res.status(200).json({
            slot_id:    slotId,
            summary,
            rooms:      Object.values(roomSummary),
            allocations,
        });

    } catch (error) {
        console.error('previewSlotSeating error:', error.message);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};