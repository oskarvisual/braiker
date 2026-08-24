import { describe, expect, it } from "vitest";
import { chatTitleEditorCommand } from "./chat-title-editor";

describe("chatTitleEditorCommand", () => {
  it("confirms a title with Enter and cancels it with Escape", () => {
    expect(chatTitleEditorCommand("Enter")).toBe("CONFIRM");
    expect(chatTitleEditorCommand("Escape")).toBe("CANCEL");
  });

  it("leaves other keys to the title input", () => {
    expect(chatTitleEditorCommand("a")).toBeNull();
  });
});
