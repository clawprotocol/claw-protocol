/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { openRecipientReviseUploadPickMethod } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import { htmlToPlainText } from "./externalAiHandoff";
import { substitutePartyPlaceholdersInUserFacingText } from "./partyPlaceholderDisplay";

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

const LONG_HTML =
  "<p>Section A. This consulting services agreement includes standard confidentiality scope and governing law.</p>" +
  "<p>2. Payment terms Net 30 upon invoice. Term is one year.</p>";

function makeDraft(id: string) {
  return {
    id,
    title: "Consulting",
    jurisdiction: "DE",
    parties: [
      { name: "Acme", role: "owner" },
      { name: "Consultant", role: "party" },
    ],
    purpose: "Consulting services.",
    payment_terms: "Net 30 upon invoice.",
    duration: "1 year",
    due_date: null,
    effective_date: "2026-01-01",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
    audit_log: [],
  };
}

describe("AgreementRecipientReview same-text import (no material change)", () => {
  beforeEach(() => {
    extractMock.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    extractMock.mockReset();
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows no-change panel when extracted text matches render, then full compare after a real edit", async () => {
    const agreementId = "ag_same_pdf_import";
    const draft = makeDraft(agreementId);
    const draftSanitizeContext = [draft.title, draft.purpose, draft.payment_terms, ...draft.parties.map((p) => p.name)].join(
      "\n",
    );
    const exactComparePlain = htmlToPlainText(
      substitutePartyPlaceholdersInUserFacingText(LONG_HTML, draftSanitizeContext),
    ).trim();

    extractMock.mockResolvedValueOnce({
      ok: true,
      text: `${exactComparePlain}\n\nPage 1 of 2\n`,
      importReviewerNotesTail: null,
      importArtifactsRemoved: [] as string[],
      pdfThinSanitizeUsedRaw: false,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}/render`)) {
        return jsonResponse({ rendered_html: LONG_HTML });
      }
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_same" />
      </AccessProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());

    await openRecipientReviseUploadPickMethod();
    expect(screen.getAllByTestId("recipient-revised-version-panel")[0]).toBeTruthy();

    const fileInput = await screen.findByTestId("recipient-import-draft-file-input");
    fireEvent.change(fileInput, { target: { files: [new File(["dummy"], "same.txt", { type: "text/plain" })] } });

    await waitFor(() => {
      expect(screen.getByTestId("recipient-import-no-change-panel")).toBeTruthy();
    });

    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();
    expect(screen.queryByTestId("recipient-business-review-cards")).toBeNull();
    expect(screen.queryByText(/Sarah Collins proposed/i)).toBeNull();
    expect(screen.queryByText(/meaningful revisions/i)).toBeNull();
    expect(screen.queryByTestId("recipient-focused-wording-dialog")).toBeNull();
    expect(screen.queryByTestId("recipient-redline-sticky-nav")).toBeNull();

    const noChangePanel = screen.getByTestId("recipient-import-no-change-panel");
    expect(within(noChangePanel).queryByText(/Changed wording/i)).toBeNull();

    extractMock.mockResolvedValueOnce({
      ok: true,
      text: `${exactComparePlain}\n\nMATERIAL_UNIQUE_TAIL: governing law must be Antarctica only for this counter-proposal.`,
      importReviewerNotesTail: null,
      importArtifactsRemoved: [] as string[],
      pdfThinSanitizeUsedRaw: false,
    });

    await userEvent.click(screen.getByTestId("recipient-import-no-change-continue-editing"));
    await waitFor(() => expect(screen.queryByTestId("recipient-import-no-change-panel")).toBeNull());

    fireEvent.change(fileInput, { target: { files: [new File(["y"], "rev.txt", { type: "text/plain" })] } });

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("recipient-import-no-change-panel")).toBeNull();
  });

  it("after a material compare, re-uploading the same-as-current draft clears prior UI and shows no-change", async () => {
    const agreementId = "ag_same_pdf_after_change";
    const draft = makeDraft(agreementId);
    const draftSanitizeContext = [draft.title, draft.purpose, draft.payment_terms, ...draft.parties.map((p) => p.name)].join(
      "\n",
    );
    const exactComparePlain = htmlToPlainText(
      substitutePartyPlaceholdersInUserFacingText(LONG_HTML, draftSanitizeContext),
    ).trim();

    extractMock.mockResolvedValueOnce({
      ok: true,
      text: `${exactComparePlain}\n\nMATERIAL_UNIQUE_TAIL: governing law must be Antarctica only for this counter-proposal.`,
      importReviewerNotesTail: null,
      importArtifactsRemoved: [] as string[],
      pdfThinSanitizeUsedRaw: false,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}/render`)) {
        return jsonResponse({ rendered_html: LONG_HTML });
      }
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_same2" />
      </AccessProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());

    await openRecipientReviseUploadPickMethod();
    expect(screen.getAllByTestId("recipient-revised-version-panel")[0]).toBeTruthy();

    const fileInput = await screen.findByTestId("recipient-import-draft-file-input");
    fireEvent.change(fileInput, { target: { files: [new File(["a"], "changed.txt", { type: "text/plain" })] } });

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 8000 },
    );
    expect(screen.queryByTestId("recipient-import-no-change-panel")).toBeNull();
    expect(screen.getByTestId("recipient-suggested-changes-document")).toBeTruthy();

    extractMock.mockResolvedValueOnce({
      ok: true,
      text: `${exactComparePlain}\n\nPage 1 of 2\n`,
      importReviewerNotesTail: null,
      importArtifactsRemoved: [] as string[],
      pdfThinSanitizeUsedRaw: false,
    });

    fireEvent.change(fileInput, { target: { files: [new File(["b"], "same-as-draft.txt", { type: "text/plain" })] } });

    await waitFor(() => {
      expect(screen.getByTestId("recipient-import-no-change-panel")).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();
    expect(screen.queryByTestId("recipient-business-review-cards")).toBeNull();
    expect(screen.queryByText(/Antarctica/i)).toBeNull();
    expect(screen.queryByText(/meaningful revisions/i)).toBeNull();
    expect(screen.queryByTestId("recipient-focused-wording-dialog")).toBeNull();
    expect(screen.queryByTestId("recipient-redline-sticky-nav")).toBeNull();
    const panel = screen.getByTestId("recipient-import-no-change-panel");
    expect(within(panel).queryByText(/Changed wording/i)).toBeNull();
  });
});
