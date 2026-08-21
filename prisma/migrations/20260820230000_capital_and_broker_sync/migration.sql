-- CreateTable
CREATE TABLE `BotCapitalEvent` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `amount` DECIMAL(28, 12) NOT NULL,
    `balanceAfter` DECIMAL(28, 12) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BotCapitalEvent_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrokerOrderSnapshot` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `brokerOrderId` VARCHAR(128) NOT NULL,
    `clientOrderId` VARCHAR(128) NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `side` VARCHAR(8) NOT NULL,
    `orderType` VARCHAR(16) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `quantity` DECIMAL(28, 12) NOT NULL,
    `filledQuantity` DECIMAL(28, 12) NOT NULL DEFAULT 0,
    `filledAveragePrice` DECIMAL(28, 12) NULL,
    `submittedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `rawPayload` JSON NOT NULL,

    UNIQUE INDEX `BrokerOrderSnapshot_brokerOrderId_key`(`brokerOrderId`),
    INDEX `BrokerOrderSnapshot_walletId_submittedAt_idx`(`walletId`, `submittedAt`),
    INDEX `BrokerOrderSnapshot_walletId_status_idx`(`walletId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Wallet`
    ADD COLUMN `managedCapital` DECIMAL(28, 12) NOT NULL DEFAULT 100,
    ADD COLUMN `unallocatedCapital` DECIMAL(28, 12) NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE `BotInstance`
    ADD COLUMN `lifeStatus` ENUM('ACTIVE', 'DEAD') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `initialCapital` DECIMAL(28, 12) NOT NULL DEFAULT 0,
    ADD COLUMN `currentCapital` DECIMAL(28, 12) NOT NULL DEFAULT 0,
    ADD COLUMN `reservedCapital` DECIMAL(28, 12) NOT NULL DEFAULT 0,
    ADD COLUMN `diedAt` DATETIME(3) NULL;

-- AddForeignKey
ALTER TABLE `BotCapitalEvent` ADD CONSTRAINT `BotCapitalEvent_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BrokerOrderSnapshot` ADD CONSTRAINT `BrokerOrderSnapshot_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
