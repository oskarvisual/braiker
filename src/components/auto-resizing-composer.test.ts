import { describe, expect, it } from "vitest";
import { composerTextareaHeight } from "./auto-resizing-composer";

describe("composerTextareaHeight", () => {
  it("keeps a compact single-line composer until content needs more space", () => {
    expect(composerTextareaHeight(24)).toBe(48);
    expect(composerTextareaHeight(48)).toBe(48);
  });

  it("grows with the message but stops at the readable maximum", () => {
    expect(composerTextareaHeight(96)).toBe(96);
    expect(composerTextareaHeight(260)).toBe(168);
  });
});
