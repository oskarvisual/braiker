import { describe, expect, it } from "vitest";
import { appendToast } from "./toast-state";

describe("appendToast", () => {
  it("keeps the newest three messages visible", () => {
    const initial = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(appendToast(initial, { id: 4 })).toEqual([{ id: 2 }, { id: 3 }, { id: 4 }]);
  });
});
