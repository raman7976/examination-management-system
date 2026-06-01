// ═════════════════════════════════════════════════════════════════════════════
//  Row builders for integration tests.
//
//  Every insert is __TEST_-tagged so teardown can find it. Helpers return the
//  ids/handles a test needs and, for users, a ready-to-use minted JWT.
//
//  The admin/invigilator users carry a REAL bcrypt hash of TEST_PASSWORD so the
//  one end-to-end /login test can authenticate; all other suites mint tokens
//  directly (skipping the loginLimiter).
// ═════════════════════════════════════════════════════════════════════════════

import bcrypt from 'bcrypt';
import db from './db.js';
import { mintToken } from './auth.js';
import {
    TEST_PREFIX,
    TEST_PASSWORD,
    testEmail,
    testRoom,
    testEmpId,
    testCourseCode,
    studentRoll,
} from '../fixtures/constants.js';

// Hash once and reuse — bcrypt is deliberately slow.
let _pwHashPromise;
export function testPasswordHash() {
    if (!_pwHashPromise) _pwHashPromise = bcrypt.hash(TEST_PASSWORD, 10);
    return _pwHashPromise;
}

let userSeq = 0;
// Insert a user. role ∈ admin|faculty|phd_student|lab_staff.
// Returns { id, email, role, employee_id, token }.
export async function seedUser({ role = 'faculty', local, employeeId, withPassword = true, fullName } = {}) {
    userSeq += 1;
    const email = testEmail(local || `${role}${userSeq}`);
    const employee_id = employeeId === null ? null : (employeeId || testEmpId(`${userSeq}`));
    const password_hash = withPassword ? await testPasswordHash() : null;
    const full_name = fullName || `${TEST_PREFIX}User ${userSeq}`;

    const [ins] = await db.query(
        `INSERT INTO users (full_name, email, role, employee_id, department, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [full_name, email, role, employee_id, `${TEST_PREFIX}Dept`, password_hash],
    );
    const id = ins.insertId;
    return { id, email, role, employee_id, full_name, token: mintToken({ id, email, role }) };
}

export const seedAdmin = (opts = {}) => seedUser({ role: 'admin', ...opts });

// Seed one user of each invigilator role + an admin. Returns a map.
export async function seedStandardUsers() {
    const admin = await seedAdmin({ local: 'admin' });
    const faculty = await seedUser({ role: 'faculty', local: 'fac' });
    const phd = await seedUser({ role: 'phd_student', local: 'phd' });
    const lab = await seedUser({ role: 'lab_staff', local: 'lab' });
    return { admin, faculty, phd, lab };
}

let roomSeq = 0;
// Insert a classroom. Returns { id, room_name }.
export async function seedClassroom(overrides = {}) {
    roomSeq += 1;
    const room_name = testRoom(overrides.room_name || `R${roomSeq}`);
    const {
        cap_purple = 30, cap_green = 30, cap_yellow = 30,
        priority = 1, location_order = roomSeq, type = 'normal',
    } = overrides;
    const [ins] = await db.query(
        `INSERT INTO classrooms (room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type],
    );
    return { id: ins.insertId, room_name };
}

let studentSeq = 0;
// Insert a student. Returns roll_number. email carries the __TEST_ prefix so the
// teardown's broad sweep finds it (the short roll tag alone is not swept).
export async function seedStudent(overrides = {}) {
    studentSeq += 1;
    const roll_number = overrides.roll_number || studentRoll(studentSeq);
    const [r] = await db.query(
        `INSERT INTO students (roll_number, name, email, branch, section_name)
         VALUES (?, ?, ?, ?, ?)`,
        [
            roll_number,
            overrides.name || `${TEST_PREFIX}Stu${studentSeq}`,
            testEmail(`stu${studentSeq}`),
            overrides.branch || 'CSE',
            overrides.section_name || 'A',
        ],
    );
    return roll_number;
}

let courseSeq = 0;
// Insert a course for a semester. Returns { course_code, semester_label }.
export async function seedCourse({ semester_label, code, name, total_students = 0, short_name } = {}) {
    courseSeq += 1;
    const course_code = code || testCourseCode(`${courseSeq}`);
    await db.query(
        `INSERT INTO courses (course_code, course_name, total_students, short_name, semester_label)
         VALUES (?, ?, ?, ?, ?)`,
        [course_code, name || `${TEST_PREFIX}Course ${courseSeq}`, total_students, short_name || null, semester_label],
    );
    return { course_code, semester_label };
}

// Enroll a roll number into a course for a semester.
export async function seedEnrollment({ semester_label, course_code, roll_number, course_type = null }) {
    await db.query(
        `INSERT IGNORE INTO course_enrollments (roll_number, course_code, course_type, semester_label)
         VALUES (?, ?, ?, ?)`,
        [roll_number, course_code, course_type, semester_label],
    );
}

// Create an exam slot in a period. Returns slot id.
export async function seedSlot({ period_id, exam_date = '2099-01-01', exam_day = 'Tuesday', start_time = '09:00:00', end_time = '12:00:00' }) {
    const [ins] = await db.query(
        `INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time, exam_period_id)
         VALUES (?, ?, ?, ?, ?)`,
        [exam_date, exam_day, start_time, end_time, period_id],
    );
    return ins.insertId;
}

// Schedule a course into a slot. Returns scheduled_exams id.
export async function seedScheduledExam({ slot_id, course_code }) {
    const [ins] = await db.query(
        `INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`,
        [slot_id, course_code],
    );
    return ins.insertId;
}

// Insert an invigilator assignment. Returns assignment id.
export async function seedAssignment({ slot_id, classroom_id, user_id, is_course_instructor = 0, period_id }) {
    const [ins] = await db.query(
        `INSERT INTO invigilator_assignments
            (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
         VALUES (?, ?, ?, ?, ?)`,
        [slot_id, classroom_id, user_id, is_course_instructor, period_id],
    );
    return ins.insertId;
}

// Lay out `count` physical chairs in one room+lane (the blueprint the Zip
// micro-plan algorithm consumes). seat_number defaults to `${lane}${i}` and
// seq_order is 1..count. Returns the list of seat_numbers in order.
export async function seedClassroomSeats({ classroom_id, lane = 'G', count, startNum = 1 }) {
    const seats = [];
    for (let i = 0; i < count; i += 1) {
        const seq = startNum + i;
        const seat_number = `${lane}${seq}`;
        await db.query(
            `INSERT INTO classroom_seats (classroom_id, lane, seat_number, seq_order)
             VALUES (?, ?, ?, ?)`,
            [classroom_id, lane, seat_number, seq],
        );
        seats.push(seat_number);
    }
    return seats;
}

// Insert a seating_allocation (room+lane block for a scheduled exam). Returns id.
export async function seedAllocation({ scheduled_exam_id, classroom_id, lane = 'G', student_count, room_mode = 'S' }) {
    const [ins] = await db.query(
        `INSERT INTO seating_allocations
            (scheduled_exam_id, classroom_id, lane, student_count, room_mode)
         VALUES (?, ?, ?, ?, ?)`,
        [scheduled_exam_id, classroom_id, lane, student_count, room_mode],
    );
    return ins.insertId;
}
