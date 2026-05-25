/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_multi_review_iso";

const draftMultiReviewer = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Owner", role: "owner", id: "p-owner" },
    { name: "Atlas Harbor", role: "reviewer", id: "p-atlas" },
    { name: "Meridian", role: "reviewer", id: "p-meridian" },
    { name: "Prairie", role: "reviewer", id: "p-prairie" },
    { name: "NovaGrid", role: "reviewer", id: "p-novagrid" },
  ],
  purpose: "Consulting.",
  payment_terms: "Pay upon receipt.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [
    {
      event_type: "recipient_approved" as const,
      at: new Date().toISOString(),
      value: { participant_id: "p-atlas" },
    },
  ],
};

describe("AgreementRecipientReview multi-reviewer token isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reviewer2 still sees Looks good when reviewer1 is approved in audit (scoped)", async () => {
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
        return jsonResponse({ draft: draftMultiReviewer, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_meridian"
          participantPartyId="p-meridian"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    expect(screen.queryByText("Reviewer approved this draft without requesting changes.")).toBeNull();
    expect(screen.queryByTestId("recipient-accepted-awaiting-lock-root")).toBeNull();

    expect(screen.getByTestId("recipient-review-first-actions")).toBeTruthy();
    expect(screen.getByTestId("recipient-review-approve-draft")).toBeTruthy();
    expect(screen.getByTestId("recipient-review-propose-updated-draft")).toBeTruthy();
    expect(screen.queryByTestId("recipient-review-edit-draft")).toBeNull();
  });
});
