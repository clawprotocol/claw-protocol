/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientChangedClauseCard } from "./RecipientChangedClauseCard";
import { buildRecipientClauseCards, assessRecipientPreviewDiff } from "./recipientPreviewDiffModel";
import type { AgreementDraft } from "./agreementTypes";

function baseDraft(over: Partial<AgreementDraft> = {}): AgreementDraft {
  const now = new Date().toISOString();
  return {
    id: "a1",
    title: "Services",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "owner" },
      { name: "B", role: "party" },
    ],
    purpose: "Custom software development.",
    payment_terms: "Net 15. Invoices due on receipt.",
    duration: "1 year",
    due_date: null,
    effective_date: "2026-01-01",
    created_at: now,
    updated_at: now,
    versions: [{ version: 1, created_at: now, note: "x" }],
    audit_log: [],
    ...over,
  };
}

describe("RecipientChangedClauseCard", () => {
  afterEach(() => cleanup());

  it("shows Net 30 + pause bullets, field redline, and tucks full text in disclosure", async () => {
    const base = baseDraft();
    const proposed = baseDraft({
      payment_terms:
        "Net 30. Invoices due within 30 days. The developer may pause work if payment is more than 15 days late until brought current.",
    });
    const a = assessRecipientPreviewDiff(base, proposed, "<p>x</p>", "<p>x</p>");
    const [card] = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff).filter(
      (c) => c.id === "payment_terms",
    );
    expect(card).toBeDefined();
    expect(card!.sectionLabel).toMatch(/Payment terms/);

    render(<RecipientChangedClauseCard card={card!} />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    const bullets = within(root).getByTestId("clause-what-changed");
    expect(bullets.textContent).toMatch(/Payment timing changed to Net 30/i);
    expect(bullets.textContent).toMatch(/pause work.*15 days late/i);

    const redlineHost = within(root).getByTestId("clause-field-redline");
    expect(redlineHost.querySelector('[data-redline="insert"]')).toBeTruthy();
    expect(redlineHost.querySelector('[data-redline="delete"]')).toBeTruthy();

    const details = within(root).getByTestId("clause-full-before-after");
    expect(details.hasAttribute("open")).toBe(false);

    const summary = details.querySelector("summary");
    expect(summary).toBeTruthy();
    await userEvent.click(summary!);
    expect(details.hasAttribute("open")).toBe(true);
    expect(within(details).getByText(/Net 15\. Invoices due on receipt/i)).toBeTruthy();
    expect(within(details).getByText(/Net 30\. Invoices due within 30 days/i)).toBeTruthy();
  });
});
