ALTER TABLE `MarketBar`
  ADD COLUMN `tradeCount` INTEGER NULL,
  ADD COLUMN `vwap` DECIMAL(28, 12) NULL,
  ADD COLUMN `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE TABLE `MarketEvaluation` (
  `id` CHAR(36) NOT NULL,
  `evaluationKey` VARCHAR(220) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `symbol` VARCHAR(16) NOT NULL,
  `timeframe` VARCHAR(16) NOT NULL,
  `candleTimestamp` DATETIME(3) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  UNIQUE INDEX `MarketEvaluation_evaluationKey_key`(`evaluationKey`),
  INDEX `MarketEvaluation_botId_symbol_candleTimestamp_idx`(`botId`, `symbol`, `candleTimestamp`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

ALTER TABLE `Order` ADD COLUMN `reservationReleasedAt` DATETIME(3) NULL;

CREATE TABLE `BotPosition` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `symbol` VARCHAR(16) NOT NULL,
  `quantity` DECIMAL(28, 12) NOT NULL,
  `averageEntryPrice` DECIMAL(28, 12) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `BotPosition_botId_symbol_key`(`botId`, `symbol`),
  INDEX `BotPosition_botId_updatedAt_idx`(`botId`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `BotPosition_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
