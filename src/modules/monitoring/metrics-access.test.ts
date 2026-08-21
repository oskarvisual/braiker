import { describe, expect, it } from "vitest";
import { hasMetricsAccess } from "@/modules/monitoring/metrics-access";

describe("metrics access", () => {
  it("rejects an anonymous request", () => {
    expect(hasMetricsAccess({ authorization: null, configuredToken: "metrics-secret", userRole: null })).toBe(false);
  });

  it("allows an administrator session or an exact bearer token", () => {
    expect(hasMetricsAccess({ authorization: null, configuredToken: "metrics-secret", userRole: "ADMIN" })).toBe(true);
    expect(hasMetricsAccess({ authorization: "Bearer metrics-secret", configuredToken: "metrics-secret", userRole: null })).toBe(true);
  });
});
