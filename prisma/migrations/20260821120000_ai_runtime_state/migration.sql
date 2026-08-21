-- Durable OpenAI advisory quota circuit; no tokens, balances, or provider payloads are persisted.
CREATE TABLE `AiRuntimeState` (
  `scope` VARCHAR(32) NOT NULL DEFAULT 'global',
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `disabledAt` DATETIME(3) NULL,
  `lastCheckedAt` DATETIME(3) NULL,
  `lastError` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
