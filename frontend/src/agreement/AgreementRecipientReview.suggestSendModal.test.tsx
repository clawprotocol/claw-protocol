/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const agreementId = "ag_suggest_send_modal";

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

const identicalListingHtml =
  "<p>Master services agreement (listing only).</p><p>Invoices are payable upon receipt.</p>";

describe("AgreementRecipientReview send suggested edits modal UX", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens in-app modal (no window.confirm), confirm sends, dismiss closes; success ack and suggest another", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

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
        init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: identicalListingHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html: identicalListingHtml,
        });
      }
      if (method === "POST" && url.includes("/recipient-proposal")) {
        return jsonResponse({ proposal_id: "prop_modal_test" });
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
    await userEvent.type(instruction, "Change payment to Net 30.");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    expect(panel.textContent).not.toMatch(/\bCLAW\b/i);
    expect(panel.textContent).toContain("Changes detected");
    expect(panel.textContent).toContain("Nothing is signed yet, and everyone must approve the updated version before signing.");

    await userEvent.click(within(panel).getByTestId("recipient-open-send-suggested-edits-modal"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("recipient-send-suggested-edits-modal")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Submit proposed update\?/i })).toBeTruthy();
    expect(screen.getByTestId("recipient-send-suggested-edits-modal").textContent).toContain(
      "These go to the agreement owner.",
    );
    expect(screen.getByTestId("recipient-send-suggested-edits-modal").textContent).toContain(
      "LawDog is software, not a law firm.",
    );

    await userEvent.click(screen.getByTestId("recipient-send-suggested-edits-modal-dismiss"));
    await waitFor(() => {
      expect(screen.queryByTestId("recipient-send-suggested-edits-modal")).toBeNull();
    });

    await userEvent.click(within(panel).getByTestId("recipient-open-send-suggested-edits-modal"));
    await userEvent.click(screen.getByTestId("recipient-send-suggested-edits-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-suggested-edits-sent-ack")).toBeTruthy();
    });
    expect(screen.getByTestId("recipient-suggested-edits-sent-ack").textContent).toContain(
      "Submitted — waiting for other parties to review",
    );
    expect(screen.getByTestId("recipient-suggested-edits-sent-ack").textContent).toContain(
      "Revisions do not change the original until accepted",
    );
    expect(screen.queryByTestId("recipient-suggested-changes-panel")).toBeNull();

    await userEvent.click(screen.getByTestId("recipient-suggested-edits-suggest-another"));
    await waitFor(() => {
      expect(screen.queryByTestId("recipient-suggested-edits-sent-ack")).toBeNull();
    });
    expect(await screen.findByTestId("recipient-revision-voice-field")).toBeTruthy();

    await userEvent.clear(await screen.findByTestId("recipient-revision-voice-field"));
    await userEvent.type(screen.getByTestId("recipient-revision-voice-field"), "Change payment to Net 30.");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });
    expect(screen.getByTestId("recipient-intent-coverage-list")).toBeTruthy();
  });
});
