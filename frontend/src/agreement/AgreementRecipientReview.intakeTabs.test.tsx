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

const agreementId = "ag_intake_tabs";

const draft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting.",
  payment_terms: "Net 30.",
  duration: "1 year",
  due_date: null,
  effective_date: "2026-01-01",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [{ version: 1, created_at: new Date().toISOString(), note: "x" }],
  audit_log: [],
};

describe("AgreementRecipientReview request intake modes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows Write request and Paste revised draft tabs; paste shows primary textarea", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_t" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Request changes/i }).length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Request changes/i })[0]!);

    expect(screen.getByTestId("recipient-intake-mode-write-request")).toBeTruthy();
    expect(screen.getByTestId("recipient-intake-mode-paste-revised")).toBeTruthy();
    expect(screen.getByText("Write request")).toBeTruthy();
    expect(screen.getByText("Paste revised draft")).toBeTruthy();

    await userEvent.click(screen.getByTestId("recipient-intake-mode-paste-revised"));
    expect(screen.getByTestId("recipient-revised-draft-paste")).toBeTruthy();
    expect(screen.getByTestId("recipient-paste-empty-hint")).toBeTruthy();
    expect(screen.getByText(/LawDog will compare it with the current draft/i)).toBeTruthy();
  });
});
