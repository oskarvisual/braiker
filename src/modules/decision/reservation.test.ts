import { describe, expect, it } from "vitest";
import { reservationAmount } from "@/modules/decision/reservation";

describe("reservationAmount", () => {
  it("reserves the buffered market-order amount using decimals", () => {
    expect(reservationAmount({ action: "BUY", orderType: "MARKET", quantity: "0.1", estimatedPrice: "81.6" }, "0.02")).toBe("8.3232");
  });

  it("does not reserve cash for a sell", () => {
    expect(reservationAmount({ action: "SELL", orderType: "MARKET", quantity: "1", estimatedPrice: "10" }, "0.02")).toBe("0");
  });
});
