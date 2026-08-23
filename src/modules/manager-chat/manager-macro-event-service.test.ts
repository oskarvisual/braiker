import { describe, expect, it, vi } from "vitest";
import { createManagerMacroEvent } from "./manager-macro-event-service";

function db(overrides: Record<string, unknown> = {}) {
  return {
    resourceSource: { findFirst: vi.fn().mockResolvedValue({ id: "resource-1", hostname: "www.bls.gov" }) },
    macroCalendarEvent: { create: vi.fn().mockResolvedValue({ id: "event-1", title: "US CPI", startsAt: new Date("2026-09-10T12:30:00.000Z"), sourceUrl: "https://www.bls.gov/news.release/cpi.htm" }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides
  };
}

describe("Manager macro-event creation", () => {
  const command = "Evento macro: US CPI | 2026-09-10T08:30:00-04:00 | https://www.bls.gov/news.release/cpi.htm";

  it("requires a future event backed by an approved MACRO Resource and audits its actor", async () => {
    const store = db();
    const result = await createManagerMacroEvent({ userId: "admin-1", content: command, source: "WEB", now: new Date("2026-09-01T00:00:00.000Z") }, store as never);
    expect(result?.reply).toContain("Created HIGH macro event");
    expect(store.resourceSource.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ category: "MACRO", active: true, reviewStatus: "APPROVED", hostname: "www.bls.gov" }) }));
    expect(store.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "admin-1", action: "MACRO_EVENT_CREATED_BY_MANAGER" }) }));
  });

  it("rejects an unreviewed source and a timestamp in the past", async () => {
    const sourceMissing = db({ resourceSource: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect((await createManagerMacroEvent({ userId: "admin-1", content: command, source: "WEB", now: new Date("2026-09-01T00:00:00.000Z") }, sourceMissing as never))?.reply).toContain("not an active, approved");
    const past = await createManagerMacroEvent({ userId: "admin-1", content: command, source: "WEB", now: new Date("2026-09-11T00:00:00.000Z") }, db() as never);
    expect(past?.reply).toContain("not in the future");
  });

  it("does not create a duplicate when the database unique key is hit", async () => {
    const store = db({ macroCalendarEvent: { create: vi.fn().mockRejectedValue({ code: "P2002" }) } });
    const result = await createManagerMacroEvent({ userId: "admin-1", content: command, source: "TELEGRAM", now: new Date("2026-09-01T00:00:00.000Z") }, store as never);
    expect(result?.reply).toContain("already exists");
  });
});
