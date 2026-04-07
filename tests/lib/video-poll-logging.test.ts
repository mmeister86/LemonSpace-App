import { describe, expect, it } from "vitest";

import {
  shouldLogVideoPollAttempt,
  shouldLogVideoPollResult,
} from "@/lib/video-poll-logging";

describe("video poll logging", () => {
  it("logs only the first and every fifth in-progress attempt", () => {
    expect(shouldLogVideoPollAttempt(1)).toBe(true);
    expect(shouldLogVideoPollAttempt(2)).toBe(false);
    expect(shouldLogVideoPollAttempt(5)).toBe(true);
    expect(shouldLogVideoPollAttempt(6)).toBe(false);
  });

  it("always logs terminal poll results", () => {
    expect(shouldLogVideoPollResult(2, "IN_PROGRESS")).toBe(false);
    expect(shouldLogVideoPollResult(5, "IN_PROGRESS")).toBe(true);
    expect(shouldLogVideoPollResult(17, "COMPLETED")).toBe(true);
    expect(shouldLogVideoPollResult(3, "FAILED")).toBe(true);
  });
});
