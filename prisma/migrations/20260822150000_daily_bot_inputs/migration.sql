CREATE TABLE `DailyBotInput` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `dailyMarketBriefId` CHAR(36) NOT NULL,
  `marketDate` DATE NOT NULL,
  `content` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DailyBotInput_botId_marketDate_key`(`botId`, `marketDate`),
  INDEX `DailyBotInput_dailyMarketBriefId_idx`(`dailyMarketBriefId`),
  CONSTRAINT `DailyBotInput_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DailyBotInput_dailyMarketBriefId_fkey` FOREIGN KEY (`dailyMarketBriefId`) REFERENCES `DailyMarketBrief`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
