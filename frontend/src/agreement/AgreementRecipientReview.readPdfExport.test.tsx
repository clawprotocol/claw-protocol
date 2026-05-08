/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import {
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_COMPARE_HELPER,
  RECIPIENT_WANT_COPY_DROPZONE_PRIMARY,
  RECIPIENT_WANT_COPY_DROPZONE_SECONDARY,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
  RECIPIENT_WANT_COPY_UPLOAD_CTA,
} from "./portableReviewCopy";

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

describe("AgreementRecipientReview read-tab draft exports", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows outside-review strip with PDF, text, copy, upload, and compare helper", async () => {
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

    await waitFor(() => {
      expect(screen.getByTestId("recipient-want-a-copy-card")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: RECIPIENT_WANT_COPY_HEADING })).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_BODY)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_COMPARE_HELPER)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_LOOPBACK_CUE)).toBeTruthy();
    expect(screen.getByRole("button", { name: RECIPIENT_WANT_COPY_UPLOAD_CTA })).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_PRIMARY)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_SECONDARY)).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download draft PDF/i })).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-text")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-draft-text")).toBeTruthy();
    expect(screen.queryAllByTestId("recipient-download-draft-pdf")).toHaveLength(1);

    const block = screen.getByTestId("recipient-want-a-copy-card").textContent ?? "";
    const upper = block.toUpperCase();
    for (const b of bannedInBlock) {
      expect(upper.includes(b.toUpperCase()), `unexpected “${b}” in export block`).toBe(false);
    }
    expect(block.toLowerCase()).not.toMatch(/\bpost\b/);
  });

  it("want-copy upload opens revised paste with imported text (full recipient surface)", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const user = userEvent.setup();
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

    await user.click(screen.getByTestId("recipient-want-copy-upload-revised"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-revised-version-panel")).toBeTruthy();
    });

    const file = new File(["Imported revised text"], "rev.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-want-copy-upload-revised-input"), file);

    await waitFor(
      () => {
        const ta = screen.getByTestId("recipient-revised-draft-paste") as HTMLTextAreaElement;
        expect(ta.value).toBe("Imported revised text");
      },
      { timeout: 10_000 },
    );

    await waitFor(() => {
      const compareBtn = screen.getByTestId("recipient-compare-versions-button") as HTMLButtonElement;
      expect(compareBtn.disabled).toBe(false);
      expect(compareBtn.textContent).toMatch(/Compare drafts/i);
    });
  }, 12_000);
});
