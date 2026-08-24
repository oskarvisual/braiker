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
      scans: { completed: 4, skipped: 1, errors: 0, botsWithoutScan: ["Laura"] },
      briefings: [{ marketDate: "2026-08-21", botInputs: 3, resources: [{ category: "MACRO", title: "CPI release" }, { category: "NEWS", title: "Market briefing" }] }],
      macro: { created: [{ title: "US CPI", startsAt: "2026-08-22T12:30:00.000Z" }], upcoming: [{ title: "Fed decision", startsAt: "2026-08-22T18:00:00.000Z" }] },
      botActivity: [{ name: "Bob", status: "COMPLETED", reason: "ANALYZED" }]
    });

    expect(report.eventType).toBe("BOT_MANAGER_DAILY_REPORT");
    expect(report.dedupeKey).toBe("bot-manager-report:daily:2026-08-21");
    expect(report.message).toContain("Reporting window: the preceding 24 hours, ending 2026-08-21T21:35:00.000Z.\n\nPaper-only fleet:");
    expect(report.message).toContain("Orders: 3 total, 2 filled, 1 rejected, 0 in progress.\n\nResources:");
    expect(report.message).toContain("Paper-only fleet: 2 on, 1 off, 0 dead.");
    expect(report.message).toContain("Orders: 3 total, 2 filled, 1 rejected, 0 in progress.");
    expect(report.message).toContain("Resources:\n1 daily briefing distributed cautious context to 3 bot inputs.\nReviewed sources:\n- MACRO: CPI release\n- NEWS: Market briefing");
    expect(report.message).toContain("Macro safety:\nAdded: 1 HIGH event: US CPI");
    expect(report.message).toContain("Upcoming guard: 1 guard: Fed decision");
    expect(report.message).toContain("Scans:\n4 completed, 1 skipped, 0 errors.\nNo scan: Laura.");
  });

  it("summarizes every briefing in a weekly or monthly operating window while keeping examples bounded", () => {
    const briefings = Array.from({ length: 8 }, (_, index) => ({
      marketDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      botInputs: 3,
      resources: [{ category: "MACRO", title: `Release ${index + 1}` }],
    }));
    const report = buildBotManagerReport({
      cadence: "WEEKLY",
      generatedAt: new Date("2026-08-21T21:45:00.000Z"),
      bots: { on: 3, off: 0, dead: 0 },
      orders: { total: 12, filled: 8, rejected: 2, inProgress: 2 },
      scans: { completed: 60, skipped: 12, errors: 1, botsWithoutScan: [] },
      briefings,
      macro: { created: [{ title: "CPI", startsAt: "2026-08-20T12:30:00.000Z" }], upcoming: [{ title: "Jobs", startsAt: "2026-08-24T12:30:00.000Z" }] },
      botActivity: [],
    });

    expect(report.message).toContain("Weekly paper-only report");
    expect(report.message).toContain("Resources:\n8 daily briefings distributed cautious context to 24 bot inputs.");
    expect(report.message).toContain("Release 1");
    expect(report.message).toContain("Added: 1 HIGH event");
  });

  it("upserts the period report without resetting completed delivery timestamps", async () => {
    const db = {
      botInstance: {
        groupBy: vi.fn().mockResolvedValue([
          { runMode: "PAPER_ACTIVE", lifeStatus: "ACTIVE", _count: { _all: 2 } },
          { runMode: "OFF", lifeStatus: "ACTIVE", _count: { _all: 1 } },
        ]),
        findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Bob", lifeStatus: "ACTIVE" }]),
      },
      order: {
        groupBy: vi.fn().mockResolvedValue([
          { status: "FILLED", _count: { _all: 2 } },
          { status: "REJECTED", _count: { _all: 1 } },
        ]),
      },
      botScanRun: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ status: "COMPLETED", _count: { _all: 1 } }])
          .mockResolvedValueOnce([{ botId: "bot-1", _count: { _all: 1 } }]),
        findMany: vi.fn().mockResolvedValue([{ botId: "bot-1", status: "COMPLETED", reason: "ANALYZED", startedAt: new Date() }]),
      },
      dailyMarketBrief: { findMany: vi.fn().mockResolvedValue([]) },
      macroCalendarEvent: { findMany: vi.fn().mockResolvedValue([]) },
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
