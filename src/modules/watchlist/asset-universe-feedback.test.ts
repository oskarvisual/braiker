import { describe, expect, it } from "vitest";
import { assetUniverseFeedback, assetUniversePublicError } from "./asset-universe-feedback";

describe("asset universe feedback", () => {
  it("does not expose a Prisma runtime error to the settings page", () => {
    expect(assetUniversePublicError(new TypeError("Cannot read properties of undefined (reading 'upsert')"))).toEqual({ code: "ASSET_UNIVERSE_UNAVAILABLE", status: 503 });
    expect(assetUniverseFeedback("ASSET_UNIVERSE_UNAVAILABLE")).toContain("temporarily unavailable");
  });

  it("preserves explicit authorization feedback", () => {
    expect(assetUniversePublicError(new Error("FORBIDDEN"))).toEqual({ code: "FORBIDDEN", status: 403 });
    expect(assetUniverseFeedback("FORBIDDEN")).toContain("Administrator");
  });
});
