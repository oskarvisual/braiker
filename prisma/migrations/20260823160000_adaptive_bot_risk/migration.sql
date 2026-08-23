ALTER TABLE `BotInstance`
  ADD COLUMN `adaptiveRiskEnabled` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `BotRiskAdjustment` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `level` VARCHAR(24) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `basePolicy` JSON NOT NULL,
  `effectivePolicy` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `BotRiskAdjustment_botId_createdAt_idx` (`botId`, `createdAt`),
  CONSTRAINT `BotRiskAdjustment_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
