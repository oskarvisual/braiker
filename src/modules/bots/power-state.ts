/** Paper execution eligibility is represented separately from bot life. */
export function botPowerState(runMode: "OFF" | "SIMULATION" | "PAPER_ACTIVE") {
  return runMode === "PAPER_ACTIVE" ? { label: "ON", tone: "on" as const } : { label: "OFF", tone: "off" as const };
}
