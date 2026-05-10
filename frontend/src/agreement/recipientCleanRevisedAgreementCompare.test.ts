import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import { getScrollTargetBlockIdForSemanticOrFallback } from "./recipientBusinessReviewCardsModel";
import { buildRecipientLegalRedlinePlainTexts } from "./recipientWholeDocRedlineSource";
import type { AgreementDraft } from "./agreementTypes";
import { compareAgreementSnapshots } from "../vs01/agreementCompare";
import { draftToSnapshot } from "./agreementVersionStore";

function draft(overrides: Partial<AgreementDraft>): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: "ag_cmp",
    title: "WEB DEVELOPMENT AGREEMENT",
    jurisdiction: "CA",
    parties: [{ name: "Acme", role: "owner" }],
    purpose: "Placeholder purpose field for whole-doc preview.",
    payment_terms: "Net 30.",
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

describe("recipient clean revised agreement compare (structural plain)", () => {
  it("does not explode into dozens of heading-only removals when comparing baseline HTML to full revised purpose", () => {
    const baselineHtml = `<article>
      <h1>WEB DEVELOPMENT AGREEMENT</h1>
      <p>Background and Purpose</p>
      <p>Client wants a website.</p>
      <p>1. Services</p>
      <p>Developer shall deliver milestones on schedule.</p>
      <p>2. Payment</p>
      <p>Fees are Net 30 from invoice date.</p>
      <p>3. Intellectual Property</p>
      <p>Client owns deliverables upon payment.</p>
    </article>`;
    const proposedHtml = "<p>Shell — purpose lives in draft field for whole-doc preview.</p>";
    const baseline = draft({ payment_terms: "Fees are Net 30 from invoice date." });
    const revisedBody = [
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "Background and Purpose",
      "Client wants a website.",
      "",
      "1. Services",
      "Developer shall deliver milestones within forty-five days including expanded deliverables.",
      "",
      "2. Payment",
      "Fees are Net 45 from invoice date and work may pause for nonpayment after notice.",
      "",
      "3. Intellectual Property",
      "Client owns deliverables; Developer retains reusable tools and background materials with a limited license.",
    ].join("\n");
    const proposed = draft({
      purpose: revisedBody,
      payment_terms: "Fees are Net 45 from invoice date.",
    });
    const fields = compareAgreementSnapshots(draftToSnapshot(baseline), draftToSnapshot(proposed)).changedFields;
    const paired = buildRecipientLegalRedlinePlainTexts(
      baseline,
      proposed,
      baselineHtml,
      proposedHtml,
      true,
      "Revised draft attached.",
      fields,
      { structuralProposedPlainOverride: revisedBody },
    );
    expect(paired.sourceMode).toBe("baseline_vs_revise_html");
    const vm = applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(paired.currentPlain, paired.proposedPlain),
    );
    expect(vm.stats.changedBlockCount).toBeLessThan(15);
    expect(vm.stats.deleteCount).toBeLessThan(80);
    const titleBlocks = vm.blocks.filter((b) => b.kind === "title" && b.hasChange);
    expect(titleBlocks.length).toBe(0);
    const joined = vm.blocks.map((b) => b.segments.map((s) => s.text).join("")).join(" ");
    expect(joined).not.toMatch(/WEB\s+DEVELOPMENT\s+AGREEMENT\s+WEB\s+DEVELOPMENT\s+AGREEMENT/i);
    expect(joined).not.toMatch(/Background\s+and\s+Purpose\s+Background\s+and\s+Purpose/i);
  });

  it("payment semantic scroll target should not be a title block (regression)", () => {
    const baselineHtml = "<p>WEB DEVELOPMENT AGREEMENT</p><p>2. Payment</p><p>Net 30.</p>";
    const proposedHtml = "<p>x</p>";
    const baseline = draft({ payment_terms: "Net 30." });
    const proposed = draft({
      purpose: "WEB DEVELOPMENT AGREEMENT\n\n2. Payment\nNet 45.",
      payment_terms: "Net 45.",
    });
    const fields = compareAgreementSnapshots(draftToSnapshot(baseline), draftToSnapshot(proposed)).changedFields;
    const paired = buildRecipientLegalRedlinePlainTexts(
      baseline,
      proposed,
      baselineHtml,
      proposedHtml,
      true,
      "Payment",
      fields,
      { structuralProposedPlainOverride: String(proposed.purpose) },
    );
    const vm = applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(paired.currentPlain, paired.proposedPlain),
    );
    const bid = getScrollTargetBlockIdForSemanticOrFallback(vm, "payment_terms");
    const blk = vm.blocks.find((b) => b.id === bid);
    expect(blk?.kind).not.toBe("title");
  });
});
