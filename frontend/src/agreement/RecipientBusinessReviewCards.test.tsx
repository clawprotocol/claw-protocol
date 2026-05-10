/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RecipientBusinessReviewCards } from "./RecipientBusinessReviewCards";
import {
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING,
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT,
  RECIPIENT_VIEW_IN_FULL_LEGAL_REDLINE,
} from "./portableReviewCopy";

const paymentVm: LegalRedlineDocumentViewModel = {
  blocks: [
    {
      id: "pay",
      kind: "clause",
      label: "4. Payment",
      segments: [
        { type: "delete", text: "Due on receipt." },
        { type: "insert", text: "Net 30 from invoice." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    },
  ],
  stats: {
    blockCount: 1,
    changedBlockCount: 1,
    insertCount: 1,
    deleteCount: 1,
    sameCount: 0,
    segmentCount: 2,
    currentLen: 20,
    proposedLen: 22,
  },
  hasChanges: true,
};

describe("RecipientBusinessReviewCards", () => {
  afterEach(() => cleanup());

  it("renders preview CTA copy, hint, title subline, and expandable detail copy for desktop inspection", () => {
    const onView = vi.fn();
    render(
      <RecipientBusinessReviewCards chips={["Payment terms"]} legalVm={paymentVm} onViewExactWording={onView} />,
    );
    expect(screen.getByText(RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT)).toBeTruthy();
    fireEvent.click(screen.getByTestId("recipient-business-review-card-popover-payment_terms"));
    const panel = screen.getByTestId("recipient-business-review-card-detail-panel-payment_terms");
    expect(within(panel).getByText(/Why this matters:/)).toBeTruthy();
    expect(within(panel).getByText(/Clarifies when invoices/)).toBeTruthy();
    expect(screen.getByTestId("recipient-business-review-card-subline-payment_terms").textContent?.length).toBeGreaterThan(
      8,
    );
  });

  it("opens the compact mobile sheet with the same preview fields on tap", () => {
    render(
      <RecipientBusinessReviewCards chips={["Payment terms"]} legalVm={paymentVm} onViewExactWording={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("recipient-business-review-card-mobile-preview-payment_terms"));
    const sheet = screen.getByTestId("recipient-business-review-card-mobile-sheet");
    expect(within(sheet).getByText(/Why this matters:/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("recipient-business-review-card-mobile-sheet-backdrop"));
    expect(screen.queryByTestId("recipient-business-review-card-mobile-sheet")).toBeNull();
  });

  it("opens full redline before awaiting semantic navigation", async () => {
    const order: string[] = [];
    render(
      <RecipientBusinessReviewCards
        chips={["Ownership"]}
        legalVm={paymentVm}
        onViewExactWording={vi.fn()}
        onOpenFullRedline={() => void order.push("open")}
        onNavigateSemanticInRedline={async () => {
          order.push("nav");
        }}
      />,
    );
    fireEvent.click(screen.getByText(RECIPIENT_VIEW_IN_FULL_LEGAL_REDLINE));
    await Promise.resolve();
    expect(order).toEqual(["open", "nav"]);
  });

  it("invokes exact wording modal path from Preview wording", () => {
    const onView = vi.fn();
    render(
      <RecipientBusinessReviewCards chips={["Payment terms"]} legalVm={paymentVm} onViewExactWording={onView} />,
    );
    fireEvent.click(screen.getByText(RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView.mock.calls[0]![0].oldText).toContain("Due on receipt");
    expect(onView.mock.calls[0]![0].newText).toContain("Net 30");
  });
});
