-- ─────────────────────────────────────────────────────────────────────────────
--  scheduled_exams: enforce one row per (slot_id, course_code).
--
--  Until now scheduled_exams had only non-unique indexes on slot_id and
--  course_code, so re-assigning the same course to the same slot inserted a
--  duplicate row — and scheduleController.assignCourses' ER_DUP_ENTRY → 409
--  branch never fired. This adds the missing UNIQUE KEY so duplicate assigns
--  are rejected by the DB (the controller already maps ER_DUP_ENTRY → 409).
--
--  NOTE: seating_allocations.scheduled_exam_id → scheduled_exams is
--  ON DELETE CASCADE, so de-duping a row also removes any seating that hung off
--  the discarded duplicate. We keep the LOWEST id per group (the canonical row
--  the rest of the app already references).
--
--  The canonical statements below are what the idempotent runner
--  (run_scheduled_exams_unique_migration.js) applies, with a __TEST_-scoped
--  self-test in front of them as a live-DB guard.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. De-duplicate: keep the lowest id within each (slot_id, course_code) group.
DELETE se FROM scheduled_exams se
JOIN (
    SELECT slot_id, course_code, MIN(id) AS keep_id
    FROM scheduled_exams
    GROUP BY slot_id, course_code
    HAVING COUNT(*) > 1
) d ON se.slot_id = d.slot_id AND se.course_code = d.course_code
WHERE se.id <> d.keep_id;

-- 2. Enforce uniqueness going forward.
ALTER TABLE scheduled_exams
    ADD UNIQUE KEY uq_slot_course (slot_id, course_code);
