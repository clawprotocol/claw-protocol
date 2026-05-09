import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  countRecipientIntentGaps,
  extractRecipientInstructionIntents,
  finalizeRecipientInstructionIntents,
  recipientIntentStatusTestId,
  recipientRedlineAnchorForIntentCategory,
  routeRecipientInstructionLanes,
} from "./recipientInstructionIntents";
import { compareAgreementSnapshots } from "../vs01/agreementCompare";
import { draftToSnapshot } from "./agreementVersionStore";

function minimalDraft(overrides: Partial<AgreementDraft>): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: "ag_intent_test",
    title: "Services",
    jurisdiction: "CA",
    parties: [{ name: "A", role: "owner" }],
    purpose: "Consulting.",
    payment_terms: "Invoices are payable upon receipt.",
    duration: "1 year",
    due_date: null,
    effective_date: "2026-01-01",
    created_at: now,
    updated_at: now,
    versions: [{ version: 1, created_at: now, note: "x" }],
    audit_log: [],
    ...overrides,
  } as AgreementDraft;
}

function changedFieldsBetween(a: AgreementDraft, b: AgreementDraft) {
  return compareAgreementSnapshots(draftToSnapshot(a), draftToSnapshot(b)).changedFields;
}

function finalize(
  instruction: string,
  currentPlain: string,
  proposedPlain: string,
  base: AgreementDraft,
  prop: AgreementDraft,
  opts?: Partial<{
    paymentTermsInlinePlacementFailed: boolean;
    narrowRecipientTargetedRedline: boolean;
    fieldPatchDisplay: boolean;
  }>,
) {
  return finalizeRecipientInstructionIntents({
    instructionPlain: instruction,
    currentPlain,
    proposedPlain,
    baselineDraft: base,
    proposedDraft: prop,
    changedFields: changedFieldsBetween(base, prop),
    paymentTermsInlinePlacementFailed: opts?.paymentTermsInlinePlacementFailed ?? false,
    narrowRecipientTargetedRedline: opts?.narrowRecipientTargetedRedline ?? false,
    fieldPatchDisplay: opts?.fieldPatchDisplay ?? true,
  });
}

describe("recipient intent status anchors", () => {
  it("maps categories to stable test ids and redline anchor keys", () => {
    expect(recipientIntentStatusTestId("payment_timing")).toBe("recipient-intent-status-payment_timing");
    expect(recipientIntentStatusTestId("suspend_pause_work")).toBe("recipient-intent-status-pause_suspend_work");
    expect(recipientRedlineAnchorForIntentCategory("payment_timing")).toBe("payment_timing");
    expect(recipientRedlineAnchorForIntentCategory("suspend_pause_work")).toBe("pause_suspend_work");
    expect(recipientRedlineAnchorForIntentCategory("late_fee")).toBeNull();
  });
});

