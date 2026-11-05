-- ─────────────────────────────────────────────────────────────────────────────
--  exam_sessions.semester_type: widen varchar(10) → varchar(20).
--
--  The Semester dropdown in PDF Reports (and the Registration period picker)
--  now offers "Summer Term" alongside "Even"/"Odd". "Summer Term" is 11
--  characters — one over the old varchar(10) cap — so saving a Summer Term
--  session would fail with "Data too long for column 'semester_type'" under
--  MySQL strict mode (Aiven's default). 20 chars gives headroom for future
--  labels too.
--
--  The canonical statement below is what the idempotent runner
--  (run_widen_semester_type_migration.js) applies.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE exam_sessions
    MODIFY COLUMN semester_type VARCHAR(20) NOT NULL;
