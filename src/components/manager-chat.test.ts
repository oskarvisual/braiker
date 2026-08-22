import { describe, expect, it } from "vitest";
import { synchronizeManagerSessions, type ManagerSession } from "@/components/manager-chat";

const operationsSession: ManagerSession = {
  id: "operations-1",
  title: "Bot Manager · Operations",
  kind: "OPERATIONS",
  pinned: true,
  updatedAt: "2026-08-21T21:00:00.000Z",
  messages: []
};

describe("synchronizeManagerSessions", () => {
  it("keeps the active conversation and includes Telegram messages persisted after the page opened", () => {
    const synchronized = synchronizeManagerSessions("operations-1", [
      {
        ...operationsSession,
        updatedAt: "2026-08-21T21:02:00.000Z",
        messages: [
          {
            id: "telegram-message-1",
            role: "USER",
            source: "TELEGRAM",
            content: "que sugieres?",
            createdAt: "2026-08-21T21:01:00.000Z"
          }
        ]
      }
    ]
    );

    expect(synchronized.selectedId).toBe("operations-1");
    expect(synchronized.sessions[0]?.messages[0]?.source).toBe("TELEGRAM");
  });

  it("falls back to the first synchronized conversation when the selected one no longer exists", () => {
    const synchronized = synchronizeManagerSessions("removed-session", [operationsSession]);

    expect(synchronized.selectedId).toBe("operations-1");
  });
});
