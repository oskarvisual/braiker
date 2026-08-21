CREATE TABLE `PaperCapitalPool` (
    `scope` VARCHAR(32) NOT NULL DEFAULT 'global',
    `managedCapital` DECIMAL(28, 12) NOT NULL DEFAULT 100,
    `unallocatedCapital` DECIMAL(28, 12) NOT NULL DEFAULT 100,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve existing wallet allocations when moving from per-wallet broker
-- connections to one global Paper account. Existing capital is fully allocated.
INSERT INTO `PaperCapitalPool` (`scope`, `managedCapital`, `unallocatedCapital`, `createdAt`, `updatedAt`)
SELECT
    'global',
    COALESCE(SUM(`managedCapital`), 100),
    CASE WHEN COUNT(*) = 0 THEN 100 ELSE 0 END,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `Wallet`;
