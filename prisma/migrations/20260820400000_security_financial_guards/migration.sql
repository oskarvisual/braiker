CREATE TABLE `LoginThrottle` (
    `keyHash` CHAR(64) NOT NULL,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `windowStartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `blockedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `LoginThrottle_blockedUntil_idx`(`blockedUntil`),
    PRIMARY KEY (`keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Fill` ADD COLUMN `botId` CHAR(36) NULL,
    ADD COLUMN `realizedPnl` DECIMAL(28, 12) NOT NULL DEFAULT 0;

UPDATE `Fill`
INNER JOIN `Order` ON `Order`.`id` = `Fill`.`orderId`
INNER JOIN `TradeProposal` ON `TradeProposal`.`id` = `Order`.`proposalId`
SET `Fill`.`botId` = `TradeProposal`.`botId`;

ALTER TABLE `Fill` MODIFY `botId` CHAR(36) NOT NULL,
    ADD INDEX `Fill_botId_filledAt_idx`(`botId`, `filledAt`);

ALTER TABLE `TradeProposal` ADD COLUMN `reservationAmount` DECIMAL(28, 12) NOT NULL DEFAULT 0;
UPDATE `TradeProposal`
SET `reservationAmount` = CASE
    WHEN `action` = 'BUY' THEN `quantity` * `estimatedPrice`
    ELSE 0
END;
