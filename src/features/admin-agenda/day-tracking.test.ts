import { describe, expect, it } from "vitest";

import { advanceDay } from "./day-tracking";

describe("advanceDay", () => {
  it("keeps the state while the day is the same", () => {
    const state = { today: "2026-11-13", selectedDate: "2026-11-13" };
    expect(advanceDay(state, "2026-11-13")).toBe(state);
  });

  it("moves the view to the new day when she was on the old today", () => {
    expect(advanceDay({ today: "2026-11-13", selectedDate: "2026-11-13" }, "2026-11-14")).toEqual({
      today: "2026-11-14",
      selectedDate: "2026-11-14",
    });
  });

  it("does not touch a date she navigated to", () => {
    expect(advanceDay({ today: "2026-11-13", selectedDate: "2026-11-20" }, "2026-11-14")).toEqual({
      today: "2026-11-14",
      selectedDate: "2026-11-20",
    });
  });
});
