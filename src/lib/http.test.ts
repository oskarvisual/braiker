import { afterEach, describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/http";

const publicOrigin = "https://braiker-stagging.orivisdev.shop";
const originalAppOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalAppOrigin;
});

describe("assertSameOrigin", () => {
  it("accepts the configured public origin behind a reverse proxy", () => {
    process.env.APP_ORIGIN = publicOrigin;
    const request = new Request("http://10.0.0.12:3000/api/auth/password", {
      method: "POST",
      headers: { origin: publicOrigin }
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("uses the request origin when no public origin is configured", () => {
    delete process.env.APP_ORIGIN;
    const request = new Request("http://localhost:3000/api/auth/password", {
      method: "POST",
      headers: { origin: "http://localhost:3000" }
    });

    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects a different browser origin even behind a reverse proxy", () => {
    process.env.APP_ORIGIN = publicOrigin;
    const request = new Request("http://10.0.0.12:3000/api/auth/password", {
      method: "POST",
      headers: { origin: "https://attacker.example" }
    });

    expect(() => assertSameOrigin(request)).toThrow("CSRF_ORIGIN_REJECTED");
  });

  it("rejects malformed Origin headers without exposing a parser error", () => {
    process.env.APP_ORIGIN = publicOrigin;
    const request = new Request("http://10.0.0.12:3000/api/auth/password", {
      method: "POST",
      headers: { origin: "not a valid origin" }
    });

    expect(() => assertSameOrigin(request)).toThrow("CSRF_ORIGIN_REJECTED");
  });
});
