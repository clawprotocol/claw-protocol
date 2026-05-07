/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import * as pdfDl from "./recipientPreviewPdfDownload";
import { RecipientPreviewVersionsExport } from "./recipientPreviewVersionExport";

describe("RecipientPreviewVersionsExport repeat-click guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("only issues one PDF request when the original button is clicked repeatedly during load", async () => {
    let resolveDl!: () => void;
    const dl = new Promise<void>((r) => {
      resolveDl = r;
    });
    const spy = vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockImplementation(() => dl);
    const vm = buildLegalRedlineDocumentViewModel("A", "B");
    render(
      <RecipientPreviewVersionsExport
        plainSource={{ currentPlain: "A", proposedPlain: "B" }}
        legalRedlineVm={vm}
        pdfReadContext={{
          agreementId: "ag-1",
          readHeaders: {},
          scrubbedOriginalHtml: "<p>A</p>",
          scrubbedProposedHtml: "<p>B</p>",
          exportBasename: "ab",
        }}
      />,
    );
    const btn = screen.getByTestId("recipient-preview-download-original-pdf") as HTMLButtonElement;
    void userEvent.click(btn);
    void userEvent.click(btn);
    void userEvent.click(btn);
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(btn.disabled).toBe(true);
    resolveDl();
    await waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
  });
});
