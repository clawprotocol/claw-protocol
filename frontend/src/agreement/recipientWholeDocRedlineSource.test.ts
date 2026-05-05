import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildRecipientLegalRedlinePlainTexts } from "./recipientWholeDocRedlineSource";
import type { AgreementDraft } from "./agreementTypes";

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

describe("buildRecipientLegalRedlinePlainTexts", () => {
  it("when HTML is identical but payment terms differ, whole-doc VM shows Net 30 insert and changed blocks", () => {
    const sameHtml = "<p>Standard agreement body without payment detail.</p>";
    const current = minimalDraft({ payment_terms: "invoices are payable upon receipt" });
    const proposed = minimalDraft({ payment_terms: "invoices are payable Net 30" });
    const { currentPlain, proposedPlain } = buildRecipientLegalRedlinePlainTexts(
      current,
      proposed,
      sameHtml,
      sameHtml,
      true,
    );
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    expect(vm.hasChanges).toBe(true);
    expect(vm.stats.insertCount).toBeGreaterThan(0);
    expect(vm.stats.changedBlockCount).toBeGreaterThan(0);
    const joined = vm.blocks
      .flatMap((b) => b.segments)
      .filter((s) => s.type === "insert")
      .map((s) => s.text)
      .join("");
    expect(joined).toMatch(/Net\s*30/i);
  });

  it("does not append trailer when HTML-derived redline already has changes", () => {
    const curHtml = "<p>Pay upon receipt.</p>";
    const propHtml = "<p>Net 30.</p>";
    const d = minimalDraft({});
    const { currentPlain, proposedPlain } = buildRecipientLegalRedlinePlainTexts(d, d, curHtml, propHtml, true);
    expect(currentPlain).not.toContain("Agreement fields (tracked for redline)");
    const vm = buildLegalRedlineDocumentViewModel(currentPlain, proposedPlain);
    expect(vm.hasChanges).toBe(true);
  });
});
