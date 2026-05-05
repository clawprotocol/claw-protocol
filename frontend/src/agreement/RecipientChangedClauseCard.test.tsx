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
    payment_terms: "Invoices are due upon receipt. Additional terms apply per schedule A.",
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

  it("shows track-change Added lines, compact bullets, and full text only in disclosure", async () => {
    const base = baseDraft();
    const proposed = baseDraft({
      payment_terms:
        "Net 30. Invoices due within 30 days. The developer may pause work if payment is more than 15 days late until brought current.",
    });
    const a = assessRecipientPreviewDiff(base, proposed, "<p>x</p>", "<p>x</p>", {
      recipientInstructionPlain: "Net 30 and pause work after 15 days late",
    });
    const [card] = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff, a.clauseContext).filter(
      (c) => c.id === "payment_terms",
    );
    expect(card).toBeDefined();
    expect(card!.cardTitle).toBe("Payment terms");
    expect(card!.trackMode).toBe("lines");

    render(<RecipientChangedClauseCard card={card!} />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    const primary = within(root).getByTestId("clause-card-primary");
    expect(within(primary).getByTestId("clause-track-lines").textContent).toMatch(/Added:.*Net 30/i);
    expect(within(primary).getByTestId("clause-track-lines").textContent).toMatch(/pause work/i);
    expect(primary.textContent).not.toMatch(/until brought current/i);

    const details = within(root).getByTestId("clause-full-before-after");
    expect(details.hasAttribute("open")).toBe(false);
    await userEvent.click(details.querySelector("summary")!);
    expect(within(details).getByText(/until brought current/i)).toBeTruthy();
  });
});
