/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_whole_doc_redline_int";

const initialDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting.",
  payment_terms: "Invoices are payable upon receipt.",
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
  payment_terms: "Invoices are payable Net 30.",
  updated_at: new Date().toISOString(),
};

/** Identical rendered HTML for baseline and proposed — field-level change must still drive whole-doc redline. */
const identicalListingHtml = "<p>Master services agreement (listing only).</p>";

describe("AgreementRecipientReview whole-doc redline vs identical HTML", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows non-zero tracked summary and Net 30 insert when HTML matches but payment_terms changed", async () => {
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
        return jsonResponse({ rendered_html: identicalListingHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html: identicalListingHtml,
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

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment to Net 30.");
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-tracked-summary")).toBeTruthy();
    });

    const summary = screen.getByTestId("recipient-redline-tracked-summary").textContent ?? "";
    expect(summary).toMatch(/[1-9]\d*\s+insertion|[1-9]\d*\s+insertions/i);
    expect(summary).not.toMatch(/0\s+insertions\s*·\s*0\s+deletions\s*·\s*0\s+changed/i);

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    const insertEl = legalRoot.querySelector('[data-redline="insert"]');
    expect(insertEl).toBeTruthy();
    expect(insertEl?.textContent).toMatch(/Net\s*30/i);

    await userEvent.click(screen.getByRole("button", { name: /Side-by-side/i }));
    const grid = screen.getByTestId("recipient-side-by-side-block-grid");
    expect(within(grid).getByText(/Net\s*30/i)).toBeTruthy();
    expect(grid.querySelector('[data-redline="insert"]')).toBeTruthy();
  });
});

const baselineStructuredHtml = `<div>
  <p>Master Services Agreement</p>
  <p>3.2 Payment</p>
  <p>Invoices are payable upon receipt.</p>
</div>`;

const divergentReviseRenderedHtml = `<article>
  <h1>Alternate template</h1>
  <section><p>Article I — Definitions</p><p>Lorem ipsum dolor sit amet.</p></section>
  <section><p>Article II — Scope</p><p>Aliqua ut enim ad minim.</p></section>
  <section><p>Article III — Fees</p><p>Consectetur adipiscing elit sed do.</p></section>
  <section><p>Article IV — Term</p><p>Excepteur sint occaecat cupidatat.</p></section>
</article>`;

const agreementIdDrift = "ag_whole_doc_redline_drift";

const initialDraftDrift = {
  ...initialDraft,
  id: agreementIdDrift,
};

const revisedDraftDrift = {
  ...revisedDraft,
  id: agreementIdDrift,
};

describe("AgreementRecipientReview whole-doc redline vs divergent revise HTML", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps baseline structure, shows only payment insert, hides Agreement fields trailer, flags pause gap", async () => {
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
        return jsonResponse({ rendered_html: baselineStructuredHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraftDrift,
          rendered_html: divergentReviseRenderedHtml,
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraftDrift });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementIdDrift} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    fireEvent.change(instruction, {
      target: { value: "Net 30 and pause work after 15 days late" },
    });
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-tracked-summary")).toBeTruthy();
    });

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalRoot.textContent).not.toMatch(/Agreement fields \(tracked for redline\)/i);
    expect(legalRoot.textContent).not.toMatch(/Excepteur sint occaecat/i);

    const insertEl = legalRoot.querySelector('[data-redline="insert"]');
    expect(insertEl).toBeTruthy();
    expect(insertEl?.textContent).toMatch(/Net\s*30/i);

    expect(screen.getByTestId("recipient-redline-instruction-gap-note")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Side-by-side/i }));
    const grid = screen.getByTestId("recipient-side-by-side-block-grid");
    expect(grid.textContent).not.toMatch(/Agreement fields \(tracked for redline\)/i);
    expect(grid.textContent).not.toMatch(/Excepteur sint occaecat/i);
    expect(within(grid).getByText(/Net\s*30/i)).toBeTruthy();
  });
});
