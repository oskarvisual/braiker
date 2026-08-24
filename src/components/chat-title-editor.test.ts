import { describe, expect, it } from "vitest";
import { chatTitleEditorCommand, isChatTitleEditing } from "./chat-title-editor";

describe("chatTitleEditorCommand", () => {
  it("confirms a title with Enter and cancels it with Escape", () => {
    expect(chatTitleEditorCommand("Enter")).toBe("CONFIRM");
    expect(chatTitleEditorCommand("Escape")).toBe("CANCEL");
  });

  it("leaves other keys to the title input", () => {
    expect(chatTitleEditorCommand("a")).toBeNull();
  });

  it("does not mistake an empty session for an active rename", () => {
    expect(isChatTitleEditing(null, null)).toBe(false);
    expect(isChatTitleEditing("session-1", "session-1")).toBe(true);
    expect(isChatTitleEditing("session-1", "session-2")).toBe(false);
  });
});
