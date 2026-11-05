// ═════════════════════════════════════════════════════════════════════════════
//  Unfair-means (UFM) case register — examination department only.
//
//  Every endpoint is admin-only: invigilators hand over their report and the
//  exam department records it here. Invigilators have no access to the register.
//
//    GET    /session-students?slot_id=   students writing in a session + invigilators on duty
//    POST   /                            record a case
//    GET    /?q=&status=&period_id=      the register (default: active period; 'all' = every period)
//    GET    /:id                         one case, with its photo list
//    PUT    /:id                         edit the incident details (until the case is closed)
//    PUT    /:id/review                  set status + decision note
//    POST   /:id/photos                  upload evidence photos (multipart "photos", ≤ 5 per case)
//    GET    /:id/photos/:photoId         one photo (image bytes)
//    DELETE /:id/photos/:photoId         remove a photo (until the case is closed)
//
//  Student, course, room and seat are DERIVED on the server from the seating
//  plan (or, before seat numbers exist, from enrollments) — never trusted from
//  the client — and copied into the case so it survives later changes.
// ═════════════════════════════════════════════════════════════════════════════
import db from '../config/mysql.js';
import { resolveActivePeriod, loadPeriod } from '../utils/periodResolver.js';

const httpErr = (status, message) => Object.assign(new Error(message), { http: status });

export const CATEGORIES = [
    'chits_notes', 'electronic_device', 'copying_from_candidate', 'communication',
    'impersonation', 'writing_on_body_or_desk', 'misbehaviour', 'other',
];
export const ACTIONS = [
    'answer_book_seized_new_issued', 'answer_book_seized', 'warned_allowed_to_continue', 'sent_out_of_hall',
];
const STATUSES = ['reported', 'under_review', 'action_taken', 'dismissed'];
const FINAL_STATUSES = ['action_taken', 'dismissed'];

const DESCRIPTION_MIN = 10;
const TEXT_MAX = 2000;
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// "UFM-2026-0012" — year of recording + zero-padded id.
export function caseNumber(row) {
    const year = new Date(row.created_at).getFullYear();
    return `UFM-${year}-${String(row.id).padStart(4, '0')}`;
}

function shapeCase(row) {
    return {
        ...row,
        case_number:     caseNumber(row),
        material_seized: !!row.material_seized,
        photo_count:     row.photo_count != null ? Number(row.photo_count) : undefined,
        is_closed:       FINAL_STATUSES.includes(row.status),
    };
}

const CASE_SELECT = `
    SELECT c.*, (SELECT COUNT(*) FROM unfair_means_photos p WHERE p.case_id = c.id) AS photo_count
    FROM unfair_means_cases c`;

// Free-text search over the register. A case number ("UFM-2026-0012", "12")
// also matches by id.
function searchClause(q) {
    const text = String(q || '').trim();
    if (!text) return { sql: '', params: [] };
    const like = `%${text}%`;
    let sql = ` AND (c.roll_number LIKE ? OR c.student_name LIKE ? OR c.course_code LIKE ? OR c.course_name LIKE ?
                     OR c.room_name LIKE ? OR c.reported_by_name LIKE ?`;
    const params = [like, like, like, like, like, like];
    const idMatch = text.match(/^(?:ufm[-\s]?(?:\d{4}[-\s]?)?)?0*(\d+)$/i);
    if (idMatch) { sql += ' OR c.id = ?'; params.push(Number(idMatch[1])); }
    return { sql: `${sql})`, params };
}

function statusClause(status) {
    if (!status || status === 'all') return { sql: '', params: [] };
    if (!STATUSES.includes(status)) throw httpErr(400, `Unknown status: ${status}`);
    return { sql: ' AND c.status = ?', params: [status] };
}

const hhmm = (v) => (v == null || v === '' ? null : /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v : undefined);
const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);

