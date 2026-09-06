/** Tests for score threshold styling (PRD §15.1, §25.2 #7). */

import { describe, expect, it } from "vitest";
import { scoreStatus, scoreStyle } from "./scores";

describe("scoreStatus thresholds", () => {
  it("0-40 is critical", () => {
    expect(scoreStatus(0)).toBe("critical");
    expect(scoreStatus(40)).toBe("critical");
  });

  it("41-75 is warning", () => {
    expect(scoreStatus(41)).toBe("warning");
    expect(scoreStatus(75)).toBe("warning");
  });

  it("76-100 is good", () => {
    expect(scoreStatus(76)).toBe("good");
    expect(scoreStatus(100)).toBe("good");
  });
});

describe("scoreStyle", () => {
  it("provides a distinct non-color cue per status (PRD §14A)", () => {
    const critical = scoreStyle(10);
    const warning = scoreStyle(60);
    const good = scoreStyle(90);
    expect(new Set([critical.cue, warning.cue, good.cue]).size).toBe(3);
    expect(new Set([critical.color, warning.color, good.color]).size).toBe(3);
    expect(critical.word).toBe("low");
    expect(warning.word).toBe("fair");
    expect(good.word).toBe("good");
  });
});
