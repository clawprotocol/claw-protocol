import { describe, expect, it } from "vitest";
import { preserveExtractedFacts } from "./draftFactPreservation";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true };

function baseDraft(overrides?: Partial<ParsedDraftShape>): ParsedDraftShape {
  return {
    title: "Agreement",
    jurisdiction: "Delaware",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
    ...overrides,
  };
}

describe("preserveExtractedFacts", () => {
  it("restores scope when draft has placeholder but intake has scope", () => {
    const intake = "Consulting agreement. Scope: Strategic advisory on market expansion. Payment: $5,000/month.";
    const draft = baseDraft({ purpose: "Scope and deliverables to be refined in review." });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.purpose).toMatch(/advisory|market expansion/i);
    expect(restoredFields).toContain("purpose");
  });

  it("does NOT override existing non-placeholder purpose", () => {
    const intake = "Consulting agreement. Scope: Build a widget.";
    const draft = baseDraft({ purpose: "Design and implement user dashboard" });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.purpose).toBe("Design and implement user dashboard");
    expect(restoredFields).not.toContain("purpose");
  });

  it("restores payment when draft has placeholder but intake has amount", () => {
    const intake = "Service agreement. Payment: $8,000 flat fee. Scope: Data migration.";
    const draft = baseDraft({ payment_terms: "Payment schedule to be agreed with the other party — add specifics in review." });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.payment_terms).toMatch(/8[,.]?000/);
    expect(restoredFields).toContain("payment_terms");
  });

  it("restores jurisdiction when draft has Delaware default but intake specifies state", () => {
    const intake = "Consulting agreement. Governing law: California. Fee: $3,000/month.";
    const draft = baseDraft({ jurisdiction: "Delaware" });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.jurisdiction).toMatch(/california/i);
    expect(restoredFields).toContain("jurisdiction");
  });

  it("DOES override jurisdiction when intake has authoritative (>=0.8 confidence) extraction", () => {
    // Regression spec §1: once governing law is extracted with confidence >= 0.8 it is
    // authoritative. Even a non-default existing jurisdiction must be replaced — otherwise
    // a stale "New York" from a prior session could mask the user's explicit "Texas".
    const intake = "Agreement. Governing law: Texas.";
    const draft = baseDraft({ jurisdiction: "New York" });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.jurisdiction).toBe("Texas");
    expect(restoredFields).toContain("jurisdiction");
  });

  it("does NOT override jurisdiction when intake has only a low-confidence signal", () => {
    // No legal context anywhere → bare state in prose has confidence < 0.8 and must NOT win.
    const intake = "Agreement description that mentions Texas as a place name only.";
    const draft = baseDraft({ jurisdiction: "New York" });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.jurisdiction).toBe("New York");
    expect(restoredFields).not.toContain("jurisdiction");
  });

  it("restores duration when draft has generic default but intake specifies term", () => {
    const intake = "Contractor agreement. Duration: 6 months. Rate: $100/hr.";
    const draft = baseDraft({ duration: "12 months unless terminated earlier as agreed in writing." });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.duration).toMatch(/6 months/i);
    expect(restoredFields).toContain("duration");
  });

  it("restores termination when draft is empty but intake specifies notice", () => {
    const intake = "Services agreement. Either party may terminate with 30 days written notice. Fee: $2,000/month.";
    const draft = baseDraft({ termination_summary: "" });
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, intake);
    expect(result.termination_summary).toMatch(/30/);
    expect(restoredFields).toContain("termination_summary");
  });

  it("does nothing when intake has no extractable data", () => {
    const intake = "Agreement.";
    const draft = baseDraft({ purpose: "To be refined in review." });
    const { restoredFields } = preserveExtractedFacts(draft, intake);
    expect(restoredFields.length).toBe(0);
  });

  it("handles empty intake gracefully", () => {
    const draft = baseDraft();
    const { draft: result, restoredFields } = preserveExtractedFacts(draft, "");
    expect(restoredFields.length).toBe(0);
    expect(result).toEqual(draft);
  });
});
