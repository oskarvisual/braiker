-- AlterTable
ALTER TABLE `TelegramManagerSession` MODIFY `scope` VARCHAR(32) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE `TelegramRuntimeState` MODIFY `scope` VARCHAR(32) NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE `WorkerRuntimeState` MODIFY `scope` VARCHAR(32) NOT NULL DEFAULT 'global';

-- CreateTable
CREATE TABLE `TradableAsset` (
    `id` CHAR(36) NOT NULL,
    `symbol` VARCHAR(16) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `exchange` VARCHAR(32) NOT NULL,
    `assetClass` VARCHAR(32) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `tradable` BOOLEAN NOT NULL DEFAULT true,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `syncedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TradableAsset_symbol_key`(`symbol`),
    INDEX `TradableAsset_enabled_active_tradable_idx`(`enabled`, `active`, `tradable`),
    INDEX `TradableAsset_symbol_enabled_idx`(`symbol`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Keep the reviewed liquid starting universe available before the first
-- authenticated Alpaca refresh. New Alpaca assets default disabled.
INSERT INTO `TradableAsset` (`id`,`symbol`,`name`,`exchange`,`assetClass`,`active`,`tradable`,`enabled`,`syncedAt`,`createdAt`,`updatedAt`) VALUES
(UUID(),'SPY','SPDR S&P 500 ETF Trust','ARCA','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'QQQ','Invesco QQQ Trust','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'AAPL','Apple Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'MSFT','Microsoft Corporation','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'NVDA','NVIDIA Corporation','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'AMZN','Amazon.com, Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'META','Meta Platforms, Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'GOOGL','Alphabet Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'TSLA','Tesla, Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
(UUID(),'AMD','Advanced Micro Devices, Inc.','NASDAQ','us_equity',true,true,true,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3));
