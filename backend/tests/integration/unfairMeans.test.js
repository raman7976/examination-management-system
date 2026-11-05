// ═════════════════════════════════════════════════════════════════════════════
//  Integration — unfair-means case register (/api/unfair-means), admin only.
//
//  One test period with a session holding two courses: COURSE_A has a seat-level
//  plan (individual_seating_plans), COURSE_B only has enrollments (no seats yet).
//  inv1 + inv2 are on duty in the session (reporter / witness candidates).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import {
    seedAdmin, seedUser, seedClassroom, seedCourse, seedSlot, seedScheduledExam,
    seedAllocation, seedAssignment, seedStudent, seedEnrollment,
} from '../helpers/seedFixtures.js';
import { createTestPeriod } from '../helpers/periodFixture.js';

const base = '/api/unfair-means';
let admin, period, room, slot, inv1, inv2, seatedRoll, unseatedRoll, courseA, courseB, caseId;

// 1×1 PNG, and a buffer with a JPEG signature (the API checks signatures only).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1)]);

const incident = (overrides = {}) => ({
    category: 'chits_notes',
    action_taken: 'answer_book_seized_new_issued',
    description: 'Found a chit with formulae under the answer book.',
    incident_time: '10:15',
    material_seized: true,
    material_description: 'One handwritten chit',
    reported_by_user_id: inv1.id,
    ...overrides,
});

