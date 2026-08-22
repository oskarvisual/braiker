CREATE TABLE `ResourceSource` (
  `id` CHAR(36) NOT NULL,
  `category` ENUM('MACRO', 'NEWS', 'FILINGS', 'EARNINGS', 'SENTIMENT', 'ETF_ROTATION', 'TECHNICAL') NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `hostname` VARCHAR(191) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT false,
  `autoActivated` BOOLEAN NOT NULL DEFAULT false,
  `reviewStatus` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `refreshMinutes` INTEGER NOT NULL DEFAULT 1440,
  `lastFetchedAt` DATETIME(3) NULL,
  `nextRefreshAt` DATETIME(3) NULL,
  `lastError` VARCHAR(1000) NULL,
  `proposedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ResourceSource_url_key`(`url`),
  INDEX `ResourceSource_category_active_nextRefreshAt_idx`(`category`, `active`, `nextRefreshAt`),
  INDEX `ResourceSource_reviewStatus_updatedAt_idx`(`reviewStatus`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ResourceSource_proposedById_fkey` FOREIGN KEY (`proposedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `ResourceSnapshot` (
  `id` CHAR(36) NOT NULL,
  `sourceId` CHAR(36) NOT NULL,
  `canonicalUrl` VARCHAR(191) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `contentHash` CHAR(64) NOT NULL,
  `excerpt` TEXT NOT NULL,
  `summary` TEXT NULL,
  `relevance` VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  `fetchedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ResourceSnapshot_sourceId_fetchedAt_idx`(`sourceId`, `fetchedAt`),
  INDEX `ResourceSnapshot_contentHash_idx`(`contentHash`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ResourceSnapshot_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ResourceSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `DailyMarketBrief` (
  `id` CHAR(36) NOT NULL,
  `marketDate` DATE NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'GENERATED',
  `content` JSON NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DailyMarketBrief_marketDate_key`(`marketDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;

CREATE TABLE `DailyBriefResource` (
  `briefId` CHAR(36) NOT NULL,
  `sourceId` CHAR(36) NOT NULL,
  `snapshotId` CHAR(36) NOT NULL,
  INDEX `DailyBriefResource_sourceId_idx`(`sourceId`),
  INDEX `DailyBriefResource_snapshotId_idx`(`snapshotId`),
  PRIMARY KEY (`briefId`, `sourceId`, `snapshotId`),
  CONSTRAINT `DailyBriefResource_briefId_fkey` FOREIGN KEY (`briefId`) REFERENCES `DailyMarketBrief`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DailyBriefResource_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ResourceSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DailyBriefResource_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `ResourceSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
