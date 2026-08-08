import { describe, expect, it } from "vitest";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";
import {
  ensurePaidProVisibleDocumentTitleOpening,
  needsPaidProDocumentTitleOpeningRepair,
  projectPaidProVisibleTitleDisplayPlain,
  repairPaidProDocumentTitleOpening,
} from "./paidProDocumentTitleOpeningRepair";

describe("repairPaidProDocumentTitleOpening", () => {
  it("is idempotent on a clean title + recital opening", () => {
    const clean = [
      "MUTUAL SERVICES AGREEMENT",
      "",
      'This Mutual Services Agreement (this "Agreement") is entered into by and among Example LLC and Sample Inc.',
      "",
      "1. Services",
      "Each party provides services.",
    ].join("\n");

    expect(needsPaidProDocumentTitleOpeningRepair(clean)).toBe(false);
    const once = repairPaidProDocumentTitleOpening(clean);
    const twice = repairPaidProDocumentTitleOpening(once.text);
    expect(once.repairs).toHaveLength(0);
    expect(twice.text).toBe(once.text);
    expect(summarizePaidProDocumentBlockClassifications(clean).titleCount).toBe(1);
  });

  it("dedupes production-style single-repeat glued title openings", () => {
    const collapsed =
      'MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT (the "Agreement") is entered into by and among Example LLC and Sample Inc.\n\n1. Services\nBody.';
    const repaired = repairPaidProDocumentTitleOpening(collapsed);
    expect(repaired.repairs).toContain("display:repair_collapsed_title_opening");
    expect(repaired.text).toMatch(/^MUTUAL SERVICES AGREEMENT\n\nThis Mutual Services Agreement/m);
    expect(repaired.text).not.toMatch(/MUTUAL SERVICES AGREEMENT This MUTUAL SERVICES AGREEMENT/i);
    expect(summarizePaidProDocumentBlockClassifications(repaired.text).titleCount).toBe(1);
    expect(summarizePaidProDocumentBlockClassifications(collapsed).titleCount).toBe(1);
  });
});

describe("ensurePaidProVisibleDocumentTitleOpening", () => {
  it("prepends draft title when corpus opens at section 1 with no title", () => {
    const body = [
      "1. Services and Project Term",
      "Designer will provide product design services for Client's new mobile app UI during the six-week period starting on the Effective Date.",
      "",
      "2. Fees and Payment",
      "Client shall pay Designer a fixed fee of $12,000 as set forth in Exhibit A.",
    ].join("\n\n");
    expect(summarizePaidProDocumentBlockClassifications(body).titleCount).toBe(0);
    const ensured = ensurePaidProVisibleDocumentTitleOpening(body, {
      fallbackTitle: "Services Agreement",
    });
    expect(ensured.repairs).toContain("display:ensure_missing_document_title");
    expect(ensured.text).toMatch(/^SERVICES AGREEMENT\n\n1\. Services and Project Term/m);
    expect(summarizePaidProDocumentBlockClassifications(ensured.text).titleCount).toBe(1);
  });

  it("is idempotent once a title is present", () => {
    const withTitle = [
      "SERVICES AGREEMENT",
      "",
      "1. Services and Project Term",
      "Designer will provide product design services.",
    ].join("\n\n");
    const once = ensurePaidProVisibleDocumentTitleOpening(withTitle, {
      fallbackTitle: "Services Agreement",
    });
    const twice = ensurePaidProVisibleDocumentTitleOpening(once.text, {
      fallbackTitle: "Services Agreement",
    });
    expect(once.repairs).toHaveLength(0);
    expect(twice.text).toBe(once.text);
  });

  it("projectPaidProVisibleTitleDisplayPlain uses fallback for section-1-only corpus", () => {
    const body = [
      "1. Services and Project Term",
      "Designer will provide product design services for Client during the project term described below and related delivery obligations.",
      "",
      "2. Fees and Payment",
      "Client shall pay Designer a fixed fee as set forth in Exhibit A for the services described herein.",
    ].join("\n\n");
    const projected = projectPaidProVisibleTitleDisplayPlain(body, {
      fallbackTitle: "Services Agreement",
    });
    expect(projected).toMatch(/^SERVICES AGREEMENT\n\n1\. Services and Project Term/m);
  });
});