describe("recipient instruction intents", () => {
  it("A: multi-part payment request yields distinct intents", () => {
    const intents = extractRecipientInstructionIntents("Net 30 and pause work after 15 days late");
    expect(intents.length).toBeGreaterThanOrEqual(2);
    expect(intents.some((i) => i.category === "payment_timing")).toBe(true);
    expect(intents.some((i) => i.category === "suspend_pause_work")).toBe(true);
  });

  it("B: one applied (Net 30) and one failed (pause) under narrow field patch", () => {
    const base = minimalDraft({});
    const prop = minimalDraft({ payment_terms: "Invoices are payable Net 30." });
    const cur = "Invoices are payable upon receipt.\n\nFooter.";
    const proposed = "Invoices are payable Net 30.\n\nFooter.";
    const out = finalize("Net 30 and pause work after 15 days late", cur, proposed, base, prop, {
      paymentTermsInlinePlacementFailed: false,
      narrowRecipientTargetedRedline: true,
      fieldPatchDisplay: true,
    });
    expect(out.every((i) => i.status !== "pending")).toBe(true);
    expect(out.find((i) => i.category === "payment_timing")?.status).toBe("applied");
    expect(out.find((i) => i.category === "suspend_pause_work")?.status).toBe("failed");
    expect(out.find((i) => i.category === "suspend_pause_work")?.reason).toMatch(/payment section/i);
    expect(countRecipientIntentGaps(out)).toBe(1);
  });

  it("C: ambiguous long fragment ends unclear", () => {
    const base = minimalDraft({});
    const prop = minimalDraft({});
    const out = finalize(
      "Do the needful regarding contractual fee structures and adjustments",
      "x",
      "x",
      base,
      prop,
      { fieldPatchDisplay: true },
    );
    const u = out.find((i) => i.category === "uncategorized");
    expect(u?.status === "unclear" || out.some((i) => i.status === "unclear")).toBe(true);
  });

  it("D: conflicting Net days leaves at most one applied timing intent and at least one failed", () => {
    const base = minimalDraft({});
    const prop = minimalDraft({ payment_terms: "Invoices are payable Net 30." });
    const out = finalize("Net 30 and Net 60", "upon receipt", "Net 30", base, prop, {
      fieldPatchDisplay: true,
    });
    const timings = out.filter((i) => i.category === "payment_timing");
    expect(timings.length).toBeGreaterThanOrEqual(2);
    expect(timings.some((i) => i.status === "applied")).toBe(true);
    expect(timings.some((i) => i.status === "failed")).toBe(true);
  });

  it("E: requested timing not present in output yields failed with no section", () => {
    const base = minimalDraft({});
    const prop = minimalDraft({ payment_terms: "Invoices are payable upon receipt." });
    const out = finalize("Net 999 payment timing", "upon receipt", "upon receipt", base, prop, {
      fieldPatchDisplay: false,
      paymentTermsInlinePlacementFailed: false,
      narrowRecipientTargetedRedline: false,
    });
    const pay = out.find((i) => i.category === "payment_timing");
    expect(pay?.status).toBe("failed");
    expect(pay?.reason).toMatch(/grouped for readability/i);
  });

  it("F: two applied when payment timing and confidentiality both reflected", () => {
    const base = minimalDraft({ purpose: "Work." });
    const prop = minimalDraft({
      payment_terms: "Invoices are payable Net 30.",
      purpose: "Work. Strict confidentiality obligations apply.",
    });
    const cur = "Payment upon receipt.\nWork.";
    const proposed = "Payment Net 30.\nWork. Strict confidentiality obligations apply.";
    const out = finalize("Net 30 and strict confidentiality", cur, proposed, base, prop, {
      fieldPatchDisplay: true,
    });
    expect(out.find((i) => i.category === "payment_timing")?.status).toBe("applied");
    expect(out.find((i) => i.category === "confidentiality")?.status).toBe("applied");
    expect(countRecipientIntentGaps(out)).toBe(0);
  });

  it("G: drafting guidance is routed out — no intent rows for preserve / commercially reasonable", () => {
    const lanes = routeRecipientInstructionLanes(
      "Net 30; preserve structure; keep commercially reasonable; avoid rewriting unrelated clauses",
    );
    expect(lanes.draftingGuidance.length).toBeGreaterThanOrEqual(2);
    const intents = extractRecipientInstructionIntents(
      "Net 30; preserve structure; keep commercially reasonable; avoid rewriting unrelated clauses",
    );
    expect(intents.every((i) => !/preserve structure/i.test(i.normalizedIntent))).toBe(true);
    expect(intents.every((i) => !/commercially reasonable/i.test(i.normalizedIntent))).toBe(true);
    expect(intents.some((i) => i.category === "payment_timing")).toBe(true);
  });

  it("H: mixed QA-style paste — persona + drafting in lanes; Net 30 + pause remain actionable intents", () => {
    const instruction = `Please revise from Sarah Collins' perspective to add stronger operational and payment protections. Apply changes surgically and minimally:
1. Convert invoice timing to Net 30.
2. Add that Developer may pause work if undisputed invoices remain unpaid more than 15 days after written notice.
3. Clarify scope creep/change requests.
4. Clarify Client delays extend deadlines.
5. Clarify post-launch support is excluded unless separately agreed.
6. Add third-party services disclaimer.
7. Add 14-day bug-fix correction window.
Preserve numbering, formatting, structure. Avoid broad rewrites.`;

    const lanes = routeRecipientInstructionLanes(instruction);
    expect(lanes.draftingGuidance.some((d) => /preserve|avoid broad|surgical/i.test(d))).toBe(true);
    expect(lanes.reviewerNotes.some((n) => /perspective|stronger operational/i.test(n))).toBe(true);

    const intents = extractRecipientInstructionIntents(instruction);
    expect(intents.some((i) => i.category === "payment_timing")).toBe(true);
    expect(intents.some((i) => i.category === "suspend_pause_work")).toBe(true);
    expect(intents.some((i) => i.category === "scope_change_management")).toBe(true);
    expect(intents.every((i) => !/preserve numbering/i.test(i.originalText))).toBe(true);
    expect(intents.every((i) => !/commercially reasonable/i.test(i.originalText))).toBe(true);
  });

  it("I: gap count excludes soft operational intents that were not verified (suppressed from UI list)", () => {
    const base = minimalDraft({ purpose: "Scope." });
    const prop = minimalDraft({ purpose: "Scope." });
    const out = finalize(
      "Clarify post-launch support is excluded unless separately agreed.",
      "x",
      "x",
      base,
      prop,
      { fieldPatchDisplay: true },
    );
    expect(out.some((i) => i.category === "post_launch_support")).toBe(false);
    expect(countRecipientIntentGaps(out)).toBe(0);
  });
});
