/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
            audit_log: [{ event_type: "recipient_approved", at: new Date().toISOString() }],
          },
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft:
            approveCalls > 0
              ? {
                  ...draftOpen,
                  audit_log: [{ event_type: "recipient_approved", at: new Date().toISOString() }],
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

    const actionRoots = screen.getAllByTestId("recipient-party-review-actions");
    const landing = actionRoots.find((el) => el.getAttribute("data-placement") === "landing");
    expect(landing).toBeTruthy();
    await userEvent.click(within(landing!).getByTestId("recipient-document-first-looks-good"));

    await waitFor(() => {
      expect(screen.getByText("Reviewer approved this draft without requesting changes.")).toBeTruthy();
    });

    expect(screen.queryByText(/Failed to execute 'setItem'/i)).toBeNull();
    expect(screen.queryByText(/exceeded the quota/i)).toBeNull();
    expect(screen.getByText("Waiting for sender to finalize signing.")).toBeTruthy();
    expect(setItem.mock.calls.some(([k]) => String(k).startsWith("claw_agreement_versions_v1:"))).toBe(true);
    expect(screen.queryByRole("heading", { name: recipientPartyReviewCopy.looksGood })).toBeNull();
  });
});
