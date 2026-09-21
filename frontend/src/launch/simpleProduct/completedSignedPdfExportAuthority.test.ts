/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PersistedSigningParty } from "./acceptedSigningPreparationAuthority";
import { evaluateCompletedSignedPdfExport } from "./completedSignedPdfExportAuthority";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_ID = "crs-silver-mesa-pdf";
const DIGEST = "c".repeat(64);
const LOCK_VERSION = "lv_silver_mesa_pdf";

const SILVER_MESA_PARTIES: PersistedSigningParty[] = [
  {
    id: "ironclad-uuid",
    name: "Ironclad Systems Group LLC",
    role: "Sponsor",
    signerName: "Ethan Cole",
    email: "ethan.cole@ironcladsg.com",
  },
  {
    id: "harborline-uuid",
    name: "Harborline Data Solutions Inc.",
    role: "Vendor",
    signerName: "Maya Bennett",
    email: "maya.bennett@harborlinedata.com",
  },
  {
    id: "northwind-uuid",
    name: "Northwind Automation Partners LLC",
    role: "Integrator",
    signerName: "Lucas Reed",
    email: "lucas.reed@northwindap.io",
  },
  {
    id: "silver-uuid",
    name: "Silver Mesa Analytics LP",
    role: "Analyst",
    signerName: "Olivia Hart",
    email: "olivia.hart@silvermesaanalytics.com",
  },
];

function allowed(overrides?: Partial<Parameters<typeof evaluateCompletedSignedPdfExport>[0]>) {
  return evaluateCompletedSignedPdfExport({
    parties: SILVER_MESA_PARTIES,
    signedParticipantIds: SILVER_MESA_PARTIES.map((party) => String(party.id)),
    receiptBound: true,
    receiptId: "agr_rcpt_test",
    acceptedSnapshotId: SNAPSHOT_ID,
    acceptedDigest: DIGEST,
    lockSnapshotId: SNAPSHOT_ID,
    lockDigest: DIGEST,
    lockVersionId: LOCK_VERSION,
    packetSnapshotId: SNAPSHOT_ID,
    packetDigest: DIGEST,
    packetCorpus: "JOINT AI SOFTWARE ROLLOUT AGREEMENT\n".repeat(20),
    ...overrides,
  });
}

describe("completed signed PDF export authority", () => {
  it("fails closed before all required signatures or without a bound receipt", () => {
    expect(allowed({ signedParticipantIds: ["silver-uuid"] }).reason).toBe("incomplete_required_signatures");
    expect(
      allowed({
        signedParticipantIds: ["silver-uuid", "ironclad-uuid", "harborline-uuid"],
      }).reason,
    ).toBe("incomplete_required_signatures");
    expect(allowed({ receiptBound: false, receiptId: "agr_rcpt_test" }).reason).toBe("unbound_receipt");
    expect(allowed({ receiptBound: true, receiptId: "" }).reason).toBe("unbound_receipt");
    expect(allowed().ok).toBe(true);
  });

  it("fails closed on snapshot/digest mismatch and historical unsigned paper", () => {
    expect(allowed({ packetDigest: "d".repeat(64) }).reason).toBe("snapshot_digest_mismatch");
    expect(allowed({ lockSnapshotId: "crs-other" }).reason).toBe("snapshot_digest_mismatch");
    expect(allowed({ unsignedHistoricalPaper: true }).reason).toBe("historical_unsigned_paper");
  });

  it("does not use a hardcoded 2/3/4 completion shortcut", () => {
    const source = readFileSync(join(__dirname, "completedSignedPdfExportAuthority.ts"), "utf8");
    expect(source).not.toMatch(/requiredCount\s*>=\s*[234]|===\s*[234]|>=\s*3/);
    expect(source).toContain("completionProgressFromPersistedParticipants");
    const download = readFileSync(join(__dirname, "../../agreement/completedSignedAgreementPdfDownload.ts"), "utf8");
    expect(download).toContain("/completed-signed-export-pdf");
    expect(download).not.toMatch(/jspdf|html2canvas|clientGeneratedPdf/i);
  });

  it("wires owner and completed-signer surfaces to the same server export", () => {
    const owner = readFileSync(join(__dirname, "OwnerSignedAgreementPage.tsx"), "utf8");
    expect(owner).toContain("downloadCompletedSignedAgreementPdf");
    expect(owner).toContain("owner-signed-agreement-download-pdf");
    const review = readFileSync(join(__dirname, "../../agreement/AgreementRecipientReview.tsx"), "utf8");
    expect(review).toContain("downloadCompletedSignedAgreementPdf");
    expect(review).toContain("recipient-completed-signed-download-pdf");
    const pub = readFileSync(join(__dirname, "../../agreement/AgreementPublicVerifyView.tsx"), "utf8");
    expect(pub).toContain("downloadPublicCompletedSignedAgreementPdf");
  });
});
