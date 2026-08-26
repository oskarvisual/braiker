-- Preserve an authoritative original allocation for bots created before
-- BotCapitalEvent existed. `initialCapital` includes later TOP_UPs.
INSERT INTO `BotCapitalEvent` (`id`, `botId`, `kind`, `amount`, `balanceAfter`, `metadata`, `createdAt`)
SELECT
  UUID(),
  bot.`id`,
  'ALLOCATION',
  GREATEST(0, bot.`initialCapital` - COALESCE(topUps.`amount`, 0)),
  GREATEST(0, bot.`initialCapital` - COALESCE(topUps.`amount`, 0)),
  JSON_OBJECT('source', 'PERFORMANCE_ALLOCATION_BACKFILL'),
  CURRENT_TIMESTAMP(3)
FROM `BotInstance` AS bot
LEFT JOIN (
  SELECT `botId`, SUM(`amount`) AS `amount`
  FROM `BotCapitalEvent`
  WHERE `kind` = 'TOP_UP'
  GROUP BY `botId`
) AS topUps ON topUps.`botId` = bot.`id`
WHERE NOT EXISTS (
  SELECT 1 FROM `BotCapitalEvent` AS allocation
  WHERE allocation.`botId` = bot.`id` AND allocation.`kind` = 'ALLOCATION'
);
