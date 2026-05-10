/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import { RecipientBusinessReviewCards } from "./RecipientBusinessReviewCards";
import {
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING,
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT,
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

  it("renders preview CTA copy, hint, title subline, and popover detail copy for desktop inspection", () => {
    const onView = vi.fn();
    render(
      <RecipientBusinessReviewCards chips={["Payment terms"]} legalVm={paymentVm} onViewExactWording={onView} />,
    );
    expect(screen.getByText(RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING)).toBeTruthy();
    expect(screen.getByText(RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT)).toBeTruthy();
    const pop = screen.getByTestId("recipient-business-review-card-popover-payment_terms");
    fireEvent.click(pop);
    const detail = screen.getByTestId("recipient-business-review-card-detail-panel-payment_terms");
    expect(within(detail).getByText(/Why this matters:/)).toBeTruthy();
    expect(within(detail).getByText(/Clarifies when invoices/)).toBeTruthy();
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

  it("Show changed wording in redline opens parent redline then runs semantic navigation (weak mapping path)", async () => {
    const onOpen = vi.fn();
    const onNav = vi.fn();
    const weakVm = applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(
        [
          "4. Payment",
          "Fees are Net 30 from invoice date.",
          "",
          "5. Confidentiality",
          "Recipient must not disclose payment schedules or Net 30 billing practices to competitors.",
          "",
          "6. Term",
          "One year.",
        ].join("\n"),
        [
          "4. Payment",
          "Fees are Net 45 from invoice date.",
          "",
          "5. Confidentiality",
          "Recipient must not disclose payment schedules or Net 45 billing practices to competitors.",
          "",
          "6. Term",
          "One year.",
        ].join("\n"),
      ),
    );
    const user = userEvent.setup();
    render(
      <RecipientBusinessReviewCards
        chips={["Payment terms"]}
        legalVm={weakVm}
        onViewExactWording={() => {}}
        onOpenFullRedline={onOpen}
        onNavigateSemanticInRedline={onNav}
      />,
    );
    const btn = screen.queryByTestId("recipient-business-review-show-changed-wording");
    expect(btn).toBeTruthy();
    await user.click(btn!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledTimes(1);
  });
});
