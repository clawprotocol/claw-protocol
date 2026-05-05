/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const agreementId = "ag_whole_doc_redline_int";

const initialDraft = {
  id: agreementId,
  title: "Services",
  jurisdiction: "CA",
  parties: [
    { name: "Alice", role: "owner" },
    { name: "Bob", role: "party" },
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
  updated_at: new Date().toISOString(),
};

/** Same HTML for baseline and proposed; includes a payment line so literal/inline patch can land (no tail append). */
const identicalListingHtml =
  "<p>Master services agreement (listing only).</p><p>Invoices are payable upon receipt.</p>";

describe("AgreementRecipientReview whole-doc redline vs identical HTML", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows summary chips and Net 30 insert when HTML matches but payment_terms changed; no tabs", async () => {
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
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();

      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: identicalListingHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraft,
          rendered_html: identicalListingHtml,
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    await userEvent.clear(instruction);
    await userEvent.type(instruction, "Change payment to Net 30.");
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    expect(screen.queryByTestId("recipient-tab-redline")).toBeNull();
    expect(screen.queryByTestId("recipient-side-by-side-block-grid")).toBeNull();

    const ins = screen.getByTestId("recipient-redline-chip-insertions").textContent ?? "";
    expect(ins).toMatch(/[1-9]\d*\s+insertion/i);
    expect(ins).not.toMatch(/^0\s+insertions?$/i);

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    const insertEl = legalRoot.querySelector('[data-redline="insert"]');
    expect(insertEl).toBeTruthy();
    expect(insertEl?.textContent).toMatch(/Net\s*30/i);

    const panel = screen.getByTestId("recipient-suggested-changes-panel");
    expect(within(panel).getByRole("button", { name: /Send suggested edits/i })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: /Dismiss preview/i })).toBeTruthy();
  });
});

const baselineStructuredHtml = `<div>
  <p>Master Services Agreement</p>
  <p>3.2 Payment</p>
  <p>Invoices are payable upon receipt.</p>
  <p>IN WITNESS WHEREOF the parties execute.</p>
  <p>Created with LawDog — Draft for Review.</p>
</div>`;

const divergentReviseRenderedHtml = `<article>
  <h1>Alternate template</h1>
  <section><p>Article I — Definitions</p><p>Lorem ipsum dolor sit amet.</p></section>
  <section><p>Article II — Scope</p><p>Aliqua ut enim ad minim.</p></section>
  <section><p>Article III — Fees</p><p>Consectetur adipiscing elit sed do.</p></section>
  <section><p>Article IV — Term</p><p>Excepteur sint occaecat cupidatat.</p></section>
</article>`;

const agreementIdDrift = "ag_whole_doc_redline_drift";

const initialDraftDrift = {
  ...initialDraft,
  id: agreementIdDrift,
};

const revisedDraftDrift = {
  ...revisedDraft,
  id: agreementIdDrift,
};

