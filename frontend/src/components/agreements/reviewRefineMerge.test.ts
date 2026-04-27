import { describe, expect, it } from "vitest";
import { mergeProPreservingRefineParsed } from "./reviewRefineMerge";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const base: ParsedDraftShape = {
  title: "NDA",
  jurisdiction: "Delaware",
  parties: [
    { name: "Acme", role: "discloser" },
    { name: "Beta", role: "recipient" },
  ],
  purpose: "Build software",
  payment_terms: "None",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: "monthly", valid: true },
  agreement_family: "nda",
};

describe("mergeProPreservingRefineParsed", () => {
  it("keeps pro document fields when the refine payload omits them", () => {
    const prior: ParsedDraftShape = {
      ...base,
      premium_full_document_text: "FULL PRO TEXT",
    };
    const fromApi: ParsedDraftShape = {
      ...base,
      purpose: "Build software — with expanded confidentiality carve-outs.",
    };
    delete (fromApi as { premium_full_document_text?: string }).premium_full_document_text;
    const out = mergeProPreservingRefineParsed(prior, fromApi);
    expect(out.purpose).toContain("expanded");
    expect(out.premium_full_document_text).toBe("FULL PRO TEXT");
    expect(out.jurisdiction).toBe("Delaware");
    expect((out.parties || []).map((p) => p.name)).toEqual(["Acme", "Beta"]);
  });
});
