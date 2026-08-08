/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PAID_PRO_REVIEW_SHELL_SUBTITLE, PAID_PRO_REVIEW_SHELL_TITLE } from "./authoritativePaidProReview";
import { PAID_PRO_INLINE_SIGNER_SECTION_TITLE } from "./paidProInlineSignerSetupCopy";
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
    expect(PAID_PRO_INLINE_SIGNER_SECTION_TITLE).toBe("Signer details");
    expect(PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS).not.toMatch(/final agreement/i);
    expect(PAID_PRO_REVIEW_SUPPORTING_BEFORE_SIGNERS).not.toMatch(/Review your agreement/i);
  });

  it("compact paid review omits duplicate header and uses status steps only", () => {
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
    expect(screen.queryByTestId("paid-pro-review-compact-header")).toBeNull();
    // Compact shell still shows signer-field guidance while details are incomplete.
    expect(screen.getByTestId("paid-pro-review-status-supporting").textContent).toMatch(
      /signer name|legal entity|signature lines/i,
    );
    expect(screen.getByTestId("paid-pro-review-status-panel").textContent).toContain(
      "Signer details needed",
    );
    expect(screen.queryByTestId("paid-pro-review-next-step-callout")).toBeNull();
    expect(screen.queryByTestId("paid-pro-final-version-indicator")).toBeNull();
    const screenRoot = screen.getByTestId("simple-pro-final-review-screen");
    expect(screenRoot.className).toContain(PAID_PRO_REVIEW_POST_DOCUMENT_STACK_GAP_CLASS);
  });

  it("suppresses in-panel actions when inline signer setup owns the CTA", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        suppressShellDuplicatedChrome
        suppressFinalReviewActions
        paidReviewPlain={LONG_SOT}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("simple-pro-final-review-actions")).toBeNull();
    expect(screen.getByTestId("paid-pro-review-status-panel")).toBeTruthy();
  });

  it("suppresses inner scroll spacer when inline signer setup follows", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        suppressShellDuplicatedChrome
        suppressPostDocumentScrollSpacer
        suppressFinalReviewActions
        paidReviewPlain={LONG_SOT}
        stickyBottomScrollInsetPx={120}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("paid-pro-review-bottom-spacer")).toBeNull();
    const article = screen.getByTestId("premium-agreement-readonly-article");
    expect(article.className).toContain(PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS.split(" ")[0]);
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
