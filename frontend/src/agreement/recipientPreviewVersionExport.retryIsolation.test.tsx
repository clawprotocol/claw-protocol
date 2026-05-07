/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import * as pdfDl from "./recipientPreviewPdfDownload";
import { RecipientPreviewVersionsExport } from "./recipientPreviewVersionExport";

describe("RecipientPreviewVersionsExport per-kind errors and retry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("allows proposed PDF after original fails; clears error on retry click", async () => {
    const vm = buildLegalRedlineDocumentViewModel("A", "B");
    const spy = vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockImplementation(async (req) => {
      if (req.exportKind === "original") {
        throw new Error(pdfDl.RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);
      }
      return undefined as unknown as void;
    });
    render(
      <RecipientPreviewVersionsExport
        plainSource={{ currentPlain: "A", proposedPlain: "B" }}
        legalRedlineVm={vm}
        pdfReadContext={{
          agreementId: "ag-retry",
          readHeaders: {},
          scrubbedOriginalHtml: "<p>A</p>",
          scrubbedProposedHtml: "<p>B</p>",
          exportBasename: "test-deal",
        }}
      />,
    );
    await userEvent.click(screen.getByTestId("recipient-preview-download-original-pdf"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-pdf-export-error").textContent).toContain("Original PDF:");
      expect(screen.getByTestId("recipient-pdf-export-error").textContent).toContain("temporarily unavailable");
    });
    const proposedBtn = screen.getByTestId("recipient-preview-download-proposed-pdf") as HTMLButtonElement;
    expect(proposedBtn.disabled).toBe(false);
    await userEvent.click(proposedBtn);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ agreementId: "ag-retry", exportKind: "proposed" }),
      );
    });
  });
});
