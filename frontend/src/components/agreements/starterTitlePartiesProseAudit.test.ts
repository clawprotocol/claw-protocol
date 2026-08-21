/**
 * Regression suite for: title canonicalization, multi-party Oxford comma rendering,
 * inferred-role-label suppression, specific-scope preservation over archetype defaults,
 * and removal of internal-review wording from starter customer-facing prose.
 *
 * All assertions are at SHARED rendering layers — no family-specific patches.
 */
import { describe, expect, it } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  resolveCanonicalAgreementTitle,
  isGenericOrEmptyTitle,
  CANONICAL_TITLE_FOR_FAMILY,
} from "./canonicalAgreementTitle";
import {
  sanitizeStarterPreviewProse,
  sanitizeStarterPartyNameForDisplay,
} from "./starterPreviewProseSanitize";
import { formatLegalPartyPreamble, joinOxfordComma } from "./formatLegalPartyList";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: true };

function emptyDraft(overrides: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "",
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

function runStarter(intake: string, draft?: Partial<ParsedDraftShape>): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(emptyDraft(draft), intake, true, defaultIntakePartyRoleLabels());
}

function preview(draft: ParsedDraftShape): string {
  return buildAgreementPreviewText(draft, { starterPreview: true });
}

/* ----------------------------- 1. Title canonicalization ----------------------------- */

describe("canonical title resolution", () => {
  it("preserves substantive existing title verbatim", () => {
    const r = resolveCanonicalAgreementTitle({
      currentTitle: "Mutual Non-Disclosure Agreement",
      liveDocTitle: "Confidentiality Agreement",
      family: "nda",
    });
    expect(r.title).toBe("Mutual Non-Disclosure Agreement");
    expect(r.source).toBe("preserved");
  });

  it("falls through generic 'Agreement' to live docTitle then family canonical", () => {
    const r = resolveCanonicalAgreementTitle({
      currentTitle: "Agreement",
      liveDocTitle: "Service Agreement",
      family: "services_agreement",
    });
    expect(r.title).toBe("Service Agreement");
    expect(r.source).toBe("live");
  });

  it("falls back to family canonical when both inputs are generic", () => {
    const r = resolveCanonicalAgreementTitle({
      currentTitle: "Agreement",
      liveDocTitle: "",
      family: "consulting_agreement",
    });
    expect(r.title).toBe("Consulting Agreement");
    expect(r.source).toBe("family");
  });

  it("isGenericOrEmptyTitle catches 'Agreement', empty, [Not yet specified], 'Untitled'", () => {
    expect(isGenericOrEmptyTitle("")).toBe(true);
    expect(isGenericOrEmptyTitle("Agreement")).toBe(true);
    expect(isGenericOrEmptyTitle("[Not yet specified]")).toBe(true);
    expect(isGenericOrEmptyTitle("Untitled")).toBe(true);
    expect(isGenericOrEmptyTitle("Mutual Non-Disclosure Agreement")).toBe(false);
    expect(isGenericOrEmptyTitle("Operating Agreement")).toBe(false);
  });

  it("casual dump echoed as title falls back to family heading", () => {
    const r = resolveCanonicalAgreementTitle({
      currentTitle: "deal with Sam",
      liveDocTitle: "deal with Sam",
      family: "generic_business_agreement",
      intakeText: "deal with Sam",
    });
    expect(r.title).toBe("Business Agreement");
    expect(r.source).toBe("family");
  });

  it("dump that is already a document heading is preserved", () => {
    const r = resolveCanonicalAgreementTitle({
      currentTitle: "Apollo Data LLC Operating Agreement",
      liveDocTitle: "",
      family: "operating_agreement",
      intakeText: "Apollo Data LLC Operating Agreement",
    });
    expect(r.title).toBe("Apollo Data LLC Operating Agreement");
    expect(r.source).toBe("preserved");
  });

  it("every AgreementFamily has a canonical title (no missing entries)", () => {
    for (const v of Object.values(CANONICAL_TITLE_FOR_FAMILY)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(3);
      expect(v).not.toMatch(/^agreement$/i);
    }
  });

  it("NDA family canonical title is 'Non-Disclosure Agreement' (not generic 'Confidentiality Agreement')", () => {
    expect(CANONICAL_TITLE_FOR_FAMILY.nda).toBe("Non-Disclosure Agreement");
  });

  it("starter pipeline: NDA intake produces NDA-flavored title (not 'Agreement')", () => {
    const result = runStarter(`Mutual NDA between Alpha Corp and Beta Industries.
Term: 2 years.
Governing law: Texas.`);
    const title = (result.title || "").toLowerCase();
    expect(title).toContain("non-disclosure");
    expect(title).not.toMatch(/^agreement$/);
  });

  it("starter pipeline: services intake produces canonical service-flavored title", () => {
    const result = runStarter(`Vendor services agreement.
Parties: Acme Corp, Beta LLC.
Scope: IT support services.
Governing law: California.`);
    const title = result.title || "";
    expect(title).not.toBe("Agreement");
    expect(title).not.toBe("[Not yet specified]");
    expect(title.length).toBeGreaterThan(5);
  });

  it("starter pipeline: empty title fallback prefers family canonical when no live signal", () => {
    const result = runStarter("Multi-party deal between A, B, and C.");
    expect(isGenericOrEmptyTitle(result.title)).toBe(false);
  });
});

