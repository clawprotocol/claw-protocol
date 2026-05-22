/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

describe("SimpleProFinalReviewScreen", () => {
  it("shows applied trust copy and checklist when DOM mutation markers are absent", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Full authoritative agreement body</p>"
        appliedAnswerCount={5}
        appliedChecklist={["Fees & Payment", "Support & SLA", "Ownership", "Termination", "Invoice timing & renewal"]}
        appliedVariableIds={[]}
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
    const checklist = screen.getByTestId("simple-pro-applied-checklist");
    expect(checklist.textContent).toContain("Fees & Payment");
    expect(checklist.textContent).toContain("Support & SLA");
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
});
