import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import db from '../config/mysql.js';



function getCellValue(cell) {
    const val = cell?.value;
    if (val == null) return '';
    
    // If the cell contains an object, extract the actual text
    if (typeof val === 'object') {
        if (val.richText) {
            return val.richText.map(rt => rt.text).join(''); // Extract from Rich Text
        }
        if (val.text) {
            return val.text; // Extract from Hyperlink
        }
        if (val.result !== undefined) {
            return String(val.result); // Extract from Formula
        }
    }
    
    // Fallback for primitive types (strings, numbers)
    return String(val);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Converts to lowercase AND strips ALL spaces/underscores
//  'Course Name' / 'COURSENAME' / 'Course_Name' / 'course name' → 'coursename'
// ═════════════════════════════════════════════════════════════════════════════

function buildHeaderMap(worksheet) {
    const headerRow = worksheet.getRow(1);
    const map = {}; // fully-normalized header → column number

    headerRow.eachCell((cell, colNumber) => {
        const raw = String(cell.value ?? '')
            .toLowerCase()
            .replace(/[\s_]+/g, '');   // strip ALL whitespace and underscores
        if (raw) map[raw] = colNumber;
    });

    return map;
}

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/upload/courses
//  Accepts: .xlsx (multipart field "file")
//  Parses rows → upserts into `courses` table
// ═════════════════════════════════════════════════════════════════════════════

export const uploadCourses = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ success: false, message: 'No file uploaded. Use field name "file".' });

    try {
        // 1. Load workbook from buffer
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const worksheet = workbook.worksheets[0]; // First sheet
        if (!worksheet || worksheet.rowCount < 2)
            return res.status(400).json({ success: false, message: 'The Excel file is empty or has no data rows.' });

        // 2. Build case-insensitive header map
        const headers = buildHeaderMap(worksheet);

        const colCode       = headers['coursecode'];
        const colName       = headers['coursename'];
        const colShortName  = headers['shortname'];
        const colStudents   = headers['totalstudent'] || headers['totalstudents'];

        if (!colCode || !colName)
            return res.status(400).json({
                success: false,
                message: 'Required columns not found. Expected: "Course code", "Course Name". Found headers: ' +
                    Object.keys(headers).join(', '),
            });

        // 3. Parse rows (skip header row 1)
        const courses = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header

    // USE THE HELPER FUNCTION HERE
    const courseCode = getCellValue(row.getCell(colCode)).trim();
    const courseName = getCellValue(row.getCell(colName)).trim();

    if (!courseCode || !courseName) return; // skip empty rows

    const rawStudents = colStudents ? getCellValue(row.getCell(colStudents)).trim() : '0';
    const totalStudents = parseInt(rawStudents, 10) || 0;

    const shortName = colShortName ? getCellValue(row.getCell(colShortName)).trim() : null;

    courses.push({ courseCode, courseName, shortName, totalStudents });
        });

        if (courses.length === 0)
            return res.status(400).json({ success: false, message: 'No valid course rows found in the file.' });

        // 4. Upsert into DB — normalized schema (courses + course_instructors)
        //    Uses BATCHED bulk queries to minimize DB round-trips
        const BATCH_SIZE = 500;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            let upserted = 0;

            // ── Batch upsert courses ───────────────────────────────────────
            for (let i = 0; i < courses.length; i += BATCH_SIZE) {
                const batch = courses.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '(?, ?, ?, ?)').join(', ');
                const values = batch.flatMap(c => [c.courseCode, c.courseName, c.totalStudents, c.shortName]);

                await conn.query(
                    `INSERT INTO courses (course_code, course_name, total_students, short_name)
                     VALUES ${placeholders}
                     ON DUPLICATE KEY UPDATE
                         course_name    = VALUES(course_name),
                         total_students = VALUES(total_students),
                         short_name     = VALUES(short_name)`,
                    values
                );
                upserted += batch.length;
            }

            await conn.commit();

            res.status(200).json({
                success: true,
                message: `✅ Successfully processed ${upserted} courses.`,
                courses_processed: upserted,
            });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('uploadCourses error:', error);
        res.status(500).json({ success: false, message: 'Server error during course upload.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/upload/enrollments
//  Accepts: .zip (multipart field "file")
//  Extracts .xlsx files → inserts into `students` + `course_enrollments`
// ═════════════════════════════════════════════════════════════════════════════

export const uploadEnrollments = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ success: false, message: 'No file uploaded. Use field name "file".' });

    try {
        // 1. Extract zip in memory
        const zip = new AdmZip(req.file.buffer);
        const entries = zip.getEntries();

        console.log(`\n══════════════════════════════════════════`);
        console.log(`📦 ZIP received: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
        console.log(`   Total entries in zip: ${entries.length}`);

        // Filter: only .xlsx files, ignore __MACOSX and ._ hidden Mac files
        const xlsxEntries = entries.filter(entry => {
            const name = entry.entryName;
            if (entry.isDirectory) return false;
            if (name.includes('__MACOSX')) return false;
            if (name.split('/').pop().startsWith('._')) return false;
            return name.toLowerCase().endsWith('.xlsx');
        });

        console.log(`   Valid .xlsx files found: ${xlsxEntries.length}`);
        xlsxEntries.forEach(e => console.log(`     → ${e.entryName}`));

        if (xlsxEntries.length === 0)
            return res.status(400).json({
                success: false,
                message: 'No .xlsx files found in the zip archive (excluding __MACOSX and hidden files).',
            });

        // 1.5. Fetch existing courses for validation before parsing
        const [existingCoursesRows] = await db.query('SELECT course_code FROM courses');
        const existingCoursesSet = new Set(existingCoursesRows.map(row => row.course_code));

        // 2. Parse all xlsx files — collect students and enrollments
        const parseStart = Date.now();
        const studentsMap = new Map();   // roll_number → { name, email, branch, section }
        const enrollments = [];           // [{ roll_number, course_code }]
        const fileResults = [];           // per-file stats
        const parseWarnings = [];

        for (const entry of xlsxEntries) {
            const fileName = entry.entryName.split('/').pop();
            let rowCount = 0;

            console.log(`\n--- Processing file: ${fileName} ---`);

            try {
                const fileBuffer = entry.getData();
                console.log(`   Buffer size: ${fileBuffer.length} bytes`);

                // Use SheetJS (xlsx) — handles adm-zip buffers much better than ExcelJS
                const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

                if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                    console.log(`   ⚠️  No worksheets found in ${fileName}, skipping.`);
                    parseWarnings.push(`${fileName}: No worksheets found, skipped.`);
                    continue;
                }

                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                console.log(`   Worksheet: "${sheetName}" | Data rows: ${rows.length}`);

                if (rows.length === 0) {
                    console.log(`   ⚠️  No data rows in ${fileName}, skipping.`);
                    parseWarnings.push(`${fileName}: No data rows found, skipped.`);
                    continue;
                }

                // Build header map from the keys of the first row (normalized: lowercase, no spaces/underscores)
                const rawHeaders = Object.keys(rows[0]);
                const headerMap = {};  // normalizedKey → originalKey
                for (const h of rawHeaders) {
                    const normalized = h.toLowerCase().replace(/[\s_]+/g, '');
                    headerMap[normalized] = h;
                }
                console.log(`   🔑 Raw headers: [${rawHeaders.join(', ')}]`);
                console.log(`   🔑 Normalized:  [${Object.keys(headerMap).join(', ')}]`);

                // Flexible column resolution with fallback aliases
                const colRoll       = headerMap['rollnumber'] || headerMap['rollno'];
                const colName       = headerMap['studentname'] || headerMap['name'];
                const colEmail      = headerMap['emailid'] || headerMap['email'];
                const colBranch     = headerMap['branch'];
                const colSection    = headerMap['sectionname'] || headerMap['sec'];
                const colCourseType = headerMap['coursetype'];
                const colCourseName = headerMap['coursename'];

                console.log(`   📋 Column mapping → Roll: ${colRoll || '❌'}, Name: ${colName || '❌'}, Email: ${colEmail || '❌'}, Branch: ${colBranch || '❌'}, Section: ${colSection || '❌'}, CourseType: ${colCourseType || '❌'}, CourseName: ${colCourseName || '❌'}`);

                if (!colRoll || !colCourseName) {
                    const msg = `❌ Skipped ${fileName}: Missing required headers. Need 'rollnumber'/'rollno' (got: ${colRoll || 'MISSING'}) and 'coursename' (got: ${colCourseName || 'MISSING'}). Found: [${rawHeaders.join(', ')}]`;
                    console.log(`   ${msg}`);
                    parseWarnings.push(msg);
                    continue;
                }

                // Temporary storage for this file
                let fileIsValid = true;
                const tempStudentsMap = new Map();
                const tempEnrollments = [];

                // Parse data rows
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];

                    const rollNumber = String(row[colRoll] ?? '').trim();
                    if (!rollNumber) continue;

                    const studentName = colName      ? String(row[colName] ?? '').trim()      : '';
                    const email       = colEmail     ? String(row[colEmail] ?? '').trim()     : '';
                    const branch      = colBranch    ? String(row[colBranch] ?? '').trim()    : '';
                    const section     = colSection   ? String(row[colSection] ?? '').trim()   : '';

                    // Extract course_code from coursename (e.g., "CSE437-Compiler Design" → "CSE437")
                    const rawCourseName = String(row[colCourseName] ?? '').trim();
                    const courseCode = rawCourseName.split('-')[0].trim();

                    // Log the very first data row for debugging
                    if (i === 0) {
                        console.log(`   ✅ First row extracted: CourseCode: ${courseCode}, Roll: ${rollNumber}, Name: ${studentName}, Email: ${email}, Branch: ${branch}, Sec: ${section}, RawCourseName: ${rawCourseName}`);
                    }

                    if (!courseCode) continue;

                    // VALIDATION ENFORCEMENT: courseCode must exist in Course Master
                    if (!existingCoursesSet.has(courseCode)) {
                        const msg = `⚠️ Skipped ${fileName}: Course [${courseCode}] does not exist in the Course Master. Please upload the course first.`;
                        console.log(`   ${msg}`);
                        parseWarnings.push(msg);
                        fileIsValid = false;
                        break; // Stop parsing this file
                    }

                    // Collect student (deduplicate by roll_number into temp)
                    if (!tempStudentsMap.has(rollNumber)) {
                        tempStudentsMap.set(rollNumber, { name: studentName, email, branch, section });
                    }

                    // Collect enrollment
                    tempEnrollments.push({ roll_number: rollNumber, course_code: courseCode });
                }

                if (!fileIsValid) {
                    continue; // Skip the rest of the loop, discarding all temp storage for this file
                }

                // If file is valid, commit temp data to main collections
                for (const [roll, mData] of tempStudentsMap) {
                    if (!studentsMap.has(roll)) {
                        studentsMap.set(roll, mData);
                    }
                }
                enrollments.push(...tempEnrollments);
                rowCount = tempEnrollments.length;

                console.log(`   📊 ${fileName}: ${rowCount} data rows parsed.`);
                fileResults.push({ file: fileName, rows_parsed: rowCount });

            } catch (fileErr) {
                console.log(`   💥 Parse error in ${fileName}: ${fileErr.message}`);
                parseWarnings.push(`${fileName}: Parse error — ${fileErr.message}`);
            }
        }

        const parseEnd = Date.now();

        console.log(`\n══════════════════════════════════════════`);
        console.log(`📈 PARSING COMPLETE (${((parseEnd - parseStart) / 1000).toFixed(2)}s)`);
        console.log(`   Unique students collected: ${studentsMap.size}`);
        console.log(`   Total enrollment rows:     ${enrollments.length}`);
        console.log(`   Warnings:                  ${parseWarnings.length}`);
        if (parseWarnings.length > 0) parseWarnings.forEach(w => console.log(`     ⚠️  ${w}`));

        if (studentsMap.size === 0)
            return res.status(400).json({
                success: false,
                message: 'No valid student data found across all files.',
                warnings: parseWarnings,
            });

        // 3. Write to database in a transaction — BATCHED INSERTS for speed
        const BATCH_SIZE = 500;
        const dbStart = Date.now();
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // ── Batch insert students ──────────────────────────────────────
            let studentsInserted = 0;
            const studentRows = Array.from(studentsMap.entries()); // [[roll, {name,email,branch,section}], ...]

            for (let i = 0; i < studentRows.length; i += BATCH_SIZE) {
                const batch = studentRows.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
                const values = batch.flatMap(([rollNumber, data]) => [
                    rollNumber, data.name, data.email, data.branch, data.section
                ]);

                const [result] = await conn.query(
                    `INSERT IGNORE INTO students (roll_number, name, email, branch, section_name)
                     VALUES ${placeholders}`,
                    values
                );
                studentsInserted += result.affectedRows;
            }

            // ── Batch insert enrollments ───────────────────────────────────
            let enrollmentsInserted = 0;

            // Deduplicate enrollments in memory first (same roll+course can appear across files)
            const uniqueEnrollments = [];
            const enrollmentSet = new Set();
            for (const enr of enrollments) {
                const key = `${enr.roll_number}|${enr.course_code}`;
                if (!enrollmentSet.has(key)) {
                    enrollmentSet.add(key);
                    uniqueEnrollments.push(enr);
                }
            }

            for (let i = 0; i < uniqueEnrollments.length; i += BATCH_SIZE) {
                const batch = uniqueEnrollments.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '(?, ?)').join(', ');
                const values = batch.flatMap(enr => [enr.roll_number, enr.course_code]);

                const [result] = await conn.query(
                    `INSERT IGNORE INTO course_enrollments (roll_number, course_code)
                     VALUES ${placeholders}`,
                    values
                );
                enrollmentsInserted += result.affectedRows;
            }

            await conn.commit();

            // ── Validate: compare actual enrollment counts vs expected ──────
            const [mismatches] = await conn.query(`
                SELECT
                    c.course_code,
                    c.course_name,
                    c.total_students            AS expected,
                    COUNT(ce.roll_number)       AS actual,
                    (c.total_students - COUNT(ce.roll_number)) AS gap
                FROM courses c
                LEFT JOIN course_enrollments ce ON c.course_code = ce.course_code
                GROUP BY c.course_code, c.course_name, c.total_students
                HAVING COUNT(ce.roll_number) != c.total_students
                ORDER BY gap DESC
            `);

            const dbEnd = Date.now();
            const totalDuplicateEnrollments = enrollments.length - uniqueEnrollments.length;

            console.log(`\n✅ DATABASE WRITE COMPLETE (${((dbEnd - dbStart) / 1000).toFixed(2)}s)`);
            console.log(`   Students    → Inserted: ${studentsInserted}, Skipped (existing): ${studentRows.length - studentsInserted}`);
            console.log(`   Enrollments → Inserted: ${enrollmentsInserted}, Skipped (existing): ${uniqueEnrollments.length - enrollmentsInserted}, Deduped in-memory: ${totalDuplicateEnrollments}`);
            console.log(`   ⏱  Total time: Parse ${((parseEnd - parseStart) / 1000).toFixed(2)}s + DB ${((dbEnd - dbStart) / 1000).toFixed(2)}s = ${((dbEnd - parseStart) / 1000).toFixed(2)}s`);
            console.log(`══════════════════════════════════════════\n`);

            res.status(200).json({
                success: true,
                message: `✅ Enrollment data processed successfully.`,
                summary: {
                    files_processed:      xlsxEntries.length,
                    total_rows_parsed:    enrollments.length,
                    students_inserted:    studentsInserted,
                    students_skipped:     studentRows.length - studentsInserted,
                    enrollments_inserted: enrollmentsInserted,
                    enrollments_skipped:  uniqueEnrollments.length - enrollmentsInserted,
                },
                file_details: fileResults,
                warnings: parseWarnings,
                mismatches: mismatches.map(m => ({
                    course_code: m.course_code,
                    course_name: m.course_name,
                    expected:    Number(m.expected),
                    actual:      Number(m.actual),
                    gap:         Number(m.gap),
                })),
            });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('uploadEnrollments error:', error);
        res.status(500).json({ success: false, message: 'Server error during enrollment upload.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/upload/reset
//  Wipes ingested semester data (danger zone)
// ═════════════════════════════════════════════════════════════════════════════

export const resetSemesterData = async (req, res) => {
    let conn;
    try {
        conn = await db.getConnection();
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        console.log('⚠️ [DANGER] Wiping Semester Data: Started');

        // Execute in exact order specified
        const tablesToWipe = [
            'individual_seating_plans',
            'seating_allocations',
            'scheduled_exams',
            'course_enrollments',
            'course_instructors',
            'courses',
            'students'
        ];

        for (const table of tablesToWipe) {
            try {
                // Determine whether the table exists by attempting truncation
                await conn.query(`TRUNCATE TABLE \`${table}\``);
                console.log(`   ✅ Wiped table: ${table}`);
            } catch (err) {
                 // Table might not exist, but let's log the error.
                 console.log(`   ⚠️ Could not wipe ${table}: ${err.message}`);
            }
        }

        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('⚠️ [DANGER] Wiping Semester Data: Completed');

        return res.status(200).json({ success: true, message: 'All semester data has been completely wiped.' });

    } catch (error) {
        if (conn) {
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        }
        console.error('resetSemesterData error:', error);
        return res.status(500).json({ success: false, message: 'Server error during semester data reset.', error: error.message });
    } finally {
        if (conn) conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/upload/courses
//  Returns the course master list with optional search
// ═════════════════════════════════════════════════════════════════════════════

export const getCourseList = async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = `
            SELECT c.course_code, c.course_name, c.total_students, c.short_name,
                   GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructors
            FROM courses c
            LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
            LEFT JOIN users u ON ci.employee_id = u.employee_id
        `;
        const params = [];

        if (search) {
            query += ` WHERE c.course_code LIKE ? OR c.course_name LIKE ? OR c.short_name LIKE ?`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY c.course_code, c.course_name, c.total_students, c.short_name ORDER BY c.course_code ASC LIMIT 200`;

        const [rows] = await db.query(query, params);
        const [countRows] = await db.query('SELECT COUNT(*) as total FROM courses');

        res.json({ success: true, courses: rows, total: countRows[0].total });
    } catch (error) {
        console.error('getCourseList error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/upload/enrollments
//  Returns the enrollment list with optional search
// ═════════════════════════════════════════════════════════════════════════════

export const getEnrollmentList = async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = `
            SELECT s.roll_number, s.name, s.email, s.branch,
                   GROUP_CONCAT(ce.course_code SEPARATOR ', ') AS enrolled_courses
            FROM students s
            LEFT JOIN course_enrollments ce ON s.roll_number = ce.roll_number
        `;
        const params = [];

        if (search) {
            query += ` WHERE s.roll_number LIKE ? OR s.name LIKE ? OR s.branch LIKE ?`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` GROUP BY s.roll_number, s.name, s.email, s.branch ORDER BY s.roll_number ASC LIMIT 200`;

        const [rows] = await db.query(query, params);
        const [countRows] = await db.query('SELECT COUNT(*) as total FROM students');

        res.json({ success: true, students: rows, total: countRows[0].total });
    } catch (error) {
        console.error('getEnrollmentList error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch enrollments.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/upload/course-instructors
//  Accepts: .xlsx (multipart field "file")
//  Excel format: course_code | employee_id  (one row per pair)
// ═════════════════════════════════════════════════════════════════════════════

export const uploadCourseInstructors = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ success: false, message: 'No file uploaded. Use field name "file".' });

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet || worksheet.rowCount < 2)
            return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });

        const headers = buildHeaderMap(worksheet);
        const colCourse = headers['coursecode'];
        const colEmpId  = headers['employeeid'];

        if (!colCourse || !colEmpId)
            return res.status(400).json({
                success: false,
                message: 'Required columns not found. Expected: "course_code", "employee_id".',
            });

        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const courseCode = getCellValue(row.getCell(colCourse)).trim();
            const employeeId = getCellValue(row.getCell(colEmpId)).trim();
            if (courseCode && employeeId) rows.push({ courseCode, employeeId, rowNumber });
        });

        if (rows.length === 0)
            return res.status(400).json({ success: false, message: 'No valid data rows found.' });

        let inserted = 0, skipped = 0;
        const errors = [];

        const BATCH_SIZE = 500;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);

                for (const { courseCode, employeeId, rowNumber } of batch) {
                    // Look up course
                    const [courseRows] = await conn.query(
                        'SELECT course_code FROM courses WHERE course_code = ?', [courseCode]
                    );
                    if (courseRows.length === 0) {
                        errors.push({ row: rowNumber, course_code: courseCode, employee_id: employeeId, reason: 'Course not found' });
                        continue;
                    }

                    // Look up invigilator (non-admin user with this employee_id)
                    const [userRows] = await conn.query(
                        "SELECT id, full_name FROM users WHERE employee_id = ? AND role != 'admin'", [employeeId]
                    );
                    if (userRows.length === 0) {
                        errors.push({ row: rowNumber, course_code: courseCode, employee_id: employeeId, reason: 'Invigilator not found (check employee_id)' });
                        continue;
                    }

                    const user = userRows[0];
                    const [result] = await conn.query(
                        `INSERT INTO course_instructors (course_code, employee_id, instructor_name)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE employee_id = employee_id`,
                        [courseCode, employeeId, user.full_name]
                    );

                    if (result.affectedRows === 1) inserted++;
                    else skipped++;
                }
            }

            await conn.commit();
            res.status(200).json({ success: true, inserted, skipped, errors });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('uploadCourseInstructors error:', error);
        res.status(500).json({ success: false, message: 'Server error.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/upload/course-instructor-template  (public — no auth)
//  Streams a .xlsx template for course-instructor mapping
// ═════════════════════════════════════════════════════════════════════════════

export const downloadCourseInstructorTemplate = async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Course Instructor Mapping');

        sheet.columns = [
            { header: 'course_code', key: 'course_code', width: 20 },
            { header: 'employee_id', key: 'employee_id', width: 20 },
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.addRow({ course_code: 'CSE437', employee_id: 'EMP001' });
        sheet.addRow({ course_code: '(One row per instructor-course pair)', employee_id: '' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="course_instructor_template.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('downloadCourseInstructorTemplate error:', error);
        if (!res.headersSent)
            res.status(500).json({ success: false, message: 'Failed to generate template.' });
    }
};
