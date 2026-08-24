import { describe, expect, it } from "vitest";
import { pageWindow } from "./page";

describe("pageWindow", () => {
  it("uses a bounded page size and asks for one extra record to detect a next page", () => {
    expect(pageWindow("3")).toEqual({ page: 3, skip: 50, take: 26 });
  });

  it("falls back safely for malformed or missing page values", () => {
    expect(pageWindow(null)).toEqual({ page: 1, skip: 0, take: 26 });
    expect(pageWindow("-2")).toEqual({ page: 1, skip: 0, take: 26 });
  });
});