// Validate the editable incident fields (shared by create + edit).
function readIncident(body) {
    const category = body.category;
    if (!CATEGORIES.includes(category)) throw httpErr(400, 'Choose a valid category.');
    const action_taken = body.action_taken;
    if (!ACTIONS.includes(action_taken)) throw httpErr(400, 'Choose the action taken in the hall.');
    const description = String(body.description || '').trim();
    if (description.length < DESCRIPTION_MIN)
        throw httpErr(400, `Describe what happened (at least ${DESCRIPTION_MIN} characters).`);
    if (description.length > TEXT_MAX) throw httpErr(400, `Description is limited to ${TEXT_MAX} characters.`);
    const incident_time = hhmm(body.incident_time);
    if (incident_time === undefined) throw httpErr(400, 'Incident time must be HH:MM.');
    const material_seized = body.material_seized ? 1 : 0;
    const material_description = material_seized ? trimOrNull(body.material_description) : null;
    if (material_description && material_description.length > 500)
        throw httpErr(400, 'Material description is limited to 500 characters.');
    const student_statement = trimOrNull(body.student_statement);
    if (student_statement && student_statement.length > TEXT_MAX)
        throw httpErr(400, `Student statement is limited to ${TEXT_MAX} characters.`);
    const reported_by = Number(body.reported_by_user_id) || null;
    if (!reported_by) throw httpErr(400, 'Choose the invigilator who reported the case.');
    const witness_user_id = body.witness_user_id ? Number(body.witness_user_id) : null;
    if (witness_user_id && witness_user_id === reported_by)
        throw httpErr(400, 'The witness must be someone other than the reporting invigilator.');
    return { category, action_taken, description, incident_time, material_seized, material_description, student_statement, reported_by, witness_user_id };
}

// Reporter / witness must be invigilators (any non-admin user).
async function invigilatorName(conn, userId, label) {
    if (!userId) return null;
    const [[u]] = await conn.query("SELECT full_name FROM users WHERE id = ? AND role != 'admin'", [userId]);
    if (!u) throw httpErr(400, `${label} must be a registered invigilator.`);
    return u.full_name;
}

async function loadSlot(conn, slotId, periodId) {
    const [[slot]] = await conn.query(
        'SELECT id, exam_date, start_time, end_time FROM exam_slots WHERE id = ? AND exam_period_id = ?',
        [slotId, periodId]
    );
    if (!slot) throw httpErr(404, 'Exam session not found in the active exam period.');
    return slot;
}

// Students writing in a session. Seat-level rows come from the seating plan;
// courses in the slot without a seating plan yet fall back to enrollments
// (room and seat unknown). Pass `rollNumber` to look up one student.
async function sessionStudents(conn, slotId, semesterLabel, rollNumber = null) {
    const rollSql = rollNumber ? ' AND isp.roll_number = ?' : '';
    const [seated] = await conn.query(
        `SELECT isp.roll_number, st.name AS student_name, st.section_name,
                se.course_code, c.course_name,
                sa.classroom_id, cl.room_name, isp.seat_number
         FROM individual_seating_plans isp
         JOIN seating_allocations sa ON isp.allocation_id = sa.id
         JOIN scheduled_exams se     ON sa.scheduled_exam_id = se.id
         JOIN classrooms cl          ON sa.classroom_id = cl.id
         JOIN students st            ON st.roll_number = isp.roll_number
         LEFT JOIN courses c         ON c.course_code = se.course_code AND c.semester_label = ?
         WHERE se.slot_id = ?${rollSql}
         ORDER BY cl.location_order, isp.roll_number`,
        rollNumber ? [semesterLabel, slotId, rollNumber] : [semesterLabel, slotId]
    );

    const seatedCourses = new Set(seated.map(r => r.course_code));
    const enrolRollSql = rollNumber ? ' AND ce.roll_number = ?' : '';
    const [enrolled] = await conn.query(
        `SELECT ce.roll_number, st.name AS student_name, st.section_name,
                se.course_code, c.course_name,
                NULL AS classroom_id, NULL AS room_name, NULL AS seat_number
         FROM scheduled_exams se
         JOIN course_enrollments ce ON ce.course_code = se.course_code AND ce.semester_label = ?
         JOIN students st           ON st.roll_number = ce.roll_number
         LEFT JOIN courses c        ON c.course_code = se.course_code AND c.semester_label = ?
         WHERE se.slot_id = ?${enrolRollSql}
         ORDER BY ce.roll_number`,
        rollNumber ? [semesterLabel, semesterLabel, slotId, rollNumber] : [semesterLabel, semesterLabel, slotId]
    );
    return [...seated, ...enrolled.filter(r => !seatedCourses.has(r.course_code))];
}

