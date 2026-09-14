import { describe, expect, it } from "vitest";
import {
  clearUnconfirmedServiceStartEffectiveDate,
  extractEffectiveDateFromRawIntake,
  extractServiceStartFromRawIntake,
  normalizeParsedDraftLegalConcepts,
} from "./intakeDraftLegalNormalize";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { STARTER_DEFAULT_TERMINATION_SUMMARY } from "./starterAgreementPreviewNormalize";

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
  it("does not treat a service start as the agreement effective date", () => {
    expect(extractEffectiveDateFromRawIntake("Work starts starting May 1st 2026 between parties.")).toBeNull();
    expect(extractServiceStartFromRawIntake("Term twelve months starting October 1, 2026")).toBe("October 1, 2026");
  });

  it("parses ISO dates when labeled effective", () => {
    expect(extractEffectiveDateFromRawIntake("Effective 2026-05-01.")).toBe("May 1, 2026");
  });
});

describe("normalizeParsedDraftLegalConcepts", () => {
  it("sets termination summary for at-will language", () => {
    const raw = "This is an at-will consulting deal between A and B in Delaware.";
    const out = normalizeParsedDraftLegalConcepts(baseDraft(), raw);
    expect(out.termination_summary).toMatch(/at-will/i);
  });

  it("does not copy a service start into effective_date", () => {
    const d = baseDraft();
    const raw = `${d.purpose} starting June 15, 2026 payment monthly`;
    const out = normalizeParsedDraftLegalConcepts(d, raw);
    expect(out.effective_date).not.toBe("June 15, 2026");
    expect(extractServiceStartFromRawIntake(raw)).toBe("June 15, 2026");
  });

  it("clears a parse effective_date that is only the service start", () => {
    const d = { ...baseDraft(), effective_date: "October 1, 2026" };
    const raw =
      "Scope is AI workflow implementation. Term twelve months starting October 1, 2026.";
    const out = clearUnconfirmedServiceStartEffectiveDate(d, raw);
    expect(out.effective_date).toBeNull();
  });

  it("does not apply the starter termination default on the premium path", () => {
    const raw = "Between A LLC and B LLC. Scope is advisory work. $5,000. Delaware law.";
    const out = normalizeParsedDraftLegalConcepts(baseDraft(), raw, { applyStarterTerminationDefault: false });
    expect(out.termination_summary).toBeUndefined();
  });

  it("strips a previously applied starter termination default on the premium path", () => {
    const raw =
      "Draft a consulting services agreement between Harbor Peak Analytics LLC and Ironvale Manufacturing Inc. Scope is AI workflow implementation. $48,000. Term twelve months starting October 1, 2026. Delaware.";
    const d = {
      ...baseDraft(),
      termination_summary: STARTER_DEFAULT_TERMINATION_SUMMARY,
    };
    const out = normalizeParsedDraftLegalConcepts(d, raw, { applyStarterTerminationDefault: false });
    expect(out.termination_summary).toBeUndefined();
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

  it("fills concrete default termination when intake omits explicit notice terms", () => {
    const raw =
      "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC for a logo and brand kit, 2400 dollars due on signing, 30 days starting August 24 2026, Texas law.";
    const out = normalizeParsedDraftLegalConcepts(baseDraft(), raw);
    expect(out.termination_summary).toMatch(/material breach/i);
    expect(out.termination_summary).not.toMatch(/to be agreed/i);
  });
});
