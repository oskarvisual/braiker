-- CreateEnum
CREATE TABLE `BotModeTransition` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `fromMode` ENUM('OFF', 'SIMULATION', 'PAPER_ACTIVE') NULL,
    `toMode` ENUM('OFF', 'SIMULATION', 'PAPER_ACTIVE') NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BotModeTransition_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotMemoryEntry` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `content` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BotMemoryEntry_botId_kind_createdAt_idx`(`botId`, `kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `BotInstance`
    ADD COLUMN `templateId` VARCHAR(24) NOT NULL DEFAULT 'NAVIGATOR',
    ADD COLUMN `avatarSeed` VARCHAR(32) NOT NULL DEFAULT 'compass',
    ADD COLUMN `runMode` ENUM('OFF', 'SIMULATION', 'PAPER_ACTIVE') NOT NULL DEFAULT 'OFF';

-- AddForeignKey
ALTER TABLE `BotModeTransition` ADD CONSTRAINT `BotModeTransition_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotMemoryEntry` ADD CONSTRAINT `BotMemoryEntry_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
