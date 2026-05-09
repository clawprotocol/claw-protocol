/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecipientHumanReviewSummary } from "./RecipientHumanReviewSummary";
import { RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS } from "./portableReviewCopy";

describe("RecipientHumanReviewSummary", () => {
  it("surfaces nothing-sent trust line and review focus before key revisions", () => {
    render(
      <RecipientHumanReviewSummary
        headline="Sarah proposed 6 meaningful revisions."
        keyUpdatesLabel="6 key updates"
        importantBullets={["payment timing updated"]}
        clarificationBullets={[]}
        negativeAssurances={["governing law"]}
        recommendedFocusLines={["payment timing", "ownership"]}
        confidenceHeadline="Compare confidence: High"
        confidenceBody="High-confidence read."
      />,
    );
    expect(screen.getByText(RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS)).toBeTruthy();
    const summary = screen.getByTestId("recipient-human-review-summary").textContent ?? "";
    const idxFocus = summary.indexOf("Review focus");
    const idxKey = summary.indexOf("Key revisions");
    expect(idxFocus).toBeGreaterThan(-1);
    expect(idxKey).toBeGreaterThan(-1);
    expect(idxFocus).toBeLessThan(idxKey);
    cleanup();
  });
});
