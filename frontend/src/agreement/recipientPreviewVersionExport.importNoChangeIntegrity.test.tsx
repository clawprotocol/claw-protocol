/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RECIPIENT_IMPORT_NO_CHANGE_PLAINTEXT_EXPORT } from "./portableReviewCopy";
import { RecipientPreviewVersionsExport } from "./recipientPreviewVersionExport";

describe("RecipientPreviewVersionsExport import no-change integrity", () => {
  afterEach(() => {
    cleanup();
  });

  it("copy original and copy proposed use the same plain text when import matches", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const prev = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const body = "Same agreement body text repeated for length. ".repeat(5).trim();
    const vm = buildLegalRedlineDocumentViewModel(body, body);
    render(
      <RecipientPreviewVersionsExport
        plainSource={{ currentPlain: body, proposedPlain: body }}
        legalRedlineVm={vm}
        redlinePdfImportMaterialNoChange
        pdfReadContext={{
          agreementId: "ag-x",
          readHeaders: {},
          scrubbedOriginalHtml: "<p>Same</p>",
          scrubbedProposedHtml: "<p>Same</p>",
          exportBasename: "deal",
        }}
      />,
    );
    const root = screen.getByTestId("recipient-preview-versions-export");
    await userEvent.click(within(root).getByTestId("recipient-copy-original-draft"));
    await userEvent.click(within(root).getByTestId("recipient-copy-proposed-draft"));
    expect(writeText).toHaveBeenNthCalledWith(1, body);
    expect(writeText).toHaveBeenNthCalledWith(2, body);

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: prev,
      configurable: true,
      writable: true,
    });
  });

  it("copy redline summary uses fixed no-change plaintext (not VM diff summary)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const prev = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const body = "Same agreement body text repeated for length. ".repeat(5).trim();
    const vm = buildLegalRedlineDocumentViewModel("alpha beta gamma", "delta epsilon zeta");
    render(
      <RecipientPreviewVersionsExport
        plainSource={{ currentPlain: body, proposedPlain: body }}
        legalRedlineVm={vm}
        redlinePdfImportMaterialNoChange
        pdfReadContext={{
          agreementId: "ag-x",
          readHeaders: {},
          scrubbedOriginalHtml: "<p>Same</p>",
          scrubbedProposedHtml: "<p>Same</p>",
          exportBasename: "deal",
        }}
      />,
    );
    const root = screen.getByTestId("recipient-preview-versions-export");
    await userEvent.click(within(root).getByTestId("recipient-copy-redline-summary"));
    expect(writeText).toHaveBeenCalledWith(RECIPIENT_IMPORT_NO_CHANGE_PLAINTEXT_EXPORT);
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("[+"));

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: prev,
      configurable: true,
      writable: true,
    });
  });
});
