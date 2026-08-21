import { describe, expect, it } from "vitest";
import { applyBotFill, releaseBotReservation } from "@/modules/capital/fill-accounting";

describe("per-bot fill accounting", () => {
  it("debits only the purchasing bot's virtual cash and releases its reservation", () => {
    expect(applyBotFill({ action: "BUY", currentCapital: "50", reservedCapital: "8.16", fillQuantity: "0.08", fillPrice: "100", reservedForOrder: "8.16" })).toEqual({ currentCapital: "42.000000000000", reservedCapital: "0.000000000000", lifeStatus: "ACTIVE" });
  });

  it("credits sale proceeds and marks a bot dead only when it has no cash and no position", () => {
    expect(applyBotFill({ action: "SELL", currentCapital: "0", reservedCapital: "0", fillQuantity: "0.1", fillPrice: "100", reservedForOrder: "0", remainingPositionQuantity: "0" })).toEqual({ currentCapital: "10.000000000000", reservedCapital: "0.000000000000", lifeStatus: "ACTIVE" });
    expect(applyBotFill({ action: "SELL", currentCapital: "0", reservedCapital: "0", fillQuantity: "0", fillPrice: "100", reservedForOrder: "0", remainingPositionQuantity: "0" })).toMatchObject({ lifeStatus: "DEAD" });
  });

  it("releases a cancelled order reservation without changing the bot's cash", () => {
    expect(releaseBotReservation({ currentCapital: "50", reservedCapital: "8.16", reservedForOrder: "8.16" }))
      .toEqual({ currentCapital: "50.000000000000", reservedCapital: "0.000000000000" });
  });
});
