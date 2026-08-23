import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), assertSameOrigin: vi.fn(), findMany: vi.fn(), create: vi.fn(), auditCreate: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/prisma", () => ({ prisma: { macroCalendarEvent: { findMany: mocks.findMany, create: mocks.create }, auditLog: { create: mocks.auditCreate } } }));

describe("macro calendar settings API", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z")); mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" }); });
  afterEach(() => vi.useRealTimers());

  it("keeps active and future pagination separate from events whose own window has ended", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "future", provider: "ADMIN", title: "Future CPI", impact: "HIGH", startsAt: new Date("2026-08-24T12:00:00.000Z"), sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15, createdAt: new Date() },
      { id: "active", provider: "ADMIN", title: "Active CPI", impact: "HIGH", startsAt: new Date("2026-08-23T11:50:00.000Z"), sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15, createdAt: new Date() },
      { id: "past", provider: "ADMIN", title: "Past CPI", impact: "HIGH", startsAt: new Date("2026-08-23T11:40:00.000Z"), sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15, createdAt: new Date() }
    ]);
    const route = await import("./route");

    const upcoming = await (await route.GET(new Request("http://localhost/api/settings/macro-events?view=upcoming"))).json();
    const past = await (await route.GET(new Request("http://localhost/api/settings/macro-events?view=past"))).json();

    expect(upcoming.events.map((event: { id: string }) => event.id)).toEqual(["active", "future"]);
    expect(past.events.map((event: { id: string }) => event.id)).toEqual(["past"]);
    expect(upcoming.events[0]).toMatchObject({ beforeMinutes: 10, afterMinutes: 15 });
  });

  it("lets an Admin add a high-impact event from an official HTTPS source", async () => {
    mocks.create.mockResolvedValue({ id: "event-1", provider: "ADMIN", title: "US CPI", impact: "HIGH", startsAt: new Date("2026-08-24T12:30:00.000Z"), sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15, createdAt: new Date() });
    const route = await import("./route");
    const response = await route.POST(new Request("http://localhost/api/settings/macro-events", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ title: "US CPI", impact: "HIGH", startsAt: "2026-08-24T12:30:00.000Z", sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15 }) }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider: "ADMIN", title: "US CPI", impact: "HIGH", beforeMinutes: 10, afterMinutes: 15 }) }));
    expect(mocks.auditCreate).toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ id: "event-1", title: "US CPI", startsAt: "2026-08-24T12:30:00.000Z" });
  });

  it("rejects non-admin writes and non-HTTPS sources", async () => {
    const route = await import("./route");
    mocks.requireUser.mockResolvedValue({ id: "viewer-1", role: "VIEWER" });
    expect((await route.POST(new Request("http://localhost/api/settings/macro-events", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ title: "US CPI", startsAt: "2026-08-24T12:30:00.000Z", sourceUrl: "https://www.bls.gov/", beforeMinutes: 10, afterMinutes: 15 }) }))).status).toBe(403);
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    expect((await route.POST(new Request("http://localhost/api/settings/macro-events", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ title: "US CPI", startsAt: "2026-08-24T12:30:00.000Z", sourceUrl: "http://example.test/", beforeMinutes: 10, afterMinutes: 15 }) }))).status).toBe(400);
  });
});
