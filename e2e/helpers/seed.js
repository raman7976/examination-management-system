// ═════════════════════════════════════════════════════════════════════════════
//  E2E fixture provisioning — every row is __TEST_E2E_-tagged.
//
//  The SPA always reads the *active* exam period (none of its period-scoped GETs
//  pass ?period_id), so global-setup must make the E2E period active for the
//  duration of the run. provision() lays down everything BOTH journeys need:
//
//   • period P (endterm) + role targets, admin + invigilators A/B, 3 classrooms.
//   • SWAP scenario  — one slot, one course, two rooms each with a seating_-
//     allocation (so the full-schedule grid renders a chip per room) and an
//     invigilator_assignment (A in room1, B in room2). A can trade their duty
//     for B's (same-slot swap → classroom_id swap, always feasible).
//   • PIPELINE scenario — a separate slot + course (+ a few enrolled students)
//     so seating-status shows exam_count>0 and generate-export has data.
//
//  reseedSwapScenario() rebuilds ONLY the swap slot tree so swap.spec is robust
//  even if the admin-pipeline run rewrote seating_allocations first.
// ═════════════════════════════════════════════════════════════════════════════

import { pool } from './db.js';
import {
  E2E_PREFIX,
  e2eEmail,
  e2eRoom,
  e2eEmpId,
  e2eCourseCode,
  e2eSemester,
  e2eRoll,
} from './constants.js';

const ROLES = ['faculty', 'phd_student', 'lab_staff'];

// E2E users authenticate via a minted JWT (helpers/auth.js) — the bcrypt /login
// path is never exercised here — so we store a static, non-functional placeholder
// hash instead of pulling bcrypt (a native module) into the e2e package.
const PLACEHOLDER_HASH = '$2b$10$E2EplaceholderhashE2EplaceholderhashE2Eplaceholder.';

