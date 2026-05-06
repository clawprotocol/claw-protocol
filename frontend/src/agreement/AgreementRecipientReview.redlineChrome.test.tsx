/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
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

  it("shows tracked summary, changed blocks, decoded quotes (no literal &quot;), and Net 30 insert", async () => {
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

    await userEvent.click(screen.getAllByRole("button", { name: /Request changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment terms to Net 30");
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    expect(screen.getByTestId("recipient-redline-chip-insertions").textContent).toMatch(/\d+\s+insertion/i);
    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalRoot.textContent).not.toMatch(/&quot;/);
    expect(legalRoot.textContent).not.toMatch(/&amp;/);
    expect(legalRoot.querySelector('[data-redline="insert"]')).toBeTruthy();
    expect(legalRoot.querySelectorAll('[data-testid="recipient-redline-changed-block"]').length).toBeGreaterThan(0);

    const exportDetails = screen.getByTestId("recipient-preview-versions-export");
    expect(exportDetails.textContent).not.toMatch(/\bCLAW\b/i);
    await userEvent.click(screen.getByText("Download / copy versions"));
    expect(screen.getByTestId("recipient-preview-versions-export-title").textContent).toContain("Use outside LawDog");
    expect(screen.getByTestId("recipient-copy-original-draft")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-proposed-draft")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-redline-summary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download current PDF/i })).toBeTruthy();
    expect((screen.getByTestId("recipient-download-original-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("recipient-download-proposed-pdf") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("recipient-download-redline-pdf") as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByTestId("recipient-download-original-pdf"));
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const pdfCall = calls.find((c) => String(c[0]).includes("recipient-preview-export-pdf"));
      expect(pdfCall).toBeTruthy();
      const init = pdfCall![1] as RequestInit;
      expect(init.method?.toUpperCase()).toBe("POST");
      expect(String(init.body)).toContain('"export_kind":"original"');
      expect(String(init.body)).toContain("<p>Services Agreement</p>");
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
  });
});
