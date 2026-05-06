/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import * as pdfDl from "./recipientPreviewPdfDownload";

describe("RecipientAgreementReadPdfExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    await userEvent.click(screen.getByText("Download agreement"));
    await userEvent.click(screen.getByTestId("recipient-read-download-current-pdf"));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("temporarily unavailable");
    });
    expect(screen.getByRole("status").textContent).not.toMatch(/failed to fetch/i);
  });
});
