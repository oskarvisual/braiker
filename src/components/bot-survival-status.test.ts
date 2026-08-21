import { describe, expect, it } from "vitest";
import { survivalMoodEmoji } from "./bot-survival-status";

describe("survivalMoodEmoji", () => {
  it("gives every deterministic survival state a distinct native emoji", () => {
    expect(survivalMoodEmoji("THRIVING")).toBe("😄");
    expect(survivalMoodEmoji("STABLE")).toBe("🙂");
    expect(survivalMoodEmoji("CAUTIOUS")).toBe("🤔");
    expect(survivalMoodEmoji("STRESSED")).toBe("😰");
    expect(survivalMoodEmoji("CRITICAL")).toBe("😟");
    expect(survivalMoodEmoji("DEAD")).toBe("☠️");
    expect(survivalMoodEmoji("CALIBRATING")).toBe("🧭");
  });
});
