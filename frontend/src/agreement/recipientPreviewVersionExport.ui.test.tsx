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
        }}
      />,
    );
    await userEvent.click(screen.getByText("Download / copy versions"));
    await userEvent.click(screen.getByRole("button", { name: /Download current PDF/i }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("temporarily unavailable");
    });
    expect(screen.getByRole("status").textContent).not.toMatch(/failed to fetch/i);
  });
});
