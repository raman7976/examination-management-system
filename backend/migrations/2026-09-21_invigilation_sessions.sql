-- Migration: invigilation session archive tables
-- Mirrors the exam_sessions / exam_session_seating pattern but for invigilator duties.

CREATE TABLE IF NOT EXISTS `invigilation_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_period_id` int NOT NULL,
  `session_name` varchar(150) NOT NULL,
  `semester_label` varchar(50) NOT NULL,
  `exam_type` varchar(20) NOT NULL,
  `total_assignments` int NOT NULL DEFAULT 0,
  `total_invigilators` int NOT NULL DEFAULT 0,
  `saved_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inv_session_period` (`exam_period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `invigilation_session_duties` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `slot_id` int DEFAULT NULL,
  `exam_date` date DEFAULT NULL,
  `exam_day` varchar(20) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `classroom_id` int DEFAULT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `role` varchar(20) DEFAULT NULL,
  `is_course_instructor` tinyint(1) NOT NULL DEFAULT 0,
  `course_codes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inv_duty_session` (`session_id`),
  KEY `idx_inv_duty_user` (`user_id`),
  CONSTRAINT `fk_inv_duty_session` FOREIGN KEY (`session_id`) REFERENCES `invigilation_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
