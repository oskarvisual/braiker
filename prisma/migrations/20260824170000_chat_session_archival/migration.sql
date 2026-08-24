ALTER TABLE `ManagerChatSession`
  ADD COLUMN `archivedAt` DATETIME(3) NULL;

ALTER TABLE `BotChatSession`
  ADD COLUMN `archivedAt` DATETIME(3) NULL;

CREATE INDEX `ManagerChatSession_userId_archivedAt_pinned_updatedAt_idx`
  ON `ManagerChatSession`(`userId`, `archivedAt`, `pinned`, `updatedAt`);

CREATE INDEX `BotChatSession_userId_archivedAt_updatedAt_idx`
  ON `BotChatSession`(`userId`, `archivedAt`, `updatedAt`);

CREATE INDEX `BotChatSession_botId_userId_archivedAt_updatedAt_idx`
  ON `BotChatSession`(`botId`, `userId`, `archivedAt`, `updatedAt`);
