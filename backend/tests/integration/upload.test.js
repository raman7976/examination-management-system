// ═════════════════════════════════════════════════════════════════════════════
//  Integration — uploadController (/api/upload)
//
//  Course master (.xlsx), enrollment (.zip of .xlsx), course-instructor mapping
//  (.xlsx), mismatch view, and the public template. Every write resolves its
//  semester from an explicit period_id (body for POSTs, query for GETs), so the
//  non-destructive endpoints ride resolveActivePeriod's safe lane.
//
//  resetSemesterData HARD-RESETS the active period, so it runs ONLY inside
//  withActivePeriod(periodA) and is gated behind RUN_DESTRUCTIVE=1 (default off).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import { seedAdmin, seedUser, seedCourse, seedStudent, seedEnrollment, seedSlot } from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery, withActivePeriod } from '../helpers/periodFixture.js';
import { coursesXlsx, excelJsBuffer, enrollmentZip, instructorsXlsx } from '../helpers/xlsxBuilders.js';
import { testCourseCode, testEmail, studentRoll } from '../fixtures/constants.js';

let admin, periodA, periodB;

before(async () => {
    admin = await seedAdmin({ local: 'upload_admin' });
    periodA = await createTestPeriod({ label: 'uploadA' });
    periodB = await createTestPeriod({ label: 'uploadB' });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);
const pid = (id) => String(id);

// ── public template (no auth) ─────────────────────────────────────────────────
test('GET /course-instructor-template streams an .xlsx with no auth', async () => {
    const res = await request(app).get('/api/upload/course-instructor-template');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /spreadsheetml\.sheet/);
    assert.match(res.headers['content-disposition'], /attachment;.*\.xlsx/);
});

// ── course master upload ────────────────────────────────────────────────────
test('POST /courses upserts the course master into the period\'s semester', async () => {
    const c1 = testCourseCode('UP1');
    const buf = await coursesXlsx([
        { courseCode: c1, courseName: 'Upload One', shortName: 'U1', totalStudents: 10 },
    ]);

    const res = await request(app)
        .post('/api/upload/courses')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', buf, 'courses.xlsx');
    assert.equal(res.status, 200);
    assert.equal(res.body.courses_processed, 1);

    // It landed in period A's semester …
    const list = await request(app)
        .get(periodQuery('/api/upload/courses', periodA.id))
        .set('Authorization', auth());
    const row = list.body.courses.find((c) => c.course_code === c1);
    assert.ok(row, 'uploaded course is in the list');
    assert.equal(Number(row.total_students), 10);

    // Re-upload with a changed count → ON DUPLICATE KEY UPDATE overwrites.
    const buf2 = await coursesXlsx([
        { courseCode: c1, courseName: 'Upload One v2', shortName: 'U1', totalStudents: 99 },
    ]);
    const reup = await request(app)
        .post('/api/upload/courses')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', buf2, 'courses.xlsx');
    assert.equal(reup.status, 200);

    const list2 = await request(app)
        .get(periodQuery('/api/upload/courses', periodA.id))
        .set('Authorization', auth());
    const row2 = list2.body.courses.find((c) => c.course_code === c1);
    assert.equal(Number(row2.total_students), 99, 're-upload overwrote total_students');
});

test('POST /courses rejects non-xlsx, empty, and column-less files (400)', async () => {
    // wrong file type → multer fileFilter rejects
    const wrongType = await request(app)
        .post('/api/upload/courses')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', Buffer.from('not a spreadsheet'), 'notes.txt');
    assert.equal(wrongType.status, 400);
    assert.match(wrongType.body.message, /\.xlsx/i);

    // header row only (no data rows) → "empty or has no data rows"
    const emptyBuf = await coursesXlsx([]);
    const empty = await request(app)
        .post('/api/upload/courses')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', emptyBuf, 'courses.xlsx');
    assert.equal(empty.status, 400);

    // valid xlsx but missing required columns → "Required columns not found"
    const badCols = await excelJsBuffer(['Foo', 'Bar'], [['x', 'y']]);
    const missing = await request(app)
        .post('/api/upload/courses')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', badCols, 'courses.xlsx');
    assert.equal(missing.status, 400);
    assert.match(missing.body.message, /Required columns/i);
});

// ── enrollment upload ─────────────────────────────────────────────────────────
test('POST /enrollments parses the zip, inserts students+enrollments, ignores junk', async () => {
    // The course MUST exist in the period's semester before enrollments validate.
    const ce1 = testCourseCode('ENR1');
    await seedCourse({ semester_label: periodA.semester_label, code: ce1, name: 'Enrol One', total_students: 2 });

    const rows = [
        { roll: studentRoll(8101), email: testEmail('enr_s1'), courseName: ce1 },
        { roll: studentRoll(8102), email: testEmail('enr_s2'), courseName: ce1 },
    ];
    // withJunk injects __MACOSX/ and ._hidden entries that MUST be filtered out.
    const zip = enrollmentZip({ 'roster.xlsx': rows }, { withJunk: true });

    const res = await request(app)
        .post('/api/upload/enrollments')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', zip, 'enrollments.zip');

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.files_processed, 1, 'only the real .xlsx counted (junk filtered)');
    assert.equal(res.body.summary.students_inserted, 2);
    assert.equal(res.body.summary.enrollments_inserted, 2);
});

