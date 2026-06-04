/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PAID_PRO_REVIEW_SHELL_SAFETY_LINE,
  PAID_PRO_REVIEW_SHELL_SUBTITLE,
  PAID_PRO_REVIEW_SHELL_TITLE,
} from "./authoritativePaidProReview";
import { PaidProReviewStatusPanel } from "./PaidProReviewStatusPanel";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";
import {
  PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS,
  PAID_PRO_REVIEW_POST_DOCUMENT_STACK_GAP_CLASS,
} from "./paidProReviewLayoutConstants";
import { PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS } from "./paidProReviewTrustUx";

const LONG_SOT = `Agreement body. ${"Operative clause. ".repeat(700)}`;

describe("paidProReviewUxCopy", () => {
  afterEach(() => cleanup());

  it("uses simplified review shell copy without duplicate review/final-agreement phrasing", () => {
    expect(PAID_PRO_REVIEW_SHELL_TITLE).toBe("Agreement ready");
    expect(PAID_PRO_REVIEW_SHELL_SUBTITLE).toMatch(/Review the agreement below/i);
    expect(PAID_PRO_REVIEW_SHELL_SUBTITLE).toMatch(/signer details/i);
    expect(PAID_PRO_REVIEW_SHELL_SAFETY_LINE).toMatch(/Nothing is sent or signed/i);
    expect(PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS).not.toMatch(/final agreement/i);
    expect(PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS).not.toMatch(/Review your agreement/i);
  });

  it("compact paid review renders header and status without redundant callout or final-version card", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        suppressShellDuplicatedChrome
        paidReviewPlain={LONG_SOT}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.getByTestId("paid-pro-review-compact-header").textContent).toContain("Agreement ready");
    expect(screen.getByTestId("paid-pro-review-safety-line").textContent).toContain(
      PAID_PRO_REVIEW_SHELL_SAFETY_LINE,
    );
    expect(screen.getByTestId("paid-pro-review-status-panel")).toBeTruthy();
    expect(screen.queryByTestId("paid-pro-review-next-step-callout")).toBeNull();
    expect(screen.queryByTestId("paid-pro-final-version-indicator")).toBeNull();
    const screenRoot = screen.getByTestId("simple-pro-final-review-screen");
    expect(screenRoot.className).toContain(PAID_PRO_REVIEW_POST_DOCUMENT_STACK_GAP_CLASS);
  });

  it("places review status panel before sticky scroll spacer (reduced document-to-status gap)", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        suppressShellDuplicatedChrome
        paidReviewPlain={LONG_SOT}
        stickyBottomScrollInsetPx={120}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const root = screen.getByTestId("simple-pro-final-review-screen");
    const status = root.querySelector('[data-testid="paid-pro-review-status-panel"]');
    const spacer = root.querySelector('[data-testid="paid-pro-review-bottom-spacer"]');
    expect(status).toBeTruthy();
    expect(spacer).toBeTruthy();
    expect(
      status!.compareDocumentPosition(spacer!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const article = root.querySelector('[data-testid="premium-agreement-readonly-article"]');
    expect(article).toBeTruthy();
    expect(article!.className).toContain(PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS.split(" ")[0]);
  });

  it("status panel supporting copy stays short", () => {
    render(<PaidProReviewStatusPanel signersReady={false} />);
    const panel = screen.getByTestId("paid-pro-review-status-panel");
    const supporting = panel.querySelector('[data-testid="paid-pro-review-status-supporting"]');
    expect(supporting).toBeTruthy();
    expect(supporting!.textContent).toMatch(/signer name/i);
    expect(supporting!.textContent).not.toMatch(/generated and reviewed/i);
  });
});
