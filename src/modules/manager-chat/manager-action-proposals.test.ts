import { describe, expect, it, vi } from "vitest";
import { confirmManagerActionProposal, createManagerActionProposal, listPendingManagerActionProposals } from "./manager-action-proposals";

describe("Manager action proposals", () => {
  it("stores only a hash of the Telegram confirmation code", async () => {
    const create = vi.fn().mockResolvedValue({ id: "proposal-1", expiresAt: new Date("2026-08-22T15:10:00.000Z") });
    const result = await createManagerActionProposal({
      userId: "admin-1",
      actorRole: "ADMIN",
      botId: "bot-1",
      action: "TURN_OFF",
      now: new Date("2026-08-22T15:00:00.000Z"),
      code: "CONFIRM-123"
    }, { managerActionProposal: { create } } as never);

    expect(result).toEqual({ id: "proposal-1", confirmationCode: "CONFIRM-123", expiresAt: new Date("2026-08-22T15:10:00.000Z") });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      codeHash: expect.not.stringContaining("CONFIRM-123"),
      status: "PENDING",
      action: "TURN_OFF"
    }) }));
  });

  it("claims a Telegram confirmation exactly once then revalidates through the existing bot control transaction", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const applyControl = vi.fn().mockResolvedValue({ id: "bot-1", runMode: "OFF", killSwitch: true });
    const db = { managerActionProposal: { updateMany, update, findUnique: vi.fn().mockResolvedValue({ botId: "bot-1", action: "TURN_OFF" }) } } as never;

    const result = await confirmManagerActionProposal({
      proposalId: "proposal-1",
      actorId: "admin-1",
      actorRole: "ADMIN",
      channel: "TELEGRAM",
      confirmationCode: "CONFIRM-123",
      now: new Date("2026-08-22T15:01:00.000Z")
    }, { db, applyControl });

    expect(result).toEqual({ id: "bot-1", runMode: "OFF", killSwitch: true });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: "proposal-1", userId: "admin-1", status: "PENDING", codeHash: expect.any(String)
    }), data: expect.objectContaining({ status: "CONFIRMING" }) }));
    expect(applyControl).toHaveBeenCalledWith(expect.objectContaining({ botId: "bot-1", action: "TURN_OFF", actorId: "admin-1", actorRole: "ADMIN", db }));
    expect(update).toHaveBeenCalledWith({ where: { id: "proposal-1" }, data: expect.objectContaining({ status: "EXECUTED" }) });
  });

  it("does not execute an expired, reused, or invalid confirmation", async () => {
    const applyControl = vi.fn();
    await expect(confirmManagerActionProposal({
      proposalId: "proposal-1", actorId: "admin-1", actorRole: "ADMIN", channel: "TELEGRAM", confirmationCode: "wrong"
    }, { db: { managerActionProposal: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn(), findUnique: vi.fn() } } as never, applyControl })).rejects.toThrow("MANAGER_ACTION_CONFIRMATION_INVALID");
    expect(applyControl).not.toHaveBeenCalled();
  });

  it("lists only the caller's still-actionable proposals so a web refresh keeps the confirmation visible", async () => {
    const now = new Date("2026-08-22T15:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([{ id: "proposal-1", action: "TURN_ON", expiresAt: new Date("2026-08-22T15:10:00.000Z"), bot: { name: "Juan trAIder" } }]);

    await expect(listPendingManagerActionProposals("admin-1", { managerActionProposal: { findMany } } as never, now)).resolves.toEqual([
      { id: "proposal-1", action: "TURN_ON", expiresAt: new Date("2026-08-22T15:10:00.000Z"), botName: "Juan trAIder" }
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "admin-1", status: "PENDING", expiresAt: { gt: now } }
    }));
  });
});
