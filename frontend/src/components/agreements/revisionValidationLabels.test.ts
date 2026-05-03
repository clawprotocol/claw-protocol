import { describe, expect, it } from "vitest";
import { humanizeRevisionValidationIssues } from "./revisionValidationLabels";

describe("humanizeRevisionValidationIssues", () => {
  it("maps known server codes to user-facing labels", () => {
    expect(
      humanizeRevisionValidationIssues([
        "missing_cure_period",
        "missing_non_disparagement",
        "timeline_not_updated",
        "jurisdiction_dropped",
        "payment_terms_dropped",
      ])
    ).toEqual([
      "Cure period may not have been added.",
      "Non-disparagement language may be missing.",
      "Timeline may not reflect the requested change.",
      "Governing law may have been removed.",
      "Payment terms may have been removed.",
    ]);
  });

  it("falls back to raw code for unknown issues", () => {
    expect(humanizeRevisionValidationIssues(["future_anchor_xyz"])).toEqual(["future_anchor_xyz"]);
  });
});
