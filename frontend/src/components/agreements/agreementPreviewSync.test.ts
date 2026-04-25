import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { extractStructuredPatchesFromPreview } from "./agreementPreviewSync";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const base: ParsedDraftShape = {
  title: "Test Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Alice", role: "party" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Build a widget",
  payment_terms: "$1,000 flat",
  duration: "3 months",
  due_date: null,
  effective_date: "March 1, 2026",
  payment: { amount: null, cadence: null, valid: true },
  termination_summary: "Either party may terminate with 14 days notice.",
};

describe("extractStructuredPatchesFromPreview", () => {
  it("extracts payment_terms when section 2 text changes", () => {
    const full = buildAgreementPreviewText(base).replace("$1,000 flat", "$2,000 net 30");
    const patch = extractStructuredPatchesFromPreview(full, base);
    expect(patch.payment_terms).toBe("$2,000 net 30");
  });
});
