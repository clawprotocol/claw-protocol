/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { openRecipientQuickChangeWorkspace } from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import { enableOwnerProposalReviewQaLocal } from "./ownerProposalReviewQa";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_submitted_state";

const initialDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { id: "p-owner", name: "Alice", role: "owner" },
    { id: "p-reviewer", name: "Bob", role: "party" },
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
};

describe("AgreementRecipientReview submitted proposal state", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("hides Approve draft after submit and shows waiting-for-owner ack", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

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
        return jsonResponse({ rendered_html: "<p>Consulting.</p>" });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({ draft: revisedDraft, rendered_html: "<p>Consulting.</p>" });
      }
      if (method === "POST" && url.includes("/recipient-proposal")) {
        if (url.includes("/stage")) {
          return jsonResponse({ proposal_id: "prop_submitted", staged: true });
        }
        if (!url.includes("/apply") && !url.includes("/reject")) {
          return jsonResponse({ proposal_id: "prop_submitted", ok: true });
        }
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-reviewer"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    expect(screen.getByTestId("recipient-review-approve-draft")).toBeTruthy();

    await openRecipientQuickChangeWorkspace();
    const instruction = await screen.findByTestId("recipient-revision-voice-field");
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment to Net 30.");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    await userEvent.click(within(panel).getByTestId("recipient-open-send-suggested-edits-modal"));
    await userEvent.click(screen.getByTestId("recipient-send-suggested-edits-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-suggested-edits-sent-ack")).toBeTruthy();
    });
    expect(screen.getByText(/Submitted — waiting for owner review/i)).toBeTruthy();
    expect(screen.queryByTestId("recipient-review-approve-draft")).toBeNull();
    expect(screen.getByTestId("recipient-approve-blocked-awaiting-owner")).toBeTruthy();
    expect(screen.queryByTestId("recipient-qa-open-owner-review")).toBeNull();
  });

  it("shows QA Open owner review only when QA flag enabled", async () => {
    enableOwnerProposalReviewQaLocal();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

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
        return jsonResponse({ rendered_html: "<p>Consulting.</p>" });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({ draft: revisedDraft, rendered_html: "<p>Consulting.</p>" });
      }
      if (method === "POST" && url.includes("/recipient-proposal")) {
        if (url.includes("/stage")) {
          return jsonResponse({ proposal_id: "prop_qa", staged: true });
        }
        return jsonResponse({ proposal_id: "prop_qa", ok: true });
      }
      if (method === "GET" && url.includes("/api/agreements/")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p-reviewer"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await openRecipientQuickChangeWorkspace();
    await userEvent.clear(await screen.findByTestId("recipient-revision-voice-field"));
    await userEvent.type(screen.getByTestId("recipient-revision-voice-field"), "Change payment to Net 30.");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    await userEvent.click(within(panel).getByTestId("recipient-open-send-suggested-edits-modal"));
    await userEvent.click(screen.getByTestId("recipient-send-suggested-edits-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-qa-open-owner-review")).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId("recipient-qa-open-owner-review"));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/app/agreements/${agreementId}?qaReview=1`),
      "_blank",
      "noopener,noreferrer",
    );
  });
});
