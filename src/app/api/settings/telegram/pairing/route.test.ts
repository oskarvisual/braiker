import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertSameOrigin: vi.fn(),
  env: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("@/modules/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/http", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/prisma", () => ({ prisma: { notificationSettings: { findUnique: mocks.findUnique } } }));

describe("POST /api/settings/telegram/pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.env.mockReturnValue({ TELEGRAM_BOT_TOKEN: "synthetic-test-token" });
  });

  it("refuses to issue a pairing code while the Telegram manager master switch is off", async () => {
    mocks.findUnique.mockResolvedValue({ telegramManagerEnabled: false });
    const route = await import("./route");

    const response = await route.POST(new Request("http://localhost/api/settings/telegram/pairing", { method: "POST", headers: { origin: "http://localhost" } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "TELEGRAM_MANAGER_DISABLED" });
  });
});
