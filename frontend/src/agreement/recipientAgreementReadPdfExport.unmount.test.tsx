/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import * as pdfDl from "./recipientPreviewPdfDownload";

describe("RecipientAgreementReadPdfExport unmount safety", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("allows a fresh mount to export after unmount during an in-flight export", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const spy = vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockImplementation(() => gate);
    const { unmount } = render(
      <RecipientAgreementReadPdfExport agreementId="ag-u1" readHeaders={{}} scrubbedCurrentHtml="<p>x</p>" />,
    );
    const btn = screen.getByTestId("recipient-read-download-pdf") as HTMLButtonElement;
    void userEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    unmount();
    release();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    cleanup();
    render(<RecipientAgreementReadPdfExport agreementId="ag-u1" readHeaders={{}} scrubbedCurrentHtml="<p>y</p>" />);
    const btn2 = screen.getByTestId("recipient-read-download-pdf") as HTMLButtonElement;
    expect(btn2.disabled).toBe(false);
    vi.mocked(pdfDl.downloadRecipientPreviewPdf).mockResolvedValue(undefined);
    await userEvent.click(btn2);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