test('POST /enrollments skips a file whose course is not in the master (400 + warning)', async () => {
    const ghost = testCourseCode('ENR_GHOST'); // never inserted into courses
    const zip = enrollmentZip({
        'ghost.xlsx': [{ roll: studentRoll(8201), email: testEmail('enr_ghost'), courseName: ghost }],
    });

    const res = await request(app)
        .post('/api/upload/enrollments')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', zip, 'enrollments.zip');

    // The only file is invalid → no student data survives → 400 with a warning.
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.warnings));
    assert.ok(
        res.body.warnings.some((w) => w.includes(ghost) && /Course Master/i.test(w)),
        'warning names the unknown course',
    );
});

test('POST /enrollments rejects a non-zip file (400)', async () => {
    const res = await request(app)
        .post('/api/upload/enrollments')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', Buffer.from('PK-not-really'), 'enrollments.txt');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /\.zip/i);
});

// ── enrollment mismatch view ───────────────────────────────────────────────────
test('GET /enrollment-mismatches surfaces the expected-vs-actual gap', async () => {
    const mm = testCourseCode('MM1');
    await seedCourse({ semester_label: periodA.semester_label, code: mm, name: 'Mismatch One', total_students: 5 });
    // enroll only 2 of the expected 5
    for (const n of [9101, 9102]) {
        const roll = await seedStudent({ roll_number: studentRoll(n) });
        await seedEnrollment({ semester_label: periodA.semester_label, course_code: mm, roll_number: roll });
    }

    const res = await request(app)
        .get(periodQuery('/api/upload/enrollment-mismatches', periodA.id))
        .set('Authorization', auth());
    assert.equal(res.status, 200);
    const row = res.body.mismatches.find((m) => m.course_code === mm);
    assert.ok(row, 'mismatch row present');
    assert.equal(row.expected, 5);
    assert.equal(row.actual, 2);
    assert.equal(row.gap, 3);
});

// ── course-instructor mapping ───────────────────────────────────────────────────
test('POST /course-instructors links valid pairs and reports bad rows', async () => {
    const invig = await seedUser({ role: 'faculty', local: 'ci_invig' });
    const ciCourse = testCourseCode('CI1');
    await seedCourse({ semester_label: periodA.semester_label, code: ciCourse, name: 'CI Course', total_students: 0 });

    const buf = await instructorsXlsx([
        { courseCode: ciCourse, employeeId: invig.employee_id },          // valid
        { courseCode: testCourseCode('CI_GHOST'), employeeId: invig.employee_id }, // course missing
        { courseCode: ciCourse, employeeId: 'NOBODY-EMP' },               // invigilator missing
    ]);

    const res = await request(app)
        .post('/api/upload/course-instructors')
        .set('Authorization', auth())
        .field('period_id', pid(periodA.id))
        .attach('file', buf, 'instructors.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.inserted, 1, 'one valid pair linked');
    assert.equal(res.body.errors.length, 2, 'two rows flagged');

    // The link is visible on the course list as an instructor name.
    const list = await request(app)
        .get(periodQuery('/api/upload/courses', periodA.id))
        .set('Authorization', auth());
    const row = list.body.courses.find((c) => c.course_code === ciCourse);
    assert.ok(row && row.instructors && row.instructors.includes(invig.full_name), 'instructor linked to course');
});

// ── DESTRUCTIVE: resetSemesterData (gated + active-period sandboxed) ────────────
// Hard-resets the ACTIVE period's slots/scheduled/seating/assignments. Runs ONLY
// inside withActivePeriod(periodA) so the real active period is never touched, and
// only when RUN_DESTRUCTIVE=1 so a default test run never flips the active flag.
test('DELETE /reset wipes ONLY the active period, leaving others intact', { skip: !process.env.RUN_DESTRUCTIVE }, async () => {
    const slotA = await seedSlot({ period_id: periodA.id });
    const slotB = await seedSlot({ period_id: periodB.id });

    await withActivePeriod(periodA, async () => {
        const res = await request(app)
            .delete('/api/upload/reset') // no period_id → resolves the active period (A)
            .set('Authorization', auth());
        assert.equal(res.status, 200);
        assert.equal(res.body.exam_period_id, periodA.id);
    });

    const [aSlots] = await db.query(`SELECT id FROM exam_slots WHERE id = ?`, [slotA]);
    assert.equal(aSlots.length, 0, 'period A slot wiped');

    const [bSlots] = await db.query(`SELECT id FROM exam_slots WHERE id = ?`, [slotB]);
    assert.equal(bSlots.length, 1, 'period B slot survived');
});
