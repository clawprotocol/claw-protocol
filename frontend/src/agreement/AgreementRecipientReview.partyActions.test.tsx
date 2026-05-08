/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import { recipientPartyReviewCopy } from "./recipientReviewPartyActions";

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

describe("AgreementRecipientReview party actions (landing + document)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("document-first: draft and summary are above the fold; compact actions and downloads on read tab", async () => {
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

    const docShell = screen.getByTestId("recipient-document-shell");
    expect(within(docShell).getByText(/Body/i)).toBeTruthy();
    expect(screen.queryByTestId("recipient-open-draft-preview")).toBeNull();

    const summary = screen.getByTestId("recipient-summary-card");
    expect(within(summary).getByText("Type")).toBeTruthy();
    expect(within(summary).getByText("Services")).toBeTruthy();
    expect(within(summary).queryByText(/Agreement type/i)).toBeNull();

    const actionRoots = screen.getAllByTestId("recipient-party-review-actions");
    expect(actionRoots.length).toBeGreaterThanOrEqual(2);

    const landingDesktop = actionRoots.find((el) => el.getAttribute("data-placement") === "landing");
    const landingMobile = actionRoots.find((el) => el.getAttribute("data-placement") === "landing-mobile");
    expect(landingDesktop).toBeTruthy();
    expect(landingMobile).toBeTruthy();

    for (const root of [landingDesktop!, landingMobile!]) {
      expect(within(root).queryByRole("button", { name: recipientPartyReviewCopy.reviewAgreement })).toBeNull();
      expect(within(root).getByTestId("recipient-document-first-looks-good")).toBeTruthy();
      expect(within(root).getByTestId("recipient-document-first-request-changes")).toBeTruthy();
      expect(within(root).getByTestId("recipient-document-first-download")).toBeTruthy();
      expect(within(root).getByTestId("recipient-document-first-not-participating")).toBeTruthy();
    }

    expect(screen.getByTestId("recipient-want-a-copy-card")).toBeTruthy();

    await userEvent.click(within(landingDesktop!).getByTestId("recipient-document-first-download"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-party-review-actions").getAttribute("data-placement")).toBe("document-read");
    });

    expect(screen.queryByTestId("recipient-open-draft-preview")).toBeNull();

    const docActions = screen.getByTestId("recipient-party-review-actions");
    expect(docActions.getAttribute("data-placement")).toBe("document-read");
    expect(within(docActions).queryByTestId("recipient-decision-menu")).toBeNull();
    expect(screen.getByTestId("recipient-want-a-copy-card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download draft PDF$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download draft text$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy draft text/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manual compare/i })).toBeNull();

    await userEvent.click(within(docActions).getByTestId("recipient-document-first-request-changes"));
    await userEvent.click(await screen.findByTestId("recipient-compose-card-small-tweak"));
    expect(await screen.findByTestId("recipient-revision-voice-field")).toBeTruthy();
  });

  it("Request changes from landing opens the composer", async () => {
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

    const landingDesktop = screen
      .getAllByTestId("recipient-party-review-actions")
      .find((el) => el.getAttribute("data-placement") === "landing")!;
    await userEvent.click(within(landingDesktop).getByTestId("recipient-document-first-request-changes"));
    await userEvent.click((await screen.findAllByTestId("recipient-compose-card-small-tweak"))[0]!);
    expect((await screen.findAllByTestId("recipient-revision-voice-field")).length).toBeGreaterThan(0);
  });
});
