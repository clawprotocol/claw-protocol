/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE } from "../../launch/simpleProduct/reviewFirstSendSurface";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

describe("SimpleProFinalReviewScreen", () => {
  afterEach(() => cleanup());

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

  it("'Edit signer details' is actionable and invokes the signer-setup handler", () => {
    const onBackToSignerDetails = vi.fn();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml=""
        canonicalPaidProReview
        paidReviewPlain={`PRO AGREEMENT body. ${"Substantive clause. ".repeat(900)}`}
        onBackToSignerDetails={onBackToSignerDetails}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const editBtn = screen.getByTestId("simple-pro-back-to-signer-details");
    expect(editBtn.textContent).toContain("Edit signer details");
    fireEvent.click(editBtn);
    expect(onBackToSignerDetails).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("shows Edit agreement text alongside copy and export actions", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        signersReady
        editablePlainText="Agreement plain"
        onEditablePlainTextChange={vi.fn()}
        onSavePlainTextEdits={vi.fn()}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const actions = screen.getByTestId("simple-pro-final-review-actions");
    expect(within(actions).getByTestId("simple-pro-copy-agreement")).toBeTruthy();
    expect(within(actions).getByTestId("simple-pro-export-agreement")).toBeTruthy();
    expect(within(actions).getByTestId("simple-pro-edit-agreement-text-toggle")).toBeTruthy();
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

  it("paid Pro final review does not clip long SoT corpus", () => {
    const longBodyHtml = [
      "<h1>This AI Workflow Setup Services Agreement</h1>",
      "<p>Opening paid Pro body text.</p>",
      `<p>${"Commercial terms and implementation details. ".repeat(180)}</p>`,
      "<h2>Limitation of Liability</h2>",
      "<p>Liability terms remain visible in the middle of the agreement.</p>",
      `<p>${"Additional paid Pro clauses. ".repeat(180)}</p>`,
      "<h2>Signatures</h2>",
      "<p>IN WITNESS WHEREOF, the parties have executed this Agreement.</p>",
    ].join("");

    render(
      <SimpleProFinalReviewScreen
        agreementHtml={longBodyHtml}
        canonicalPaidProReview
        paidReviewPlain={[
          "This AI Workflow Setup Services Agreement",
          "Limitation of Liability",
          "IN WITNESS WHEREOF",
          "x".repeat(11_500),
        ].join("\n")}
        signaturePrimaryLabel="Add signer details"
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );

    const documentShell = screen.getByTestId("simple-pro-final-review-document");
    expect(within(documentShell).getByText(/This AI Workflow Setup Services Agreement/)).toBeTruthy();
    expect(within(documentShell).getByText(/Limitation of Liability/)).toBeTruthy();
    expect(within(documentShell).getByText(/IN WITNESS WHEREOF/)).toBeTruthy();
    expect(screen.queryByText(/Agreement preview is not available/i)).toBeNull();
    expect(screen.queryByText(/Finalizing secure agreement version/i)).toBeNull();

    const article = screen.getByTestId("premium-agreement-readonly-article");
    expect(article.className).toContain("overflow-visible");
    expect(article.className).not.toContain("max-h-[");
    expect(article.className).not.toContain("overflow-y-auto");
    const actions = screen.getByTestId("simple-pro-final-review-actions");
    expect(documentShell.contains(actions)).toBe(false);
    expect(actions.textContent).toContain("Add signer details");
    expect(screen.getByTestId("simple-pro-final-review-signers-required").textContent).toContain(
      "Add signer details before continuing.",
    );
    expect(screen.queryByTestId("simple-pro-send-for-review")).toBeNull();
    expect(screen.queryByTestId("simple-pro-change-signing-order")).toBeNull();
    cleanup();
  });

  it("canonical paid Pro review never renders a guided 'Draft ready to review' refine block", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml={`<p>${"Paid Pro authoritative clause. ".repeat(200)}</p>`}
        canonicalPaidProReview
        paidReviewPlain={`PRO AGREEMENT body. ${"Substantive clause. ".repeat(900)}`}
        appliedChecklist={[]}
        appliedAnswerCount={0}
        signaturePrimaryLabel="Add signer details"
        onBackToSignerDetails={vi.fn()}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    // No guided/free refinement surface may leak onto the paid Pro review.
    expect(screen.queryByText(/Draft ready to review/i)).toBeNull();
    expect(screen.queryByText(/Ready to create links/i)).toBeNull();
    expect(screen.queryByTestId("simple-pro-applied-updates-card")).toBeNull();
    expect(screen.queryByText(/Finalizing secure agreement version/i)).toBeNull();
    // Signers incomplete: CTA stays "Add signer details", not a links/continue prompt.
    expect(screen.getByTestId("simple-pro-final-review-actions").textContent).toContain(
      "Add signer details",
    );
    cleanup();
  });

  it("signer-setup typing surface: canonical paid Pro review shows the SoT body, no guided/free/starter mounts", () => {
    // Decorative chrome (tiny HTML) must never become the document body; the SoT plain wins.
    const sotPlain = `PRO AGREEMENT body. ${"Substantive operative clause. ".repeat(600)}`;
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>e-sign card</p>"
        canonicalPaidProReview
        paidReviewPlain={sotPlain}
        signaturePrimaryLabel="Add signer details"
        onBackToSignerDetails={vi.fn()}
        onSendForSignature={vi.fn()}
        onSendForReview={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
      />,
    );
    const documentShell = screen.getByTestId("simple-pro-final-review-document");
    // Full SoT body is rendered (not the ~28-char decorative card).
    expect(documentShell.textContent || "").toContain("Substantive operative clause.");
    expect((documentShell.textContent || "").length).toBeGreaterThan(5_000);
    // No guided / free / starter surfaces leak onto the paid Pro signer-setup review.
    expect(screen.queryByText(/Draft ready to review/i)).toBeNull();
    expect(screen.queryByText(/Ready to create links/i)).toBeNull();
    expect(screen.queryByTestId("simple-pro-applied-updates-card")).toBeNull();
    expect(screen.queryByText(/STARTER DRAFT/i)).toBeNull();
    expect(screen.queryByText(/Continue with Pro/i)).toBeNull();
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

  it("shows signing-token config copy with operator hint and back only (no retry loop)", () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffError={REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE}
        reviewFirstSigningTokenSecretMissing
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
    expect(screen.getByTestId("review-first-env-config-hint")).toBeTruthy();
    expect(screen.queryByTestId("simple-pro-review-first-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("simple-pro-review-first-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("enables retry for non-config mint failures when handler provided", () => {
    const onRetry = vi.fn();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Body</p>"
        reviewFirstHandoffError="Review links could not be created. Check recipient details and try again."
        onRetryReviewFirstHandoff={onRetry}
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
    fireEvent.click(screen.getByTestId("simple-pro-review-first-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
