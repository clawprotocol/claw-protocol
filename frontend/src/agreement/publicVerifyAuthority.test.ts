import { describe, expect, it } from "vitest";
import type { PublicVerifyPayload } from "./agreementPublicVerify";
import {
  isPublicVerifyFullyAttested,
  publicCompletedPdfDistributionPermitted,
  publicVerifyProofBadgeState,
  publicVerifyStatusLabel,
} from "./publicVerifyAuthority";

const SHA = "a".repeat(64);

function attested(): PublicVerifyPayload {
  return {
    agreement_id: "ag-1",
    summary: { title: "SaaS Subscription Agreement", status: "fully_executed", jurisdiction: "New York" },
    participants: [{ name: "Orion Labs LLC", role: "Provider" }],
    version_history: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z", version_hash: SHA }],
    signature_status: {
      fully_executed: true,
      signatures_recorded: 2,
      signer_party_count: 2,
      locked_version_id: "lv-1",
      signing_commitment_hash: "commit-1",
    },
    signature_events: [{ event_type: "signed", participant_id: "p0", signer_role_id: "sr0" }],
    verification: {
      agreement_hash: "overview",
      signing_commitment_hash: "commit-1",
      schema: "claw.agreement.public_verify/v1",
      envelope_attestation_valid: true,
      accepted_review_snapshot: { snapshot_id: "crs-1", corpus_sha256: SHA, corpus_length: 10 },
      envelope_provenance: { acceptedSoTDigest: SHA, packetDigest: "b".repeat(64) },
    },
  };
}

describe("public verify authority", () => {
  it("attests only when counts, lock, commitment, snapshot, and envelope agree", () => {
    expect(isPublicVerifyFullyAttested(attested())).toBe(true);
    expect(publicVerifyProofBadgeState(attested())).toBe("verified");
    expect(publicVerifyStatusLabel(attested())).toBe("Fully executed");
    expect(isPublicVerifyFullyAttested({ ...attested(), record_status: "pending" })).toBe(false);
    expect(
      isPublicVerifyFullyAttested({
        ...attested(),
        signature_status: { ...attested().signature_status, signatures_recorded: 1 },
      }),
    ).toBe(false);
    expect(
      isPublicVerifyFullyAttested({
        ...attested(),
        verification: { ...attested().verification, envelope_attestation_valid: false },
      }),
    ).toBe(false);
    expect(
      isPublicVerifyFullyAttested({
        ...attested(),
        verification: {
          ...attested().verification,
          envelope_provenance: { acceptedSoTDigest: "c".repeat(64), packetDigest: "b".repeat(64) },
        },
      }),
    ).toBe(false);
  });

  it("keeps public PDF closed unless the server sends an explicit opt-in", () => {
    expect(publicCompletedPdfDistributionPermitted(attested())).toBe(false);
    expect(
      publicCompletedPdfDistributionPermitted({
        ...attested(),
        public_completed_pdf_distribution: true,
      }),
    ).toBe(true);
    expect(
      publicCompletedPdfDistributionPermitted({
        ...attested(),
        public_completed_pdf_distribution: true,
        signature_status: { ...attested().signature_status, fully_executed: false },
      }),
    ).toBe(false);
  });

  it("labels locked and partial states without a verified badge", () => {
    const locked: PublicVerifyPayload = {
      ...attested(),
      summary: { ...attested().summary, status: "locked_for_signing" },
      signature_status: { ...attested().signature_status, fully_executed: false, signatures_recorded: 0 },
      verification: { ...attested().verification, envelope_attestation_valid: false },
    };
    expect(publicVerifyStatusLabel(locked)).toBe("Locked for signing");
    expect(publicVerifyProofBadgeState(locked)).toBe("pending");
    const partial: PublicVerifyPayload = {
      ...locked,
      summary: { ...locked.summary, status: "partially_signed" },
      signature_status: { ...locked.signature_status, signatures_recorded: 1 },
    };
    expect(publicVerifyStatusLabel(partial)).toBe("Partially signed");
    expect(publicVerifyProofBadgeState(partial)).toBe("pending");
  });
});
