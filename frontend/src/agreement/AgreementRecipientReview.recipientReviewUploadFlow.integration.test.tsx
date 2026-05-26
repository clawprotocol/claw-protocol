/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { openRecipientReviseUploadPickMethod } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import { RECIPIENT_BTN_CONTINUE_EDITING } from "./portableReviewCopy";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_recipient_upload_flow";

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

const revisedDraft = {
  ...draft,
  purpose: `${draft.purpose} Revised.`,
  updated_at: new Date().toISOString(),
};

function mockFetchForCompare() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : typeof Request !== "undefined" && input instanceof Request
            ? input.url
            : String(input);
    const method = (
      init?.method ||
      (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    if (method === "POST" && url.includes("/render")) {
      return jsonResponse({ rendered_html: "<p>Agreement body for recipient.</p>" });
    }
    if (method === "POST" && url.includes("/revise")) {
      return jsonResponse({
        draft: revisedDraft,
        rendered_html: "<p>Agreement body for recipient.</p>",
      });
    }
    if (method === "GET" && url.includes(`/api/agreements/${agreementId}`) && !url.includes("/revise")) {
      return jsonResponse({ draft });
    }
    return new Response("not found", { status: 404 });
  });
}

async function openWorkspaceRevisedPickMethod(user: ReturnType<typeof userEvent.setup>) {
  await openRecipientReviseUploadPickMethod(user);
  expect(screen.getByTestId("recipient-upload-revised-file")).toBeTruthy();
}

describe("AgreementRecipientReview revised upload → compare (regression guard)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("workspace file input from pick-method hydrates compare and shows summary headline", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mockFetchForCompare();
    const user = userEvent.setup();

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_up" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await openWorkspaceRevisedPickMethod(user);

    const body = "y".repeat(2000);
    const file = new File([body], "rev-workspace.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-import-draft-file-input"), file);

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 20_000 },
    );

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    expect(within(panel).getByTestId("recipient-preview-summary-heading").textContent).toBe("Changes detected");
    expect(within(panel).getByRole("button", { name: RECIPIENT_BTN_CONTINUE_EDITING })).toBeTruthy();
  }, 30_000);

  it("empty workspace upload shows inline error in pick-method (no silent fail)", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mockFetchForCompare();
    const user = userEvent.setup();

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_bad" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await openWorkspaceRevisedPickMethod(user);

    const emptyTxt = new File([], "empty.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-import-draft-file-input"), emptyTxt);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-draft-import-error-pick-method")).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();
  }, 25_000);

  it("drop revised .txt on revised panel hydrates compare", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mockFetchForCompare();

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_drop" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await openRecipientReviseUploadPickMethod();
    const panelEl = await screen.findByTestId("recipient-revised-version-panel");

    const body = "q".repeat(2000);
    const file = new File([body], "dropped.txt", { type: "text/plain" });
    const dataTransfer = {
      dropEffect: "copy" as const,
      effectAllowed: "all" as const,
      files: Object.assign([file], { item: (i: number) => [file][i] ?? null, length: 1 }),
      items: { add: () => {} },
      types: ["Files"],
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    fireEvent.dragOver(panelEl, { dataTransfer, preventDefault: () => {} });
    fireEvent.drop(panelEl, { dataTransfer, preventDefault: () => {} });

    await waitFor(() => expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy(), {
      timeout: 20_000,
    });
  }, 30_000);
});
