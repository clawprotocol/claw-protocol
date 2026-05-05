import { describe, expect, it } from "vitest";
import {
  buildLegalRedlineDocumentViewModel,
  filterNarrowRecipientPaymentRedlineNoise,
} from "./legalRedlineBlocks";
import {
  buildRecipientLegalRedlinePlainTexts,
  buildRecipientPauseRemedyClause,
  extractLatePaymentGraceDaysFromInstruction,
  extractPaymentPlacementCalloutSnippet,
  splitPlainTextAtRecipientPaymentNoiseBoundary,
} from "./recipientWholeDocRedlineSource";
import type { AgreementDraft } from "./agreementTypes";
import { compareAgreementSnapshots } from "../vs01/agreementCompare";
import { draftToSnapshot } from "./agreementVersionStore";

function minimalDraft(overrides: Partial<AgreementDraft>): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: "ag_test",
    title: "Services",
    jurisdiction: "CA",
    parties: [{ name: "A", role: "owner" }],
    purpose: "Consulting.",
    payment_terms: "invoices are payable upon receipt",
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

describe("splitPlainTextAtRecipientPaymentNoiseBoundary", () => {
  it("cuts before IN WITNESS so payment edits stay in the head prefix", () => {
    const raw = "Invoices are payable upon receipt.\n\nIN WITNESS WHEREOF\nAlice";
    const { head, tail } = splitPlainTextAtRecipientPaymentNoiseBoundary(raw);
    expect(head).toContain("upon receipt");
    expect(tail).toContain("IN WITNESS");
    expect(head).not.toContain("IN WITNESS");
  });
});

describe("extractPaymentPlacementCalloutSnippet", () => {
  it("returns Net N from payment terms after text", () => {
    expect(extractPaymentPlacementCalloutSnippet("Invoices are payable Net 30.")).toMatch(/net\s*30/i);
  });
});

describe("buildRecipientPauseRemedyClause", () => {
  it("defaults to fifteen (15) days when instruction omits a number", () => {
    expect(buildRecipientPauseRemedyClause("pause work after days late")).toContain("fifteen (15)");
  });
  it("uses explicit day count from instruction", () => {
    expect(buildRecipientPauseRemedyClause("pause work after 21 days late")).toMatch(/twenty-one \(21\)/i);
  });
});

describe("extractLatePaymentGraceDaysFromInstruction", () => {
  it("parses common phrasings", () => {
    expect(extractLatePaymentGraceDaysFromInstruction("after 15 days late")).toBe(15);
    expect(extractLatePaymentGraceDaysFromInstruction("after 7 days late")).toBe(7);
  });
});