describe("AgreementRecipientReview whole-doc redline vs divergent revise HTML", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps baseline structure, applies Net 30 and pause remedy in payment block, hides Agreement fields trailer, two intents applied", async () => {
    const scrollIntoViewMock = vi.fn();
    for (const proto of [Element.prototype, HTMLElement.prototype]) {
      Object.defineProperty(proto, "scrollIntoView", {
        configurable: true,
        value: scrollIntoViewMock,
      });
    }
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();

      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: baselineStructuredHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraftDrift,
          rendered_html: divergentReviseRenderedHtml,
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraftDrift });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementIdDrift} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    fireEvent.change(instruction, {
      target: { value: "Net 30 and pause work after 15 days late" },
    });
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    expect(legalRoot.textContent).not.toMatch(/Agreement fields \(tracked for redline\)/i);
    expect(legalRoot.textContent).not.toMatch(/Excepteur sint occaecat/i);

    const insertEls = legalRoot.querySelectorAll('[data-redline="insert"]');
    expect(insertEls.length).toBeGreaterThan(0);
    const insertJoined = Array.from(insertEls)
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(insertJoined).toMatch(/Net\s*30/i);
    expect(insertJoined).toMatch(/pause work until all overdue undisputed amounts are paid/i);
    expect(insertJoined).toMatch(/fifteen \(15\)/i);

    expect(screen.getByTestId("recipient-redline-chip-insertions").textContent).toMatch(/^[12]\s+insertions?$/i);
    expect(screen.getByTestId("recipient-redline-chip-deletions").textContent).toMatch(/^0\s+deletion|^1\s+deletion$/i);
    expect(screen.getByTestId("recipient-redline-chip-sections").textContent).toMatch(/^1\s+changed section$/i);

    expect(screen.queryByTestId("recipient-redline-chip-not-reflected")).toBeNull();

    for (const el of legalRoot.querySelectorAll('[data-redline="insert"], [data-redline="delete"]')) {
      const t = (el.textContent ?? "").toLowerCase();
      expect(t).not.toContain("lawdog");
      expect(t).not.toContain("in witness whereof");
      expect(t).not.toContain("alice");
      expect(t).not.toContain("bob");
    }

    const callout = screen.getByTestId("recipient-redline-not-reflected-callout");
    expect(screen.getByTestId("recipient-intent-coverage-list")).toBeTruthy();
    expect(callout.textContent).toMatch(/Added:/i);
    expect(callout.textContent).not.toMatch(/Could not add:/i);
    const list = screen.getByTestId("recipient-intent-coverage-list");
    expect(within(list).getAllByRole("button", { name: /Added:/i })).toHaveLength(2);

    expect(legalRoot.querySelector('[data-recipient-redline-anchor="payment_timing"]')).toBeTruthy();
    expect(legalRoot.querySelector('[data-recipient-redline-anchor="pause_suspend_work"]')).toBeTruthy();
    scrollIntoViewMock.mockClear();
    await userEvent.click(
      within(screen.getByTestId("recipient-intent-status-payment_timing")).getByRole("button", {
        name: /Added:/i,
      }),
    );
    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockClear();
    await userEvent.click(
      within(screen.getByTestId("recipient-intent-status-pause_suspend_work")).getByRole("button", {
        name: /Added:/i,
      }),
    );
    expect(scrollIntoViewMock).toHaveBeenCalled();

    expect(screen.queryByTestId("recipient-side-by-side-block-grid")).toBeNull();
    expect(screen.queryByTestId("recipient-tab-redline")).toBeNull();
  });
});

const agreementIdPlacement = "ag_recipient_placement_fail";

const initialPlacementDraft = {
  ...initialDraft,
  id: agreementIdPlacement,
};

const revisedPlacementDraft = {
  ...revisedDraft,
  id: agreementIdPlacement,
};

const listingOnlyNoPaymentHtml = "<p>Master services agreement (listing only).</p>";

describe("AgreementRecipientReview payment inline placement failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows placement callout and does not put Net 30 after LawDog when HTML has no payment anchor", async () => {
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
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();

      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({
          rendered_html: `${listingOnlyNoPaymentHtml}<p>Created with LawDog — Draft for Review.</p>`,
        });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedPlacementDraft,
          rendered_html: `${listingOnlyNoPaymentHtml}<p>Created with LawDog — Draft for Review.</p>`,
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialPlacementDraft });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementIdPlacement} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    fireEvent.change(instruction, {
      target: { value: "Contract update request only." },
    });
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-placement-callout")).toBeTruthy();
    });

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    const full = legalRoot.textContent ?? "";
    const lawdog = full.toLowerCase().indexOf("created with lawdog");
    if (lawdog >= 0 && /net\s*30/i.test(full)) {
      expect(full.toLowerCase().indexOf("net 30")).toBeLessThan(lawdog);
    } else {
      expect(full).not.toMatch(/net\s*30/i);
    }
    expect(full).not.toMatch(/Agreement fields \(tracked for redline\)/i);
  });
});

