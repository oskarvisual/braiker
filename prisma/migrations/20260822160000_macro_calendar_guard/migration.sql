CREATE TABLE `MacroCalendarEvent` (
  `id` CHAR(36) NOT NULL,
  `provider` VARCHAR(80) NOT NULL,
  `externalId` VARCHAR(191) NULL,
  `title` VARCHAR(255) NOT NULL,
  `impact` VARCHAR(16) NOT NULL DEFAULT 'HIGH',
  `startsAt` DATETIME(3) NOT NULL,
  `sourceUrl` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MacroCalendarEvent_provider_title_startsAt_key`(`provider`, `title`, `startsAt`),
  INDEX `MacroCalendarEvent_impact_startsAt_idx`(`impact`, `startsAt`),
  INDEX `MacroCalendarEvent_externalId_idx`(`externalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
