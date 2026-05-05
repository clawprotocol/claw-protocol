import { describe, expect, it } from "vitest";
import {
  assessRecipientPreviewDiff,
  buildRecipientMaterialSummaryFromDiff,
  numberedSectionChangeLines,
  recipientPreviewNoOpMessage,
} from "./recipientPreviewDiffModel";
import type { AgreementDraft } from "./agreementTypes";

function baseDraft(over: Partial<AgreementDraft> = {}): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: "a1",
    title: "Services",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "owner" },
      { name: "B", role: "party" },
    ],
    purpose: "Consulting.",
    payment_terms: "Net 15.",
    duration: "1 year",
    due_date: null,
    effective_date: "2026-01-01",
    created_at: now,
    updated_at: now,
    versions: [{ version: 1, created_at: now, note: "x" }],
    audit_log: [],
    ...over,
  };
}

describe("recipientPreviewDiffModel", () => {
  it("flags no-op when plain HTML text is identical", () => {
    const html = "<p>Same <strong>body</strong> text.</p>";
    const b = baseDraft();
    const p = baseDraft();
    const a = assessRecipientPreviewDiff(b, p, html, html);
    expect(a.hasMaterialTextDiff).toBe(false);
    expect(a.canSubmit).toBe(false);
    expect(recipientPreviewNoOpMessage()).toContain("No changes detected");
  });

  it("allows submit when text and snapshot both differ", () => {
    const base = baseDraft();
    const proposed = baseDraft({ payment_terms: "Net 45.", purpose: "Consulting (revised)." });
    const a = assessRecipientPreviewDiff(
      base,
      proposed,
      "<p>Version one.</p>",
      "<p>Version two with more words.</p>",
    );
    expect(a.hasMaterialTextDiff).toBe(true);
    expect(a.hasSnapshotDiff).toBe(true);
    expect(a.canSubmit).toBe(true);
    expect(buildRecipientMaterialSummaryFromDiff(a)).toMatch(/Updated fields:/);
  });

  it("blocks submit when only HTML differs but snapshot fields match", () => {
    const d = baseDraft();
    const a = assessRecipientPreviewDiff(d, d, "<p>Alpha</p>", "<p>Beta gamma</p>");
    expect(a.hasMaterialTextDiff).toBe(true);
    expect(a.hasSnapshotDiff).toBe(false);
    expect(a.canSubmit).toBe(false);
  });

  it("numberedSectionChangeLines labels snapshot keys", () => {
    expect(numberedSectionChangeLines(["payment_terms", "purpose"])).toEqual([
      "Section 1 — Payment terms modified",
      "Section 2 — Purpose modified",
    ]);
  });
});
