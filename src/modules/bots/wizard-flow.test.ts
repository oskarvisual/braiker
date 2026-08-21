import { describe, expect, it } from "vitest";
import { nextBotWizardStep } from "./wizard-flow";

describe("nextBotWizardStep", () => {
  it("advances an incomplete wizard instead of treating it as a save", () => {
    expect(nextBotWizardStep(2)).toBe(3);
  });

  it("keeps the final step in place", () => {
    expect(nextBotWizardStep(3)).toBe(3);
  });
});
