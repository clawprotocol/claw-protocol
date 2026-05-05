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

  it("tracked ON renders field redline with data-redline insert/delete when before/after exists", async () => {
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
    expect(card!.fieldRedline?.hasChanges).toBe(true);

    render(<RecipientChangedClauseCard card={card!} showTrackedChanges />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    const primary = within(root).getByTestId("clause-card-primary");
    const redlineRoot = within(primary).getByTestId("clause-field-redline");
    expect(redlineRoot.querySelector('[data-redline="insert"]')).toBeTruthy();
    expect(redlineRoot.querySelector('[data-redline="delete"]')).toBeTruthy();
    expect(primary.querySelector('[data-redline="insert-pill"]')).toBeNull();

    const primaryText = primary.textContent ?? "";
    expect(primaryText.length).toBeLessThan(8000);
    expect(primaryText).not.toMatch(/Additional terms apply per schedule A.*Additional terms apply per schedule A/s);

    const details = within(root).getByTestId("clause-full-before-after");
    expect(details.hasAttribute("open")).toBe(false);
    await userEvent.click(details.querySelector("summary")!);
    expect(within(details).getByText(/until brought current/i)).toBeTruthy();
  });

  it("tracked OFF renders clean proposed only — no data-redline markers", () => {
    const base = baseDraft();
    const proposed = baseDraft({
      payment_terms:
        "Net 30. Invoices due within 30 days. The developer may pause work if payment is more than 15 days late until brought current.",
    });
    const a = assessRecipientPreviewDiff(base, proposed, "<p>x</p>", "<p>x</p>", {
      recipientInstructionPlain: "Net 30",
    });
    const card = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff, a.clauseContext).find(
      (c) => c.id === "payment_terms",
    );
    expect(card).toBeDefined();

    render(<RecipientChangedClauseCard card={card!} showTrackedChanges={false} />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    expect(within(root).getByTestId("clause-clean-proposed")).toBeTruthy();
    expect(root.querySelector("[data-redline]")).toBeNull();
  });

  it("insert-only payment terms shows green data-redline insert and neutral additions label", () => {
    const base = baseDraft({ payment_terms: "" });
    const proposed = baseDraft({ payment_terms: "Invoices are due Net 30." });
    const a = assessRecipientPreviewDiff(base, proposed, "<p>x</p>", "<p>x</p>");
    const card = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff, a.clauseContext).find(
      (c) => c.id === "payment_terms",
    );
    expect(card?.redlineView.canRenderTrackedDiff).toBe(true);
    expect(card?.redlineView.hasDeletes).toBe(false);
    expect(card?.redlineView.hasAdds).toBe(true);

    render(<RecipientChangedClauseCard card={card!} showTrackedChanges />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    expect(root.querySelector('[data-redline="insert"]')).toBeTruthy();
    expect(screen.getByTestId("clause-additions-label").textContent).toMatch(/Additions shown/i);
  });

  it("shows requested-but-not-reflected warning when pause was asked but omitted from proposal", () => {
    const base = baseDraft({ payment_terms: "Net 15." });
    const proposed = baseDraft({ payment_terms: "Net 30." });
    const a = assessRecipientPreviewDiff(base, proposed, "<p>x</p>", "<p>x</p>", {
      recipientInstructionPlain: "Net 30 and pause work after 15 days late",
    });
    expect(a.instructionCaptureWarning).toBe(true);
    const card = buildRecipientClauseCards(a.snapshotCompare, a.hasMaterialTextDiff, a.clauseContext).find(
      (c) => c.id === "payment_terms",
    );
    expect(card).toBeDefined();

    render(<RecipientChangedClauseCard card={card!} showTrackedChanges />);

    const root = screen.getByTestId("recipient-clause-card-payment_terms");
    expect(within(root).getByTestId("clause-what-changed").textContent).toMatch(/Requested but not reflected/i);
    expect(within(root).getByTestId("clause-what-changed").textContent).toMatch(/pause/i);
  });
});
