/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const ORIGINAL_SCHEDULE_A =
  "SCHEDULE A — Phase, Payment, and Support Terms\n\nSpecific compensation mechanics will be completed in Schedule A before execution.";

const UPDATED_SCHEDULE_A =
  "SCHEDULE A — Phase, Payment, and Support Terms\n\nTotal project fee: $120,000 USD.\n\n$72,000 build/configuration due kickoff.\n\n$30,000 rollout/launch due when workflows/dashboards ready for client review.\n\n$18,000 support handoff/acceptance due at final acceptance or 30 days after launch.\n\n$6,000 monthly support begins after launch. Support scope and Net 30 invoice terms apply.";

const reviewFirstDraft = {
  ...initialDraft,
  parties: [
    { id: "p-owner", name: "Alice", role: "owner" },
    { id: "p-bob", name: "Bob", role: "party" },
  ],
  purpose: `AI Automation Services Agreement\n\n${ORIGINAL_SCHEDULE_A}`,
  server_full_document_text: `AI Automation Services Agreement\n\n${ORIGINAL_SCHEDULE_A}`,
  premium_render_source: "review_first_final_corpus",
  pro_redline_v1: {
    review_first_final_corpus: {
      text: `AI Automation Services Agreement\n\n${ORIGINAL_SCHEDULE_A}`,
    },
  },
};

describe("AgreementRecipientReview review-first actions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
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
    expect(within(summary).getByText("Agreement")).toBeTruthy();
    expect(within(summary).getByText("Services")).toBeTruthy();
    expect(within(summary).queryByText(/Agreement type/i)).toBeNull();

    expect(screen.getByRole("heading", { name: "Review agreement" })).toBeTruthy();
    expect(screen.getByText(/Read the draft, approve it, or propose an updated draft/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Request changes/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /I'm not participating|I’m not participating/i })).toBeNull();
    expect(screen.queryByText(/Review somewhere else/i)).toBeNull();
    expect(screen.queryByText(/^Download copy$/i)).toBeNull();

    const actions = screen.getByTestId("recipient-review-first-actions");
    expect(within(actions).getByRole("button", { name: /Approve draft/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /Propose updated agreement/i })).toBeTruthy();
    expect(within(actions).getByRole("button", { name: /^Download$/i })).toBeTruthy();
    expect(screen.queryByLabelText(/Requested change/i)).toBeNull();
    expect(within(actions).queryByRole("button", { name: /Paste updated wording/i })).toBeNull();
    expect(within(actions).queryByRole("button", { name: /More options/i })).toBeNull();
    expect(within(actions).queryByRole("button", { name: /^Download text$/i })).toBeNull();
    expect(within(actions).queryByRole("button", { name: /^Copy text$/i })).toBeNull();
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

    await userEvent.click(screen.getByTestId("recipient-review-propose-updated-draft"));
    expect(await screen.findByTestId("recipient-edit-draft-textarea")).toBeTruthy();
    expect(screen.getByTestId("recipient-compare-versions-button").textContent).toMatch(/Review changes/i);
  });

  it("pasted revised draft from a personal link shows Schedule A before/after and attribution", async () => {
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
        return jsonResponse({ rendered_html: `<article><pre>${reviewFirstDraft.purpose}</pre></article>` });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: reviewFirstDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getByTestId("recipient-review-propose-updated-draft"));
    const paste = await screen.findByTestId("recipient-edit-draft-textarea");
    await userEvent.clear(paste);
    await userEvent.type(paste, `AI Automation Services Agreement\n\n${UPDATED_SCHEDULE_A}`);
    const livePreview = await screen.findByTestId("recipient-review-proposed-update-preview");
    expect(within(livePreview).getByText(/Changes detected/i)).toBeTruthy();
    expect(within(livePreview).getByText(/Everyone will review these wording changes before approval./i)).toBeTruthy();
    expect(within(livePreview).getByText(/Ready to submit/i)).toBeTruthy();
    expect(within(livePreview).getByText(/Previous wording/i)).toBeTruthy();
    expect(within(livePreview).getByText(/Updated wording/i)).toBeTruthy();
    expect(within(livePreview).getByText(/Updated by Bob/i)).toBeTruthy();
    const submit = screen.getByTestId("recipient-compare-versions-button");
    expect(submit).toHaveProperty("disabled", false);
    await userEvent.click(submit);

    expect((await screen.findByTestId("recipient-preview-summary-heading")).textContent).toBe(
      "Changes detected",
    );
    const summary = screen.getByTestId("recipient-review-change-visibility-summary");
    expect(within(summary).getByText(/Previous wording/i)).toBeTruthy();
    expect(within(summary).getByText(/Updated wording/i)).toBeTruthy();
    expect(within(summary).getByText(/Updated by Bob/i)).toBeTruthy();
    expect(within(summary).getByText(/Specific compensation mechanics will be completed in Schedule A before execution/i)).toBeTruthy();
    expect(within(summary).getByText(/Total project fee: \$120,000 USD/i)).toBeTruthy();
    expect(within(summary).getByText(/\$72,000 build\/configuration due kickoff/i)).toBeTruthy();
    expect(screen.getByText(/Nothing is signed yet, and everyone must approve the updated version before signing/i)).toBeTruthy();
  });

  it("missing participant token blocks proposed update with personal-link attribution message", async () => {
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
        return jsonResponse({ rendered_html: `<article><pre>${reviewFirstDraft.purpose}</pre></article>` });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: reviewFirstDraft });
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

    await userEvent.click(screen.getByTestId("recipient-review-propose-updated-draft"));
    expect((await screen.findByTestId("recipient-review-personal-link-required")).textContent).toContain(
      "Open your personal review link to send this update.",
    );
    const paste = await screen.findByTestId("recipient-edit-draft-textarea");
    await userEvent.type(paste, `AI Automation Services Agreement\n\n${UPDATED_SCHEDULE_A}`);
    expect((await screen.findByTestId("recipient-review-proposed-update-state")).textContent).toContain(
      "Open your personal review link to send this update.",
    );
    expect(screen.getByTestId("recipient-compare-versions-button")).toHaveProperty("disabled", true);
  });

  it("no-change revised draft disables submit and shows a no-change state", async () => {
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
        return jsonResponse({ rendered_html: `<article><pre>${reviewFirstDraft.purpose}</pre></article>` });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: reviewFirstDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-bob"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getByTestId("recipient-review-propose-updated-draft"));
    const paste = await screen.findByTestId("recipient-edit-draft-textarea");
    fireEvent.change(paste, { target: { value: reviewFirstDraft.purpose } });

    expect((await screen.findByTestId("recipient-review-proposed-update-state")).textContent).toContain(
      "No changes detected",
    );
    expect(screen.getByTestId("recipient-compare-versions-button")).toHaveProperty("disabled", true);
  });
});
