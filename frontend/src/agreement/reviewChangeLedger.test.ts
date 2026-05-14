import { describe, expect, it } from "vitest";
import { buildReviewChangeLedger, normalizeLedgerPlainText } from "./reviewChangeLedger";

/** Five-party software integration style corpus (plain), aligned with premium identity QA fixtures. */
function fivePartyIntegrationBase(): string {
  return [
    "SOFTWARE INTEGRATION AGREEMENT",
    "",
    "This Agreement is between FoundryCo Inc., Beacon Operations And Logistics Group LLC, Apollo Data Services LLC, Smith & Wesson Holdings LLC, and Coastal Reserve Partners LP.",
    "",
    "FEES. Client shall pay the integration fee of $47,500 within thirty days of invoice.",
    "",
    "TERM. The initial term is four (4) months from the Effective Date.",
    "",
    "GOVERNING LAW. This Agreement is governed by the laws of the State of Oklahoma.",
    "",
    "CONFIDENTIALITY. Each party shall keep Confidential Information strictly confidential.",
    "",
    "DISPUTE RESOLUTION. The parties shall first attempt good-faith negotiation to resolve disputes.",
    "",
    "SIGNATURES.\nFoundryCo Inc.\nBy: ____________\n\nBeacon Operations And Logistics Group LLC\nBy: ____________\n\nApollo Data Services LLC\nBy: ____________\n\nSmith & Wesson Holdings LLC\nBy: ____________\n\nCoastal Reserve Partners LP\nBy: ____________",
  ].join("\n\n");
}

describe("normalizeLedgerPlainText", () => {
  it("treats CRLF and trailing line spaces as non-substantive", () => {
    const a = "Line one\r\nLine two  \r\n";
    const b = "Line one\nLine two";
    expect(normalizeLedgerPlainText(a)).toBe(normalizeLedgerPlainText(b));
  });

  it("collapses four or more consecutive newlines to three", () => {
    expect(normalizeLedgerPlainText("a\n\n\n\n\nb")).toBe("a\n\n\nb");
  });
});

describe("buildReviewChangeLedger", () => {
  it("returns zero entries for identical baseline and revised", () => {
    const t = fivePartyIntegrationBase();
    const ledger = buildReviewChangeLedger(t, t);
    expect(ledger.entries).toHaveLength(0);
    expect(ledger.stats).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(ledger.truncated).toBe(false);
  });

  it("returns zero entries when only safe normalization differs", () => {
    const base = fivePartyIntegrationBase();
    const noisy = base.replace(/\n/g, "\r\n") + "   \n";
    const ledger = buildReviewChangeLedger(base, noisy);
    expect(ledger.entries).toHaveLength(0);
  });

  it("detects payment-only change with payment risk tag", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace("$47,500", "$62,000");
    const ledger = buildReviewChangeLedger(base, rev);
    const feeRow = ledger.entries.find(
      (e) => e.type === "changed" && e.afterText.includes("$62,000") && e.beforeText.includes("$47,500"),
    );
    expect(feeRow).toBeTruthy();
    expect(feeRow!.riskTags).toContain("payment");
  });

  it("detects party legal name change", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace("Apollo Data Services LLC", "Apollo Data Systems LLC");
    const ledger = buildReviewChangeLedger(base, rev);
    const row = ledger.entries.find(
      (e) =>
        (e.type === "changed" && e.afterText.includes("Apollo Data Systems LLC")) ||
        (e.type === "changed" && e.beforeText.includes("Apollo Data Services LLC")),
    );
    expect(row).toBeTruthy();
    expect(row!.riskTags).toContain("parties");
  });

  it("detects governing law jurisdiction change", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace("State of Oklahoma", "State of Texas");
    const ledger = buildReviewChangeLedger(base, rev);
    const row = ledger.entries.find((e) => e.afterText.includes("Texas"));
    expect(row).toBeTruthy();
    expect(row!.riskTags).toContain("governing_law");
  });

  it("detects removed confidentiality section", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace(/\n\nCONFIDENTIALITY\.[^\n]+\n\n/, "\n\n");
    const ledger = buildReviewChangeLedger(base, rev);
    const removed = ledger.entries.find(
      (e) => e.type === "removed" && /confidentiality/i.test(e.beforeText),
    );
    expect(removed).toBeTruthy();
    expect(removed!.riskTags).toContain("confidentiality");
  });

  it("detects added arbitration / binding dispute clause", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace(
      "DISPUTE RESOLUTION.",
      "DISPUTE RESOLUTION.\n\nBINDING ARBITRATION. Any dispute shall be resolved by binding arbitration under AAA rules.",
    );
    const ledger = buildReviewChangeLedger(base, rev);
    const added = ledger.entries.find((e) => e.type === "added" && /arbitration/i.test(e.afterText));
    expect(added).toBeTruthy();
  });

  it("detects signature block party order change", () => {
    const base = fivePartyIntegrationBase();
    const oldSig =
      "SIGNATURES.\nFoundryCo Inc.\nBy: ____________\n\nBeacon Operations And Logistics Group LLC\nBy: ____________\n\nApollo Data Services LLC\nBy: ____________\n\nSmith & Wesson Holdings LLC\nBy: ____________\n\nCoastal Reserve Partners LP\nBy: ____________";
    const newSig =
      "SIGNATURES.\nApollo Data Services LLC\nBy: ____________\n\nBeacon Operations And Logistics Group LLC\nBy: ____________\n\nFoundryCo Inc.\nBy: ____________\n\nSmith & Wesson Holdings LLC\nBy: ____________\n\nCoastal Reserve Partners LP\nBy: ____________";
    expect(base).toContain(oldSig);
    const rev = base.replace(oldSig, newSig);
    const ledger = buildReviewChangeLedger(base, rev);
    const sig = ledger.entries.filter((e) => /SIGNATURES/i.test(e.beforeText + e.afterText));
    expect(sig.length).toBeGreaterThan(0);
    expect(ledger.entries.some((e) => e.riskTags.includes("signature"))).toBe(true);
  });

  it("detects deleted party from intro paragraph", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace(", Smith & Wesson Holdings LLC", "");
    const ledger = buildReviewChangeLedger(base, rev);
    expect(ledger.entries.length).toBeGreaterThan(0);
    expect(ledger.entries.some((e) => e.riskTags.includes("parties"))).toBe(true);
  });

  it("detects added party in intro paragraph", () => {
    const base = fivePartyIntegrationBase();
    const rev = base.replace(
      "and Coastal Reserve Partners LP.",
      "Coastal Reserve Partners LP, and River Delta Technologies LLC.",
    );
    const ledger = buildReviewChangeLedger(base, rev);
    expect(ledger.entries.some((e) => /River Delta/i.test(e.afterText))).toBe(true);
  });

  it("does not treat reordered identical paragraphs as a full-document rewrite", () => {
    const p1 = "FEES. Client shall pay $1,000.";
    const p2 = "TERM. One month.";
    const p3 = "GOVERNING LAW. Oklahoma.";
    const base = [p1, p2, p3].join("\n\n");
    const rev = [p2, p1, p3].join("\n\n");
    const ledger = buildReviewChangeLedger(base, rev);
    expect(ledger.entries.length).toBeGreaterThan(0);
    expect(ledger.entries.length).toBeLessThanOrEqual(4);
    for (const e of ledger.entries) {
      expect(e.beforeText.length + e.afterText.length).toBeLessThan(base.length + 20);
    }
  });
});
