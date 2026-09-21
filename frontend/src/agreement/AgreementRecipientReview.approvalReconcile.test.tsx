/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { approveDraftFromReviewFirst } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";

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

const agreementId = "ag_approve_reconcile";
const SNAP = "crs_intended";
const DIGEST = "aa".repeat(32);

const draftOpen = {
  id: agreementId,
  title: "Services",
  jurisdiction: "MA",
  parties: [
    { id: "p_lumen", name: "Lumen Bioinformatics Inc.", role: "Platform Developer" },
    { id: "p_thalassa", name: "Thalassa Data Systems LLC", role: "reviewer" },
    { id: "p_coastal", name: "Coastal Meridian Analytics LLC", role: "reviewer" },
    { id: "p_vanguard", name: "Vanguard Regulatory Sciences Ltd.", role: "reviewer" },
  ],
  purpose: "Consulting.",
  payment_terms: "Milestones.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

const approvedAudit = [
  {
    event_type: "participant_approved",
    at: new Date().toISOString(),
    value: { participant_id: "p_lumen", snapshot_id: SNAP, corpus_sha256: DIGEST },
  },
];

function renderReview() {
  return render(
    <AccessProvider>
      <AgreementRecipientReview
        agreementId={agreementId}
        recipientAccessToken="tok_lumen"
        participantPartyId="p_lumen"
      />
    </AccessProvider>,
  );
}

describe("AgreementRecipientReview approval authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    localStorage.clear();
  });

  it("keeps the rejection when the server refuses the approve POST", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let approveCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : String((input as Request).url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/render")) return jsonResponse({ rendered_html: "<p>Body</p>" });
      if (method === "POST" && url.includes("/recipient-approve")) {
        approveCalls += 1;
        return jsonResponse({ detail: "owner_uses_workspace_not_recipient_approve" }, 403);
      }
      if (method === "GET" && url.includes("/api/agreements/")) {
        return jsonResponse({ draft: draftOpen, signing_lock: null });
      }
      return new Response("not found", { status: 404 });
    });

    renderReview();
    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());
    await approveDraftFromReviewFirst();
    await waitFor(() => {
      expect(screen.getByTestId("journey-action-banner").textContent).toMatch(/Couldn't record approval/i);
    });
    expect(screen.queryByTestId("recipient-approved-waiting-header")).toBeNull();
    expect(screen.queryByTestId("recipient-review-approved-status")).toBeNull();
    expect(approveCalls).toBe(1);
  });

  it("records a successful server-confirmed approval", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let approveCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : String((input as Request).url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/render")) return jsonResponse({ rendered_html: "<p>Body</p>" });
      if (method === "POST" && url.includes("/recipient-approve")) {
        approveCalls += 1;
        return jsonResponse({ ok: true, draft: { ...draftOpen, audit_log: approvedAudit } });
      }
      if (method === "GET" && url.includes("/api/agreements/")) {
        return jsonResponse({
          draft: approveCalls > 0 ? { ...draftOpen, audit_log: approvedAudit } : draftOpen,
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    renderReview();
    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());
    await approveDraftFromReviewFirst();
    await waitFor(() => {
      expect(
        screen.queryByTestId("recipient-approved-waiting-header") ||
          screen.queryByTestId("recipient-review-approved-status"),
      ).toBeTruthy();
    });
    expect(approveCalls).toBe(1);
    expect(screen.queryByText(/Couldn't record approval/i)).toBeNull();
  });

  it("reconciles an ambiguous 5xx with the recorded approval and does not POST again", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let approveCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : String((input as Request).url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/render")) return jsonResponse({ rendered_html: "<p>Body</p>" });
      if (method === "POST" && url.includes("/recipient-approve")) {
        approveCalls += 1;
        return jsonResponse({ detail: "upstream_timeout" }, 500);
      }
      if (method === "GET" && url.includes("/api/agreements/")) {
        return jsonResponse({
          draft: approveCalls > 0 ? { ...draftOpen, audit_log: approvedAudit } : draftOpen,
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    renderReview();
    await waitFor(() => expect(screen.queryByText(/Loading agreement/i)).toBeNull());
    await approveDraftFromReviewFirst();
    await waitFor(() => {
      expect(screen.queryByText(/Couldn't record approval/i)).toBeNull();
      expect(
        screen.queryByTestId("recipient-approved-waiting-header") ||
          screen.queryByTestId("recipient-review-approved-status"),
      ).toBeTruthy();
    });
    expect(approveCalls).toBe(1);
  });
});
