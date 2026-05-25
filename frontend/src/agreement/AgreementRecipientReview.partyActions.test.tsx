/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_party_actions_test";

const initialDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting.",
  payment_terms: "Pay upon receipt.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("AgreementRecipientReview review-first actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a simplified collaborative draft-review UI without legacy decision cards", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      if (method === "POST" && url.includes("/recipient-approve")) {
        return jsonResponse({ ok: true, draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    const docShell = screen.getByTestId("recipient-document-shell");
    expect(within(docShell).getByText(/Body/i)).toBeTruthy();
    expect(screen.queryByTestId("recipient-open-draft-preview")).toBeNull();

    const summary = screen.getByTestId("recipient-summary-card");
    expect(within(summary).getByText("Type")).toBeTruthy();
    expect(within(summary).getByText("Services")).toBeTruthy();
    expect(within(summary).queryByText(/Agreement type/i)).toBeNull();

    expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    expect(screen.getByText(/Read the draft, approve it, or suggest a change/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Request changes/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /I'm not participating|I’m not participating/i })).toBeNull();
    expect(screen.queryByText(/Review somewhere else/i)).toBeNull();
    expect(screen.queryByText(/^Download copy$/i)).toBeNull();

    const actions = screen.getByTestId("recipient-review-first-actions");
    expect(within(actions).getByRole("button", { name: /Approve draft/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /Suggest changes/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /^Download$/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /More options/i })).toBeTruthy();
    expect(within(actions).queryByRole("button", { name: /Edit text directly/i })).toBeNull();
    await userEvent.click(within(actions).getByRole("button", { name: /More options/i }));
    expect(within(actions).getByRole("button", { name: /Edit text directly/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /Upload updated draft/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /^Download text$/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /^Copy text$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manual compare/i })).toBeNull();

    await userEvent.click(within(actions).getByRole("button", { name: /Approve draft/i }));
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
  });

  it("opens the inline editor from the review-first actions", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Hi</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getByTestId("recipient-review-more-options"));
    await userEvent.click(screen.getByTestId("recipient-review-edit-draft"));
    expect(await screen.findByTestId("recipient-edit-draft-textarea")).toBeTruthy();
    expect(screen.getByTestId("recipient-compare-versions-button").textContent).toMatch(/Save updated draft/i);
  });
});
