-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATOR', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Wallet` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'USD',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletMember` (
    `walletId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `role` ENUM('ADMIN', 'OPERATOR', 'VIEWER') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WalletMember_userId_idx`(`userId`),
    PRIMARY KEY (`walletId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BrokerConnection` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `mode` ENUM('PAPER', 'LIVE') NOT NULL DEFAULT 'PAPER',
    `encryptedKey` TEXT NOT NULL,
    `keyIv` VARCHAR(64) NOT NULL,
    `keyTag` VARCHAR(64) NOT NULL,
    `encryptedSecret` TEXT NOT NULL,
    `secretIv` VARCHAR(64) NOT NULL,
    `secretTag` VARCHAR(64) NOT NULL,
    `keyVersion` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BrokerConnection_walletId_provider_mode_key`(`walletId`, `provider`, `mode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotInstance` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `status` ENUM('RUNNING', 'PAUSED', 'RISK_HALTED', 'ERROR', 'MAINTENANCE') NOT NULL DEFAULT 'PAUSED',
    `killSwitch` BOOLEAN NOT NULL DEFAULT true,
    `riskPolicy` JSON NOT NULL,
    `strategyProfile` JSON NOT NULL,
    `aiProfile` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BotInstance_walletId_status_idx`(`walletId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotStateTransition` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `fromState` ENUM('RUNNING', 'PAUSED', 'RISK_HALTED', 'ERROR', 'MAINTENANCE') NULL,
    `toState` ENUM('RUNNING', 'PAUSED', 'RISK_HALTED', 'ERROR', 'MAINTENANCE') NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BotStateTransition_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Watchlist` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Watchlist_symbol_enabled_idx`(`symbol`, `enabled`),
    UNIQUE INDEX `Watchlist_botId_symbol_key`(`botId`, `symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketBar` (
    `id` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `timeframe` VARCHAR(16) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `open` DECIMAL(28, 12) NOT NULL,
    `high` DECIMAL(28, 12) NOT NULL,
    `low` DECIMAL(28, 12) NOT NULL,
    `close` DECIMAL(28, 12) NOT NULL,
    `volume` DECIMAL(28, 12) NOT NULL,
    `feed` VARCHAR(24) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MarketBar_symbol_timeframe_timestamp_idx`(`symbol`, `timeframe`, `timestamp`),
    UNIQUE INDEX `MarketBar_symbol_timeframe_timestamp_feed_key`(`symbol`, `timeframe`, `timestamp`, `feed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketSnapshot` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MarketSnapshot_botId_symbol_createdAt_idx`(`botId`, `symbol`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketStreamEvent` (
    `id` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NULL,
    `eventType` VARCHAR(48) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MarketStreamEvent_symbol_createdAt_idx`(`symbol`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrategySignal` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `snapshotId` CHAR(36) NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `action` ENUM('BUY', 'SELL', 'HOLD') NOT NULL,
    `confidence` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StrategySignal_botId_symbol_createdAt_idx`(`botId`, `symbol`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiDecision` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `model` VARCHAR(120) NOT NULL,
    `request` JSON NOT NULL,
    `response` JSON NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `costUsd` DECIMAL(28, 12) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiDecision_botId_createdAt_idx`(`botId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeProposal` (
    `id` CHAR(36) NOT NULL,
    `botId` CHAR(36) NOT NULL,
    `signalId` CHAR(36) NULL,
    `aiDecisionId` CHAR(36) NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `action` ENUM('BUY', 'SELL', 'HOLD') NOT NULL,
    `orderType` ENUM('MARKET', 'LIMIT') NOT NULL,
    `quantity` DECIMAL(28, 12) NOT NULL,
    `limitPrice` DECIMAL(28, 12) NULL,
    `estimatedPrice` DECIMAL(28, 12) NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_RISK',
    `context` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TradeProposal_botId_symbol_createdAt_idx`(`botId`, `symbol`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskDecision` (
    `id` CHAR(36) NOT NULL,
    `proposalId` CHAR(36) NOT NULL,
    `approved` BOOLEAN NOT NULL,
    `reason` VARCHAR(80) NOT NULL,
    `checks` JSON NOT NULL,
    `approvedOrder` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RiskDecision_proposalId_key`(`proposalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExecutionJob` (
    `id` CHAR(36) NOT NULL,
    `proposalId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leaseToken` CHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExecutionJob_proposalId_key`(`proposalId`),
    INDEX `ExecutionJob_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` CHAR(36) NOT NULL,
    `proposalId` CHAR(36) NOT NULL,
    `brokerOrderId` VARCHAR(128) NULL,
    `clientOrderId` VARCHAR(128) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `action` ENUM('BUY', 'SELL', 'HOLD') NOT NULL,
    `orderType` ENUM('MARKET', 'LIMIT') NOT NULL,
    `quantity` DECIMAL(28, 12) NOT NULL,
    `limitPrice` DECIMAL(28, 12) NULL,
    `status` ENUM('PENDING', 'NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `rawPayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_brokerOrderId_key`(`brokerOrderId`),
    UNIQUE INDEX `Order_clientOrderId_key`(`clientOrderId`),
    INDEX `Order_proposalId_createdAt_idx`(`proposalId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Fill` (
    `id` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `brokerFillId` VARCHAR(128) NOT NULL,
    `quantity` DECIMAL(28, 12) NOT NULL,
    `price` DECIMAL(28, 12) NOT NULL,
    `filledAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Fill_brokerFillId_key`(`brokerFillId`),
    INDEX `Fill_orderId_filledAt_idx`(`orderId`, `filledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Position` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `quantity` DECIMAL(28, 12) NOT NULL,
    `averageEntryPrice` DECIMAL(28, 12) NOT NULL,
    `marketValue` DECIMAL(28, 12) NOT NULL,
    `unrealizedPnl` DECIMAL(28, 12) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Position_walletId_updatedAt_idx`(`walletId`, `updatedAt`),
    UNIQUE INDEX `Position_walletId_symbol_key`(`walletId`, `symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortfolioSnapshot` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `botId` CHAR(36) NULL,
    `equity` DECIMAL(28, 12) NOT NULL,
    `cash` DECIMAL(28, 12) NOT NULL,
    `exposure` DECIMAL(28, 12) NOT NULL,
    `realizedPnl` DECIMAL(28, 12) NOT NULL,
    `unrealizedPnl` DECIMAL(28, 12) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL,

    INDEX `PortfolioSnapshot_walletId_capturedAt_idx`(`walletId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyPerformance` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `day` DATE NOT NULL,
    `startingEquity` DECIMAL(28, 12) NOT NULL,
    `endingEquity` DECIMAL(28, 12) NOT NULL,
    `realizedPnl` DECIMAL(28, 12) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DailyPerformance_walletId_day_key`(`walletId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReconciliationRun` (
    `id` CHAR(36) NOT NULL,
    `walletId` CHAR(36) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `discrepancy` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `ReconciliationRun_walletId_startedAt_idx`(`walletId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledTask` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `cronExpression` VARCHAR(120) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `nextRunAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ScheduledTask_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobRun` (
    `id` CHAR(36) NOT NULL,
    `taskId` CHAR(36) NOT NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `leaseToken` CHAR(36) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `error` TEXT NULL,

    INDEX `JobRun_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
    UNIQUE INDEX `JobRun_taskId_scheduledFor_key`(`taskId`, `scheduledFor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `walletId` CHAR(36) NULL,
    `action` VARCHAR(120) NOT NULL,
    `target` VARCHAR(120) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_walletId_createdAt_idx`(`walletId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemEvent` (
    `id` CHAR(36) NOT NULL,
    `severity` VARCHAR(16) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemEvent_severity_createdAt_idx`(`severity`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ErrorEvent` (
    `id` CHAR(36) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `stack` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ErrorEvent_source_createdAt_idx`(`source`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletMember` ADD CONSTRAINT `WalletMember_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletMember` ADD CONSTRAINT `WalletMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BrokerConnection` ADD CONSTRAINT `BrokerConnection_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotInstance` ADD CONSTRAINT `BotInstance_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotStateTransition` ADD CONSTRAINT `BotStateTransition_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Watchlist` ADD CONSTRAINT `Watchlist_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeProposal` ADD CONSTRAINT `TradeProposal_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiskDecision` ADD CONSTRAINT `RiskDecision_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `TradeProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExecutionJob` ADD CONSTRAINT `ExecutionJob_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `TradeProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Fill` ADD CONSTRAINT `Fill_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Position` ADD CONSTRAINT `Position_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PortfolioSnapshot` ADD CONSTRAINT `PortfolioSnapshot_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PortfolioSnapshot` ADD CONSTRAINT `PortfolioSnapshot_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `BotInstance`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobRun` ADD CONSTRAINT `JobRun_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `ScheduledTask`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `Wallet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
