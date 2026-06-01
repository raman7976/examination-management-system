-- MySQL dump 10.13  Distrib 9.5.0, for macos15 (arm64)
--
-- Host: examination-management-database-7976-exam-management-7976.j.aivencloud.com    Database: defaultdb
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `classroom_seats`
--

DROP TABLE IF EXISTS `classroom_seats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classroom_seats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `classroom_id` int NOT NULL,
  `lane` varchar(20) NOT NULL,
  `seat_number` varchar(10) NOT NULL,
  `seq_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `classroom_id` (`classroom_id`),
  CONSTRAINT `classroom_seats_ibfk_1` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2056 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `classrooms`
--

DROP TABLE IF EXISTS `classrooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classrooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `room_name` varchar(50) NOT NULL,
  `cap_purple` int NOT NULL,
  `cap_green` int NOT NULL,
  `cap_yellow` int NOT NULL,
  `priority` int NOT NULL,
  `location_order` int NOT NULL,
  `type` varchar(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `room_name` (`room_name`)
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_enrollments`
--

DROP TABLE IF EXISTS `course_enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `roll_number` varchar(20) NOT NULL,
  `course_code` varchar(50) NOT NULL,
  `course_type` varchar(50) DEFAULT NULL,
  `semester_label` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enrollment` (`semester_label`,`course_code`,`roll_number`),
  KEY `roll_number` (`roll_number`),
  KEY `course_code` (`course_code`),
  KEY `idx_ce_semester` (`semester_label`),
  CONSTRAINT `course_enrollments_ibfk_1` FOREIGN KEY (`roll_number`) REFERENCES `students` (`roll_number`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=44442 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `course_instructors`
--

DROP TABLE IF EXISTS `course_instructors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `course_instructors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_code` varchar(50) NOT NULL,
  `instructor_name` varchar(150) NOT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `semester_label` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instructor` (`semester_label`,`course_code`,`employee_id`),
  KEY `course_code` (`course_code`),
  KEY `idx_ci_semester` (`semester_label`)
) ENGINE=InnoDB AUTO_INCREMENT=1405 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `course_code` varchar(50) NOT NULL,
  `course_name` varchar(150) NOT NULL,
  `total_students` int DEFAULT '0',
  `short_name` varchar(20) DEFAULT NULL,
  `semester_label` varchar(50) NOT NULL,
  PRIMARY KEY (`semester_label`,`course_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exam_periods`
--

DROP TABLE IF EXISTS `exam_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `semester_label` varchar(50) NOT NULL,
  `exam_type` enum('midterm','endterm') NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period` (`semester_label`,`exam_type`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=142 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exam_session_seating`
--

DROP TABLE IF EXISTS `exam_session_seating`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_session_seating` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `slot_id` int DEFAULT NULL,
  `exam_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `roll_number` varchar(20) NOT NULL,
  `student_name` varchar(100) DEFAULT NULL,
  `section_name` varchar(20) DEFAULT NULL,
  `course_code` varchar(20) NOT NULL,
  `course_name` varchar(100) DEFAULT NULL,
  `seat_number` varchar(10) NOT NULL,
  `room_name` varchar(50) NOT NULL,
  `lane` char(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `session_id` (`session_id`),
  CONSTRAINT `exam_session_seating_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14908 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exam_sessions`
--

DROP TABLE IF EXISTS `exam_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_type` varchar(50) NOT NULL,
  `semester_type` varchar(10) NOT NULL,
  `academic_year` varchar(10) NOT NULL,
  `saved_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `total_students` int DEFAULT '0',
  `total_courses` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `exam_slots`
--

DROP TABLE IF EXISTS `exam_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_date` date NOT NULL,
  `exam_day` varchar(20) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `exam_period_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_slot_period` (`exam_period_id`),
  CONSTRAINT `fk_slot_period` FOREIGN KEY (`exam_period_id`) REFERENCES `exam_periods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=420 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `individual_seating_plans`
--

DROP TABLE IF EXISTS `individual_seating_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `individual_seating_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `allocation_id` int NOT NULL,
  `roll_number` varchar(20) NOT NULL,
  `seat_number` varchar(10) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `allocation_id` (`allocation_id`),
  KEY `roll_number` (`roll_number`),
  CONSTRAINT `individual_seating_plans_ibfk_1` FOREIGN KEY (`allocation_id`) REFERENCES `seating_allocations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `individual_seating_plans_ibfk_2` FOREIGN KEY (`roll_number`) REFERENCES `students` (`roll_number`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2999 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invigilator_assignments`
--

DROP TABLE IF EXISTS `invigilator_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invigilator_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slot_id` int NOT NULL,
  `classroom_id` int NOT NULL,
  `user_id` int NOT NULL,
  `is_course_instructor` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `exam_period_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slot_user` (`slot_id`,`user_id`,`exam_period_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_slot` (`slot_id`),
  KEY `fk_assign_classroom` (`classroom_id`),
  KEY `idx_period` (`exam_period_id`),
  CONSTRAINT `fk_assign_classroom` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms` (`id`),
  CONSTRAINT `fk_assign_slot` FOREIGN KEY (`slot_id`) REFERENCES `exam_slots` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assign_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ia_period` FOREIGN KEY (`exam_period_id`) REFERENCES `exam_periods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1263 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invigilator_role_targets`
--

DROP TABLE IF EXISTS `invigilator_role_targets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invigilator_role_targets` (
  `role` varchar(20) NOT NULL,
  `target_duties` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `exam_period_id` int NOT NULL,
  PRIMARY KEY (`exam_period_id`,`role`),
  CONSTRAINT `fk_rt_period` FOREIGN KEY (`exam_period_id`) REFERENCES `exam_periods` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invigilator_swap_requests`
--

DROP TABLE IF EXISTS `invigilator_swap_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invigilator_swap_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_period_id` int NOT NULL,
  `requester_user_id` int NOT NULL,
  `target_user_id` int NOT NULL,
  `requester_assignment_id` int NOT NULL,
  `target_assignment_id` int DEFAULT NULL,
  `status` enum('pending_peer','pending_admin','approved','rejected_by_peer','rejected_by_admin','cancelled') NOT NULL DEFAULT 'pending_peer',
  `request_type` enum('swap','cover') NOT NULL DEFAULT 'swap',
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `peer_responded_at` timestamp NULL DEFAULT NULL,
  `admin_responded_at` timestamp NULL DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_swap_requester` (`requester_user_id`,`status`,`created_at` DESC),
  KEY `idx_swap_target` (`target_user_id`,`status`,`created_at` DESC),
  KEY `idx_swap_period` (`exam_period_id`,`status`,`created_at` DESC),
  KEY `idx_swap_pair` (`requester_assignment_id`,`target_assignment_id`),
  KEY `fk_swap_tgt_assign` (`target_assignment_id`),
  CONSTRAINT `fk_swap_period` FOREIGN KEY (`exam_period_id`) REFERENCES `exam_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_req_assign` FOREIGN KEY (`requester_assignment_id`) REFERENCES `invigilator_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_requester_user` FOREIGN KEY (`requester_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_swap_tgt_assign` FOREIGN KEY (`target_assignment_id`) REFERENCES `invigilator_assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invigilator_target_overrides`
--

DROP TABLE IF EXISTS `invigilator_target_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invigilator_target_overrides` (
  `user_id` int NOT NULL,
  `override_target` int NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `exam_period_id` int NOT NULL,
  PRIMARY KEY (`exam_period_id`,`user_id`),
  KEY `fk_override_user` (`user_id`),
  CONSTRAINT `fk_ov_period` FOREIGN KEY (`exam_period_id`) REFERENCES `exam_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_override_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `scheduled_exams`
--

DROP TABLE IF EXISTS `scheduled_exams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `scheduled_exams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slot_id` int NOT NULL,
  `course_code` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slot_course` (`slot_id`,`course_code`),
  KEY `course_code` (`course_code`),
  CONSTRAINT `scheduled_exams_ibfk_1` FOREIGN KEY (`slot_id`) REFERENCES `exam_slots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=136 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `seating_allocations`
--

DROP TABLE IF EXISTS `seating_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seating_allocations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `scheduled_exam_id` int NOT NULL,
  `classroom_id` int NOT NULL,
  `lane` char(1) NOT NULL,
  `student_count` int NOT NULL,
  `room_mode` char(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `scheduled_exam_id` (`scheduled_exam_id`),
  KEY `classroom_id` (`classroom_id`),
  CONSTRAINT `seating_allocations_ibfk_1` FOREIGN KEY (`scheduled_exam_id`) REFERENCES `scheduled_exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `seating_allocations_ibfk_2` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=198 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `students`
--

DROP TABLE IF EXISTS `students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `students` (
  `roll_number` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `branch` varchar(50) NOT NULL,
  `section_name` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`roll_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `role` enum('admin','faculty','phd_student','lab_staff') NOT NULL DEFAULT 'admin',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `employee_id` varchar(50) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `employee_id` (`employee_id`)
) ENGINE=InnoDB AUTO_INCREMENT=353 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'defaultdb'
--

--
-- Dumping routines for database 'defaultdb'
--
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.0.45.
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-01 19:53:48
