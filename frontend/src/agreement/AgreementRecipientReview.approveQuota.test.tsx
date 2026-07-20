/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { approveDraftFromReviewFirst } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import { PUBLIC_ALL_REVIEWS_COMPLETE_BODY } from "./recipientApprovedWaitingPresentation";

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/agreements/ag/review",
    search: "",
    hash: "",
    navigate: vi.fn(),
  }),
}));

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_approve_quota";

const draftOpen = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party", id: "p-bob" },
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

describe("AgreementRecipientReview approve + localStorage quota", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    localStorage.clear();
  });

  it("shows approved UI when API succeeds even if version cache write hits quota", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    let approveCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
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
        return jsonResponse({ rendered_html: "<p>" + "y".repeat(40_000) + "</p>" });
      }
      if (method === "POST" && url.includes("/recipient-approve")) {
        approveCalls += 1;
        return jsonResponse({
          draft: {
            ...draftOpen,
            audit_log: [
              {
                event_type: "recipient_approved",
                at: new Date().toISOString(),
                value: { participant_id: "p-bob" },
              },
            ],
          },
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft:
            approveCalls > 0
              ? {
                  ...draftOpen,
                  audit_log: [
                    {
                      event_type: "recipient_approved",
                      at: new Date().toISOString(),
                      value: { participant_id: "p-bob" },
                    },
                  ],
                }
              : draftOpen,
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string) => {
      if (key.startsWith("claw_agreement_versions_v1:")) {
        throw new DOMException("quota", "QuotaExceededError");
      }
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_bob" participantPartyId="p-bob" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    expect(screen.getByTestId("recipient-review-approve-draft")).toBeTruthy();
    await approveDraftFromReviewFirst();

    await waitFor(() => {
      expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toMatch(
        /Review submitted|All reviews complete/,
      );
    });

    expect(screen.queryByText(/Failed to execute 'setItem'/i)).toBeNull();
    expect(screen.queryByText(/exceeded the quota/i)).toBeNull();
    expect(screen.getByTestId("recipient-approved-waiting-body").textContent).toContain(
      PUBLIC_ALL_REVIEWS_COMPLETE_BODY.slice(0, 32),
    );
    expect(setItem.mock.calls.some(([k]) => String(k).startsWith("claw_agreement_versions_v1:"))).toBe(true);
    expect(screen.queryByRole("heading", { name: /Looks good/i })).toBeNull();
  });
});
