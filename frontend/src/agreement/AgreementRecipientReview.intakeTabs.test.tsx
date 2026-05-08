/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeDraft(id: string) {
  return {
    id,
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
}

describe("AgreementRecipientReview request intake modes", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows Describe, Paste draft, and Edit draft tabs; paste shows primary textarea and import", async () => {
    const agreementId = "ag_intake_tabs";
    const draft = makeDraft(agreementId);
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

    expect(screen.getAllByTestId("recipient-intake-mode-write-request").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-intake-mode-paste-revised").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-intake-mode-edit-draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Describe changes").length).toBeGreaterThan(0);
    expect(screen.getByText("Paste draft")).toBeTruthy();
    expect(screen.getByText("Edit draft")).toBeTruthy();
    expect(screen.getByText("What should change?")).toBeTruthy();
    expect(screen.getByText(/Ask for edits or paste your own/i)).toBeTruthy();
    expect(screen.getByText("Suggestions are not signatures.")).toBeTruthy();

    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);
    expect(screen.getAllByTestId("recipient-revised-draft-paste")[0]!).toBeTruthy();
    expect(screen.getAllByTestId("recipient-paste-empty-hint")[0]!).toBeTruthy();
    expect(screen.getByText(/We'll compare with the current draft/i)).toBeTruthy();
    expect(screen.getAllByTestId("recipient-import-draft-file")[0]!).toBeTruthy();

    await userEvent.click(screen.getByText("Save or review elsewhere"));
    expect(await screen.findByText(/Copy or download, edit elsewhere/i)).toBeTruthy();
    expect(screen.getAllByTestId("recipient-preview-changes-confidence-hint")[0]!).toBeTruthy();
    expect(await screen.findByTestId("recipient-request-copy-export-pdf")).toBeTruthy();
    expect(screen.queryAllByTestId("recipient-preview-versions-export")).toHaveLength(0);
  });

  it("Edit draft tab shows inline editor after click", async () => {
    const agreementId = "ag_intake_edit_only";
    const draft = makeDraft(agreementId);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Alpha beta</p>" });
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
    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-edit-draft")[0]!);
    await waitFor(() => {
      expect(screen.getAllByTestId("recipient-edit-draft-textarea").length).toBeGreaterThan(0);
    });
    const el = screen.getAllByTestId("recipient-edit-draft-textarea")[0] as HTMLTextAreaElement;
    expect(el.value.length).toBeGreaterThan(0);
  });

  it("importing a .txt file populates the paste field", async () => {
    const agreementId = "ag_intake_import_txt";
    const draft = makeDraft(agreementId);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>x</p>" });
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
    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);

    const file = new File(["imported line one"], "draft.md", { type: "text/markdown" });
    const input = screen.getAllByTestId("recipient-import-draft-file-input")[0]!;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect((screen.getAllByTestId("recipient-revised-draft-paste")[0] as HTMLTextAreaElement).value).toBe(
        "imported line one",
      );
    });
  });

  it("shows friendly error for unsupported import extension", async () => {
    const agreementId = "ag_intake_import_bad";
    const draft = makeDraft(agreementId);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>x</p>" });
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
    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);

    const file = new File(["%PDF"], "x.doc", { type: "application/msword" });
    const input = screen.getAllByTestId("recipient-import-draft-file-input")[0]!;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getAllByTestId("recipient-draft-import-error").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId("recipient-draft-import-error")[0]?.textContent ?? "").toMatch(
      /Couldn't read that file/i,
    );
  });

  it("paste textarea maxHeight stays within recipient draft cap (≤720px)", async () => {
    const agreementId = "ag_intake_max_h";
    const draft = makeDraft(agreementId);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>x</p>" });
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
    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);

    const ta = screen.getAllByTestId("recipient-revised-draft-paste")[0] as HTMLTextAreaElement;
    const max = Number.parseInt(ta.style.maxHeight.replace("px", ""), 10);
    expect(max).toBeGreaterThanOrEqual(280);
    expect(max).toBeLessThanOrEqual(720);
  });
});
