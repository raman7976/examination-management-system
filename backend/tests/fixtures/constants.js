// ═════════════════════════════════════════════════════════════════════════════
//  Shared test identity / prefixing.
//
//  SAFETY: every row a test writes to the LIVE DB is tagged with TEST_PREFIX so
//  the teardown sweeper can find and remove ONLY this run's data. The embedded
//  timestamp (RUN_ID) makes false-positive matches against real rows effectively
//  impossible. CI sets TEST_RUN_ID per run so concurrent runs never collide.
// ═════════════════════════════════════════════════════════════════════════════

import 'dotenv/config';

export const RUN_ID = process.env.TEST_RUN_ID || String(Date.now());

// For long columns: semester_label(50), email(255), room_name(50), course_code(50).
export const TEST_PREFIX = `__TEST_${RUN_ID}_`;

// students.roll_number is only varchar(20), so it gets a short, run-unique tag.
export const RUN_TAG = RUN_ID.slice(-6);
export const STUDENT_ROLL_PREFIX = `T${RUN_TAG}`;

const cap = (s, n = 50) => s.slice(0, n);

export const testEmail = (local) => cap(`${TEST_PREFIX}${local}@test.invalid`, 255);
export const testRoom = (name) => cap(`${TEST_PREFIX}${name}`);
export const testEmpId = (n) => cap(`${TEST_PREFIX}E${n}`);
export const testCourseCode = (n) => cap(`${TEST_PREFIX}C${n}`);
export const testSemester = (label) => cap(`${TEST_PREFIX}${label}`);
export const studentRoll = (n) => cap(`${STUDENT_ROLL_PREFIX}${n}`, 20);

export const TEST_PASSWORD = 'TestPass123!';
