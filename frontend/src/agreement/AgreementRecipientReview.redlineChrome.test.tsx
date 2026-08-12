/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const agreementId = "ag_redline_chrome_test";

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

describe("AgreementRecipientReview redline chrome", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "shows tracked summary, changed blocks, decoded quotes (no literal &quot;), and Net 30 insert",
    async () => {
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

      if (method === "POST" && url.includes("recipient-preview-export-pdf")) {
        const buf = new Uint8Array(120);
        buf[0] = 0x25;
        buf[1] = 0x50;
        buf[2] = 0x44;
        buf[3] = 0x46;
        return new Response(buf, { status: 200, headers: { "Content-Type": "application/pdf" } });
      }

      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Agrees to &quot;Net 30&quot;.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Pay upon receipt &amp; wire.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
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
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment terms to Net 30");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    expect(screen.getByTestId("recipient-redline-chip-insertions").textContent).toMatch(/\d+\s+addition/i);
    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalRoot.textContent).not.toMatch(/&quot;/);
    expect(legalRoot.textContent).not.toMatch(/&amp;/);
    expect(legalRoot.querySelector('[data-redline="insert"]')).toBeTruthy();
    expect(legalRoot.querySelectorAll('[data-testid="recipient-redline-changed-block"]').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByTestId("recipient-preview-export-details"));
    const exportRoot = screen.getByTestId("recipient-preview-versions-export");
    expect(exportRoot.textContent).not.toMatch(/\bCLAW\b/i);
    expect(screen.queryAllByTestId("recipient-read-download-pdf")).toHaveLength(0);
    expect(screen.queryAllByTestId("recipient-review-download-pdf")).toHaveLength(0);
    expect(screen.queryAllByTestId("recipient-request-copy-export-pdf")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /Export review versions/i })).toBeTruthy();
    expect(screen.getByText(/Save the original, proposed version, or redline before sending/i)).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-original-draft")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-proposed-draft")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-redline-summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download original draft PDF/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download revised agreement PDF/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Download comparison/i }).length).toBeGreaterThanOrEqual(1);
    expect((screen.getByTestId("recipient-preview-download-original-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("recipient-preview-download-proposed-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("recipient-preview-download-redline-pdf") as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(screen.getByTestId("recipient-preview-download-original-pdf"));
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const pdfCalls = calls.filter((c) => String(c[0]).includes("recipient-preview-export-pdf"));
      expect(pdfCalls.length).toBeGreaterThan(0);
      const init = pdfCalls[pdfCalls.length - 1]![1] as RequestInit;
      expect(init.method?.toUpperCase()).toBe("POST");
      expect(String(init.body)).toContain('"export_kind":"original"');
      expect(String(init.body)).toContain("<p>Services Agreement</p>");
    });

    await userEvent.click(screen.getByTestId("recipient-preview-download-proposed-pdf"));
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const pdfCalls = calls.filter((c) => String(c[0]).includes("recipient-preview-export-pdf"));
      const last = pdfCalls[pdfCalls.length - 1]![1] as RequestInit;
      expect(String(last.body)).toContain('"export_kind":"proposed"');
    });

    await userEvent.click(screen.getByTestId("recipient-preview-download-redline-pdf"));
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const pdfCalls = calls.filter((c) => String(c[0]).includes("recipient-preview-export-pdf"));
      const last = pdfCalls[pdfCalls.length - 1]![1] as RequestInit;
      expect(String(last.body)).toContain('"export_kind":"redline"');
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    const prev = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await userEvent.click(screen.getByTestId("recipient-copy-original-draft"));
    expect(writeText).toHaveBeenCalled();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: prev,
    });

    await userEvent.click(screen.getByRole("button", { name: "← Back to agreement" }));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-review-download-pdf")).toBeTruthy();
    });
    await userEvent.click(screen.getByTestId("recipient-review-download-pdf"));
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const pdfCalls = calls.filter((c) => String(c[0]).includes("recipient-preview-export-pdf"));
      const init = pdfCalls[pdfCalls.length - 1]![1] as RequestInit;
      const body = String(init.body);
      expect(body).toContain('"export_kind":"original"');
      expect(body).toContain("Pay upon receipt");
      expect(body).not.toMatch(/Net\s+30/i);
      expect(body.toLowerCase()).not.toContain("<del");
      expect(body.toLowerCase()).not.toContain("<ins");
    });
  },
  20_000,
  );
});
