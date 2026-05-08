/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientWantACopyStrip } from "./recipientWantACopyStrip";
import {
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_DROPZONE_PRIMARY,
  RECIPIENT_WANT_COPY_DROPZONE_SECONDARY,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
  RECIPIENT_WANT_COPY_UPLOAD_TIP,
} from "./portableReviewCopy";

describe("RecipientWantACopyStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows outside-review heading, loop copy, compare helper, and upload control", () => {
    render(
      <RecipientWantACopyStrip
        agreementId="ag_test"
        readHeaders={{}}
        scrubbedCurrentHtml="<p>x</p>"
        plainDraftText="body"
        onPrepareRevisedImport={vi.fn()}
        onImportedRevisedPlainText={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: RECIPIENT_WANT_COPY_HEADING })).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_BODY)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_UPLOAD_TIP)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_LOOPBACK_CUE)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_PRIMARY)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_SECONDARY)).toBeTruthy();
    expect(screen.getByTestId("recipient-want-copy-dropzone")).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-pdf")).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-text")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-draft-text")).toBeTruthy();
    expect(screen.getByTestId("recipient-want-copy-upload-revised")).toBeTruthy();
  });

  it("runs prepare then imports .txt contents via callback", async () => {
    const onPrepare = vi.fn();
    const onImported = vi.fn();
    render(
      <RecipientWantACopyStrip
        agreementId="ag_test"
        readHeaders={{}}
        scrubbedCurrentHtml="<p>x</p>"
        plainDraftText="body"
        onPrepareRevisedImport={onPrepare}
        onImportedRevisedPlainText={onImported}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("recipient-want-copy-upload-revised"));
    expect(onPrepare).toHaveBeenCalledTimes(1);
    const file = new File(["Revised line from file"], "changes.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-want-copy-upload-revised-input"), file);
    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith("Revised line from file");
    });
  });
});
