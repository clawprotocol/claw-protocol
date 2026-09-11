/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgreementPublicVerify } from "./AgreementPublicVerifyView";
import * as agreementPublicVerify from "./agreementPublicVerify";
import * as completedPdf from "./completedSignedAgreementPdfDownload";
import type { PublicVerifyPayload } from "./agreementPublicVerify";

const SHA = "a".repeat(64);

function executedPayload(extras?: Partial<PublicVerifyPayload>): PublicVerifyPayload {
  return {
    agreement_id: "ag_done",
    summary: { title: "Done deal", status: "fully_executed" },
    participants: [],
    version_history: [],
    signature_status: {
      fully_executed: true,
      signatures_recorded: 2,
      signer_party_count: 2,
      locked_version_id: "lv-1",
      signing_commitment_hash: "commit-1",
    },
    signature_events: [],
    verification: {
      agreement_hash: "abc",
      schema: "claw.agreement.public_verify/v1",
      signing_commitment_hash: "commit-1",
      envelope_attestation_valid: true,
      accepted_review_snapshot: { snapshot_id: "crs-1", corpus_sha256: SHA, corpus_length: 10 },
      envelope_provenance: { acceptedSoTDigest: SHA, packetDigest: "b".repeat(64) },
    },
    ...extras,
  };
}

describe("AgreementPublicVerify download PDF", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides Download PDF when fully executed but the server sent no distribution opt-in", async () => {
    vi.spyOn(agreementPublicVerify, "loadPublicAgreementVerify").mockResolvedValue({
      ok: true,
      data: executedPayload(),
    });
    render(<AgreementPublicVerify agreementId="ag_done" />);
    await screen.findByText(/Public verification/i);
    expect(screen.queryByTestId("public-verify-download-pdf")).toBeNull();
  });

  it("hides Download PDF when not fully executed", async () => {
    vi.spyOn(agreementPublicVerify, "loadPublicAgreementVerify").mockResolvedValue({
      ok: true,
      data: {
        agreement_id: "ag_open",
        summary: { title: "Open deal", status: "partially_signed" },
        participants: [],
        version_history: [],
        signature_status: { fully_executed: false, signatures_recorded: 1, signer_party_count: 2 },
        signature_events: [],
        verification: { agreement_hash: "abc", schema: "claw.agreement.public_verify/v1" },
      },
    });
    render(<AgreementPublicVerify agreementId="ag_open" />);
    await screen.findByText(/Public verification/i);
    expect(screen.queryByTestId("public-verify-download-pdf")).toBeNull();
  });

  it("invokes public PDF download only when the server opt-in is present and the record is attested", async () => {
    vi.spyOn(agreementPublicVerify, "loadPublicAgreementVerify").mockResolvedValue({
      ok: true,
      data: executedPayload({ public_completed_pdf_distribution: true }),
    });
    const downloadSpy = vi.spyOn(completedPdf, "downloadPublicCompletedSignedAgreementPdf").mockResolvedValue();
    render(<AgreementPublicVerify agreementId="ag_done" />);
    const btn = await screen.findByTestId("public-verify-download-pdf");
    btn.click();
    await vi.waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith("ag_done");
    });
  });
});
