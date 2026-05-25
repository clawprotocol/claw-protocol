/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { openRecipientQuickChangeWorkspace } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_preview_toggle_test";

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

const revisedDraft = {
  ...initialDraft,
  payment_terms: "Net 30.",
  updated_at: new Date().toISOString(),
};

describe("AgreementRecipientReview suggested-changes single surface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows one redline document with insert markers and summary chips; no compare tabs", async () => {
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

      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Net 30.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Pay upon receipt.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
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

    await openRecipientQuickChangeWorkspace();
    const instruction = await screen.findByTestId("recipient-revision-voice-field");
    fireEvent.change(instruction, { target: { value: "Change payment terms to Net 30" } });

    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
    });

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    expect(within(panel).getByTestId("recipient-review-change-visibility-summary")).toBeTruthy();

    expect(screen.queryByTestId("recipient-tab-redline")).toBeNull();
    expect(screen.queryByTestId("recipient-tab-clean-proposed")).toBeNull();
    expect(screen.queryByTestId("recipient-tab-side-by-side")).toBeNull();
    expect(screen.queryByTestId("recipient-tab-changed-clauses")).toBeNull();
    expect(screen.queryByTestId("recipient-tracked-changes-toggle")).toBeNull();
    expect(screen.queryByTestId("recipient-side-by-side-block-grid")).toBeNull();

    expect(screen.getByTestId("recipient-suggested-changes-document")).toBeTruthy();
    const legalDocRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalDocRoot).toBeTruthy();
    expect(
      legalDocRoot.querySelectorAll(
        '[data-testid="recipient-legal-redline-block"],[data-testid="recipient-redline-changed-block"]',
      ).length,
    ).toBeGreaterThan(0);
    const insertEl = legalDocRoot.querySelector('[data-redline="insert"]');
    expect(insertEl).toBeTruthy();
    expect(insertEl?.textContent).toMatch(/Net\s*30/i);
    expect(legalDocRoot.textContent).toMatch(/Net|thirty/i);

    expect(screen.getByTestId("recipient-redline-chip-insertions").textContent).toMatch(/\d+\s+addition/i);
    expect(screen.getByTestId("recipient-redline-chip-deletions").textContent).toMatch(/\d+\s+removal/i);
    expect(screen.getByTestId("recipient-redline-chip-sections").textContent).toMatch(/\d+\s+wording change/i);
  });

  it("at narrow width the single suggested-changes surface remains available", async () => {
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
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Net 30.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Pay upon receipt.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <div style={{ width: 360, maxWidth: "100%" }}>
        <AccessProvider>
          <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" />
        </AccessProvider>
      </div>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });
    await openRecipientQuickChangeWorkspace();
    const instruction = await screen.findByTestId("recipient-revision-voice-field");
    fireEvent.change(instruction, { target: { value: "Change payment terms to Net 30" } });
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));
    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-document")).toBeTruthy();
      },
      { timeout: 8000 },
    );
    expect(screen.queryByTestId("recipient-tab-changed-clauses")).toBeNull();
  }, 15_000);
});
