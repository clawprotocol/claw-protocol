import { describe, expect, it } from "vitest";
import { looksLikeRefinementIntent } from "./reviewRefineIntent";

describe("looksLikeRefinementIntent", () => {
  it("matches user-listed revision prefaces (case / punctuation tolerant)", () => {
    expect(looksLikeRefinementIntent("Please revise, add a 30-day cure period for breach.")).toBe(true);
    expect(looksLikeRefinementIntent("Please revise the confidentiality section.")).toBe(true);
    expect(looksLikeRefinementIntent("Add a mutual indemnity clause.")).toBe(true);
    expect(looksLikeRefinementIntent("Replace the governing law with New York.")).toBe(true);
    expect(looksLikeRefinementIntent("Confirm the payment schedule matches our January deal.")).toBe(true);
    expect(looksLikeRefinementIntent("Do not change party names, only the termination section.")).toBe(true);
  });

  it("matches common one-line instruction verbs on the first line", () => {
    expect(looksLikeRefinementIntent("Update the warranty disclaimer to be mutual.")).toBe(true);
    expect(looksLikeRefinementIntent("clarify payment to net 15")).toBe(true);
  });
});
