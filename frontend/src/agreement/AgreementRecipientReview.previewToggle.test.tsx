/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
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

describe("AgreementRecipientReview tracked-changes toggle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preview defaults to Redline tab with whole-document insert markers; toggle affects side-by-side", async () => {
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

    const suggestButtons = screen.getAllByRole("button", { name: /Suggest changes/i });
    await userEvent.click(suggestButtons[0]!);

    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment terms to Net 30");

    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-tracked-changes-toggle")).toBeTruthy();
    });

    expect(screen.getByTestId("recipient-tab-redline")).toBeTruthy();
    const wholeDocPanel = screen.getByTestId("recipient-whole-doc-redline");
    const legalDocRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalDocRoot).toBeTruthy();
    expect(legalDocRoot.querySelectorAll('[data-testid="recipient-legal-redline-block"]').length).toBeGreaterThan(1);
    const insertEl = wholeDocPanel.querySelector('[data-redline="insert"]');
    expect(insertEl).toBeTruthy();
    expect(insertEl?.textContent).toMatch(/Net\s*30/i);
    expect(legalDocRoot.textContent).toMatch(/Net|thirty/i);

    await userEvent.click(screen.getByTestId("recipient-tab-changed-clauses"));
    const clauseCard = await screen.findByTestId("recipient-clause-card-payment_terms");
    const redline =
      within(clauseCard).queryByTestId("clause-field-redline") ??
      within(clauseCard).queryByTestId("clause-track-lines") ??
      within(clauseCard).queryByTestId("clause-track-snippet-fallback") ??
      within(clauseCard).queryByTestId("clause-field-redline-fallback");
    expect(redline).toBeTruthy();
    if (redline) {
      expect(redline.querySelector("[data-redline]")).toBeTruthy();
    }

    const toggle = screen.getByTestId("recipient-tracked-changes-toggle");
    const showBtn = within(toggle).getByRole("button", { name: /Show changes/i });
    const hideBtn = within(toggle).getByRole("button", { name: /Hide changes/i });
    expect(showBtn.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: /Side-by-side/i }));
    const proposedCol = screen.getByTestId("recipient-side-by-side-proposed-column");
    expect(proposedCol.querySelector('[data-testid="recipient-side-by-side-block-grid"]')).toBeTruthy();
    expect(proposedCol.querySelectorAll('[data-testid="recipient-side-by-side-row"]').length).toBeGreaterThan(1);
    expect(proposedCol.querySelector("[data-redline]")).toBeTruthy();

    await userEvent.click(hideBtn);
    expect(proposedCol.querySelector("[data-redline]")).toBeNull();
    expect(proposedCol.textContent).toMatch(/Net\s*30/i);
  });

  it(
    "at narrow width the tracked-changes toggle and clause card remain in document",
    async () => {
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
    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment terms to Net 30");
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);
    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-tracked-changes-toggle")).toBeTruthy();
      },
      { timeout: 8000 },
    );
    await userEvent.click(screen.getByTestId("recipient-tab-changed-clauses"));
    expect(screen.getByTestId("recipient-clause-card-payment_terms")).toBeTruthy();
  }, 15_000);
});
