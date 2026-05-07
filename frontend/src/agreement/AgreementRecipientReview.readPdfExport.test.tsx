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

const agreementId = "ag_read_pdf_export";

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

const bannedInBlock = ["CLAW", "social", "tweet", "twitter", "facebook", "linkedin"] as const;

describe("AgreementRecipientReview read-tab PDF export", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows visible Download agreement block with PDF control after Review agreement", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Agreement body</p>" });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_r" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-read-download-agreement")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: /Download agreement/i })).toBeTruthy();
    expect(screen.getByText(/Save a copy before you decide/i)).toBeTruthy();
    expect(screen.getByTestId("recipient-read-download-pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download PDF/i })).toBeTruthy();
    expect(screen.queryAllByTestId("recipient-read-download-pdf")).toHaveLength(1);

    const block = screen.getByTestId("recipient-read-download-agreement").textContent ?? "";
    const upper = block.toUpperCase();
    for (const b of bannedInBlock) {
      expect(upper.includes(b.toUpperCase()), `unexpected “${b}” in export block`).toBe(false);
    }
    expect(block.toLowerCase()).not.toMatch(/\bpost\b/);
  });
});
