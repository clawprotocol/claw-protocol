import { describe, expect, it } from "vitest";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";
import {
  needsPaidProDocumentTitleOpeningRepair,
  repairPaidProDocumentTitleOpening,
} from "./paidProDocumentTitleOpeningRepair";

describe("repairPaidProDocumentTitleOpening", () => {
  it("is idempotent on a clean title + recital opening", () => {
    const clean = [
      "MUTUAL SERVICES AGREEMENT",
      "",
      'This Mutual Services Agreement (this "Agreement") is entered into by and among Example LLC and Sample Inc.',
      "",
      "1. Services",
      "Each party provides services.",
    ].join("\n");

    expect(needsPaidProDocumentTitleOpeningRepair(clean)).toBe(false);
    const once = repairPaidProDocumentTitleOpening(clean);
    const twice = repairPaidProDocumentTitleOpening(once.text);
    expect(once.repairs).toHaveLength(0);
    expect(twice.text).toBe(once.text);
    expect(summarizePaidProDocumentBlockClassifications(clean).titleCount).toBe(1);
  });

  it("dedupes repeated title phrases glued into the recital", () => {
    const collapsed =
      "MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT This Mutual Services Agreement (this \"Agreement\") is entered into by and among Example LLC and Sample Inc.\n\n1. Services\nBody.";
    const repaired = repairPaidProDocumentTitleOpening(collapsed);
    expect(repaired.repairs).toContain("display:repair_collapsed_title_opening");
    expect(repaired.text).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement/m);
    expect(repaired.text).not.toMatch(/MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i);
    expect(summarizePaidProDocumentBlockClassifications(repaired.text).titleCount).toBe(1);
  });
});