async function insertUser(db, { role, local, empN, fullName }) {
  const email = e2eEmail(local);
  const employee_id = e2eEmpId(empN);
  const password_hash = PLACEHOLDER_HASH;
  const [r] = await db.query(
    `INSERT INTO users (full_name, email, role, employee_id, department, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fullName, email, role, employee_id, `${E2E_PREFIX}Dept`, password_hash],
  );
  return { id: r.insertId, email, role, employee_id, full_name: fullName };
}

async function insertClassroom(db, { name, locationOrder }) {
  const room_name = e2eRoom(name);
  const [r] = await db.query(
    `INSERT INTO classrooms (room_name, cap_purple, cap_green, cap_yellow, priority, location_order, type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [room_name, 30, 30, 30, 1, locationOrder, 'normal'],
  );
  return { id: r.insertId, room_name };
}

async function insertCourse(db, { semesterLabel, code, name, total }) {
  const course_code = e2eCourseCode(code);
  await db.query(
    `INSERT INTO courses (course_code, course_name, total_students, short_name, semester_label)
     VALUES (?, ?, ?, ?, ?)`,
    [course_code, name, total, name.slice(0, 10), semesterLabel],
  );
  return course_code;
}

async function insertSlot(db, { periodId, date, day, start = '09:00:00', end = '12:00:00' }) {
  const [r] = await db.query(
    `INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time, exam_period_id)
     VALUES (?, ?, ?, ?, ?)`,
    [date, day, start, end, periodId],
  );
  return r.insertId;
}

async function insertScheduledExam(db, { slotId, courseCode }) {
  const [r] = await db.query(
    `INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`,
    [slotId, courseCode],
  );
  return r.insertId;
}

async function insertAllocation(db, { scheduledExamId, classroomId, lane = 'G', count, mode = 'S' }) {
  const [r] = await db.query(
    `INSERT INTO seating_allocations (scheduled_exam_id, classroom_id, lane, student_count, room_mode)
     VALUES (?, ?, ?, ?, ?)`,
    [scheduledExamId, classroomId, lane, count, mode],
  );
  return r.insertId;
}

async function insertAssignment(db, { slotId, classroomId, userId, periodId }) {
  const [r] = await db.query(
    `INSERT INTO invigilator_assignments (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
     VALUES (?, ?, ?, 0, ?)`,
    [slotId, classroomId, userId, periodId],
  );
  return r.insertId;
}

// ── SWAP scenario ────────────────────────────────────────────────────────────
// Rebuilds the swap slot tree from scratch. Safe to call repeatedly: it removes
// any prior swap slot for this period first (CASCADE/explicit), then re-inserts.
export async function reseedSwapScenario({ periodId, semesterLabel, rooms, users, swapCourseCode }) {
  const db = pool();
  const [roomA, roomB] = rooms;

  // Tear down a prior swap slot (assignments + allocations are children of
  // slot/scheduled_exam). Match by the unique swap exam_day marker below.
  const SWAP_DAY = 'E2E-SWAP';
  const [oldSlots] = await db.query(
    `SELECT id FROM exam_slots WHERE exam_period_id = ? AND exam_day = ?`,
    [periodId, SWAP_DAY],
  );
  for (const { id: slotId } of oldSlots) {
    await db.query(`DELETE FROM invigilator_assignments WHERE slot_id = ?`, [slotId]);
    await db.query(
      `DELETE sa FROM seating_allocations sa
         JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
       WHERE se.slot_id = ?`,
      [slotId],
    );
    await db.query(`DELETE FROM scheduled_exams WHERE slot_id = ?`, [slotId]);
    await db.query(`DELETE FROM exam_slots WHERE id = ?`, [slotId]);
  }

  const slotId = await insertSlot(db, { periodId, date: '2099-02-01', day: SWAP_DAY });
  const scheduledExamId = await insertScheduledExam(db, { slotId, courseCode: swapCourseCode });
  // One allocation per room → grid renders both rooms as columns with a chip.
  await insertAllocation(db, { scheduledExamId, classroomId: roomA.id, count: 20 });
  await insertAllocation(db, { scheduledExamId, classroomId: roomB.id, count: 20 });
  // A in roomA, B in roomB — A clicks B's chip, offers their own (only) duty.
  const assignmentA = await insertAssignment(db, { slotId, classroomId: roomA.id, userId: users.invA.id, periodId });
  const assignmentB = await insertAssignment(db, { slotId, classroomId: roomB.id, userId: users.invB.id, periodId });

  return { slotId, scheduledExamId, assignmentA, assignmentB, roomA, roomB };
}

// ── Full provisioning (called once by global-setup) ──────────────────────────
export async function provision() {
  const db = pool();
  const semesterLabel = e2eSemester('SEM');

  // Period (inactive on insert; global-setup activates it after capturing the
  // real active id so it can be restored on teardown).
  const [pIns] = await db.query(
    `INSERT INTO exam_periods (semester_label, exam_type, is_active) VALUES (?, 'endterm', 0)`,
    [semesterLabel],
  );
  const periodId = pIns.insertId;
  for (const role of ROLES) {
    await db.query(
      `INSERT INTO invigilator_role_targets (exam_period_id, role, target_duties) VALUES (?, ?, ?)`,
      [periodId, role, 3],
    );
  }

  // Users.
  const admin = await insertUser(db, { role: 'admin', local: 'admin', empN: 'A1', fullName: `${E2E_PREFIX}Admin` });
  const invA = await insertUser(db, { role: 'faculty', local: 'inva', empN: 'IA', fullName: `${E2E_PREFIX}Invig Alpha` });
  const invB = await insertUser(db, { role: 'phd_student', local: 'invb', empN: 'IB', fullName: `${E2E_PREFIX}Invig Bravo` });
  const users = { admin, invA, invB };

  // Classrooms.
  const rooms = [
    await insertClassroom(db, { name: 'RA', locationOrder: 1 }),
    await insertClassroom(db, { name: 'RB', locationOrder: 2 }),
    await insertClassroom(db, { name: 'RC', locationOrder: 3 }),
  ];

  // SWAP course + scenario.
  const swapCourseCode = await insertCourse(db, { semesterLabel, code: 'SWAP', name: 'SwapCourse', total: 40 });
  const swap = await reseedSwapScenario({ periodId, semesterLabel, rooms, users, swapCourseCode });

  // PIPELINE course + scenario (separate slot; a few enrolled students).
  const pipeCourseCode = await insertCourse(db, { semesterLabel, code: 'PIPE', name: 'PipeCourse', total: 40 });
  const pipeSlotId = await insertSlot(db, { periodId, date: '2099-03-01', day: 'E2E-PIPE', start: '09:00:00', end: '12:00:00' });
  await insertScheduledExam(db, { slotId: pipeSlotId, courseCode: pipeCourseCode });
  for (let i = 1; i <= 5; i += 1) {
    const roll = e2eRoll(i);
    await db.query(
      `INSERT INTO students (roll_number, name, email, branch, section_name) VALUES (?, ?, ?, 'CSE', 'A')`,
      [roll, `${E2E_PREFIX}Stu${i}`, e2eEmail(`stu${i}`)],
    );
    await db.query(
      `INSERT IGNORE INTO course_enrollments (roll_number, course_code, course_type, semester_label)
       VALUES (?, ?, NULL, ?)`,
      [roll, pipeCourseCode, semesterLabel],
    );
  }

  return {
    periodId,
    semesterLabel,
    users,
    rooms,
    swap: { ...swap, courseCode: swapCourseCode },
    pipeline: { slotId: pipeSlotId, courseCode: pipeCourseCode },
  };
}
