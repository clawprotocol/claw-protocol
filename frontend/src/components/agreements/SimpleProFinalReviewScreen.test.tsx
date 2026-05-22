/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SimpleProFinalReviewScreen } from "./SimpleProFinalReviewScreen";

describe("SimpleProFinalReviewScreen", () => {
  it("renders required title, CTAs, and suggest changes", () => {
    render(
      <SimpleProFinalReviewScreen
        agreementHtml="<p>Full agreement body</p>"
        onContinueToSigning={vi.fn()}
        onCopyAgreement={vi.fn()}
        onExportAgreement={vi.fn()}
        onSuggestEditsDraftChange={vi.fn()}
        onApplySuggestEdits={vi.fn()}
        onUploadFile={vi.fn()}
      />,
    );
    expect(screen.getByText("Review your updated Pro agreement")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-continue-to-signing")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-copy-agreement")).toBeTruthy();
    expect(screen.getByTestId("simple-pro-export-agreement")).toBeTruthy();
    fireEvent.click(screen.getByTestId("simple-pro-suggest-changes-toggle"));
    expect(screen.getByTestId("simple-pro-suggest-edits-card")).toBeTruthy();
    cleanup();
  });
});
