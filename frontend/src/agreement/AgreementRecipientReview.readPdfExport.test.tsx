/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import {
  RECIPIENT_BTN_CONTINUE_EDITING,
  RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE,
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_DROPZONE_PRIMARY,
  RECIPIENT_WANT_COPY_DROPZONE_SECONDARY,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
  RECIPIENT_WANT_COPY_UPLOAD_CTA,
  RECIPIENT_WANT_COPY_UPLOAD_TIP,
} from "./portableReviewCopy";
import { REVISED_DRAFT_FILE_INPUT_ACCEPT } from "./recipientRevisedDraftImportText";

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
    expect(screen.getByText(RECIPIENT_WANT_COPY_UPLOAD_TIP)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_LOOPBACK_CUE)).toBeTruthy();
    expect(screen.getByRole("button", { name: RECIPIENT_WANT_COPY_UPLOAD_CTA })).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_PRIMARY)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_WANT_COPY_DROPZONE_SECONDARY)).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-pdf")).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-pdf").getAttribute("title")).toBe(
      RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE,
    );
    expect(screen.getByRole("button", { name: /Download draft PDF/i })).toBeTruthy();
    expect(screen.getByTestId("recipient-download-draft-text")).toBeTruthy();
    expect(screen.getByTestId("recipient-copy-draft-text")).toBeTruthy();
    expect(screen.queryAllByTestId("recipient-download-draft-pdf")).toHaveLength(1);

    const wantCopyInput = screen.getByTestId("recipient-want-copy-upload-revised-input");
    expect(wantCopyInput.getAttribute("accept")).toBe(REVISED_DRAFT_FILE_INPUT_ACCEPT);
    expect(wantCopyInput.getAttribute("accept")).toContain(".pdf");
    expect(wantCopyInput.getAttribute("accept")).toContain("application/pdf");

    const block = screen.getByTestId("recipient-want-a-copy-card").textContent ?? "";
    const upper = block.toUpperCase();
    for (const b of bannedInBlock) {
      expect(upper.includes(b.toUpperCase()), `unexpected “${b}” in export block`).toBe(false);
    }
    expect(block.toLowerCase()).not.toMatch(/\bpost\b/);
  });

  it("want-copy upload runs auto-compare and lands on suggested-changes panel (full recipient surface)", async () => {
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

    const workspaceImport = screen.getByTestId("recipient-import-draft-file-input");
    expect(workspaceImport.getAttribute("accept")).toBe(REVISED_DRAFT_FILE_INPUT_ACCEPT);
    expect(workspaceImport.getAttribute("accept")).toContain(".pdf");
    expect(workspaceImport.getAttribute("accept")).toContain("application/pdf");

    const importedRevisedBody = [
      "Master Services Agreement (Revised)",
      "1. Scope of Work",
      "The Consultant shall perform the professional services described in the statement of work. The Client shall pay all undisputed invoiced amounts within thirty days.",
      "2. Confidentiality",
      "Each party must keep confidential all information marked confidential or reasonably understood as confidential.",
      "3. Termination",
      "Either party may terminate this agreement upon thirty days written notice. Payment for work completed through the termination date shall remain due.",
      "4. Liability",
      "Except for breaches of confidentiality or indemnity obligations, neither party shall be liable for consequential damages.",
      "5. Intellectual Property",
      "The Client shall own all deliverables upon full payment unless otherwise agreed.",
      "6. General",
      "This agreement shall be governed by the laws of the State of California.",
    ].join("\n\n");
    const file = new File([importedRevisedBody], "rev.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-want-copy-upload-revised-input"), file);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-revised-upload-analyzing")).toBeTruthy();
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 15_000 },
    );

    await user.click(
      within(screen.getByTestId("recipient-suggested-changes-panel")).getByRole("button", {
        name: RECIPIENT_BTN_CONTINUE_EDITING,
      }),
    );
    await waitFor(() => {
      const ta = screen.getByTestId("recipient-revised-draft-paste") as HTMLTextAreaElement;
      expect(ta.value).toBe(importedRevisedBody);
    });
  }, 25_000);

  it("want-copy upload separates Reviewer Notes and shows callout on compare panel", async () => {
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

    const agreementLike = "y".repeat(2000);
    const file = new File([`${agreementLike}\n\nReviewer Notes\nPrefer Net 45.`], "rev.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("recipient-want-copy-upload-revised-input"), file);

    await waitFor(
      () => {
        expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
      },
      { timeout: 15_000 },
    );

    expect(screen.getByTestId("recipient-reviewer-notes-panel")).toBeTruthy();
    await user.click(screen.getByTestId("recipient-reviewer-notes-panel-summary"));
    expect(screen.getByTestId("recipient-reviewer-notes-panel-body").textContent).toMatch(/Prefer Net 45/i);
  }, 25_000);
});
