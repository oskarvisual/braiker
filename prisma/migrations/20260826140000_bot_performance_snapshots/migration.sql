CREATE TABLE `BotPerformanceSnapshot` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `marketDate` DATE NOT NULL,
    `liquidCapital` DECIMAL(28, 12) NOT NULL,
    `assetValue` DECIMAL(28, 12) NOT NULL,
    `equity` DECIMAL(28, 12) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BotPerformanceSnapshot_botId_marketDate_key`(`botId`, `marketDate`),
    INDEX `BotPerformanceSnapshot_botId_capturedAt_idx`(`botId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BotPerformanceSnapshot`
  ADD CONSTRAINT `BotPerformanceSnapshot_botId_fkey`
  FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
