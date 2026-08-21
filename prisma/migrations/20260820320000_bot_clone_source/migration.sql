ALTER TABLE `BotInstance`
  ADD COLUMN `cloneSourceId` CHAR(36) NULL,
  ADD INDEX `BotInstance_cloneSourceId_idx` (`cloneSourceId`);
