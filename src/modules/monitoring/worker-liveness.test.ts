import { describe, expect, it } from "vitest";
import { workerLivenessResponse } from "./worker-liveness";

describe("worker liveness", () => {
  it("only reports healthy after the worker has completed startup", () => {
    expect(workerLivenessResponse(false)).toMatchObject({ status: 503, body: { status: "starting" } });
    expect(workerLivenessResponse(true)).toMatchObject({ status: 200, body: { status: "healthy" } });
  });
});
