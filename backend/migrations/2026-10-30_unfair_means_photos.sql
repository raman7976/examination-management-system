-- ─────────────────────────────────────────────────────────────────────────────
--  Unfair-means register, round 2 (applied by run_unfair_means_photos_migration.js,
--  which probes each step so it is safe to re-run):
--
--  1. Cases are now recorded by the examination department, not invigilators.
--     `reported_by` / `reported_by_name` keep meaning "the invigilator who caught
--     the candidate"; `recorded_by` / `recorded_by_name` is the admin who entered
--     the case.
--
--  2. Evidence photographs. Stored in the database (MEDIUMBLOB) rather than on
--     disk, so they are covered by the normal database backup and need no file
--     storage on the server. The browser shrinks photos to JPEG before upload;
--     the API accepts only JPEG/PNG (checked by file signature), at most 5 per
--     case and 5 MB each. Deleting a case would delete its photos (CASCADE), but
--     cases themselves are never deleted, only dismissed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `unfair_means_cases`
  ADD COLUMN `recorded_by` int DEFAULT NULL,
  ADD COLUMN `recorded_by_name` varchar(100) DEFAULT NULL,
  ADD CONSTRAINT `fk_ufm_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS `unfair_means_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` int NOT NULL,
  `mime_type` varchar(20) NOT NULL,
  `size_bytes` int NOT NULL,
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `caption` varchar(255) DEFAULT NULL,
  `data` mediumblob NOT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_by_name` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ufm_photo_case` (`case_id`),
  CONSTRAINT `fk_ufm_photo_case` FOREIGN KEY (`case_id`) REFERENCES `unfair_means_cases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ufm_photo_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
