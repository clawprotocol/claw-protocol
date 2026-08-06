/**
 * Genesis Dog / PixelForge-shaped services draft: non-empty multi-word category
 * parents ("Scope of Services", "Fees and Payment", "Term and Cancellation") with
 * affinity siblings must demote before reviewed-document integrity hard-fails
 * with duplicate_provision_family (Retry Pro draft).
 */
/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { repairPaidProEmptyParentSectionHierarchy } from "./repairPaidProEmptyParentSectionHierarchy";
import {
  diagnosePaidProReviewedDocumentIntegrity,
  preparePaidProImmutableReviewedDocument,
} from "./paidProReviewedDocumentIntegrity";

function buildPixelForgeShapedCorpus(): string {
  const pad = "Additional commercial detail — the parties cooperate in good faith. ".repeat(40);
  return [
    "SERVICES AGREEMENT",
    "",
    'This Agreement is between PixelForge Labs ("Client") and Alex Rivera ("Service Provider").',
    "",
    "1. Purpose",
    "This Agreement sets forth the terms for mobile app UI design services.",
    "2. Scope of Services",
    "Service Provider will design the Client mobile app UI for six weeks.",
    "3. Services",
    "Deliverables include wireframes, high-fidelity screens, and a component library.",
    "4. Fees and Payment",
    "Client will pay a flat fee of $4,500, 50% up front and 50% on delivery.",
    "5. Payment Terms",
    "Invoices are due upon receipt. Late amounts accrue interest as allowed by law.",
    "6. Term and Cancellation",
    "The initial term is six (6) weeks from the Effective Date.",
    "7. Term",
    "Either party may cancel with seven (7) days' written notice and payment for work completed.",
    "8. Intellectual Property",
    "Client owns final designs once paid in full. Service Provider may show work in portfolio.",
    "9. Confidentiality",
    "Each party will protect Confidential Information disclosed under this Agreement.",
    "10. General Terms",
    "10.1 Independent Contractor",
    "Service Provider is an independent contractor.",
    "10.2 Notices",
    "If to PixelForge Labs: Attention: Authorized Signer.",
    "If to Alex Rivera: Attention: Authorized Signer.",
    "11. Notices",
    "If to PixelForge Labs: Attention: Authorized Signer.",
    "If to Alex Rivera: Attention: Authorized Signer.",
    "12. Governing Law",
    "This Agreement shall be governed by applicable law.",
    "",
    pad,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "PixelForge Labs",
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    "Alex Rivera",
    "By: __________________________",
  ].join("\n");
}

