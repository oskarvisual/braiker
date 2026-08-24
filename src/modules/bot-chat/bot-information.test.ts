import { describe, expect, it } from "vitest";
import { buildBotInformationReply, parseBotInformationRequest } from "./bot-information";
import { newYorkMarketDayStart } from "@/modules/market/new-york-market-day";

describe("deterministic bot information", () => {
  it("recognizes Spanish and English requests for remaining trades and capital", () => {
    expect(parseBotInformationRequest("¿Cuántas operaciones restantes tiene Bob hoy?")).toBe("TRADES");
    expect(parseBotInformationRequest("How much money does Bob have left?")).toBe("CAPITAL");
    expect(parseBotInformationRequest("Tell me about the market")).toBeNull();
  });

  it("reports the effective trade capacity and virtual capital without floating-point arithmetic", () => {
    const reply = buildBotInformationReply({
      name: "Bob trAIder",
      locale: "es",
      tradesToday: 4,
      maxTradesPerDay: 4,
      currentCapital: "12.500000000000",
      reservedCapital: "2.160000000000",
      checkedAt: new Date("2026-08-24T16:00:00.000Z")
    });

    expect(reply).toContain("0");
    expect(reply).toContain("$12.50");
    expect(reply).toContain("$2.16");
    expect(reply).toContain("$10.34");
    expect(reply).toContain("límite efectivo");
  });

  it("finds the New York market-day boundary across daylight saving time", () => {
    expect(newYorkMarketDayStart(new Date("2026-08-24T16:00:00.000Z")).toISOString()).toBe("2026-08-24T04:00:00.000Z");
    expect(newYorkMarketDayStart(new Date("2026-01-24T16:00:00.000Z")).toISOString()).toBe("2026-01-24T05:00:00.000Z");
  });
});
