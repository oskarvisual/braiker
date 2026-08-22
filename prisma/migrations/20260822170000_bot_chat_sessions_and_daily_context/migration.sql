ALTER TABLE `BotChatSession`
  DROP INDEX `BotChatSession_botId_userId_key`,
  ADD COLUMN `kind` ENUM('CONVERSATION', 'MANAGER_NOTE') NOT NULL DEFAULT 'CONVERSATION' AFTER `botId`,
  ADD COLUMN `title` VARCHAR(120) NOT NULL DEFAULT 'New conversation' AFTER `kind`,
  ADD INDEX `BotChatSession_botId_userId_updatedAt_idx`(`botId`, `userId`, `updatedAt`);

CREATE TABLE `BotDailyContext` (
  `id` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `messageId` CHAR(36) NOT NULL,
  `marketDate` DATE NOT NULL,
  `source` ENUM('USER_CHAT', 'MANAGER_NOTE') NOT NULL,
  `content` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BotDailyContext_messageId_key`(`messageId`),
  INDEX `BotDailyContext_botId_marketDate_idx`(`botId`, `marketDate`),
  INDEX `BotDailyContext_userId_marketDate_idx`(`userId`, `marketDate`),
  CONSTRAINT `BotDailyContext_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BotDailyContext_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BotDailyContext_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `BotChatMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
