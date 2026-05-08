/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function duplicateDomIds(root: HTMLElement): string[] {
  const counts = new Map<string, number>();
  root.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id");
    if (!id?.trim()) return;
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return [...counts.entries()].filter(([, c]) => c > 1).map(([id]) => id);
}

function brokenAriaLabelledBy(doc: Document, root: HTMLElement): string[] {
  const bad: string[] = [];
  root.querySelectorAll("[aria-labelledby]").forEach((el) => {
    const raw = el.getAttribute("aria-labelledby");
    if (!raw?.trim()) return;
    for (const token of raw.trim().split(/\s+/)) {
      if (!token) continue;
      if (!doc.getElementById(token)) bad.push(`${el.tagName}[aria-labelledby~="${token}"]`);
    }
  });
  return bad;
}

const agreementId = "ag_dom_integrity";

const initialDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
  ],
  purpose: "Consulting.",
  payment_terms: "Pay upon receipt.",
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
  payment_terms: "Net 30.",
  updated_at: new Date().toISOString(),
};

describe("AgreementRecipientReview DOM integrity (recipient export)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps unique ids and at most one visible export surface while rapidly toggling preview", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
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
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      if (method === "POST" && url.includes("recipient-preview-export-pdf")) {
        const buf = new Uint8Array(120);
        buf[0] = 0x25;
        buf[1] = 0x50;
        buf[2] = 0x44;
        buf[3] = 0x46;
        return new Response(buf, { status: 200, headers: { "Content-Type": "application/pdf" } });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Net 30.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({
          rendered_html:
            "<p>Services Agreement</p><p>3.2 Payment terms<br/>Pay upon receipt.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>",
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });

    const { container, baseElement } = render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_dom" />
      </AccessProvider>,
    );
    const doc = baseElement.ownerDocument ?? document;

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });
    await userEvent.click(screen.getAllByRole("button", { name: /Review agreement/i })[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("recipient-ask-quick-change")).toBeTruthy();
    });
    await userEvent.click(screen.getByTestId("recipient-ask-quick-change"));

    const voice = screen.getByTestId("recipient-revision-voice-field");
    await userEvent.type(voice, "Switch to Net 30 for payment timing.");

    for (let i = 0; i < 6; i++) {
      await userEvent.click(screen.getByTestId("recipient-compare-versions-button"));
      await waitFor(() => {
        expect(screen.getByTestId("recipient-preview-versions-export")).toBeTruthy();
      });
      expect(screen.queryAllByTestId("recipient-preview-versions-export")).toHaveLength(1);
      expect(screen.queryAllByTestId("recipient-read-download-agreement")).toHaveLength(0);

      const exportRegion = screen.getByTestId("recipient-preview-versions-export");
      await userEvent.click(within(exportRegion).getByTestId("recipient-preview-download-original-pdf"));
      const panel = screen.getByTestId("recipient-suggested-changes-panel");
      await userEvent.click(within(panel).getByRole("button", { name: "Keep reviewing" }));

      expect(duplicateDomIds(container)).toEqual([]);
      expect(brokenAriaLabelledBy(doc, container)).toEqual([]);
    }

    await userEvent.click(screen.getByRole("button", { name: "← Back to agreement" }));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-read-download-agreement")).toBeTruthy();
    });
    expect(screen.queryAllByTestId("recipient-read-download-agreement")).toHaveLength(1);
    expect(screen.queryAllByTestId("recipient-preview-versions-export")).toHaveLength(0);
    expect(duplicateDomIds(container)).toEqual([]);
  });
});
