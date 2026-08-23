import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { activeMacroGuard } from "./macro-guard";

const databaseUrl = process.env.BRAIKER_TEST_DATABASE_URL;
const describeMysql = databaseUrl ? describe : describe.skip;
const db = databaseUrl ? new PrismaClient({ datasources: { db: { url: databaseUrl } } }) : null;

describeMysql("Macro calendar guard (MySQL)", () => {
  beforeAll(async () => db?.$connect());
  beforeEach(async () => { await db?.macroCalendarEvent.deleteMany(); });
  afterAll(async () => db?.$disconnect());

  it("persists an event-specific protection window and supplies it to the deterministic guard", async () => {
    if (!db) throw new Error("BRAIKER_TEST_DATABASE_URL is required");
    await db.macroCalendarEvent.create({ data: { provider: "BLS", title: "US CPI release", impact: "HIGH", startsAt: new Date("2026-08-24T12:30:00.000Z"), sourceUrl: "https://www.bls.gov/", beforeMinutes: 30, afterMinutes: 45 } });
    const events = await db.macroCalendarEvent.findMany({ where: { impact: "HIGH" } });

    expect(events[0]).toMatchObject({ beforeMinutes: 30, afterMinutes: 45 });
    expect(activeMacroGuard(events, new Date("2026-08-24T12:00:00.000Z"))).toMatchObject({ active: true, eventTitle: "US CPI release" });
  });
});
