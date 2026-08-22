CREATE TABLE `ManagerChatSession` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `kind` ENUM('OPERATIONS', 'CONVERSATION') NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `pinned` BOOLEAN NOT NULL DEFAULT false,
  `externalKey` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ManagerChatSession_externalKey_key`(`externalKey`),
  INDEX `ManagerChatSession_userId_pinned_updatedAt_idx`(`userId`, `pinned`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ManagerChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `ManagerChatMessage` (
  `id` CHAR(36) NOT NULL,
  `sessionId` CHAR(36) NOT NULL,
  `sourceReference` VARCHAR(191) NULL,
  `role` ENUM('USER', 'ASSISTANT', 'SYSTEM') NOT NULL,
  `source` ENUM('WEB', 'TELEGRAM', 'TELEGRAM_ALERT', 'SYSTEM') NOT NULL,
  `content` TEXT NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ManagerChatMessage_sourceReference_key`(`sourceReference`),
  INDEX `ManagerChatMessage_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ManagerChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `ManagerChatSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
