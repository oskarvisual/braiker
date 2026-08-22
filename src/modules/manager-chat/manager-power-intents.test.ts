import { describe, expect, it, vi } from "vitest";
import { parseManagerPowerIntent, prepareManagerPowerProposal } from "./manager-power-intents";

describe("Manager power intents", () => {
  it("accepts explicit English and Spanish ON/OFF requests while preserving the exact bot reference", () => {
    expect(parseManagerPowerIntent("Activate bot Juan trAIder")).toEqual({ action: "TURN_ON", botReference: "Juan trAIder" });
    expect(parseManagerPowerIntent("apaga a Pepe")).toEqual({ action: "TURN_OFF", botReference: "Pepe" });
    expect(parseManagerPowerIntent("What bots are active?")).toBeNull();
  });

  it("creates one typed proposal only for an exact bot-name match", async () => {
    const create = vi.fn().mockResolvedValue({ id: "proposal-1", expiresAt: new Date("2026-08-22T15:10:00.000Z") });
    const result = await prepareManagerPowerProposal({
      userId: "admin-1",
      actorRole: "ADMIN",
      content: "activate bot Juan trAIder",
      requestedVia: "WEB",
      now: new Date("2026-08-22T15:00:00.000Z"),
      code: "A1B2C3D4E5F6"
    }, {
      botInstance: { findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Juan trAIder" }]) },
      managerActionProposal: { create }
    } as never);

    expect(result).toEqual(expect.objectContaining({ kind: "proposal", bot: { id: "bot-1", name: "Juan trAIder" }, action: "TURN_ON", confirmationCode: "A1B2C3D4E5F6" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ botId: "bot-1", action: "TURN_ON", requestedVia: "WEB" }) }));
  });

  it("does not guess when the requested bot name is not exact", async () => {
    const create = vi.fn();
    const result = await prepareManagerPowerProposal({ userId: "admin-1", actorRole: "ADMIN", content: "activate Juan traiet", requestedVia: "TELEGRAM" }, {
      botInstance: { findMany: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Juan trAIder" }]) },
      managerActionProposal: { create }
    } as never);

    expect(result).toEqual(expect.objectContaining({ kind: "unmatched" }));
    expect(create).not.toHaveBeenCalled();
  });
});
