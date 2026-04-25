import { describe, expect, it } from "vitest";
import { extractEffectiveDateFromRawIntake, normalizeParsedDraftLegalConcepts } from "./intakeDraftLegalNormalize";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const baseDraft = (): ParsedDraftShape => ({
  title: "Consulting Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "A LLC", role: "party" },
    { name: "B", role: "party" },
  ],
  purpose: "Advisory services",
  payment_terms: "$5,000 monthly",
  duration: "12 months",
  due_date: null,
  effective_date: "Upon full execution by all parties",
  payment: { amount: null, cadence: "monthly", valid: true },
});

describe("extractEffectiveDateFromRawIntake", () => {
  it("parses starting month day year", () => {
    expect(extractEffectiveDateFromRawIntake("Work starts starting May 1st 2026 between parties.")).toBe("May 1, 2026");
  });

  it("parses ISO dates", () => {
    expect(extractEffectiveDateFromRawIntake("Effective 2026-05-01.")).toBe("May 1, 2026");
  });
});

describe("normalizeParsedDraftLegalConcepts", () => {
  it("sets termination summary for at-will language", () => {
    const raw = "This is an at-will consulting deal between A and B in Delaware.";
    const out = normalizeParsedDraftLegalConcepts(baseDraft(), raw);
    expect(out.termination_summary).toMatch(/at-will/i);
  });

  it("fills weak effective date from raw when present", () => {
    const d = baseDraft();
    const raw = `${d.purpose} starting June 15, 2026 payment monthly`;
    const out = normalizeParsedDraftLegalConcepts(d, raw);
    expect(out.effective_date).toBe("June 15, 2026");
  });

  it("does not apply at-will service heuristics to operating agreement family", () => {
    const d: ParsedDraftShape = {
      ...baseDraft(),
      agreement_family: "operating_agreement",
      title: "Operating Agreement — ABC LLC",
    };
    const raw = "This is an at-will consulting deal between A and B in Delaware.";
    const out = normalizeParsedDraftLegalConcepts(d, raw);
    expect(out.termination_summary).toBeUndefined();
  });

  it("moves misrouted notice period off duration and fills termination from intake", () => {
    const raw =
      "Between A LLC and B LLC. Monthly pay of $2000. Termination by either party by email with 30 days notice.";
    const d: ParsedDraftShape = {
      ...baseDraft(),
      duration: "30 days · Upon full execution by all parties",
      effective_date: "Upon full execution by all parties",
      termination_summary: undefined,
    };
    const out = normalizeParsedDraftLegalConcepts(d, raw);
    expect(out.duration?.toLowerCase()).toContain("ongoing");
    expect(out.termination_summary?.toLowerCase()).toMatch(/either party may terminate|prior written notice/);
  });

  it("replaces generic 12-month shell duration when intake implies termination-driven term", () => {
    const raw = "Between A and B. $1,000 monthly. Either party may terminate with 30 days written notice.";
    const d: ParsedDraftShape = {
      ...baseDraft(),
      duration: "12 months unless terminated earlier as agreed in writing.",
      termination_summary: undefined,
    };
    const out = normalizeParsedDraftLegalConcepts(d, raw);
    expect(out.duration?.toLowerCase()).toContain("ongoing");
    expect(out.termination_summary?.toLowerCase()).toMatch(/either party|notice/);
  });
});
