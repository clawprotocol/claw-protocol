/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import * as pdfDl from "./recipientPreviewPdfDownload";
import { RecipientPreviewVersionsExport } from "./recipientPreviewVersionExport";

describe("RecipientPreviewVersionsExport PDF UX", () => {
  it("shows friendly message when PDF download fails (e.g. 503)", async () => {
    vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockRejectedValue(
      new Error(pdfDl.RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE),
    );
    const vm = buildLegalRedlineDocumentViewModel("Hello.", "Hello there.");
    render(
      <RecipientPreviewVersionsExport
        plainSource={{ currentPlain: "Hello.", proposedPlain: "Hello there." }}
        legalRedlineVm={vm}
        pdfReadContext={{
          agreementId: "ag-x",
          readHeaders: {},
          scrubbedOriginalHtml: "<p>Hello.</p>",
          scrubbedProposedHtml: "<p>Hello there.</p>",
          exportBasename: "hello-deal",
        }}
      />,
    );
    await userEvent.click(screen.getByTestId("recipient-preview-download-original-pdf"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-pdf-export-error").textContent).toMatch(/Original PDF:.*temporarily unavailable/is);
    });
    expect(screen.getByTestId("recipient-pdf-export-error").textContent).not.toMatch(/failed to fetch/i);
  });
});
