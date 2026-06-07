/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import { recipientPartyReviewCopy } from "./recipientReviewPartyActions";
import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";
import {
  RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
} from "./portableReviewCopy";
import { RECIPIENT_PUBLIC_HERO_TITLE } from "./recipientReviewTrustCopy";
import { RECIPIENT_APPROVED_LAWDOG_PROMO_LINE } from "./recipientPublicReviewChrome";

const mockNavigate = vi.fn();

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/agreements/ag/review",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_accepted_await_lock";

const draftAccepted = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner", id: "p-alice" },
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
  audit_log: [
    {
      event_type: "recipient_approved",
      at: new Date().toISOString(),
      value: { participant_id: "p-bob" },
    },
  ],
};

describe("AgreementRecipientReview post-accept awaiting signing_lock", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it("shows clean waiting layout: no legacy review surface, Want a copy + downloads, refresh", async () => {
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
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: draftAccepted, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" participantPartyId="p-bob" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
    expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toContain("Review submitted");
    expect(screen.getByTestId("recipient-approved-waiting-body").textContent).toContain(
      "remaining reviewer(s)",
    );
    expect(screen.getByTestId("recipient-approved-waiting-body").textContent).not.toMatch(
      /sender will finalize/i,
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();

    expect(screen.queryByTestId("recipient-document-shell")).toBeNull();
    expect(screen.queryByRole("heading", { name: RECIPIENT_PUBLIC_HERO_TITLE })).toBeNull();
    expect(screen.queryByRole("button", { name: recipientPartyReviewCopy.requestChanges })).toBeNull();
    expect(screen.queryByText(RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL)).toBeNull();
    expect(screen.queryByRole("heading", { name: RECIPIENT_WANT_COPY_HEADING })).toBeNull();
    expect(screen.queryByText(RECIPIENT_WANT_COPY_LOOPBACK_CUE)).toBeNull();
    expect(screen.queryByTestId("recipient-want-copy-dropzone")).toBeNull();

    expect(screen.getByRole("heading", { name: /^Want a copy\?$/ })).toBeTruthy();
    expect(screen.getByTestId("recipient-records-download-pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download text$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Copy text$/ })).toBeTruthy();
    expect(screen.getByTestId("recipient-approved-lawdog-promo").textContent).toContain(
      RECIPIENT_APPROVED_LAWDOG_PROMO_LINE,
    );
    expect(screen.queryByText(/Current plan:/)).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
  });

  it("notifies parent shell to hide account chrome while approved/waiting", async () => {
    const onApprovedWaitingChange = vi.fn();
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
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: draftAccepted, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-bob"
          onRecipientApprovedWaitingChange={onApprovedWaitingChange}
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(onApprovedWaitingChange).toHaveBeenCalledWith(true);
    });
  });

  it("after polling detects signing_lock, signer sees Continue to signing and waiting root is gone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: vi.fn(),
      });
    let agreementGetCount = 0;
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
        return jsonResponse({ rendered_html: "<p>Locked doc</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        agreementGetCount += 1;
        if (agreementGetCount === 1) {
          return jsonResponse({ draft: draftAccepted, signing_lock: null });
        }
        const scope = recipientLinkTokenFingerprint("tok_test");
        const raw = localStorage.getItem(`claw_agreement_versions_v1:${agreementId}:r:${scope}`);
        const vid = raw ? (JSON.parse(raw) as { versions: { id: string }[] }).versions[0]?.id ?? "" : "";
        return jsonResponse({
          draft: draftAccepted,
          signing_lock: { locked_version_id: vid, locked_at: "2026-05-10T12:00:00.000Z", locked_by: "owner" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-bob"
          recipientLinkRole="signer"
        />
      </AccessProvider>,
    );

      await waitFor(() => {
        expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      await waitFor(() => {
        expect(screen.queryByTestId("recipient-accepted-awaiting-lock-root")).toBeNull();
      });
      const continueLinks = screen.getAllByRole("link", { name: recipientPartyReviewCopy.continueToSigning });
      expect(continueLinks.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("recipient-document-shell")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("QA Party 2 simulation shows public recipient post-approval copy", async () => {
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
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: draftAccepted, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-bob"
          recipientViewerContext="qa_recipient_simulation"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
    });

    expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toContain("Review submitted");
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByText(/Current plan:/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Dashboard$/ })).toBeNull();
  });

  it("QA Party 1 simulation shows creator-aware post-approval copy", async () => {
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
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft: {
            ...draftAccepted,
            parties: [
              { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "owner" },
              { id: "p-iron", name: "Iron Vale Systems Inc.", role: "party" },
            ],
            audit_log: [{ event_type: "recipient_approved", at: new Date().toISOString(), value: { participant_id: "p-blue" } }],
          },
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-blue"
          recipientViewerContext="qa_recipient_simulation"
          qaOwnerReturnPath="/app/done/ag_accepted_await_lock"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
    });

    expect(screen.getByTestId("recipient-signing-readiness-panel").getAttribute("data-recipient-post-approval-audience")).toBe(
      "creator",
    );
    expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toContain("Review complete");
    expect(screen.getByRole("button", { name: "Return to dashboard" })).toBeTruthy();
    expect(screen.getByTestId("recipient-approved-waiting-body").textContent).toContain(
      "remaining reviewer(s)",
    );
    expect(screen.getByTestId("recipient-approved-waiting-body").textContent).not.toMatch(
      /sender will finalize|Agreement review dashboard|Check for updates/i,
    );
  });

  it("Party 1 QA can return to dashboard", async () => {
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
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft: {
            ...draftAccepted,
            parties: [
              { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "owner" },
              { id: "p-iron", name: "Iron Vale Systems Inc.", role: "party" },
            ],
            audit_log: [{ event_type: "recipient_approved", at: new Date().toISOString(), value: { participant_id: "p-blue" } }],
          },
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-blue"
          recipientViewerContext="qa_recipient_simulation"
          qaOwnerReturnPath="/app/done/ag_accepted_await_lock"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Return to dashboard" })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "Return to dashboard" }));
    expect(mockNavigate).toHaveBeenCalledWith("/app");
  });
});
