import { describe, expect, it } from "vitest";
import { buildReviewChangeLedger } from "../../agreement/reviewChangeLedger";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";
import {
  applyDeterministicSurgicalRevisionFallback,
  looksLikeTerminationConvenienceNoticeDaysInstruction,
} from "./premiumRefineDeterministicSurgicalFallback";
import { resolvePremiumRefineApplyOutcome } from "./premiumRefineLateFeeFallback";

const PRODUCTION_TERMINATION_INSTR =
  "Revise the termination section to require forty-five (45) days' prior written notice for termination for convenience instead of thirty (30) days. Keep all other commercial, payment, ownership, confidentiality, governing law, dispute resolution, signature, party identity, and project scope terms unchanged.";

/** Exact production-style numbered convenience clause (notice period is fifteen, not thirty). */
const PRODUCTION_NINE_ONE_CONVENIENCE =
  "9.1 Termination for Convenience. Any Party may terminate its participation in this Agreement for convenience upon at least fifteen (15) days' prior written notice to the other Parties, unless the Parties agree in writing to a different notice period for a specific project phase.";

function buildProStyleIntegrationFixture(): string {
  const filler = "Supporting operational text. ".repeat(650);
  const parties =
    "This Software Integration Agreement (the \"Agreement\") is entered into among FoundryCo Inc., " +
    "Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, " +
    "and Coastal Reserve Partners LP.";
  const body = [
    "# Software Integration Agreement",
    "",
    "## Parties",
    parties,
    "",
    "## Fees and Payment",
    "The Client shall pay a fixed project fee of US$68,500 in accordance with the payment schedule.",
    "",
    "## Term",
    "The initial term of this Agreement is four (4) months from the Effective Date.",
    "",
    "## Governing Law",
    "This Agreement shall be governed by the laws of the State of Oklahoma, without regard to conflicts of law principles.",
    "",
    "## Termination",
    "### Termination for Cause",
    "A party may terminate this Agreement for material breach, subject to a cure period of fifteen (15) calendar days following written notice of the breach.",
    "",
    "### Termination for Convenience",
    "Any Party may terminate its participation in this Agreement for convenience upon thirty (30) days' prior written notice to the other Parties.",
    "",
    "## Notices",
    "Day-to-day project communications may occur by email. Formal notices under Article 10 shall be delivered as set forth in that Article.",
    "",
    "## General",
    filler.trim(),
    "",
    "## Signatures",
    "IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.",
    "",
    "FoundryCo Inc.",
    "Beacon Operations And Logistics Group LLC",
    "Apollo Data Services LLC",
    "Smith & Wesson Holdings LLC",
    "Coastal Reserve Partners LP",
  ].join("\n\n");
  return body;
}

describe("applyDeterministicSurgicalRevisionFallback — termination for convenience notice", () => {
  it("applies forty-five (45) days in the convenience clause and preserves fee, term, law, parties, and cure period", () => {
    const doc = buildProStyleIntegrationFixture();
    const r = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: doc,
      userInstruction: PRODUCTION_TERMINATION_INSTR,
    });
    expect(r.applied).toBe(true);
    expect(r.reason).toBe("termination_notice_period");
    expect(r.log.deterministicSurgicalFallbackApplied).toBe(true);
    expect(r.log.deterministicSurgicalFallbackAttempted).toBe(true);
    expect(r.log.deterministicSurgicalFallbackMatchedClause).toMatch(/upon/i);
    expect(r.text).toContain("forty-five (45) days' prior written notice");
    expect(r.text).toContain("US$68,500");
    expect(r.text).toContain("four (4) months");
    expect(r.text).toMatch(/State of Oklahoma/i);
    expect(r.text).toContain("FoundryCo Inc.");
    expect(r.text).toContain("Beacon Operations And Logistics Group LLC");
    expect(r.text).toContain("Apollo Data Services LLC");
    expect(r.text).toContain("Smith & Wesson Holdings LLC");
    expect(r.text).toContain("Coastal Reserve Partners LP");
    expect(r.text).toContain("fifteen (15) calendar days");
    const conv = r.text.split(/### Termination for Convenience/i)[1] ?? "";
    const convThroughNext = conv.split(/###|##/)[0] ?? conv;
    expect(convThroughNext).not.toMatch(/thirty\s*\(\s*30\s*\)/i);
    expect(r.text).not.toMatch(/\[ORG_/i);
    expect(r.text).not.toMatch(/\bParty\s+[A-F]\b/i);
    const ledger = buildReviewChangeLedger(doc, r.text);
    expect(ledger.entries.length).toBeGreaterThan(0);
  });

  it("does not run on purely advisory termination questions", () => {
    const doc = buildProStyleIntegrationFixture();
    const r = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: doc,
      userInstruction: "Is this termination section fair?",
    });
    expect(r.applied).toBe(false);
    expect(r.log.deterministicSurgicalFallbackAttempted).toBe(false);
    expect(r.log.deterministicSurgicalFallbackApplied).toBe(false);
  });

  it("does not run on vague improvement instructions", () => {
    const doc = buildProStyleIntegrationFixture();
    const r = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: doc,
      userInstruction: "Make termination better.",
    });
    expect(r.applied).toBe(false);
    expect(r.log.deterministicSurgicalFallbackApplied).toBe(false);
  });
});

