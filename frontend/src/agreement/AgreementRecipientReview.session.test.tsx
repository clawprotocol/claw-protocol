/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import {
  invalidateNegotiationReviewSessionPresentation,
  resetNegotiationReviewSessionAuthForTests,
} from "./recipientReviewAuth";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_session_review";
const draft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { id: "p-owner", name: "Alice", role: "owner" },
    { id: "p-bob", name: "Bob", role: "party" },
  ],
  purpose: "Consulting agreement body.",
  payment_terms: "Net 30",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("AgreementRecipientReview session presentation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetNegotiationReviewSessionAuthForTests();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("authenticated session renders review screen and logout calls backend once", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/negotiation-review/session/logout")) {
        return jsonResponse({ authenticated: false });
      }
      if (method === "POST" && url.includes("/negotiation-review/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementId}/negotiation-review/draft`)) {
        return jsonResponse({ draft, review_authorization: { mode: "review" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });
    expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();

    await userEvent.click(screen.getByTestId("recipient-review-session-logout"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-review-session-invalid")).toBeTruthy();
    });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/session/logout"))).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Review agreement" })).toBeNull();
  });

  it("logout failure keeps protected review UI and shows truthful error", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/negotiation-review/session/logout")) {
        return new Response("error", { status: 503 });
      }
      if (method === "POST" && url.includes("/negotiation-review/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementId}/negotiation-review/draft`)) {
        return jsonResponse({ draft, review_authorization: { mode: "review" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId("recipient-review-session-logout"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-review-session-logout-failed")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    expect(screen.queryByTestId("recipient-review-session-invalid")).toBeNull();
  });

  it("stale draft response does not overwrite newer agreement state", async () => {
    let resolveFirstDraft!: (value: Response) => void;
    const firstDraftPromise = new Promise<Response>((resolve) => {
      resolveFirstDraft = resolve;
    });
    const agreementB = "ag_session_review_b";
    const draftB = { ...draft, id: agreementB, title: "Agreement B" };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/negotiation-review/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementId}/negotiation-review/draft`)) {
        return firstDraftPromise;
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementB}/negotiation-review/draft`)) {
        return jsonResponse({ draft: draftB, review_authorization: { mode: "review" } });
      }
      return new Response("not found", { status: 404 });
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const { rerender } = render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    rerender(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementB}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Agreement B")).toBeTruthy();
    });

    resolveFirstDraft(jsonResponse({ draft, review_authorization: { mode: "review" } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Services")).toBeNull();
    expect(screen.getByText("Agreement B")).toBeTruthy();
  });

  it("401 on session-authenticated refresh clears protected content", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/negotiation-review/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementId}/negotiation-review/draft`)) {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ draft, review_authorization: { mode: "review" } });
        }
        return new Response("forbidden", { status: 403 });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    });

    invalidateNegotiationReviewSessionPresentation();

    await waitFor(() => {
      expect(screen.getByTestId("recipient-review-session-invalid")).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-review-session-logout")).toBeNull();
  });

  it("does not persist plaintext credentials to web storage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/negotiation-review/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (method === "GET" && url.includes(`/api/agreements/${agreementId}/negotiation-review/draft`)) {
        return jsonResponse({ draft, review_authorization: { mode: "review" } });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          negotiationReviewSessionAuth
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    const storageBlob = `${window.localStorage.length}:${window.sessionStorage.length}:${JSON.stringify(
      window.localStorage,
    )}:${JSON.stringify(window.sessionStorage)}`;
    expect(storageBlob).not.toMatch(/#t=|bootstrap-token|recipient-access-token/i);
  });
});
