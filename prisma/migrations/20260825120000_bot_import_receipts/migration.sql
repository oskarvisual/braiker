CREATE TABLE `BotImportReceipt` (
  `id` CHAR(36) NOT NULL,
  `packageHash` CHAR(64) NOT NULL,
  `schemaVersion` INTEGER NOT NULL,
  `manifest` JSON NOT NULL,
  `importedById` CHAR(36) NOT NULL,
  `botId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `BotImportReceipt_packageHash_key`(`packageHash`),
  INDEX `BotImportReceipt_botId_createdAt_idx`(`botId`, `createdAt`),
  INDEX `BotImportReceipt_importedById_createdAt_idx`(`importedById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BotImportReceipt`
  ADD CONSTRAINT `BotImportReceipt_importedById_fkey`
  FOREIGN KEY (`importedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `BotImportReceipt`
  ADD CONSTRAINT `BotImportReceipt_botId_fkey`
  FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
