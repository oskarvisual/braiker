import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { managerActionSummary, reconcileManagerMessages, synchronizeManagerSessions, type ManagerSession } from "@/components/manager-chat";

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

  it("replaces a temporary local message with its persisted equivalent after a reply", () => {
    const local = { id: "local-123", role: "USER" as const, source: "WEB" as const, content: "give me report system", createdAt: "2026-08-24T16:00:00.000Z" };
    const persisted = { ...local, id: "message-123", createdAt: "2026-08-24T16:00:00.100Z" };

    expect(reconcileManagerMessages([local], [persisted])).toEqual([persisted]);
  });

  it("renders the paper-only impact of a pending Manager power proposal", () => {
    expect(managerActionSummary({ id: "proposal-1", botName: "Juan trAIder", action: "TURN_ON", expiresAt: "2026-08-22T15:10:00.000Z" }))
      .toContain("turn ON Juan trAIder");
  });

  it("does not repeat proposal-confirmation policy in the conversation sidebar", () => {
    expect(readFileSync(resolve(process.cwd(), "src/components/manager-chat.tsx"), "utf8"))
      .not.toContain("Proposals require confirmation");
  });

  it("starts at the latest message and pages backward inside the transcript", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/manager-chat.tsx"), "utf8");

    expect(component).toContain("container.scrollTop = container.scrollHeight");
    expect(component).toContain("loadOlderMessages");
    expect(component).toContain("/api/manager/sessions/${selected.id}/messages?before=");
    expect(component).toContain("Loading earlier messages…");
  });

  it("guards a web send synchronously so one submit cannot create duplicate messages", () => {
    const component = readFileSync(resolve(process.cwd(), "src/components/manager-chat.tsx"), "utf8");

    expect(component).toContain("const sendInFlightRef = useRef(false)");
    expect(component).toContain("if (!content || !selected || sending || sendInFlightRef.current) return;");
    expect(component).toContain("sendInFlightRef.current = true;");
  });
});
