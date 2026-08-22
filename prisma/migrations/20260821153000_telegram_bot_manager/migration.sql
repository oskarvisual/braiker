ALTER TABLE `NotificationSettings`
  ADD COLUMN `telegramEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `telegramEvents` JSON NULL,
  ADD COLUMN `telegramReceiveMessages` BOOLEAN NOT NULL DEFAULT false;

UPDATE `NotificationSettings` SET `telegramEvents` = JSON_ARRAY() WHERE `telegramEvents` IS NULL;
ALTER TABLE `NotificationSettings` MODIFY `telegramEvents` JSON NOT NULL;

ALTER TABLE `NotificationAlert`
  ADD COLUMN `telegramDeliveredAt` DATETIME(3) NULL,
  ADD COLUMN `telegramLastAttemptAt` DATETIME(3) NULL,
  ADD COLUMN `telegramLastError` VARCHAR(1000) NULL;

CREATE TABLE `TelegramManagerSession` (
  `scope` VARCHAR(32) NOT NULL,
  `telegramChatId` VARCHAR(64) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastReceivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TelegramManagerSession_telegramChatId_key`(`telegramChatId`),
  INDEX `TelegramManagerSession_userId_idx`(`userId`),
  PRIMARY KEY (`scope`),
  CONSTRAINT `TelegramManagerSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `TelegramPairingCode` (
  `id` CHAR(36) NOT NULL,
  `codeHash` CHAR(64) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `TelegramPairingCode_codeHash_key`(`codeHash`),
  INDEX `TelegramPairingCode_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `TelegramPairingCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `TelegramRuntimeState` (
  `scope` VARCHAR(32) NOT NULL,
  `nextUpdateId` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `TelegramManagerMessage` (
  `id` CHAR(36) NOT NULL,
  `sessionScope` VARCHAR(32) NOT NULL,
  `telegramUpdateId` VARCHAR(64) NULL,
  `direction` VARCHAR(16) NOT NULL,
  `content` VARCHAR(4000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `TelegramManagerMessage_telegramUpdateId_key`(`telegramUpdateId`),
  INDEX `TelegramManagerMessage_sessionScope_createdAt_idx`(`sessionScope`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `TelegramManagerMessage_sessionScope_fkey` FOREIGN KEY (`sessionScope`) REFERENCES `TelegramManagerSession`(`scope`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
