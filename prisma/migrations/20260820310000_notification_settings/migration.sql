-- CreateTable
CREATE TABLE `NotificationSettings` (
    `id` CHAR(36) NOT NULL,
    `scope` VARCHAR(32) NOT NULL DEFAULT 'global',
    `webhookEnabled` BOOLEAN NOT NULL DEFAULT false,
    `encryptedWebhookUrl` TEXT NULL,
    `webhookUrlIv` VARCHAR(64) NULL,
    `webhookUrlTag` VARCHAR(64) NULL,
    `webhookKeyVersion` INTEGER NOT NULL DEFAULT 1,
    `webhookEvents` JSON NOT NULL,
    `emailEnabled` BOOLEAN NOT NULL DEFAULT false,
    `emailRecipients` JSON NOT NULL,
    `emailEvents` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationSettings_scope_key`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