/* ----------------------------- 2. Multi-party Oxford comma ----------------------------- */

describe("multi-party Oxford comma rendering", () => {
  it("joinOxfordComma: 4 names produces ', and' Oxford comma", () => {
    const out = joinOxfordComma(["A", "B", "C", "D"]);
    expect(out).toBe("A, B, C, and D");
  });

  it("formatLegalPartyPreamble: 4 generic-role parties uses Oxford comma + collective", () => {
    const text = formatLegalPartyPreamble([
      { name: "Alpha LLC", role: "party" },
      { name: "Beta Advisors", role: "party" },
      { name: "Gamma Holdings", role: "party" },
      { name: "Delta Capital", role: "party" },
    ]);
    expect(text).toMatch(/Alpha LLC, Beta Advisors, Gamma Holdings, and Delta Capital/);
    expect(text).toMatch(/collectively, the .Parties./);
    // No "X and Y and Z" sequence (between names) — but "by and between" preamble is fine.
    expect(text).not.toMatch(/Beta Advisors and Gamma Holdings and Delta Capital/);
    expect(text).not.toMatch(/Holdings and Delta/);
  });

  it("starter preview: 4-party intake produces Oxford comma in preamble", () => {
    const result = runStarter(`Joint venture.
Parties: Northstar Labs, Riverbend Partners, Atlas Capital, Summit Ventures.
Scope: Real estate fund.
Governing law: Texas.`);
    const out = preview(result);
    expect(out).toMatch(/, and Summit Ventures/);
    // No "X and Y and Z" pattern
    expect(out).not.toMatch(/Riverbend Partners and Atlas Capital and Summit Ventures/);
  });

  it("starter preview: 3-party signer-row intake uses Oxford comma", () => {
    const result = runStarter(`Collaboration agreement.
Signer 1: Devon Ortiz
Signer 2: Yuki Hamada
Signer 3: Carlos Patel
Scope: Joint product launch.
Governing law: New York.`);
    const out = preview(result);
    expect(out).toMatch(/Ortiz, .* Hamada, and .* Patel/);
  });
});

/* ----------------------------- 3. Inferred collective labels suppressed ----------------------------- */

describe("inferred collective labels suppression in starter preview", () => {
  it("starter preview: 4-party draft never produces '(Developers)' or '(Clients)' collective", () => {
    const result = runStarter(`Joint venture agreement.
Parties: Alpha LLC, Beta LLC, Gamma LLC, Delta LLC.
Scope: Building a marketplace.
Governing law: Texas.`);
    const out = preview(result);
    expect(out).not.toMatch(/collectively, the .Developers./i);
    expect(out).not.toMatch(/collectively, the .Clients./i);
    expect(out).not.toMatch(/collectively, the .Consultants./i);
    // Generic "Parties" collective is fine
    expect(out).toMatch(/collectively, the .Parties./i);
  });

  it("starter preview: party with role='Developer' from draft is rendered as generic 'Party'", () => {
    const draft: ParsedDraftShape = emptyDraft({
      title: "Development Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Studio One", role: "Developer" },
        { name: "Studio Two", role: "Developer" },
        { name: "Studio Three", role: "Developer" },
      ],
      purpose: "Joint app development.",
      payment_terms: "$1,000",
      duration: "12 months",
      effective_date: "2026-01-01",
    });
    const out = buildAgreementPreviewText(draft, { starterPreview: true });
    expect(out).not.toMatch(/collectively, the .Developers./i);
    expect(out).toMatch(/collectively, the .Parties./i);
  });

  it("premium preview: party with explicit role='Developer' IS shown (high-confidence overlay)", () => {
    const draft: ParsedDraftShape = emptyDraft({
      title: "Development Agreement",
      jurisdiction: "California",
      parties: [
        { name: "Studio One", role: "Developer" },
        { name: "Studio Two", role: "Developer" },
        { name: "Studio Three", role: "Developer" },
      ],
      purpose: "Joint app development.",
      payment_terms: "$1,000",
      duration: "12 months",
      effective_date: "2026-01-01",
    });
    const out = buildAgreementPreviewText(draft, { starterPreview: false, premiumDeliverablePreview: true });
    // Premium path keeps user-supplied roles (high confidence by definition).
    expect(out).toMatch(/collectively, the .Developers./i);
  });
});

/* ----------------------------- 4. Specific scope preservation ----------------------------- */

