import { describe, expect, it } from "vitest";
import { assessResourceUrl, resourceCategories } from "./resource-policy";

describe("resource policy", () => {
  it("keeps the seven resource categories explicit", () => {
    expect(resourceCategories).toEqual(["MACRO", "NEWS", "FILINGS", "EARNINGS", "SENTIMENT", "ETF_ROTATION", "TECHNICAL"]);
  });

  it("accepts only public HTTPS links and auto-activates configured trusted domains", () => {
    expect(assessResourceUrl("https://www.sec.gov/Archives/example", ["www.sec.gov"])).toMatchObject({ accepted: true, autoActivate: true, hostname: "www.sec.gov" });
    expect(assessResourceUrl("http://www.sec.gov/Archives/example", ["www.sec.gov"])).toMatchObject({ accepted: false, reason: "HTTPS_REQUIRED" });
    expect(assessResourceUrl("https://127.0.0.1/private", ["www.sec.gov"])).toMatchObject({ accepted: false, reason: "PRIVATE_HOST" });
    expect(assessResourceUrl("https://new-blog.example/article", ["www.sec.gov"])).toMatchObject({ accepted: true, autoActivate: false });
  });
});
