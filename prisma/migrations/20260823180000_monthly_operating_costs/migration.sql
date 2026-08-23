CREATE TABLE `OperatingCostAllocation` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `billingMonth` DATE NOT NULL,
    `monthlyCost` DECIMAL(28, 12) NOT NULL,
    `allocatedAmount` DECIMAL(28, 12) NOT NULL,
    `chargedAmount` DECIMAL(28, 12) NOT NULL,
    `unpaidAmount` DECIMAL(28, 12) NOT NULL,
    `capitalBefore` DECIMAL(28, 12) NOT NULL,
    `capitalAfter` DECIMAL(28, 12) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OperatingCostAllocation_botId_billingMonth_key`(`botId`, `billingMonth`),
    INDEX `OperatingCostAllocation_billingMonth_createdAt_idx`(`billingMonth`, `createdAt`),
    INDEX `OperatingCostAllocation_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperatingCostSettings` (
    `scope` VARCHAR(32) NOT NULL DEFAULT 'global',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `monthlyCost` DECIMAL(28, 12) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OperatingCostAllocation` ADD CONSTRAINT `OperatingCostAllocation_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
