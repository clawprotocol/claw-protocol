/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import { computeRecipientDraftTextareaMaxPx } from "../hooks/useRecipientDraftTextareaMaxPx";

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

    expect(screen.getAllByTestId("recipient-review-elsewhere-card").length).toBeGreaterThan(0);
    expect(screen.getByText("Prefer another editor?")).toBeTruthy();
    expect(
      screen.getByText(/Download or copy the draft, edit it with your lawyer or AI tool/i),
    ).toBeTruthy();
    expect(screen.getAllByTestId("recipient-review-elsewhere-import").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-review-elsewhere-download-pdf").length).toBeGreaterThan(0);

    expect(screen.getAllByTestId("recipient-intake-mode-write-request").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-intake-mode-paste-revised").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-intake-mode-edit-draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Describe changes").length).toBeGreaterThan(0);
    expect(screen.getByText("Paste draft")).toBeTruthy();
    expect(screen.getByText("Edit draft")).toBeTruthy();
    expect(screen.getByText("What should change?")).toBeTruthy();
    expect(screen.getByText(/Ask for edits or send your own version/i)).toBeTruthy();
    expect(screen.getByText("Nothing changes until the sender accepts.")).toBeTruthy();
    expect(screen.getAllByText("Suggestions are not signatures.").length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);
    expect(screen.getAllByTestId("recipient-revised-draft-paste")[0]!).toBeTruthy();
    expect(screen.getAllByTestId("recipient-paste-import-prominent").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("recipient-paste-empty-hint")[0]!).toBeTruthy();
    expect(screen.getByText(/We'll compare with the current draft/i)).toBeTruthy();

    const pasteTa = screen.getAllByTestId("recipient-revised-draft-paste")[0] as HTMLTextAreaElement;
    expect(pasteTa.className).toMatch(/min-h-\[280px\]/);
    expect(pasteTa.className).toMatch(/sm:min-h-\[420px\]/);
    expect(pasteTa.className).toMatch(/resize-y/);
    expect(pasteTa.className).toMatch(/overflow-x-hidden/);

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
    expect(el.className).toMatch(/min-h-\[280px\]/);
    expect(el.className).toMatch(/sm:min-h-\[420px\]/);
    expect(el.className).toMatch(/resize-y/);
    expect(el.className).toMatch(/overflow-x-hidden/);
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

  it("paste textarea maxHeight stays within recipient draft cap (≤900px)", async () => {
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
    expect(max).toBeLessThanOrEqual(900);
  });

  it("mobile viewport uses 65vh cap and keeps paste textarea overflow-x hidden", async () => {
    const agreementId = "ag_intake_mobile_cap";
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

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 640px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const { container } = render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_t" />
      </AccessProvider>,
    );
    const scoped = within(container);

    try {
      await waitFor(() => {
        expect(scoped.queryByText(/Loading agreement/i)).toBeNull();
      });
      await userEvent.click(scoped.getAllByRole("button", { name: /Review agreement/i })[0]!);
      await waitFor(() => {
        expect(scoped.getAllByRole("button", { name: /Request changes/i }).length).toBeGreaterThan(0);
      });
      await userEvent.click(scoped.getAllByRole("button", { name: /Request changes/i })[0]!);
      await userEvent.click(scoped.getByTestId("recipient-intake-mode-paste-revised"));

      const ta = scoped.getByTestId("recipient-revised-draft-paste") as HTMLTextAreaElement;
      expect(ta.className).toMatch(/overflow-x-hidden/);
      const max = Number.parseInt(ta.style.maxHeight.replace("px", ""), 10);
      expect(max).toBe(computeRecipientDraftTextareaMaxPx(window));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("import from review-elsewhere card while on Describe switches to Paste and fills draft", async () => {
    const agreementId = "ag_intake_elsewhere_import";
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

    const { container } = render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_t" />
      </AccessProvider>,
    );
    const scoped = within(container);

    await waitFor(() => {
      expect(scoped.queryByText(/Loading agreement/i)).toBeNull();
    });
    await userEvent.click(scoped.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(scoped.getAllByRole("button", { name: /Request changes/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(scoped.getAllByRole("button", { name: /Request changes/i })[0]!);

    expect(scoped.getByText("What should change?")).toBeTruthy();

    await userEvent.click(scoped.getByTestId("recipient-review-elsewhere-import"));
    const file = new File(["from elsewhere import"], "notes.md", { type: "text/markdown" });
    const input = scoped.getByTestId("recipient-import-draft-file-input");
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect((scoped.getByTestId("recipient-revised-draft-paste") as HTMLTextAreaElement).value).toBe(
        "from elsewhere import",
      );
    });
    expect(scoped.getByTestId("recipient-paste-import-prominent")).toBeTruthy();
  });
});
