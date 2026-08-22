import { describe, expect, it, vi } from "vitest";
import {
  buildBotManagerReport,
  managerReportSchedules,
  publishBotManagerReport,
} from "./bot-manager-reports";
import type { BotManagerReportDb } from "./bot-manager-reports";

describe("Bot Manager reports", () => {
  it("defines durable daily, weekly, and monthly New York report schedules", () => {
    expect(managerReportSchedules).toEqual([
      expect.objectContaining({ cadence: "DAILY", taskName: "bot-manager-daily-report", cronExpression: "35 16 * * *", timezone: "America/New_York" }),
      expect.objectContaining({ cadence: "WEEKLY", taskName: "bot-manager-weekly-report", cronExpression: "45 16 * * 5", timezone: "America/New_York" }),
      expect.objectContaining({ cadence: "MONTHLY", taskName: "bot-manager-monthly-report", cronExpression: "0 17 1 * *", timezone: "America/New_York" }),
    ]);
  });

  it("builds a daily paper-only report with a deterministic period key", () => {
    const report = buildBotManagerReport({
      cadence: "DAILY",
      generatedAt: new Date("2026-08-21T21:35:00.000Z"),
      bots: { on: 2, off: 1, dead: 0 },
      orders: { total: 3, filled: 2, rejected: 1, inProgress: 0 },
    });

    expect(report.eventType).toBe("BOT_MANAGER_DAILY_REPORT");
    expect(report.dedupeKey).toBe("bot-manager-report:daily:2026-08-21");
    expect(report.message).toContain("Paper-only: 2 on, 1 off, 0 dead.");
    expect(report.message).toContain("Orders: 3 total, 2 filled, 1 rejected, 0 in progress.");
  });

  it("upserts the period report without resetting completed delivery timestamps", async () => {
    const db = {
      botInstance: {
        groupBy: vi.fn().mockResolvedValue([
          { runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", _count: { _all: 2 } },
          { runMode: "OFF", lifeStatus: "ACTIVE", _count: { _all: 1 } },
        ]),
      },
      order: {
        groupBy: vi.fn().mockResolvedValue([
          { status: "FILLED", _count: { _all: 2 } },
          { status: "REJECTED", _count: { _all: 1 } },
        ]),
      },
      notificationAlert: { upsert: vi.fn().mockResolvedValue({ id: "report-1" }) },
    };

    await publishBotManagerReport("DAILY", new Date("2026-08-21T21:35:00.000Z"), db as unknown as BotManagerReportDb);

    const call = db.notificationAlert.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ dedupeKey: "bot-manager-report:daily:2026-08-21" });
    expect(call.create.eventType).toBe("BOT_MANAGER_DAILY_REPORT");
    expect(call.update).not.toHaveProperty("webhookDeliveredAt");
    expect(call.update).not.toHaveProperty("emailDeliveredAt");
    expect(call.update).not.toHaveProperty("telegramDeliveredAt");
  });
});
