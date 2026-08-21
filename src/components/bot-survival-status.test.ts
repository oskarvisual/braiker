import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { survivalMoodEmoji } from "./bot-survival-status";
import { BotSurvivalStatus } from "./bot-survival-status";

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

  it("renders the mood as a bare emoji instead of an icon tile", () => {
    const markup = renderToStaticMarkup(createElement(BotSurvivalStatus, { compact: true, state: { code: "STABLE", label: "Stable", summary: "Capital is healthy.", tone: "neutral" } }));

    expect(markup).toContain("🙂");
    expect(markup).not.toContain("<i");
  });
});
