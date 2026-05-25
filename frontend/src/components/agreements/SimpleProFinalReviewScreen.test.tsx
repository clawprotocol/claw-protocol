/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE } from "../../launch/simpleProduct/reviewFirstSendSurface";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

describe("SimpleProFinalReviewScreen", () => {
  it("shows applied trust copy and checklist when DOM mutation markers are absent", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Full authoritative agreement body</p>"
        appliedAnswerCount={5}
        appliedChecklist={[
          "Fees & Payment",
          "Support & SLA",
          "Ownership",
          "Termination / Renewal",
          "Invoice timing & renewal",
        ]}
        appliedVariableIds={["payment_timing", "saas_sla", "ip_ownership", "renewal_notice"]}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.getByTestId("simple-pro-final-review-trust-line").textContent).toContain(
      "5 answers applied to this version",
    );
    expect(screen.getByTestId("simple-pro-final-review-send-trust").textContent).toContain(
      "This is the version that will be sent.",
    );
    expect(screen.getByTestId("simple-pro-applied-updates-card").textContent).toContain("Updates applied");
    const checklist = screen.getByTestId("simple-pro-applied-checklist");
    expect(checklist.textContent).toContain("Fees & Payment");
    expect(checklist.textContent).toContain("Support & SLA");
    expect(screen.getByTestId("simple-pro-jump-section-fees-payment")).toBeTruthy();
    cleanup();
  });

  it("shows signer/reviewer ready trust line when signersReady", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        appliedAnswerCount={5}
        signersReady
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.getByTestId("simple-pro-final-review-signers-ready").textContent).toContain(
      "Signer/reviewer details ready",
    );
    cleanup();
  });

  it("renders send CTAs and Edit agreement text link, not Suggest changes", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        appliedAnswerCount={5}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onSuggestEditsDraftChange={vi.fn()}
        onApplySuggestEdits={vi.fn()}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("simple-pro-send-for-signature")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-send-for-review")).toBeTruthy();
    expect(screen.queryByTestId("simple-pro-suggest-changes-toggle")).toBeNull();
    expect(screen.queryByTestId("simple-pro-continue-to-signing")).toBeNull();
    expect(screen.getByTestId("simple-pro-edit-agreement-text-toggle").textContent).toContain(
      "Edit agreement text",
    );
    fireEvent.click(screen.getByTestId("simple-pro-edit-agreement-text-toggle"));
    expect(screen.getByTestId("simple-pro-edit-agreement-text-card")).toBeTruthy();
    cleanup();
  });

  it("shows busy status above actions while minting (send buttons remain)", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffBusy
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.getByTestId("simple-pro-review-first-handoff-busy").textContent).toContain(
      "Creating review links",
    );
    expect(screen.getByTestId("simple-pro-send-for-review").textContent).toContain("Creating review links");
    expect((screen.getByTestId("simple-pro-send-for-review") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
  });

  it("replaces final review action buttons with inline review-first error panel", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffError="We could not create review links. Try again."
        onRetryReviewFirstHandoff={vi.fn()}
        onBackToFinalReviewFromReviewHandoff={vi.fn()}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const actions = screen.getByTestId("simple-pro-final-review-actions");
    expect(actions.contains(screen.getByTestId("simple-pro-review-first-handoff-error"))).toBe(true);
    expect(screen.getByTestId("simple-pro-review-first-handoff-error").textContent).toContain(
      "Review links unavailable",
    );
    expect(screen.queryByTestId("simple-pro-send-for-review")).toBeNull();
    expect(screen.queryByTestId("simple-pro-send-for-signature")).toBeNull();
    expect(screen.queryByText(/We couldn.t save your draft just now/i)).toBeNull();
    cleanup();
  });

  it("shows signing-token config copy with retry and back actions for mint 422", () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffError={REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE}
        onRetryReviewFirstHandoff={onRetry}
        onBackToFinalReviewFromReviewHandoff={onBack}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const panel = screen.getByTestId("simple-pro-review-first-handoff-error");
    expect(panel.textContent).toContain("Review links unavailable");
    expect(panel.textContent).toContain("Review links could not be created");
    expect(panel.textContent).toContain("signing/review token minting is not configured");
    fireEvent.click(screen.getByTestId("simple-pro-review-first-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("simple-pro-review-first-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("enables retry when handoff error is shown (mint actions replaced)", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffError={REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE}
        onRetryReviewFirstHandoff={vi.fn()}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("simple-pro-send-for-review")).toBeNull();
    expect((screen.getByTestId("simple-pro-review-first-retry") as HTMLButtonElement).disabled).toBe(
      false,
    );
    cleanup();
  });
});
