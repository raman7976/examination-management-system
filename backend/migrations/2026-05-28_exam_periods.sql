-- ═════════════════════════════════════════════════════════════════════════════
--  Semester / exam-period awareness for invigilator scheduling.
--  Adds exam_periods table and tags 3 existing tables with exam_period_id.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exam_periods (
    id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    semester_label  VARCHAR(50) NOT NULL,
    exam_type       ENUM('midterm','endterm') NOT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_period (semester_label, exam_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a default active period so existing data has somewhere to attach.
INSERT INTO exam_periods (semester_label, exam_type, is_active)
SELECT 'Current Semester', 'midterm', 1
WHERE NOT EXISTS (SELECT 1 FROM exam_periods);

-- ── invigilator_role_targets ───────────────────────────────────────────────
ALTER TABLE invigilator_role_targets
    ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0;

UPDATE invigilator_role_targets
SET    exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
WHERE  exam_period_id = 0;

ALTER TABLE invigilator_role_targets
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (exam_period_id, role),
    ALTER COLUMN exam_period_id DROP DEFAULT,
    ADD CONSTRAINT fk_rt_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE;

-- ── invigilator_target_overrides ──────────────────────────────────────────
ALTER TABLE invigilator_target_overrides
    ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0;

UPDATE invigilator_target_overrides
SET    exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
WHERE  exam_period_id = 0;

ALTER TABLE invigilator_target_overrides
    DROP FOREIGN KEY fk_override_user,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (exam_period_id, user_id),
    ALTER COLUMN exam_period_id DROP DEFAULT,
    ADD CONSTRAINT fk_override_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_ov_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE;

-- ── invigilator_assignments ───────────────────────────────────────────────
ALTER TABLE invigilator_assignments
    ADD COLUMN exam_period_id INT NOT NULL DEFAULT 0;

UPDATE invigilator_assignments
SET    exam_period_id = (SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1)
WHERE  exam_period_id = 0;

ALTER TABLE invigilator_assignments ALTER COLUMN exam_period_id DROP DEFAULT;
ALTER TABLE invigilator_assignments
    ADD CONSTRAINT fk_ia_period FOREIGN KEY (exam_period_id) REFERENCES exam_periods(id) ON DELETE CASCADE;
ALTER TABLE invigilator_assignments ADD INDEX idx_period (exam_period_id);
