-- ═════════════════════════════════════════════════════════════════════════════
--  Invigilator Scheduling — 3 new tables
--  Run once on the Aiven DB.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invigilator_role_targets (
    role          VARCHAR(20) NOT NULL PRIMARY KEY,
    target_duties INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed defaults (idempotent)
INSERT INTO invigilator_role_targets (role, target_duties) VALUES
    ('faculty',     0),
    ('phd_student', 0),
    ('lab_staff',   0)
ON DUPLICATE KEY UPDATE role = role;


CREATE TABLE IF NOT EXISTS invigilator_target_overrides (
    user_id         INT NOT NULL PRIMARY KEY,
    override_target INT NOT NULL,
    note            VARCHAR(255),
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_override_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS invigilator_assignments (
    id                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slot_id              INT NOT NULL,
    classroom_id         INT NOT NULL,
    user_id              INT NOT NULL,
    is_course_instructor TINYINT(1) NOT NULL DEFAULT 0,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot_room_user (slot_id, classroom_id, user_id),
    UNIQUE KEY uq_slot_user      (slot_id, user_id),
    INDEX idx_user (user_id),
    INDEX idx_slot (slot_id),
    CONSTRAINT fk_assign_slot      FOREIGN KEY (slot_id)      REFERENCES exam_slots(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
    CONSTRAINT fk_assign_user      FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
