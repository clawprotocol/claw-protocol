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
});