const baselineQaPartyNoiseHtml = `<div>
  <p>3. Compensation and Invoicing</p>
  <p>Invoices are payable upon receipt.</p>
  <p>CLIENT:</p>
  <p>Sarah Collins</p>
  <p>DEVELOPER:</p>
  <p>Anthem Blanchard</p>
  <p>Email for Notices: legal@example.com</p>
  <p>Execution and signature placement below.</p>
  <p>IN WITNESS WHEREOF, the parties agree.</p>
  <p>Created with LawDog — Draft for Review.</p>
</div>`;

const agreementIdQaNarrow = "ag_narrow_redline_qa_party_noise";

const initialDraftQaNarrow = {
  ...initialDraft,
  id: agreementIdQaNarrow,
};

const revisedDraftQaNarrow = {
  ...revisedDraft,
  id: agreementIdQaNarrow,
};

describe("AgreementRecipientReview narrow payment redline QA (party/signature/footer drift)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("places Net 30 only in payment wording; insert/delete never spans boilerplate strings", async () => {
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
      const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();

      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: baselineQaPartyNoiseHtml });
      }
      if (method === "POST" && url.includes("/revise")) {
        return jsonResponse({
          draft: revisedDraftQaNarrow,
          rendered_html: divergentReviseRenderedHtml,
        });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: initialDraftQaNarrow });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementIdQaNarrow} recipientAccessToken="tok_test" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await userEvent.click(screen.getAllByRole("button", { name: /Suggest changes/i })[0]!);
    const instruction = await screen.findByLabelText(/Your notes in plain English/i);
    fireEvent.change(instruction, {
      target: { value: "Net 30 and pause work after 15 days late" },
    });
    await userEvent.click(screen.getAllByRole("button", { name: /^Preview changes$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-redline-chip-insertions")).toBeTruthy();
    });

    const legalRoot = screen.getByTestId("recipient-legal-redline-document");
    const insText = [...legalRoot.querySelectorAll('[data-redline="insert"]')]
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(insText).toMatch(/Net\s*30/i);
    expect(insText.toLowerCase()).toMatch(/invoice|payable|compensation|fee|payment|due|receipt|net/);

    const forbidden = [
      "Signature",
      "CLIENT",
      "DEVELOPER",
      "Sarah Collins",
      "Anthem Blanchard",
      "Created with LawDog",
      "Draft for Review",
      "IN WITNESS",
      "Email for Notices",
      "Execution and signature",
    ];
    for (const el of legalRoot.querySelectorAll('[data-redline="insert"], [data-redline="delete"]')) {
      const t = el.textContent ?? "";
      for (const f of forbidden) {
        expect(t).not.toContain(f);
      }
    }

    const fullLower = (legalRoot.textContent ?? "").toLowerCase();
    const iw = fullLower.indexOf("in witness whereof");
    const netIdx = fullLower.indexOf("net 30");
    expect(iw).toBeGreaterThan(-1);
    expect(netIdx).toBeGreaterThan(-1);
    expect(netIdx).toBeLessThan(iw);

    const insChip = screen.getByTestId("recipient-redline-chip-insertions").textContent ?? "";
    const delChip = screen.getByTestId("recipient-redline-chip-deletions").textContent ?? "";
    const secChip = screen.getByTestId("recipient-redline-chip-sections").textContent ?? "";
    expect(parseInt(insChip, 10)).toBeLessThanOrEqual(2);
    expect(parseInt(delChip, 10)).toBeLessThanOrEqual(1);
    expect(parseInt(secChip, 10)).toBeLessThanOrEqual(1);

    const callout = screen.getByTestId("recipient-redline-not-reflected-callout");
    expect(callout.textContent).toMatch(/Added:/i);
    expect(callout.textContent).not.toMatch(/Could not add:/i);
    expect(insText).toMatch(/pause work until all overdue/i);
  });
});
