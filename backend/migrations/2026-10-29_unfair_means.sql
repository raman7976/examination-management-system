-- ─────────────────────────────────────────────────────────────────────────────
--  Unfair-means (UFM) case register.
--
--  An invigilator reports a student caught using unfair means in a session
--  where they are on duty; the examination department reviews the case and
--  records a decision.
--
--  Disciplinary records must outlive the live exam data, so:
--    • session / room / student / course details are COPIED into the row, and
--    • every FK is ON DELETE SET NULL — deleting an exam period, slot, room or
--      user never deletes a case. Cases are never deleted, only dismissed.
--
--  One case per student per session (uq_ufm_slot_student) stops two
--  invigilators from reporting the same incident twice.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `unfair_means_cases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_period_id` int DEFAULT NULL,
  `semester_label` varchar(50) NOT NULL,
  `exam_type` varchar(20) NOT NULL,
  `slot_id` int DEFAULT NULL,
  `exam_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `classroom_id` int DEFAULT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `seat_number` varchar(10) DEFAULT NULL,
  `roll_number` varchar(20) NOT NULL,
  `student_name` varchar(100) DEFAULT NULL,
  `course_code` varchar(50) NOT NULL,
  `course_name` varchar(150) DEFAULT NULL,
  `category` enum('chits_notes','electronic_device','copying_from_candidate','communication','impersonation','writing_on_body_or_desk','misbehaviour','other') NOT NULL,
  `incident_time` time DEFAULT NULL,
  `description` text NOT NULL,
  `material_seized` tinyint(1) NOT NULL DEFAULT '0',
  `material_description` varchar(500) DEFAULT NULL,
  `action_taken` enum('answer_book_seized_new_issued','answer_book_seized','warned_allowed_to_continue','sent_out_of_hall') NOT NULL,
  `student_statement` text DEFAULT NULL,
  `reported_by` int DEFAULT NULL,
  `reported_by_name` varchar(100) NOT NULL,
  `witness_user_id` int DEFAULT NULL,
  `witness_name` varchar(100) DEFAULT NULL,
  `status` enum('reported','under_review','action_taken','dismissed') NOT NULL DEFAULT 'reported',
  `decision_note` text DEFAULT NULL,
  `decided_by` int DEFAULT NULL,
  `decided_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ufm_slot_student` (`slot_id`, `roll_number`),
  KEY `idx_ufm_roll` (`roll_number`),
  KEY `idx_ufm_period_status` (`exam_period_id`, `status`),
  KEY `idx_ufm_reporter` (`reported_by`),
  KEY `idx_ufm_witness` (`witness_user_id`),
  CONSTRAINT `fk_ufm_period`    FOREIGN KEY (`exam_period_id`)  REFERENCES `exam_periods` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ufm_slot`      FOREIGN KEY (`slot_id`)         REFERENCES `exam_slots` (`id`)   ON DELETE SET NULL,
  CONSTRAINT `fk_ufm_classroom` FOREIGN KEY (`classroom_id`)    REFERENCES `classrooms` (`id`)   ON DELETE SET NULL,
  CONSTRAINT `fk_ufm_reporter`  FOREIGN KEY (`reported_by`)     REFERENCES `users` (`id`)        ON DELETE SET NULL,
  CONSTRAINT `fk_ufm_witness`   FOREIGN KEY (`witness_user_id`) REFERENCES `users` (`id`)        ON DELETE SET NULL,
  CONSTRAINT `fk_ufm_decider`   FOREIGN KEY (`decided_by`)      REFERENCES `users` (`id`)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
