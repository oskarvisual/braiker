import { describe, expect, it, vi } from "vitest";
import { parseLearningProposalResolution, resolveLearningProposal } from "./learning-proposal-service";

describe("learning proposal resolution", () => {
  it("parses only explicit approve/reject commands", () => {
    expect(parseLearningProposalResolution("APPROVE 11111111-1111-4111-8111-111111111111")).toEqual({ action: "APPROVE", proposalId: "11111111-1111-4111-8111-111111111111" });
    expect(parseLearningProposalResolution("this sounds useful")).toBeNull();
  });

  it("claims an Admin approval before creating a caution-only internal rule", async () => {
    const db = {
      botLearningProposal: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: "proposal-1", botId: "bot-1", rule: "Wait for stronger confirmation.", bot: { walletId: "wallet-1", name: "Bob" } }),
        update: vi.fn().mockResolvedValue({})
      },
      botLearnedInstruction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "rule-1", revision: 1, content: "Wait for stronger confirmation." }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(resolveLearningProposal({ proposalId: "proposal-1", userId: "admin-1", actorRole: "ADMIN", action: "APPROVE" }, db as never)).resolves.toEqual({ botName: "Bob", status: "APPROVED" });
    expect(db.botLearnedInstruction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "LEARNING_PROPOSAL" }) }));
    expect(db.botLearningProposal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "PENDING" }) }));
  });

  it("rejects non-Admin resolution without mutating anything", async () => {
    const db = { botLearningProposal: { updateMany: vi.fn() }, botLearnedInstruction: { findFirst: vi.fn(), create: vi.fn() }, auditLog: { create: vi.fn() } };
    await expect(resolveLearningProposal({ proposalId: "proposal-1", userId: "viewer-1", actorRole: "VIEWER", action: "APPROVE" }, db as never)).rejects.toThrow("FORBIDDEN");
    expect(db.botLearningProposal.updateMany).not.toHaveBeenCalled();
  });
});