before(async () => {
    admin = await seedAdmin({ local: 'ufm_admin', fullName: '__TEST_Exam Cell' });
    period = await createTestPeriod({ label: 'ufm' });
    room = await seedClassroom();
    inv1 = await seedUser({ role: 'faculty', local: 'ufm_inv1', fullName: '__TEST_Reporter One' });
    inv2 = await seedUser({ role: 'phd_student', local: 'ufm_inv2', fullName: '__TEST_Witness Two' });

    ({ course_code: courseA } = await seedCourse({ semester_label: period.semester_label, name: 'UFM Course A', total_students: 1 }));
    ({ course_code: courseB } = await seedCourse({ semester_label: period.semester_label, name: 'UFM Course B', total_students: 1 }));
    slot = await seedSlot({ period_id: period.id, start_time: '09:30:00', end_time: '11:00:00' });

    seatedRoll = await seedStudent({ name: '__TEST_Seated Student' });
    await seedEnrollment({ semester_label: period.semester_label, course_code: courseA, roll_number: seatedRoll });
    const examA = await seedScheduledExam({ slot_id: slot, course_code: courseA });
    const allocA = await seedAllocation({ scheduled_exam_id: examA, classroom_id: room.id, lane: 'G', student_count: 1, room_mode: 'S' });
    await db.query('INSERT INTO individual_seating_plans (allocation_id, roll_number, seat_number) VALUES (?, ?, ?)', [allocA, seatedRoll, 'G7']);

    unseatedRoll = await seedStudent({ name: '__TEST_Unseated Student' });
    await seedEnrollment({ semester_label: period.semester_label, course_code: courseB, roll_number: unseatedRoll });
    await seedScheduledExam({ slot_id: slot, course_code: courseB });

    await seedAssignment({ slot_id: slot, classroom_id: room.id, user_id: inv1.id, period_id: period.id });
    await seedAssignment({ slot_id: slot, classroom_id: room.id, user_id: inv2.id, period_id: period.id });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const as = (user) => bearer(user.token);
const create = (body, user = admin) => request(app).post(base).set('Authorization', as(user))
    .send({ ...incident(), period_id: period.id, slot_id: slot, roll_number: seatedRoll, ...body });

test('invigilators have no access to the register at all', async () => {
    const calls = [
        request(app).get(`${base}?period_id=${period.id}`),
        request(app).get(`${base}/session-students?slot_id=${slot}&period_id=${period.id}`),
        request(app).post(base).send({ ...incident(), period_id: period.id, slot_id: slot, roll_number: seatedRoll }),
        request(app).get(`${base}/1`),
        request(app).put(`${base}/1`).send(incident()),
        request(app).post(`${base}/1/photos`).attach('photos', PNG, 'p.png'),
    ];
    for (const call of calls) {
        const res = await call.set('Authorization', as(inv1));
        assert.equal(res.status, 403, `${res.req.method} ${res.req.path} must be forbidden`);
    }
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM unfair_means_cases WHERE semester_label = ?', [period.semester_label]);
    assert.equal(Number(n), 0, 'nothing was written');
});

test('session-students lists candidates (seat plan or enrollment) and the invigilators on duty', async () => {
    const res = await request(app)
        .get(`${base}/session-students?slot_id=${slot}&period_id=${period.id}`)
        .set('Authorization', as(admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.seating_plan, true);
    const seated = res.body.students.find((s) => s.roll_number === seatedRoll);
    const unseated = res.body.students.find((s) => s.roll_number === unseatedRoll);
    assert.equal(seated.seat_number, 'G7');
    assert.equal(seated.room_name, room.room_name);
    assert.equal(unseated.seat_number, null);
    assert.deepEqual(res.body.on_duty.map((d) => d.user_id).sort(), [inv1.id, inv2.id].sort());
});

test('the exam department records a case; details are derived on the server', async () => {
    const res = await create({ witness_user_id: inv2.id, room_name: 'FAKE', seat_number: 'Z99' });
    assert.equal(res.status, 201);
    const c = res.body.case;
    caseId = c.id;
    assert.match(c.case_number, /^UFM-\d{4}-\d{4,}$/);
    assert.equal(c.course_code, courseA);
    assert.equal(c.room_name, room.room_name, 'client room ignored');
    assert.equal(c.seat_number, 'G7', 'client seat ignored');
    assert.equal(c.reported_by, inv1.id);
    assert.equal(c.reported_by_name, '__TEST_Reporter One');
    assert.equal(c.witness_name, '__TEST_Witness Two');
    assert.equal(c.recorded_by, admin.id);
    assert.equal(c.recorded_by_name, '__TEST_Exam Cell');
    assert.equal(c.photo_count, 0);
    assert.equal(c.status, 'reported');
});

test('one case per student per session, and invalid input is refused', async () => {
    const dup = await create({});
    assert.equal(dup.status, 409);
    assert.match(dup.body.message, /already has a case for this session: UFM-\d{4}-\d+/);

    const fresh = { roll_number: unseatedRoll };
    assert.equal((await create({ ...fresh, reported_by_user_id: null })).status, 400, 'reporter required');
    assert.equal((await create({ ...fresh, reported_by_user_id: admin.id })).status, 400, 'reporter must be an invigilator');
    assert.equal((await create({ ...fresh, witness_user_id: inv1.id })).status, 400, 'witness ≠ reporter');
    assert.equal((await create({ ...fresh, description: 'short' })).status, 400);
    assert.equal((await create({ ...fresh, category: 'cheating' })).status, 400);
    assert.equal((await create({ ...fresh, incident_time: '25:00' })).status, 400);
    assert.equal((await create({ roll_number: 'NOT_A_STUDENT' })).status, 404, 'not writing in this session');
});

test('a candidate without seat numbers yet can be recorded (course from enrollment)', async () => {
    const res = await create({ roll_number: unseatedRoll, category: 'electronic_device', material_seized: false, reported_by_user_id: inv2.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.case.course_code, courseB);
    assert.equal(res.body.case.room_name, null);
    assert.equal(res.body.case.material_description, null);
});

test('register: period scope, search by roll / case number / name, status counts', async () => {
    const list = await request(app).get(`${base}?period_id=${period.id}`).set('Authorization', as(admin));
    assert.equal(list.status, 200);
    assert.equal(list.body.cases.length, 2);
    assert.equal(list.body.counts.reported, 2);

    const number = list.body.cases.find((c) => c.id === caseId).case_number;
    // ('Seated Student' alone would also match 'Unseated Student' — a correct hit.)
    for (const q of [seatedRoll, number, '__TEST_Seated']) {
        const r = await request(app).get(`${base}?period_id=${period.id}&q=${encodeURIComponent(q)}`).set('Authorization', as(admin));
        assert.deepEqual(r.body.cases.map((c) => c.id), [caseId], `search "${q}"`);
    }
    const every = await request(app).get(`${base}?period_id=all`).set('Authorization', as(admin));
    assert.ok(every.body.cases.length >= 2);
    assert.equal((await request(app).get(`${base}?status=bogus&period_id=${period.id}`).set('Authorization', as(admin))).status, 400);
});

test('evidence photos: upload, fetch, validate, delete', async () => {
    const up = await request(app).post(`${base}/${caseId}/photos`).set('Authorization', as(admin))
        .field('widths', '1').field('heights', '1').field('captions', 'Chit, front')
        .field('widths', '800').field('heights', '600').field('captions', 'Chit, back')
        .attach('photos', PNG, 'front.png')
        .attach('photos', JPEG, 'back.jpg');
    assert.equal(up.status, 201);
    assert.equal(up.body.photos.length, 2);
    const [png, jpg] = up.body.photos;
    assert.equal(png.mime_type, 'image/png');
    assert.equal(png.caption, 'Chit, front');
    assert.equal(jpg.mime_type, 'image/jpeg');
    assert.equal(jpg.width, 800);
    assert.equal(png.data, undefined, 'the list never carries image bytes');

    const img = await request(app).get(`${base}/${caseId}/photos/${png.id}`).set('Authorization', as(admin))
        .buffer(true).parse((res, cb) => { const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.ok(Buffer.compare(img.body, PNG) === 0, 'bytes round-trip');
    assert.equal((await request(app).get(`${base}/${caseId}/photos/${png.id}`).set('Authorization', as(inv1))).status, 403);

    const detail = await request(app).get(`${base}/${caseId}`).set('Authorization', as(admin));
    assert.equal(detail.body.case.photo_count, 2);
    assert.equal(detail.body.case.photos.length, 2);

    const notImage = await request(app).post(`${base}/${caseId}/photos`).set('Authorization', as(admin))
        .attach('photos', Buffer.from('%PDF-1.4 not an image'), 'evil.jpg');
    assert.equal(notImage.status, 400, 'signature check, not the file name');

    const tooBig = await request(app).post(`${base}/${caseId}/photos`).set('Authorization', as(admin))
        .attach('photos', Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), 'huge.jpg');
    assert.equal(tooBig.status, 400);

    const tooMany = await request(app).post(`${base}/${caseId}/photos`).set('Authorization', as(admin))
        .attach('photos', PNG, 'a.png').attach('photos', PNG, 'b.png').attach('photos', PNG, 'c.png').attach('photos', PNG, 'd.png');
    assert.equal(tooMany.status, 400, 'at most 5 per case in total');

    const del = await request(app).delete(`${base}/${caseId}/photos/${jpg.id}`).set('Authorization', as(admin));
    assert.equal(del.status, 200);
    assert.equal(del.body.photos.length, 1);
});

test('editing and evidence lock when the case is closed, and unlock when re-opened', async () => {
    const edit = () => request(app).put(`${base}/${caseId}`).set('Authorization', as(admin))
        .send(incident({ description: 'Chit with formulae found inside the calculator cover.', reported_by_user_id: inv2.id, witness_user_id: inv1.id }));

    const ok = await edit();
    assert.equal(ok.status, 200);
    assert.equal(ok.body.case.reported_by_name, '__TEST_Witness Two');
    assert.equal(ok.body.case.witness_name, '__TEST_Reporter One');

    const noNote = await request(app).put(`${base}/${caseId}/review`).set('Authorization', as(admin)).send({ status: 'action_taken' });
    assert.equal(noNote.status, 400);
    const closed = await request(app).put(`${base}/${caseId}/review`).set('Authorization', as(admin))
        .send({ status: 'action_taken', decision_note: 'Paper cancelled as per the UFM committee.' });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.case.decided_by, admin.id);
    assert.equal(closed.body.case.is_closed, true);

    assert.equal((await edit()).status, 409, 'details locked');
    const photoId = closed.body.case.photos[0].id;
    assert.equal((await request(app).post(`${base}/${caseId}/photos`).set('Authorization', as(admin)).attach('photos', PNG, 'x.png')).status, 409);
    assert.equal((await request(app).delete(`${base}/${caseId}/photos/${photoId}`).set('Authorization', as(admin))).status, 409);

    const reopened = await request(app).put(`${base}/${caseId}/review`).set('Authorization', as(admin)).send({ status: 'under_review' });
    assert.equal(reopened.body.case.decided_at, null);
    assert.equal((await edit()).status, 200, 'editable again once re-opened');
});

test('cases and their photos survive deletion of the exam period', async () => {
    const del = await request(app).delete(`/api/invigilator-scheduling/exam-periods/${period.id}`).set('Authorization', as(admin));
    assert.equal(del.status, 200);
    const [[row]] = await db.query('SELECT exam_period_id, slot_id, room_name, seat_number FROM unfair_means_cases WHERE id = ?', [caseId]);
    assert.ok(row, 'case still exists');
    assert.equal(row.exam_period_id, null);
    assert.equal(row.slot_id, null);
    assert.equal(row.seat_number, 'G7', 'copied details are kept');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM unfair_means_photos WHERE case_id = ?', [caseId]);
    assert.equal(Number(n), 1, 'photos kept');
});
