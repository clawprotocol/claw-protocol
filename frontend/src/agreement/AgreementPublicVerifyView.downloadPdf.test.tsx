/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgreementPublicVerify } from "./AgreementPublicVerifyView";
import * as agreementPublicVerify from "./agreementPublicVerify";
import * as completedPdf from "./completedSignedAgreementPdfDownload";

describe("AgreementPublicVerify download PDF", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows Download PDF only when fully executed", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      agreement_id: "ag_done",
      summary: { title: "Done deal", status: "fully_executed" },
      participants: [],
      version_history: [],
      signature_status: { fully_executed: true, signatures_recorded: 2, signer_party_count: 2 },
      signature_events: [],
      verification: { agreement_hash: "abc", schema: "claw.agreement.public_verify/v1" },
    });
    render(<AgreementPublicVerify agreementId="ag_done" />);
    expect(await screen.findByTestId("public-verify-download-pdf")).toBeTruthy();
  });

  it("hides Download PDF when not fully executed", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      agreement_id: "ag_open",
      summary: { title: "Open deal", status: "partially_signed" },
      participants: [],
      version_history: [],
      signature_status: { fully_executed: false, signatures_recorded: 1, signer_party_count: 2 },
      signature_events: [],
      verification: { agreement_hash: "abc", schema: "claw.agreement.public_verify/v1" },
    });
    render(<AgreementPublicVerify agreementId="ag_open" />);
    await screen.findByText(/Public verification/i);
    expect(screen.queryByTestId("public-verify-download-pdf")).toBeNull();
  });

  it("invokes public PDF download on click", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      agreement_id: "ag_done",
      summary: { title: "Done deal", status: "fully_executed" },
      participants: [],
      version_history: [],
      signature_status: { fully_executed: true, signatures_recorded: 2, signer_party_count: 2 },
      signature_events: [],
      verification: { agreement_hash: "abc", schema: "claw.agreement.public_verify/v1" },
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
