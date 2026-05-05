import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildRecipientLegalRedlinePlainTexts } from "./recipientWholeDocRedlineSource";
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
    expect(r.paymentTermsInlinePlacementFailed).not.toBe(true);
    expect(r.proposedPlain.toLowerCase()).toMatch(/net\s*30/);
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
    const { currentPlain, proposedPlain, sourceMode, usedNoisyReviseGuard } = buildRecipientLegalRedlinePlainTexts(
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
  });
});
