/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import {
  openRecipientQuickChangeWorkspace,
  openRecipientReviseEditWorkspace,
  openRecipientReviseUploadPickMethod,
} from "./AgreementRecipientReview.testHelpers";
import { AccessProvider } from "../access/AccessContext";
import { computeRecipientDraftTextareaMaxPx } from "../hooks/useRecipientDraftTextareaMaxPx";
import { REVISED_DRAFT_FILE_INPUT_ACCEPT } from "./recipientRevisedDraftImportText";

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

describe("AgreementRecipientReview revise workflow routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("send-back path shows revised panel, trust line, and hides quick-change panel", async () => {
    const agreementId = "ag_workflow_cards";
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

    await openRecipientReviseUploadPickMethod();

    expect(screen.getAllByTestId("recipient-revised-version-panel")[0]).toBeTruthy();
    expect(screen.queryByTestId("recipient-quick-change-panel")).toBeNull();
    expect(screen.getByTestId("recipient-manual-propose-controls")).toBeTruthy();
    expect(screen.getAllByText("Propose an updated draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paste revised agreement text or upload a revised file/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Manual compare/i })).toBeNull();
  });

  it("manual review path does not show quick-change controls", async () => {
    const agreementId = "ag_quick_isolated";
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
    await openRecipientReviseEditWorkspace();
    expect(screen.queryByTestId("recipient-quick-change-panel")).toBeNull();
    expect(screen.queryByTestId("recipient-quick-change-panel")).toBeNull();
    expect(screen.getByTestId("recipient-edit-draft-textarea")).toBeTruthy();
  });

  it("Need to upload… link switches to revised-version panel", async () => {
    const agreementId = "ag_switch_link";
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
    await openRecipientQuickChangeWorkspace();
    await userEvent.click(screen.getAllByTestId("recipient-switch-to-revised-draft-link")[0]!);

    expect(screen.getAllByTestId("recipient-revised-version-panel")[0]).toBeTruthy();
    expect(screen.queryByTestId("recipient-quick-change-panel")).toBeNull();
  });

  it("quick change uses instruction API; compare button is Preview changes", async () => {
    const agreementId = "ag_quick_instr";
    const draft = makeDraft(agreementId);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes(`/api/agreements/${agreementId}`) && !url.includes("/render") && !url.includes("/revise")) {
        return jsonResponse({ draft });
      }
      if (url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Body</p>" });
      }
      if (url.includes("/revise")) {
        return jsonResponse({
          draft: { ...draft, purpose: "Consulting. Net 45." },
          rendered_html: "<p>Updated</p>",
        });
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
    await openRecipientQuickChangeWorkspace();
    await userEvent.type(screen.getAllByTestId("recipient-revision-voice-field")[0]!, "Make payment Net 30.");
    await userEvent.click(screen.getAllByTestId("recipient-compare-versions-button")[0]!);

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/revise"))).toBe(true);
    });
    expect(screen.getAllByTestId("recipient-compare-versions-button")[0]!.textContent).toMatch(/Preview changes/i);
  });

  it("whole-document paste compare does not call /revise", async () => {
    const agreementId = "ag_whole_doc";
    const draft = makeDraft(agreementId);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
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
    await openRecipientReviseUploadPickMethod();

    const importDraftInput = screen.getByTestId("recipient-import-draft-file-input");
    expect(importDraftInput.getAttribute("accept")).toBe(REVISED_DRAFT_FILE_INPUT_ACCEPT);
    expect(importDraftInput.getAttribute("accept")).toContain(".pdf");
    expect(importDraftInput.getAttribute("accept")).toContain("application/pdf");

    const scoped = within(screen.getByTestId("recipient-propose-update-standard-panel"));
    await userEvent.click(screen.getByTestId("recipient-intake-mode-edit-draft"));
    await waitFor(() => {
      expect(scoped.getByTestId("recipient-edit-draft-textarea")).toBeTruthy();
    });
    const paste = "x".repeat(2500);
    fireEvent.change(scoped.getByTestId("recipient-edit-draft-textarea"), { target: { value: paste } });
    expect(screen.getAllByTestId("recipient-compare-versions-button")[0]!.textContent).toMatch(/Submit proposed update/i);
    await userEvent.click(screen.getAllByTestId("recipient-compare-versions-button")[0]!);

    await waitFor(() => {
      expect(screen.getAllByTestId("recipient-suggested-changes-panel")[0]).toBeTruthy();
    });
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/revise"))).toBe(false);
  });

  it("manual full-agreement edit keeps submit enabled", async () => {
    const agreementId = "ag_quick_hint";
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
    await openRecipientReviseEditWorkspace();

    const big = "THIS AGREEMENT\n\n".repeat(200);
    fireEvent.change(screen.getByTestId("recipient-edit-draft-textarea"), { target: { value: big } });
    const previewBtn = screen.getByTestId("recipient-compare-versions-button") as HTMLButtonElement;
    expect(previewBtn.textContent).toMatch(/Submit proposed update/i);
    expect(previewBtn.disabled).toBe(false);
  });

  it("paste textarea sizing and mobile overflow", async () => {
    const agreementId = "ag_sizing";
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
      await openRecipientReviseUploadPickMethod();
      await userEvent.click(scoped.getAllByTestId("recipient-intake-mode-paste-revised")[0]!);

      const ta = scoped.getAllByTestId("recipient-revised-draft-paste")[0]! as HTMLTextAreaElement;
      expect(ta.className).toMatch(/overflow-x-hidden/);
      const max = Number.parseInt(ta.style.maxHeight.replace("px", ""), 10);
      expect(max).toBe(computeRecipientDraftTextareaMaxPx(window));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