async function loadCase(conn, id, { lock = false } = {}) {
    const [[row]] = await conn.query(`SELECT * FROM unfair_means_cases WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!row) throw httpErr(404, 'Case not found.');
    return row;
}

async function listPhotos(conn, caseId) {
    const [rows] = await conn.query(
        `SELECT id, mime_type, size_bytes, width, height, original_name, caption, uploaded_by_name, created_at
         FROM unfair_means_photos WHERE case_id = ? ORDER BY id`,
        [caseId]
    );
    return rows;
}

const fail = (res, err, label) => {
    const status = err.http || 500;
    if (!err.http) console.error(`${label} error:`, err);
    res.status(status).json({ success: false, message: err.message || 'Request failed.' });
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /session-students?slot_id=
// ─────────────────────────────────────────────────────────────────────────────
export const getSessionStudents = async (req, res) => {
    try {
        const slotId = Number(req.query.slot_id);
        if (!slotId) throw httpErr(400, 'slot_id is required.');
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const period = await loadPeriod(null, periodId);
        await loadSlot(db, slotId, periodId);
        const students = await sessionStudents(db, slotId, period.semester_label);
        // Invigilators on duty in the session — the usual reporter / witness.
        const [onDuty] = await db.query(
            `SELECT u.id AS user_id, u.full_name, u.employee_id, cl.room_name
             FROM invigilator_assignments ia
             JOIN users u       ON u.id = ia.user_id
             JOIN classrooms cl ON cl.id = ia.classroom_id
             WHERE ia.slot_id = ? AND ia.exam_period_id = ?
             ORDER BY cl.location_order, u.full_name`,
            [slotId, periodId]
        );
        res.json({ success: true, seating_plan: students.some(s => s.seat_number), students, on_duty: onDuty });
    } catch (err) { fail(res, err, 'getSessionStudents'); }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /   body { slot_id, roll_number, course_code?, reported_by_user_id, witness_user_id?, …incident }
// ─────────────────────────────────────────────────────────────────────────────
export const createCase = async (req, res) => {
    const body = req.body || {};
    const conn = await db.getConnection();
    try {
        const slotId = Number(body.slot_id);
        const rollNumber = String(body.roll_number || '').trim();
        if (!slotId || !rollNumber) throw httpErr(400, 'slot_id and roll_number are required.');
        const incident = readIncident(body);

        const periodId = await resolveActivePeriod(conn, body.period_id);
        const period = await loadPeriod(conn, periodId);
        await conn.beginTransaction();

        const slot = await loadSlot(conn, slotId, periodId);
        const reporterName = await invigilatorName(conn, incident.reported_by, 'The reporting invigilator');
        const witnessName = await invigilatorName(conn, incident.witness_user_id, 'The witness');

        // Derive the student's course / room / seat from the session itself.
        const matches = await sessionStudents(conn, slotId, period.semester_label, rollNumber);
        if (matches.length === 0)
            throw httpErr(404, `Student ${rollNumber} is not writing an exam in this session.`);
        const student = (body.course_code && matches.find(m => m.course_code === body.course_code)) || matches[0];

        // One case per student per session. A plain read is enough for the
        // message: uq_ufm_slot_student settles any race (ER_DUP_ENTRY below).
        const [[existing]] = await conn.query(
            'SELECT id, created_at FROM unfair_means_cases WHERE slot_id = ? AND roll_number = ?',
            [slotId, rollNumber]
        );
        if (existing)
            throw httpErr(409, `This student already has a case for this session: ${caseNumber(existing)}.`);

        const [[recorder]] = await conn.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        const [ins] = await conn.query(
            `INSERT INTO unfair_means_cases
                (exam_period_id, semester_label, exam_type, slot_id, exam_date, start_time, end_time,
                 classroom_id, room_name, seat_number, roll_number, student_name, course_code, course_name,
                 category, incident_time, description, material_seized, material_description,
                 action_taken, student_statement, reported_by, reported_by_name, witness_user_id, witness_name,
                 recorded_by, recorded_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [periodId, period.semester_label, period.exam_type, slotId, slot.exam_date, slot.start_time, slot.end_time,
             student.classroom_id, student.room_name, student.seat_number, rollNumber, student.student_name,
             student.course_code, student.course_name,
             incident.category, incident.incident_time, incident.description, incident.material_seized,
             incident.material_description, incident.action_taken, incident.student_statement,
             incident.reported_by, reporterName, incident.witness_user_id, witnessName,
             req.user.id, recorder?.full_name || 'Examination department']
        );
        const [[row]] = await conn.query(`${CASE_SELECT} WHERE c.id = ?`, [ins.insertId]);
        await conn.commit();
        res.status(201).json({ success: true, case: { ...shapeCase(row), photos: [] } });
    } catch (err) {
        await conn.rollback().catch(() => {});
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ success: false, message: 'This student already has a case for this session.' });
        fail(res, err, 'createCase');
    } finally {
        conn.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /?q=&status=&period_id=   — period_id: omitted = active, 'all' = every period
// ─────────────────────────────────────────────────────────────────────────────
export const listCases = async (req, res) => {
    try {
        let periodSql = '';
        const periodParams = [];
        if (req.query.period_id !== 'all') {
            const periodId = await resolveActivePeriod(null, req.query.period_id);
            periodSql = ' AND c.exam_period_id = ?';
            periodParams.push(periodId);
        }
        const search = searchClause(req.query.q);
        const status = statusClause(req.query.status);
        const [rows] = await db.query(
            `${CASE_SELECT}
             WHERE 1 = 1${periodSql}${status.sql}${search.sql}
             ORDER BY (c.status = 'reported') DESC, c.created_at DESC, c.id DESC`,
            [...periodParams, ...status.params, ...search.params]
        );
        // Counts per status for the filter chips (same period + search, any status).
        const [countRows] = await db.query(
            `SELECT c.status, COUNT(*) AS n FROM unfair_means_cases c
             WHERE 1 = 1${periodSql}${search.sql}
             GROUP BY c.status`,
            [...periodParams, ...search.params]
        );
        const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
        for (const r of countRows) counts[r.status] = Number(r.n);
        res.json({ success: true, cases: rows.map(shapeCase), counts });
    } catch (err) { fail(res, err, 'listCases'); }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /:id
// ─────────────────────────────────────────────────────────────────────────────
export const getCase = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const [[row]] = await db.query(`${CASE_SELECT} WHERE c.id = ?`, [id]);
        if (!row) throw httpErr(404, 'Case not found.');
        res.json({ success: true, case: { ...shapeCase(row), photos: await listPhotos(db, id) } });
    } catch (err) { fail(res, err, 'getCase'); }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /:id — edit incident details (reporter, witness, …) until the case is
//  closed. Student and session are fixed: a wrong entry is dismissed and
//  recorded afresh, so the register keeps an honest history.
// ─────────────────────────────────────────────────────────────────────────────
export const updateCase = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const id = Number(req.params.id);
        const incident = readIncident(req.body || {});
        await conn.beginTransaction();
        const row = await loadCase(conn, id, { lock: true });
        if (FINAL_STATUSES.includes(row.status))
            throw httpErr(409, 'This case is closed. Re-open it (set it back to Under review) to edit the details.');

        const reporterName = await invigilatorName(conn, incident.reported_by, 'The reporting invigilator');
        const witnessName = await invigilatorName(conn, incident.witness_user_id, 'The witness');
        await conn.query(
            `UPDATE unfair_means_cases
             SET category = ?, incident_time = ?, description = ?, material_seized = ?, material_description = ?,
                 action_taken = ?, student_statement = ?, reported_by = ?, reported_by_name = ?,
                 witness_user_id = ?, witness_name = ?
             WHERE id = ?`,
            [incident.category, incident.incident_time, incident.description, incident.material_seized,
             incident.material_description, incident.action_taken, incident.student_statement,
             incident.reported_by, reporterName, incident.witness_user_id, witnessName, id]
        );
        const [[updated]] = await conn.query(`${CASE_SELECT} WHERE c.id = ?`, [id]);
        const photos = await listPhotos(conn, id);
        await conn.commit();
        res.json({ success: true, case: { ...shapeCase(updated), photos } });
    } catch (err) {
        await conn.rollback().catch(() => {});
        fail(res, err, 'updateCase');
    } finally {
        conn.release();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /:id/review — body { status, decision_note }
//  A final status (action taken / dismissed) needs a note and stamps who
//  decided and when; moving back to an open status clears the stamp.
// ─────────────────────────────────────────────────────────────────────────────
export const reviewCase = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const status = req.body?.status;
        if (!STATUSES.includes(status)) throw httpErr(400, 'Choose a valid status.');
        const note = trimOrNull(req.body?.decision_note);
        if (note && note.length > TEXT_MAX) throw httpErr(400, `Decision note is limited to ${TEXT_MAX} characters.`);
        const final = FINAL_STATUSES.includes(status);
        if (final && !note) throw httpErr(400, 'Record the decision (a short note) before closing the case.');

        const [result] = await db.query(
            `UPDATE unfair_means_cases
             SET status = ?, decision_note = ?, decided_by = ?, decided_at = ${final ? 'NOW()' : 'NULL'}
             WHERE id = ?`,
            [status, note, final ? req.user.id : null, id]
        );
        if (result.affectedRows === 0) throw httpErr(404, 'Case not found.');
        const [[row]] = await db.query(`${CASE_SELECT} WHERE c.id = ?`, [id]);
        res.json({ success: true, case: { ...shapeCase(row), photos: await listPhotos(db, id) } });
    } catch (err) { fail(res, err, 'reviewCase'); }
};