describe("buildRecipientLegalRedlinePlainTexts", () => {
  it("does not append payment text when no safe payment block; placement fails closed", () => {
    const sameHtml = "<p>Standard agreement body without payment detail.</p>";
    const current = minimalDraft({ payment_terms: "invoices are payable upon receipt" });
    const proposed = minimalDraft({ payment_terms: "invoices are payable Net 30" });
    const fields = changedFieldsBetween(current, proposed);
    const r = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      sameHtml,
      sameHtml,
      true,
      "Change payment to Net 30",
      fields,
    );
    expect(r.sourceMode).toBe("baseline_vs_field_patch");
    expect(r.paymentTermsInlinePlacementFailed).toBe(true);
    expect(r.currentPlain).toBe(r.proposedPlain);
    expect(r.proposedPlain).not.toMatch(/Net\s*30/i);
    expect(r.proposedPlain).not.toContain("Agreement fields (tracked for redline)");
    const vm = buildLegalRedlineDocumentViewModel(r.currentPlain, r.proposedPlain);
    expect(vm.hasChanges).toBe(false);
  });

  it("when HTML includes payment line matching draft, Net 30 appears inline (not after LawDog footer)", () => {
    const html = `<p>3.2 Payment and Fees</p><p>Invoices are payable upon receipt.</p><p>IN WITNESS WHEREOF the parties execute.</p><p>Created with LawDog — Draft for Review.</p>`;
    const current = minimalDraft({ payment_terms: "Invoices are payable upon receipt." });
    const proposed = minimalDraft({ payment_terms: "Invoices are payable Net 30." });
    const fields = changedFieldsBetween(current, proposed);
    const r = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      html,
      html,
      true,
      "Net 30 and pause work after 15 days late",
      fields,
    );
    expect(r.sourceMode).toBe("baseline_vs_field_patch");
    expect(r.narrowRecipientTargetedRedline).toBe(true);
    expect(r.paymentTermsInlinePlacementFailed).not.toBe(true);
    expect(r.proposedPlain.toLowerCase()).toMatch(/net\s*30/);
    expect(r.proposedPlain).toMatch(/pause work until all overdue undisputed amounts are paid/i);
    expect(r.proposedPlain).toMatch(/fifteen \(15\)/i);
    const outcomes = r.instructionIntentOutcomes ?? [];
    expect(outcomes.filter((i) => i.status === "applied")).toHaveLength(2);
    expect(outcomes.filter((i) => i.status === "failed" || i.status === "unclear")).toHaveLength(0);
    const lawdog = r.proposedPlain.toLowerCase().indexOf("created with lawdog");
    const net = r.proposedPlain.toLowerCase().indexOf("net 30");
    expect(lawdog).toBeGreaterThan(-1);
    expect(net).toBeGreaterThan(-1);
    expect(net).toBeLessThan(lawdog);
    expect(r.proposedPlain.toLowerCase().lastIndexOf("net 30")).toBe(net);
  });

  it("when HTML-derived redline already has changes, still uses field patch if only structured fields changed", () => {
    const curHtml = "<p>Pay upon receipt.</p>";
    const propHtml = "<p>Net 30.</p>";
    const current = minimalDraft({ payment_terms: "Pay upon receipt." });
    const proposed = minimalDraft({ payment_terms: "Net 30." });
    const fields = changedFieldsBetween(current, proposed);
    const { currentPlain, proposedPlain, sourceMode } = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      curHtml,
      propHtml,
      true,
      "Net 30",
      fields,
    );
    expect(sourceMode).toBe("baseline_vs_field_patch");
    expect(currentPlain).not.toContain("Agreement fields (tracked for redline)");
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    expect(vm.hasChanges).toBe(true);
  });

  it("uses field patch when revise HTML has broad template drift but instruction is narrow and only payment_terms changes", () => {
    const narrowInstruction = "Net 30 and pause work after 15 days late";
    const baselineHtml = `<div>
      <p>Master Services Agreement</p>
      <p>3.2 Payment</p>
      <p>Invoices are payable upon receipt.</p>
    </div>`;
    const divergentReviseHtml = `<article>
      <h1>Completely Different Template</h1>
      <section><p>Article I — Definitions</p><p>Lorem ipsum dolor sit amet.</p></section>
      <section><p>Article II — Scope</p><p>Aliqua ut enim ad minim.</p></section>
      <section><p>Article III — Fees</p><p>Consectetur adipiscing elit sed do.</p></section>
      <section><p>Article IV — Term</p><p>Excepteur sint occaecat cupidatat.</p></section>
    </article>`;
    const current = minimalDraft({ payment_terms: "Invoices are payable upon receipt." });
    const proposed = minimalDraft({ payment_terms: "Invoices are payable Net 30." });
    const fields = changedFieldsBetween(current, proposed);
    const {
      currentPlain,
      proposedPlain,
      sourceMode,
      usedNoisyReviseGuard,
      narrowRecipientTargetedRedline,
      instructionIntentOutcomes,
    } = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      baselineHtml,
      divergentReviseHtml,
      true,
      narrowInstruction,
      fields,
    );
    expect(sourceMode).toBe("baseline_vs_field_patch");
    expect(usedNoisyReviseGuard).toBe(true);
    expect(narrowRecipientTargetedRedline).toBe(true);
    expect(currentPlain).not.toContain("Agreement fields (tracked for redline)");
    expect(proposedPlain).not.toContain("Agreement fields (tracked for redline)");
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    expect(vm.stats.changedBlockCount).toBeLessThanOrEqual(3);
    expect(vm.hasChanges).toBe(true);
    const insertJoined = vm.blocks
      .flatMap((b) => b.segments)
      .filter((s) => s.type === "insert")
      .map((s) => s.text)
      .join("");
    expect(insertJoined).toMatch(/Net\s*30/i);
    expect(proposedPlain.toLowerCase()).not.toMatch(/article iv|excepteur sint/i);
    expect(currentPlain.toLowerCase()).toContain("payment");
    const lawdogIdx = proposedPlain.toLowerCase().indexOf("created with lawdog");
    if (lawdogIdx >= 0) {
      expect(proposedPlain.toLowerCase().indexOf("net 30")).toBeLessThan(lawdogIdx);
    }
    const vmFiltered = filterNarrowRecipientPaymentRedlineNoise(vm, { narrowPaymentInstruction: true });
    expect(vmFiltered.stats.changedBlockCount).toBe(1);
    expect(vmFiltered.stats.insertCount).toBeGreaterThanOrEqual(1);
    expect(vmFiltered.stats.deleteCount).toBeLessThanOrEqual(1);
    expect(proposedPlain).toMatch(/pause work until all overdue undisputed amounts are paid/i);
    expect(instructionIntentOutcomes?.filter((i) => i.status === "applied")).toHaveLength(2);
  });

  it("when HTML has no payment anchor, narrow Net+pause instruction marks both payment-related intents failed", () => {
    const listingOnly = "<p>Master services agreement (listing only).</p>";
    const current = minimalDraft({ payment_terms: "Invoices are payable upon receipt." });
    const proposed = minimalDraft({ payment_terms: "Invoices are payable Net 30." });
    const fields = changedFieldsBetween(current, proposed);
    const r = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      listingOnly,
      listingOnly,
      true,
      "Net 30 and pause work after 15 days late",
      fields,
    );
    expect(r.paymentTermsInlinePlacementFailed).toBe(true);
    expect(r.proposedPlain).not.toMatch(/net\s*30/i);
    const failed = (r.instructionIntentOutcomes ?? []).filter((i) => i.status === "failed");
    expect(failed).toHaveLength(2);
    expect(failed.map((i) => i.category).sort()).toEqual(["payment_timing", "suspend_pause_work"].sort());
    expect(failed.every((i) => i.reason?.includes("payment") || i.reason?.includes("safely"))).toBe(true);
  });
});
