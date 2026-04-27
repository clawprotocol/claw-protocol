import { describe, expect, it } from "vitest";
import { PREMIUM_COMPLETION_ATTEMPT_MAX_MS } from "./premiumCompletionAttemptTimeout";

describe("PREMIUM_COMPLETION_ATTEMPT_MAX_MS", () => {
  it("covers post-HTTP work (review, finalize audit, review route) so withTimeout does not reject a won race", () => {
    expect(PREMIUM_COMPLETION_ATTEMPT_MAX_MS).toBe(10 * 60 * 1000);
  });
});
