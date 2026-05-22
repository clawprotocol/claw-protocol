/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

describe("SimpleProFinalReviewScreen", () => {
  it("renders trust copy, primary send CTAs, and collapsed edit", () => {
    const onSendForSignature = vi.fn();
    const onSendForReview = vi.fn();
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Full agreement body</p>"
        appliedAnswerCount={5}
        onSendForSignature={onSendForSignature}
        onSendForReview={onSendForReview}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onSuggestEditsDraftChange={vi.fn()}
        onApplySuggestEdits={vi.fn()}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByText("Review your updated Pro agreement")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-final-review-trust-line").textContent).toContain("5 answers applied");
    expect(screen.getByText("This is the version that will be sent.")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-send-for-signature")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-send-for-review")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-copy-agreement")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-export-agreement")).toBeTruthy();
    expect(screen.queryByTestId("simple-pro-continue-to-signing")).toBeNull();
    expect(screen.queryByTestId("simple-pro-suggest-changes-toggle")).toBeNull();
    fireEvent.click(screen.getByTestId("simple-pro-send-for-signature"));
    expect(onSendForSignature).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("simple-pro-send-for-review"));
    expect(onSendForReview).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("simple-pro-edit-before-sending-toggle"));
    expect(screen.getByTestId("simple-pro-edit-before-sending-card")).toBeTruthy();
    expect(screen.getByLabelText("Edit or paste changes before sending")).toBeTruthy();
    cleanup();
  });
});