describe("PixelForge-shaped duplicate provision family", () => {
  it("diagnoses duplicate term/services/fees families before repair", () => {
    const defective = buildPixelForgeShapedCorpus();
    const diag = diagnosePaidProReviewedDocumentIntegrity(defective);
    expect(diag.reasons).toContain("duplicate_provision_family");
    expect(diag.duplicateProvisionFamilies).toEqual(
      expect.arrayContaining(["term", "services", "fees"]),
    );
  });

  it("demotes non-empty multi-word category shells into subsections", () => {
    const defective = buildPixelForgeShapedCorpus();
    const { text, repairs } = repairPaidProEmptyParentSectionHierarchy(defective);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toMatch(/\d+\.\s+Scope of Services/);
    expect(text).toMatch(/\d+\.\d+\s+Services/);
    expect(text).not.toMatch(/^\d+\.\s+Services\s*$/m);
    expect(text).toMatch(/\d+\.\s+Fees and Payment/);
    expect(text).toMatch(/\d+\.\d+\s+Payment Terms/);
    expect(text).not.toMatch(/^\d+\.\s+Payment Terms\s*$/m);
    expect(text).toMatch(/\d+\.\s+Term and Cancellation/);
    expect(text).toMatch(/\d+\.\d+\s+Term\b/);
    expect(text).not.toMatch(/^\d+\.\s+Term\s*$/m);
  });

  it("preparePaidProImmutableReviewedDocument accepts the repaired corpus", () => {
    const defective = buildPixelForgeShapedCorpus();
    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    expect(prepared.diagnostics.reasons).not.toContain("duplicate_provision_family");
    expect(prepared.text).not.toMatch(/^\d+\.\s+Notices\s*$/m);
    expect(prepared.text).toMatch(/\d+\.\d+\s+Notices\b/);
  });

  it("collapses duplicate top-level Notices shells (Notices + Notices and Communications)", () => {
    const pad = "Additional commercial detail — the parties cooperate in good faith. ".repeat(30);
    const defective = [
      "SERVICES AGREEMENT",
      "",
      'This Agreement is between PixelForge Labs ("Client") and Alex Rivera ("Service Provider").',
      "",
      "1. Purpose",
      "This Agreement sets forth the terms for mobile app UI design services.",
      "2. Scope of Services",
      "Service Provider will design the Client mobile app UI for six weeks.",
      "3. Fees and Payment",
      "Client will pay a flat fee of $4,500.",
      "4. Term and Cancellation",
      "The initial term is six (6) weeks from the Effective Date.",
      "5. Intellectual Property",
      "Client owns final designs once paid in full.",
      "6. Term",
      "Either party may cancel with seven (7) days' written notice.",
      "7. Confidentiality",
      "Each party will protect Confidential Information.",
      "8. Notices",
      "If to PixelForge Labs: Attention: Authorized Signer.",
      "If to Alex Rivera: Attention: Authorized Signer.",
      "9. Notices and Communications",
      "If to PixelForge Labs: Attention: Authorized Signer.",
      "If to Alex Rivera: Attention: Authorized Signer.",
      "10. Governing Law",
      "This Agreement shall be governed by applicable law.",
      "",
      pad,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "PixelForge Labs",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "Alex Rivera",
      "By: __________________________",
    ].join("\n");

    const before = diagnosePaidProReviewedDocumentIntegrity(defective);
    expect(before.reasons).toContain("duplicate_provision_family");
    expect(before.duplicateProvisionFamilies).toEqual(
      expect.arrayContaining(["term", "notices"]),
    );

    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    expect(prepared.diagnostics.reasons).not.toContain("duplicate_provision_family");
    expect(prepared.text).toMatch(/\d+(?:\.\d+)?\s+Notices\b/);
    expect(prepared.text).not.toMatch(/^\d+\.\s+Notices and Communications\s*$/m);
    expect((prepared.text.match(/^\d+\.\s+Notices?\b/gim) || []).length).toBeLessThanOrEqual(1);
  });

  it("demotes non-adjacent Term shells separated by IP (production-shaped)", () => {
    const pad = "Additional commercial detail — the parties cooperate in good faith. ".repeat(40);
    const defective = [
      "SERVICES AGREEMENT",
      "",
      'This Agreement is between PixelForge Labs ("Client") and Alex Rivera ("Service Provider").',
      "",
      "1. Purpose",
      "This Agreement sets forth the terms for mobile app UI design services.",
      "2. Scope of Services",
      "Service Provider will design the Client mobile app UI for six weeks.",
      "3. Services",
      "Deliverables include wireframes and a component library.",
      "4. Fees and Payment",
      "Client will pay a flat fee of $4,500, 50% up front and 50% on delivery.",
      "5. Payment Terms",
      "Invoices are due upon receipt.",
      "6. Term and Cancellation",
      "The initial term is six (6) weeks from the Effective Date.",
      "7. Intellectual Property",
      "Client owns final designs once paid in full. Service Provider may show work in portfolio.",
      "8. Term",
      "Either party may cancel with seven (7) days' written notice and payment for work completed.",
      "9. Confidentiality",
      "Each party will protect Confidential Information disclosed under this Agreement.",
      "10. General Terms",
      "10.1 Independent Contractor",
      "Service Provider is an independent contractor.",
      "10.2 Notices",
      "If to PixelForge Labs: Attention: Authorized Signer.",
      "If to Alex Rivera: Attention: Authorized Signer.",
      "11. Notices",
      "If to PixelForge Labs: Attention: Authorized Signer.",
      "If to Alex Rivera: Attention: Authorized Signer.",
      "12. Governing Law",
      "This Agreement shall be governed by applicable law.",
      "",
      pad,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "PixelForge Labs",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "Alex Rivera",
      "By: __________________________",
    ].join("\n");

    const before = diagnosePaidProReviewedDocumentIntegrity(defective);
    expect(before.reasons).toContain("duplicate_provision_family");
    expect(before.duplicateProvisionFamilies).toContain("term");

    const demote = repairPaidProEmptyParentSectionHierarchy(defective);
    expect(demote.repairs.some((r) => r.startsWith("nonadjacent_hard_fail_family_demote"))).toBe(
      true,
    );
    expect(demote.text).not.toMatch(/^\d+\.\s+Term\s*$/m);
    expect(demote.text).toMatch(/\d+\.\s+Term and Cancellation/);
    expect(demote.text).toMatch(/\d+\.\d+\s+Term\b/);

    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    expect(prepared.diagnostics.reasons).not.toContain("duplicate_provision_family");
  });

  it("collapses Term + Cancellation across intervening services/fees without affinity miss", () => {
    const pad = "Additional commercial detail — the parties cooperate in good faith. ".repeat(40);
    const defective = [
      "SERVICES AGREEMENT",
      "",
      'This Agreement is between PixelForge Labs ("Client") and Alex Rivera ("Service Provider").',
      "",
      "1. Term",
      "This Agreement continues for six (6) weeks unless ended earlier.",
      "2. Services",
      "Designer provides mobile app UI design services.",
      "3. Fee and Payment",
      "Flat fee of US $4,500; 50% up front and 50% on final delivery.",
      "4. Ownership and Portfolio Rights",
      "Client owns finals once paid; Designer may show work in portfolio.",
      "5. Cancellation",
      "Either party may cancel with seven (7) days written notice and payment for work completed.",
      "6. Notices",
      "If to PixelForge Labs: Attention: Authorized Signer.",
      "If to Alex Rivera: Attention: Authorized Signer.",
      "7. Governing Law",
      "This Agreement shall be governed by applicable law.",
      "",
      pad,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "PixelForge Labs",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "Alex Rivera",
      "By: __________________________",
    ].join("\n");

    const before = diagnosePaidProReviewedDocumentIntegrity(defective);
    expect(before.duplicateProvisionFamilies).toContain("term");

    const prepared = preparePaidProImmutableReviewedDocument(defective);
    expect(prepared.ok, prepared.diagnostics.reasons.join(",")).toBe(true);
    expect(prepared.text).not.toMatch(/^\d+\.\s+Cancellation\s*$/m);
    expect(prepared.text).toMatch(/\d+\.\d+\s+Cancellation\b/);
  });
});