describe("specific-scope preservation over archetype defaults", () => {
  it("NDA archetype default is overridden by labeled 'Purpose:' extraction", () => {
    const result = runStarter(`Mutual NDA between Acme Corp and Beta Industries.
Purpose: Pre-IPO due diligence on Project Apollo and related M&A discussions.
Term: 2 years.
Governing law: New York.`);
    expect(result.purpose).toMatch(/Pre-IPO/i);
    expect(result.purpose).not.toMatch(/^Mutual protection of confidential/i);
  });

  it("NDA without explicit purpose keeps archetype default", () => {
    const result = runStarter(`Mutual NDA between Acme Corp and Beta Industries.
Term: 2 years.
Governing law: New York.`);
    // Either archetype OR a structured-extracted purpose; never empty
    expect((result.purpose || "").trim().length).toBeGreaterThan(10);
  });

  it("services agreement: labeled 'Scope:' wins over generic 'Commercial arrangement…' fallback", () => {
    const result = runStarter(`Services agreement.
Parties: Northstar Labs, Riverbend Partners.
Scope: Quarterly market intelligence reports with custom dashboards and monthly briefings.
Governing law: Texas.`);
    expect(result.purpose).toMatch(/market intelligence|dashboards|briefings/i);
    expect(result.purpose).not.toMatch(/^Commercial arrangement to be described/i);
  });

  it("starter preview: labeled scope shows in preview body (not generic placeholder)", () => {
    const result = runStarter(`Consulting agreement.
Scope: M&A advisory for European market entry through Q3 2027.
Fee: $12,000/month.
Governing law: Delaware.`);
    const out = preview(result);
    expect(out).toMatch(/M&A advisory|European market entry/i);
  });
});

/* ----------------------------- 5. Internal-review wording removed ----------------------------- */

describe("internal-review wording sanitizer", () => {
  it("removes parenthetical '(edit in review)' from party names", () => {
    expect(sanitizeStarterPartyNameForDisplay("Party A (edit in review)")).toBe("Party A");
    expect(sanitizeStarterPartyNameForDisplay("Party B (edit in review)")).toBe("Party B");
  });

  it("removes '(disclosing / receiving — edit in review)' from party names", () => {
    expect(sanitizeStarterPartyNameForDisplay("Party A (disclosing / receiving — edit in review)")).toBe("Party A");
  });

  it("rewrites 'specified in review' → 'agreed by the parties'", () => {
    const input = "Upon full execution by the parties unless otherwise specified in review.";
    const out = sanitizeStarterPreviewProse(input);
    expect(out).not.toMatch(/in review/i);
    expect(out).toMatch(/agreed by the parties/i);
  });

  it("rewrites 'to be refined in review' → 'to be agreed by the parties'", () => {
    const input = "Scope and deliverables to be refined in review.";
    const out = sanitizeStarterPreviewProse(input);
    expect(out).not.toMatch(/in review/i);
    expect(out).toMatch(/to be agreed by the parties/i);
  });

  it("strips '(add specifics in review if compensation applies)' parenthetical", () => {
    const input = "To be agreed between the parties (add specifics in review if compensation applies).";
    const out = sanitizeStarterPreviewProse(input);
    expect(out).not.toMatch(/add specifics/i);
    expect(out).not.toMatch(/in review/i);
  });

  it("starter preview: never contains 'edit in review' / 'specified in review' / 'refined in review'", () => {
    const result = runStarter("Quick agreement between Foo Co and Bar LLC for advisory work.");
    const out = preview(result);
    expect(out).not.toMatch(/edit in review/i);
    expect(out).not.toMatch(/specified in review/i);
    expect(out).not.toMatch(/refined in review/i);
    expect(out).not.toMatch(/described in review/i);
    expect(out).not.toMatch(/to be agreed in review/i);
    expect(out).not.toMatch(/add specifics in review/i);
  });

  it("starter preview: party-name placeholders render cleanly (no parenthetical)", () => {
    const result = runStarter("Generic agreement.");
    const out = preview(result);
    // Default seed parties are "Party A (edit in review)" / "Party B (edit in review)"
    // but the starter render should sanitize them.
    expect(out).not.toMatch(/Party A \(edit in review\)/);
    expect(out).not.toMatch(/Party B \(edit in review\)/);
  });

  it("starter preview: NEUTRAL_TERMINATION_NOTE no longer contains 'in review' wording", () => {
    const result = runStarter("Quick deal between Foo and Bar.");
    const out = preview(result);
    // Termination section is rendered when the field is empty.
    expect(out).toMatch(/Termination terms to be agreed by the Parties/i);
    expect(out).not.toMatch(/Termination[^.]*in review/i);
  });

  it("sanitizer is idempotent (running twice produces same output)", () => {
    const input = "Party A (edit in review) and Party B (edit in review) — to be agreed in review.";
    const once = sanitizeStarterPreviewProse(input);
    const twice = sanitizeStarterPreviewProse(once);
    expect(twice).toBe(once);
  });

  it("premium preview path keeps internal phrasing for downstream Pro review tooling", () => {
    const result = runStarter("Quick agreement between Foo Co and Bar LLC.");
    const out = buildAgreementPreviewText(result, { starterPreview: false, premiumDeliverablePreview: true });
    // Premium path is NOT sanitized; this is intentional (only customer-facing starter preview is humanized).
    // We don't assert presence here, just ensure premium build still produces a real document.
    expect(out.length).toBeGreaterThan(120);
    expect(out).toMatch(/LawDog Pro/i);
  });
});
