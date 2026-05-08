/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AgreementRecipientReview,
  RECIPIENT_REVISE_PREVIEW_CONNECTION_ERROR,
} from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_revise_preview_fail_test";

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

describe("AgreementRecipientReview revise preview failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows friendly inline error on revise fetch failure, keeps note, re-enables compare, hides raw Failed to fetch", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let reviseAttempts = 0;
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
        reviseAttempts += 1;
        if (reviseAttempts === 1) {
          return Promise.reject(new TypeError("Failed to fetch"));
        }
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

    const { container } = render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Request changes/i })[0]!);

    await userEvent.click(await screen.findByTestId("recipient-workflow-quick"));
    const instruction = await screen.findByTestId("recipient-revision-voice-field");
    const note = "Change payment terms to Net 30";
    fireEvent.change(instruction, { target: { value: note } });

    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      const el = screen.getByTestId("recipient-revise-preview-error");
      expect(el.textContent).toContain(RECIPIENT_REVISE_PREVIEW_CONNECTION_ERROR);
    });

    expect(screen.getByDisplayValue(note)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Failed to fetch/i);
    expect(screen.queryByText(/Failed to fetch/i)).toBeNull();

    await waitFor(() => {
      const b = screen.getByTestId("recipient-compare-versions-button");
      expect(b.getAttribute("disabled")).toBeNull();
    });

    expect(warnSpy).toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });
    expect(screen.queryByTestId("recipient-revise-preview-error")).toBeNull();
  });
});
