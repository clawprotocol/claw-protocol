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

  it("shows the same four action labels on landing (desktop + mobile) and after entering review on document controls", async () => {
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

    const actionRoots = screen.getAllByTestId("recipient-party-review-actions");
    expect(actionRoots.length).toBeGreaterThanOrEqual(2);

    const landingDesktop = actionRoots.find((el) => el.getAttribute("data-placement") === "landing");
    const landingMobile = actionRoots.find((el) => el.getAttribute("data-placement") === "landing-mobile");
    expect(landingDesktop).toBeTruthy();
    expect(landingMobile).toBeTruthy();

    expect(screen.getByTestId("recipient-summary-card")).toBeTruthy();

    for (const root of [landingDesktop!, landingMobile!]) {
      expect(within(root).getByRole("button", { name: recipientPartyReviewCopy.reviewAgreement })).toBeTruthy();
      expect(within(root).getByRole("button", { name: recipientPartyReviewCopy.requestChanges })).toBeTruthy();
      expect(within(root).getByRole("button", { name: new RegExp(`^${recipientPartyReviewCopy.looksGood}`, "i") })).toBeTruthy();
      expect(within(root).getByRole("button", { name: recipientPartyReviewCopy.notParticipating })).toBeTruthy();
    }

    await userEvent.click(within(landingDesktop!).getByRole("button", { name: recipientPartyReviewCopy.reviewAgreement }));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-party-review-actions").getAttribute("data-placement")).toBe("document-read");
    });

    expect(screen.getByTestId("recipient-open-draft-preview")).toBeTruthy();

    const docActions = screen.getByTestId("recipient-party-review-actions");
    expect(docActions.getAttribute("data-placement")).toBe("document-read");
    expect(screen.getByTestId("recipient-want-a-copy-card")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download draft PDF$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download draft text$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy draft text/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Manual compare/i })).toBeNull();
    expect(within(docActions).getByText(recipientPartyReviewCopy.decisionMenuSubcopy)).toBeTruthy();
    expect(within(docActions).getByRole("button", { name: recipientPartyReviewCopy.reviewAgain })).toBeTruthy();
    expect(within(docActions).getByRole("button", { name: new RegExp(recipientPartyReviewCopy.sendBackRevised, "i") })).toBeTruthy();
    expect(within(docActions).getByRole("button", { name: new RegExp(recipientPartyReviewCopy.askQuickChange, "i") })).toBeTruthy();
    expect(within(docActions).getByTestId("recipient-download-original-cta")).toBeTruthy();
    expect(within(docActions).getByRole("button", { name: new RegExp(`^${recipientPartyReviewCopy.looksGood}`, "i") })).toBeTruthy();
    expect(within(docActions).getByRole("button", { name: /not participating/i })).toBeTruthy();

    await userEvent.click(within(docActions).getByTestId("recipient-ask-quick-change"));
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
    await userEvent.click(within(landingDesktop).getByRole("button", { name: recipientPartyReviewCopy.requestChanges }));
    await userEvent.click(await screen.findByTestId("recipient-compose-card-small-tweak"));
    expect((await screen.findAllByTestId("recipient-revision-voice-field")).length).toBeGreaterThan(0);
  });
});