// ═════════════════════════════════════════════════════════════════════════════
//  Evidence photos
// ═════════════════════════════════════════════════════════════════════════════

// Trust the file's signature, not the client-declared type.
function sniffImage(buf) {
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
    return null;
}

const dimension = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 20000 ? Number(v) : null);

// POST /:id/photos — multipart field "photos" (1–5 files). Optional parallel
// body fields widths[] / heights[] / captions[] (one per file, same order).
export const uploadPhotos = async (req, res) => {
    const files = req.files || [];
    const conn = await db.getConnection();
    try {
        const id = Number(req.params.id);
        if (files.length === 0) throw httpErr(400, 'Choose at least one photo.');
        const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
        const widths = asArray(req.body?.widths), heights = asArray(req.body?.heights), captions = asArray(req.body?.captions);

        const typed = files.map((f) => {
            const mime = sniffImage(f.buffer);
            if (!mime) throw httpErr(400, `"${f.originalname}" is not a JPEG or PNG image.`);
            return { file: f, mime };
        });

        await conn.beginTransaction();
        const row = await loadCase(conn, id, { lock: true });
        if (FINAL_STATUSES.includes(row.status)) throw httpErr(409, 'This case is closed; its evidence can no longer change.');
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM unfair_means_photos WHERE case_id = ?', [id]);
        if (Number(n) + files.length > MAX_PHOTOS)
            throw httpErr(400, `A case can have at most ${MAX_PHOTOS} photos (it has ${n}).`);

        const [[uploader]] = await conn.query('SELECT full_name FROM users WHERE id = ?', [req.user.id]);
        for (const [i, { file, mime }] of typed.entries()) {
            await conn.query(
                `INSERT INTO unfair_means_photos
                    (case_id, mime_type, size_bytes, width, height, original_name, caption, data, uploaded_by, uploaded_by_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, mime, file.size, dimension(widths[i]), dimension(heights[i]),
                 String(file.originalname || '').slice(0, 255) || null,
                 trimOrNull(captions[i])?.slice(0, 255) || null,
                 file.buffer, req.user.id, uploader?.full_name || null]
            );
        }
        const photos = await listPhotos(conn, id);
        await conn.commit();
        res.status(201).json({ success: true, photos });
    } catch (err) {
        await conn.rollback().catch(() => {});
        fail(res, err, 'uploadPhotos');
    } finally {
        conn.release();
    }
};

// GET /:id/photos/:photoId — the image itself.
export const getPhoto = async (req, res) => {
    try {
        const [[photo]] = await db.query(
            'SELECT mime_type, data FROM unfair_means_photos WHERE id = ? AND case_id = ?',
            [Number(req.params.photoId), Number(req.params.id)]
        );
        if (!photo) throw httpErr(404, 'Photo not found.');
        res.set({
            'Content-Type': photo.mime_type,
            'Content-Length': photo.data.length,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(photo.data);
    } catch (err) { fail(res, err, 'getPhoto'); }
};

// DELETE /:id/photos/:photoId — only while the case is open.
export const deletePhoto = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const id = Number(req.params.id);
        await conn.beginTransaction();
        const row = await loadCase(conn, id, { lock: true });
        if (FINAL_STATUSES.includes(row.status)) throw httpErr(409, 'This case is closed; its evidence can no longer change.');
        const [result] = await conn.query('DELETE FROM unfair_means_photos WHERE id = ? AND case_id = ?', [Number(req.params.photoId), id]);
        if (result.affectedRows === 0) throw httpErr(404, 'Photo not found.');
        const photos = await listPhotos(conn, id);
        await conn.commit();
        res.json({ success: true, photos });
    } catch (err) {
        await conn.rollback().catch(() => {});
        fail(res, err, 'deletePhoto');
    } finally {
        conn.release();
    }
};
