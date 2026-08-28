-- Health checks read the newest durable stream lifecycle event by provider/type.
CREATE INDEX `MarketStreamEvent_provider_eventType_createdAt_idx`
  ON `MarketStreamEvent`(`provider`, `eventType`, `createdAt`);

-- Retention deletes use timestamp-based indexes and avoid scanning the whole
-- telemetry history as it grows.
CREATE INDEX `MarketBar_timestamp_idx` ON `MarketBar`(`timestamp`);
CREATE INDEX `MarketEvaluation_createdAt_idx` ON `MarketEvaluation`(`createdAt`);
CREATE INDEX `MarketStreamEvent_createdAt_idx` ON `MarketStreamEvent`(`createdAt`);
