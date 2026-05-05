import { describe, expect, it } from "vitest";
import type { RedlineResult } from "../vs01/agreementRedline";
import {
  assessRecipientPreviewDiff,
  buildRecipientClauseCards,
  getRecipientPreviewSummaryBullets,
  isRecipientRedlineNoisyRaw,
  numberedSectionChangeLines,
  recipientPreviewNoOpMessage,
  recipientSendConfirmationLine,
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
    expect(a.isCompleteNoOp).toBe(true);
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
    const bullets = getRecipientPreviewSummaryBullets(a);
    expect(bullets[0]).toMatch(/2 suggested changes detected/);
    expect(bullets.join(" ")).not.toMatch(/29844|characters of wording|diff segments/i);
    expect(bullets.some((b) => /Owner's draft will not change/i.test(b))).toBe(true);
  });

  it("allows submit when only rendered text differs (text-only redline)", () => {
    const d = baseDraft();
    const a = assessRecipientPreviewDiff(d, d, "<p>Alpha</p>", "<p>Beta gamma</p>");
    expect(a.hasMaterialTextDiff).toBe(true);
    expect(a.hasSnapshotDiff).toBe(false);
    expect(a.isCompleteNoOp).toBe(false);
    expect(a.canSubmit).toBe(true);
  });

  it("numberedSectionChangeLines labels snapshot keys", () => {
    expect(numberedSectionChangeLines(["payment_terms", "purpose"])).toEqual([
      "Section 1 — Payment terms modified",
      "Section 2 — Purpose modified",
    ]);
  });

  it("Net 30 + pause-if-late in payment_terms alone yields two semantic units on one card", () => {
    const base = baseDraft({
      purpose: "Custom software development.",
      payment_terms: "Net 15. Invoices due on receipt.",
    });
    const proposed = baseDraft({
      purpose: "Custom software development.",
      payment_terms:
        "Net 30. Invoices due within 30 days. The developer may pause work if payment is more than 15 days late until amounts are brought current.",
    });
    const a = assessRecipientPreviewDiff(
      base,
      proposed,
      "<p>Agreement body v1</p>",
      "<p>Agreement body v1</p>",
    );
    expect(a.hasSnapshotDiff).toBe(true);
    expect(a.isCompleteNoOp).toBe(false);
    expect(a.canSubmit).toBe(true);
    const cards = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff);
    const pay = cards.find((c) => c.id === "payment_terms");
    expect(cards.filter((c) => c.id === "purpose")).toEqual([]);
    expect(pay?.proposedText).toMatch(/Net 30/i);
    expect(pay?.whatChangedBullets.some((b) => /Payment timing changed to Net 30/i.test(b))).toBe(true);
    expect(
      pay?.whatChangedBullets.some((b) => /pause work.*more than 15 days late/i.test(b)),
    ).toBe(true);
    expect(pay?.fieldRedline?.hasChanges).toBe(true);
    expect(pay?.reason.toLowerCase()).toMatch(/pause|net/);
    const bullets = getRecipientPreviewSummaryBullets(a);
    expect(bullets[0]).toMatch(/2 suggested changes detected/);
    expect(bullets.some((b) => /Pause-work right added for late payment/i.test(b))).toBe(true);
    expect(recipientSendConfirmationLine(a)).toMatch(/2 suggested changes/);
  });

  it("marks redline as noisy when segment count is huge (defaults away from full redline in UI)", () => {
    const segs = Array.from({ length: 90 }, (_, i) =>
      i % 2 === 0 ? { type: "delete" as const, text: "x" } : { type: "insert" as const, text: "y" },
    );
    const redline: RedlineResult = { hasChanges: true, segments: segs };
    expect(isRecipientRedlineNoisyRaw(redline, 90)).toBe(true);
  });

});
