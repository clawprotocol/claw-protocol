/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { openRecipientReviseUploadPickMethod } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import {
  RECIPIENT_BTN_CONTINUE_EDITING,
  RECIPIENT_CLAUSE_SUGGESTIONS_TITLE,
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE,
} from "./portableReviewCopy";
import { REVISED_DRAFT_FILE_INPUT_ACCEPT } from "./recipientRevisedDraftImportText";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_upload_classify";

const draft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting agreement body text for length baseline in tests.",
  payment_terms: "Net 30.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("AgreementRecipientReview upload classification", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("notes-only upload shows gate card and does not run compare preview (one baseline /render for classification)", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Agreement body for recipient.</p>" });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_c" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    const callsAfterLoad = fetchSpy.mock.calls.length;

    await openRecipientReviseUploadPickMethod(user);

    const notesOnly = "Recommendation\n\nWe suggest changing payment to Net 45 for cash flow.";
    const file = new File([notesOnly], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-import-draft-file-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-upload-notes-only-card")).toBeTruthy();
    });
    expect(screen.getByText(RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE)).toBeTruthy();
    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();

    const newCalls = fetchSpy.mock.calls.slice(callsAfterLoad);
    const renderAfterUpload = newCalls.filter((c) => String(c[0]).includes("/render"));
    // Import path refreshes `/render` once for authoritative baseline before role classification.
    expect(renderAfterUpload.length).toBe(1);
  }, 20_000);

  it("structured bullet upload shows clause suggestions surface without compare preview (one /render)", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Agreement body for recipient.</p>" });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_c" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    const callsAfterLoad = fetchSpy.mock.calls.length;

    await openRecipientReviseUploadPickMethod(user);

    const bullets = [
      "Please review the following adjustments before we sign.",
      "",
      "- Payment timing: Net 45 instead of Net 30 for cash flow",
      "- Scope boundaries: keep bug fixes separate from new product work",
      "- Delays: when the client causes delay, extend delivery milestones fairly",
      "- Third-party tools: clarify who pays for SaaS the team needs mid-project",
    ].join("\n");
    const file = new File([bullets], "asks.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-import-draft-file-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-clause-suggestions-surface")).toBeTruthy();
    });
    expect(screen.getByText(RECIPIENT_CLAUSE_SUGGESTIONS_TITLE)).toBeTruthy();
    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();

    const newCalls = fetchSpy.mock.calls.slice(callsAfterLoad);
    const renderAfterUpload = newCalls.filter((c) => String(c[0]).includes("/render"));
    expect(renderAfterUpload.length).toBe(1);
  }, 20_000);

  it("full revised upload still reaches suggested-changes panel", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Agreement body for recipient.</p>" });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_c" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await openRecipientReviseUploadPickMethod(user);

    const body = "y".repeat(2000);
    const file = new File([body], "rev.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-import-draft-file-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
    }, { timeout: 15_000 });
    expect(screen.queryByTestId("recipient-upload-notes-only-card")).toBeNull();

    await user.click(
      within(screen.getByTestId("recipient-suggested-changes-panel")).getByRole("button", {
        name: RECIPIENT_BTN_CONTINUE_EDITING,
      }),
    );
    expect(screen.getByTestId("recipient-import-draft-file-input").getAttribute("accept")).toBe(
      REVISED_DRAFT_FILE_INPUT_ACCEPT,
    );
  }, 25_000);
});
