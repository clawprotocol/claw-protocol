/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import * as pdfDl from "./recipientPreviewPdfDownload";

describe("RecipientAgreementReadPdfExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("humanizes raw Failed to fetch when download helper is bypassed", async () => {
    vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockRejectedValue(new Error("Failed to fetch"));
    render(
      <RecipientAgreementReadPdfExport agreementId="ag-1" readHeaders={{}} scrubbedCurrentHtml="<p>x</p>" />,
    );
    await userEvent.click(screen.getByTestId("recipient-read-download-pdf"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-pdf-export-error").textContent).toContain("temporarily unavailable");
    });
    expect(screen.getByTestId("recipient-pdf-export-error").textContent).not.toMatch(/failed to fetch/i);
  });

  it("shows friendly message on 503 and does not throw raw fetch text", async () => {
    vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockRejectedValue(
      new Error(pdfDl.RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE),
    );
    render(
      <RecipientAgreementReadPdfExport
        agreementId="ag-1"
        readHeaders={{}}
        scrubbedCurrentHtml="<p>Terms</p>"
      />,
    );
    await userEvent.click(screen.getByTestId("recipient-read-download-pdf"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-pdf-export-error").textContent).toContain("temporarily unavailable");
    });
    expect(screen.getByTestId("recipient-pdf-export-error").textContent).not.toMatch(/failed to fetch/i);
  });
});
