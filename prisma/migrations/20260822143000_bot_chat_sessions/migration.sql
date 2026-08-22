CREATE TABLE `BotChatSession` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BotChatSession_botId_userId_key`(`botId`, `userId`),
  INDEX `BotChatSession_userId_updatedAt_idx`(`userId`, `updatedAt`),
  CONSTRAINT `BotChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BotChatSession_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BotChatMessage` (
  `id` CHAR(36) NOT NULL,
  `sessionId` CHAR(36) NOT NULL,
  `role` ENUM('USER', 'ASSISTANT', 'SYSTEM') NOT NULL,
  `content` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `BotChatMessage_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
  CONSTRAINT `BotChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `BotChatSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
