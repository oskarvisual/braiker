CREATE TABLE `WorkerRuntimeState` (
  `scope` VARCHAR(32) NOT NULL,
  `instanceId` VARCHAR(128) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `heartbeatAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE=InnoDB;
