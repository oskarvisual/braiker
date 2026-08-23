-- Internal, additive learning is versioned rather than modifying the
-- user-visible strategy profile. Inactive rows are retained for audit.
CREATE TABLE `BotLearnedInstruction` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NULL,
  `source` VARCHAR(24) NOT NULL,
  `content` VARCHAR(1200) NOT NULL,
  `revision` INTEGER NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `deactivatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BotLearnedInstruction_botId_revision_key`(`botId`, `revision`),
  INDEX `BotLearnedInstruction_botId_active_createdAt_idx`(`botId`, `active`, `createdAt`),
  INDEX `BotLearnedInstruction_createdById_createdAt_idx`(`createdById`, `createdAt`),
  CONSTRAINT `BotLearnedInstruction_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BotLearnedInstruction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MacroGuardSettings` (
  `scope` VARCHAR(24) NOT NULL DEFAULT 'global',
  `beforeMinutes` INTEGER NOT NULL DEFAULT 10,
  `afterMinutes` INTEGER NOT NULL DEFAULT 15,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MacroCalendarEvent`
  ADD COLUMN `sourceReference` VARCHAR(191) NULL,
  ADD COLUMN `createdById` CHAR(36) NULL,
  ADD INDEX `MacroCalendarEvent_createdById_createdAt_idx`(`createdById`, `createdAt`),
  ADD CONSTRAINT `MacroCalendarEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