describe("production-shaped Article 9.1 — fifteen (15) days convenience notice", () => {
  it("replaces convenience notice even when the document has fifteen (15) days and the user references thirty (30) in the prompt", () => {
    const doc = [
      "## Article 8 — Termination for Cause",
      "8.1 A party may terminate for cause only after a cure period of twenty-one (21) days following delivery of a detailed breach notice.",
      "",
      "## Article 9 — Termination",
      PRODUCTION_NINE_ONE_CONVENIENCE,
      "",
      "## Fees",
      "The fee remains US$68,500.",
      "## Governing Law",
      "Oklahoma.",
      "## Signatures",
      "FoundryCo Inc. / Beacon Operations And Logistics Group LLC / Apollo Data Services LLC / Smith & Wesson Holdings LLC / Coastal Reserve Partners LP",
      "",
      "x".repeat(12000),
    ].join("\n\n");

    const r = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: doc,
      userInstruction: PRODUCTION_TERMINATION_INSTR,
    });
    expect(r.applied).toBe(true);
    expect(r.log.deterministicSurgicalFallbackApplied).toBe(true);
    expect(r.log.deterministicSurgicalFallbackMatchedClause).toMatch(/fifteen\s*\(\s*15\s*\)/i);

    const s91 = r.text.split(/9\.1\s+Termination\s+for\s+Convenience/i)[1] ?? "";
    const s91Window = s91.slice(0, 900);
    expect(s91Window).toMatch(/forty-five \(45\)\s*days['']?\s+prior\s+written\s+notice/i);
    expect(s91Window).not.toMatch(/fifteen\s*\(\s*15\s*\)\s*days/i);
    expect(r.text).toMatch(/twenty-one\s*\(\s*21\s*\)\s*days/i);
    expect(r.text).toContain("US$68,500");
    expect(r.text).toMatch(/Oklahoma/i);
    expect(r.text).toContain("FoundryCo Inc.");

    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: doc,
      baselineText: doc,
      baselineLen: doc.length,
      summaryChanges: [],
      userInstruction: PRODUCTION_TERMINATION_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(true);
  });
});

describe("resolvePremiumRefineApplyOutcome + deterministic surgical", () => {
  it("accepts when API echoes baseline but deterministic termination fallback applies (including fail-open summary)", () => {
    const doc = buildProStyleIntegrationFixture();
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: doc,
      baselineText: doc,
      baselineLen: doc.length,
      summaryChanges: [PRO_REFINE_UNAVAILABLE_USER_MESSAGE],
      userInstruction: PRODUCTION_TERMINATION_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.appliedDeterministicSurgicalFallback).toBe(true);
    expect(resolved.deterministicSurgicalFallbackReason).toBe("termination_notice_period");
    expect(resolved.finalText).toContain("forty-five (45) days' prior written notice");
  });
});

describe("looksLikeTerminationConvenienceNoticeDaysInstruction", () => {
  it("matches production-style operative instruction", () => {
    expect(looksLikeTerminationConvenienceNoticeDaysInstruction(PRODUCTION_TERMINATION_INSTR)).toBe(true);
  });

  it("does not match advisory or vague prompts", () => {
    expect(looksLikeTerminationConvenienceNoticeDaysInstruction("Is this termination section fair?")).toBe(
      false,
    );
    expect(looksLikeTerminationConvenienceNoticeDaysInstruction("Make termination better.")).toBe(false);
  });
});
