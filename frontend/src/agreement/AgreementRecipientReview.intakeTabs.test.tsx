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

describe("AgreementRecipientReview revise workflow routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows primary revised-version workflow card and work-elsewhere copy", async () => {
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

    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Send back a revised version/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("button", { name: /Send back a revised version/i })[0]!);

    await waitFor(() => {
      expect(screen.getAllByTestId("recipient-workflow-revised").length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("recipient-workflow-revised")).toBeTruthy();
    expect(screen.getByTestId("recipient-workflow-quick")).toBeTruthy();
    expect(screen.getByText(/Used AI, Word, Google Docs, or counsel/i)).toBeTruthy();
    expect(screen.getByText("Work somewhere else")).toBeTruthy();
    expect(screen.getByText(/Download the original, edit it with your lawyer or AI tool/i)).toBeTruthy();
  });

  it("quick change uses instruction API; compare button is Preview change", async () => {
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
    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Send back a revised version/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("button", { name: /Send back a revised version/i })[0]!);

    await userEvent.click(screen.getByTestId("recipient-workflow-quick"));
    await userEvent.type(screen.getByTestId("recipient-revision-voice-field"), "Make payment Net 30.");
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/revise"))).toBe(true);
    });
    expect(screen.getByTestId("recipient-compare-versions-button").textContent).toMatch(/Preview change/i);
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
    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Send back a revised version/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("button", { name: /Send back a revised version/i })[0]!);

    await userEvent.click(screen.getByTestId("recipient-intake-mode-paste-revised"));
    const paste = "x".repeat(2500);
    fireEvent.change(screen.getByTestId("recipient-revised-draft-paste"), { target: { value: paste } });
    await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));

    await waitFor(() => {
      expect(screen.getByTestId("recipient-suggested-changes-panel")).toBeTruthy();
    });
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/revise"))).toBe(false);
  });

  it("quick change full-agreement paste shows switch hint", async () => {
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
    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Send back a revised version/i }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole("button", { name: /Send back a revised version/i })[0]!);
    await userEvent.click(screen.getByTestId("recipient-workflow-quick"));

    const big = "THIS AGREEMENT\n\n".repeat(200);
    fireEvent.change(screen.getByTestId("recipient-revision-voice-field"), { target: { value: big } });

    expect(screen.getByTestId("recipient-quick-change-full-doc-hint")).toBeTruthy();
    expect((screen.getByTestId("recipient-compare-versions-button") as HTMLButtonElement).disabled).toBe(true);
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
      await userEvent.click(scoped.getAllByRole("button", { name: /Review agreement/i })[0]!);
      await waitFor(() => {
        expect(scoped.getAllByRole("button", { name: /Send back a revised version/i }).length).toBeGreaterThan(0);
      });
      await userEvent.click(scoped.getAllByRole("button", { name: /Send back a revised version/i })[0]!);
      await userEvent.click(scoped.getByTestId("recipient-intake-mode-paste-revised"));

      const ta = scoped.getByTestId("recipient-revised-draft-paste") as HTMLTextAreaElement;
      expect(ta.className).toMatch(/overflow-x-hidden/);
      const max = Number.parseInt(ta.style.maxHeight.replace("px", ""), 10);
      expect(max).toBe(computeRecipientDraftTextareaMaxPx(window));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
