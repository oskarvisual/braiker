CREATE TABLE `BotScanRun` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `reason` VARCHAR(32) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `outcomes` JSON NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `BotScanRun_botId_startedAt_idx`(`botId`, `startedAt`),
  INDEX `BotScanRun_startedAt_idx`(`startedAt`),
  CONSTRAINT `BotScanRun_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
