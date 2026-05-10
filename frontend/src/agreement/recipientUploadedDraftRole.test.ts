import { describe, expect, it } from "vitest";
import {
  classifyRecipientUploadedDraftRole,
  looksLikeCondensedCleanRevisedAgreementArchetype,
} from "./recipientUploadedDraftRole";
import { recipientBaselinePlainFromRenderedHtml } from "./recipientNoChangeCompareGuard";

function longBaselineHtml(wordRepeat = 900): string {
  return `<div><p>${"word ".repeat(wordRepeat)}baseline anchor.</p></div>`;
}

/** Short contract-shaped body that legacy heuristics often label as commentary vs a long baseline. */
const SARAH_STYLE_CONDENSED_REVISED = [
  "Consulting Services Agreement (Revised)",
  "",
  "1. Services",
  "The Consultant shall perform the professional services in the statement of work. The Client shall pay undisputed invoices within thirty days.",
  "",
  "2. Confidentiality",
  "Each party must protect confidential information and shall not disclose it without consent.",
  "",
  "3. Termination",
  "Either party may terminate upon thirty days notice. Payment shall remain due for accepted deliverables.",
  "",
  "4. Liability",
  "The Consultant shall be liable for breaches of confidentiality or indemnified claims.",
  "",
  "5. Payment and acceptance",
  "Fees are due upon acceptance. The Client may withhold payment only for documented defects.",
  "",
  "6. General",
  "This agreement shall be governed by the laws of the State of California.",
].join("\n");

describe("looksLikeCondensedCleanRevisedAgreementArchetype", () => {
  it("returns true for short multi-section operative drafts", () => {
    expect(looksLikeCondensedCleanRevisedAgreementArchetype(SARAH_STYLE_CONDENSED_REVISED)).toBe(true);
  });

  it("returns false for pure bullet reviewer asks", () => {
    const notes = [
      "Please consider the following:",
      "- Payment timing to Net 45",
      "- Scope boundaries for SaaS tools",
      "- Suggested focus on delivery milestones",
    ].join("\n");
    expect(looksLikeCondensedCleanRevisedAgreementArchetype(notes)).toBe(false);
  });

  it("returns false when body is extremely short", () => {
    expect(looksLikeCondensedCleanRevisedAgreementArchetype("shall pay")).toBe(false);
  });
});

describe("classifyRecipientUploadedDraftRole", () => {
  it("classifies same text as SAME_AS_CURRENT_DRAFT (short-circuit)", () => {
    const html = `<p>${"Acme shall pay Net 30 upon invoice. ".repeat(6).trim()}</p>`;
    const plain = recipientBaselinePlainFromRenderedHtml(html).trim();
    expect(plain.replace(/\s+/g, " ").trim().length).toBeGreaterThanOrEqual(60);
    const r = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: html,
      uploadedSanitizedPlain: plain,
      filename: "same.pdf",
    });
    expect(r.role).toBe("SAME_AS_CURRENT_DRAFT");
    expect(r.reasons).toContain("matches_authoritative_baseline");
  });

  it("routes Sarah-style condensed revised agreement away from REVIEW_NOTES_ONLY", () => {
    const r = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: longBaselineHtml(),
      uploadedSanitizedPlain: SARAH_STYLE_CONDENSED_REVISED,
      filename: "sarah-collins-edited-agreement-archetype.pdf",
    });
    expect(r.role).not.toBe("REVIEW_NOTES_ONLY");
    expect(r.role === "CONDENSED_CLEAN_REVISED_AGREEMENT" || r.role === "FULL_REVISED_AGREEMENT").toBe(true);
    expect(r.agreementBodyForCompare.trim().length).toBeGreaterThan(200);
    expect(
      r.reasons.includes("condensed_revised_archetype_override") ||
        r.reasons.includes("condensed_shape_vs_long_baseline"),
    ).toBe(true);
  });

  it("classifies genuine reviewer notes as REVIEW_NOTES_ONLY", () => {
    const notes =
      "Recommendation\n\nWe suggest changing payment to Net 45 for cash flow. Please consider scope boundaries.";
    const r = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: longBaselineHtml(),
      uploadedSanitizedPlain: notes,
      filename: "notes.txt",
    });
    expect(r.role).toBe("REVIEW_NOTES_ONLY");
    expect(r.preferClauseSuggestionSurface).toBe(false);
  });

  it("classifies structured bullet asks as REVIEW_NOTES_ONLY with clause-suggestion preference", () => {
    const bullets = [
      "Please review the following adjustments before we sign.",
      "",
      "- Payment timing: Net 45 instead of Net 30 for cash flow",
      "- Scope boundaries: keep bug fixes separate from new product work",
      "- Delays: when the client causes delay, extend delivery milestones fairly",
    ].join("\n");
    const r = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: longBaselineHtml(),
      uploadedSanitizedPlain: bullets,
      filename: "asks.txt",
    });
    expect(r.role).toBe("REVIEW_NOTES_ONLY");
    expect(r.preferClauseSuggestionSurface).toBe(true);
  });

  it("classifies collapsed tiny extraction as INVALID_OR_TOO_LOW_SIGNAL", () => {
    const r = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: "<p>Long baseline ".repeat(40) + "</p>",
      uploadedSanitizedPlain: "x".repeat(20),
      filename: "low.pdf",
    });
    expect(r.role).toBe("INVALID_OR_TOO_LOW_SIGNAL");
    expect(r.reasons).toContain("below_min_signal_threshold");
  });

  it("does not use filename in role decisions (only logging contract)", () => {
    const html = "<p>Party A shall pay within thirty days.</p>";
    const plain = recipientBaselinePlainFromRenderedHtml(html).trim();
    const a = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: html,
      uploadedSanitizedPlain: plain,
      filename: null,
    });
    const b = classifyRecipientUploadedDraftRole({
      baselineRenderedHtml: html,
      uploadedSanitizedPlain: plain,
      filename: "ignored.pdf",
    });
    expect(a.role).toBe(b.role);
  });
});
