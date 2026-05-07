/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import * as pdfDl from "./recipientPreviewPdfDownload";

describe("RecipientAgreementReadPdfExport repeat-click guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("disables the button while preparing and ignores rapid duplicate clicks", async () => {
    let resolveDl!: () => void;
    const dl = new Promise<void>((r) => {
      resolveDl = r;
    });
    const spy = vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockImplementation(() => dl);
    render(
      <RecipientAgreementReadPdfExport agreementId="ag-1" readHeaders={{}} scrubbedCurrentHtml="<p>x</p>" />,
    );
    const btn = screen.getByTestId("recipient-read-download-pdf") as HTMLButtonElement;
    const p = userEvent.click(btn);
    const q = userEvent.click(btn);
    const r = userEvent.click(btn);
    await Promise.all([p, q, r]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    resolveDl();
    await waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });
});
