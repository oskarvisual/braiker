export function canDeleteBot(input: { lifeStatus: "ACTIVE" | "DEAD"; runMode: string }) {
  return input.lifeStatus === "ACTIVE" && input.runMode === "OFF";
}

export function canCloneBot(_: { lifeStatus: "ACTIVE" | "DEAD" }) { return true; }
