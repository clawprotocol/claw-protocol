/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import { RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE } from "./portableReviewCopy";
import * as pdfDl from "./recipientPreviewPdfDownload";

const extractMock = vi.fn();

vi.mock("./recipientRevisedDraftImportText", () => ({
  REVISED_DRAFT_FILE_INPUT_ACCEPT: ".pdf,application/pdf,.txt,text/plain,.md,text/markdown,text/x-markdown",
  extractRevisedDraftPlainText: (...args: unknown[]) => extractMock(...args),
}));

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_want_copy_baseline_pdf";
const BASELINE_MARKER = "BASELINE_ONLY_UNIQUE_QQ77";
const renderedHtml = `<p>${BASELINE_MARKER}</p><p>Second paragraph for agreement-like length.</p>`;

const draft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting.",
  payment_terms: "Net 30.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("AgreementRecipientReview want-copy draft PDF (baseline only)", () => {
  afterEach(() => {
    extractMock.mockReset();
    cleanup();
    vi.restoreAllMocks();
  });

  it("Download draft PDF keeps baseline-only title and export after outside-review compare", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const dlSpy = vi.spyOn(pdfDl, "downloadRecipientPreviewPdf").mockResolvedValue(undefined);

    const revisedBody =
      "1.0 Summary\nThis revised draft reflects clarifications requested by the reviewer.\n\n" +
      "2.0 Payment\nFees are due Net 45.\n\n" +
      "REVISED_UPLOAD_UNIQUE_ZZ88 ".repeat(80).trim();

    extractMock.mockResolvedValue({
      ok: true,
      text: revisedBody,
      importReviewerNotesTail: null,
      importArtifactsRemoved: [] as string[],
      pdfThinSanitizeUsedRaw: false,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: renderedHtml });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_wc" />
      </AccessProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());

    const draftBtn = screen.getByTestId("recipient-download-draft-pdf");
    expect(draftBtn.getAttribute("title")).toBe(RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE);

    await userEvent.click(screen.getByTestId("recipient-want-copy-upload-revised"));
    await waitFor(() => expect(screen.getByTestId("recipient-revised-version-panel")).toBeTruthy());

    await userEvent.upload(screen.getByTestId("recipient-want-copy-upload-revised-input"), new File([revisedBody], "rev.txt"));

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 20_000 },
    );

    dlSpy.mockClear();
    await userEvent.click(screen.getByTestId("recipient-download-draft-pdf"));

    await waitFor(() => expect(dlSpy).toHaveBeenCalled());
    const arg = dlSpy.mock.calls[0]![0]!;
    expect(arg.exportKind).toBe("original");
    expect(arg.html).toContain(BASELINE_MARKER);
    expect(arg.html).not.toContain("REVISED_UPLOAD_UNIQUE_ZZ88");
    expect(arg.html.toLowerCase()).not.toMatch(/line-through/);
  }, 35_000);
});
