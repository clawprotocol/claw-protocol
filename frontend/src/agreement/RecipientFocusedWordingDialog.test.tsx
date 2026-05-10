/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipientFocusedWordingDialog } from "./RecipientFocusedWordingDialog";
import { RECIPIENT_FOCUS_COMPARE_MULTI_SECTION_SUMMARY, RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE } from "./portableReviewCopy";

describe("RecipientFocusedWordingDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("compare fallback hides bogus prior/revised panels when sides are not meaningful", () => {
    render(
      <RecipientFocusedWordingDialog
        open
        variant="compare_fallback"
        sectionTitle="Best matching section"
        sectionSubline="Payment terms updated"
        businessNote="Cash timing"
        oldText="WEB DEVELOPMENT AGREEMENT"
        newText="—"
        onClose={() => {}}
        onOpenFullRedline={vi.fn()}
      />,
    );
    expect(String(screen.getByTestId("recipient-focused-wording-fallback-summary").textContent)).toContain(
      RECIPIENT_FOCUS_COMPARE_MULTI_SECTION_SUMMARY.slice(0, 40),
    );
    expect(screen.queryByText("Prior wording")).toBeNull();
  });

  it("compare fallback shows panels when both sides are meaningful clause excerpts", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <RecipientFocusedWordingDialog
        open
        variant="compare_fallback"
        sectionTitle="Best matching section"
        sectionSubline="Payment"
        oldText="Fees are Net 30 from invoice date with standard late terms."
        newText="Fees are Net 45 from invoice date with suspension after notice."
        onClose={() => {}}
        onOpenFullRedline={onOpen}
      />,
    );
    expect(screen.queryByTestId("recipient-focused-wording-fallback-summary")).toBeNull();
    await user.click(screen.getByRole("button", { name: RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE }));
    expect(onOpen).toHaveBeenCalled();
  });
});
