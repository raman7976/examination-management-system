-- ─────────────────────────────────────────────────────────────────────────────
--  invigilator_swap_requests — peer-to-peer + admin-moderated duty swaps.
--
--  State machine:
--    pending_peer  → peer approves     → pending_admin
--    pending_peer  → peer rejects      → rejected_by_peer    [TERM]
--    pending_peer  → requester cancels → cancelled           [TERM]
--    pending_admin → admin approves    → approved            [TERM, executed]
--    pending_admin → admin rejects     → rejected_by_admin   [TERM]
--
--  All FKs CASCADE: if the underlying period / user / assignment goes away
--  the request becomes meaningless, so we drop it. Indexes cover the four
--  lookup paths (my outgoing, my incoming, admin all, duplicate-pair guard).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invigilator_swap_requests (
    id                       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    exam_period_id           INT NOT NULL,
    requester_user_id        INT NOT NULL,
    target_user_id           INT NOT NULL,
    requester_assignment_id  INT NOT NULL,
    target_assignment_id     INT NOT NULL,
    status                   ENUM(
        'pending_peer','pending_admin','approved',
        'rejected_by_peer','rejected_by_admin','cancelled'
    ) NOT NULL DEFAULT 'pending_peer',
    note                     VARCHAR(500) NULL,
    created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    peer_responded_at        TIMESTAMP NULL,
    admin_responded_at       TIMESTAMP NULL,
    cancelled_at             TIMESTAMP NULL,

    INDEX idx_swap_requester (requester_user_id, status, created_at DESC),
    INDEX idx_swap_target    (target_user_id,    status, created_at DESC),
    INDEX idx_swap_period    (exam_period_id,    status, created_at DESC),
    INDEX idx_swap_pair      (requester_assignment_id, target_assignment_id),

    CONSTRAINT fk_swap_period
        FOREIGN KEY (exam_period_id)          REFERENCES exam_periods(id)            ON DELETE CASCADE,
    CONSTRAINT fk_swap_requester_user
        FOREIGN KEY (requester_user_id)       REFERENCES users(id)                   ON DELETE CASCADE,
    CONSTRAINT fk_swap_target_user
        FOREIGN KEY (target_user_id)          REFERENCES users(id)                   ON DELETE CASCADE,
    CONSTRAINT fk_swap_req_assign
        FOREIGN KEY (requester_assignment_id) REFERENCES invigilator_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_swap_tgt_assign
        FOREIGN KEY (target_assignment_id)    REFERENCES invigilator_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
