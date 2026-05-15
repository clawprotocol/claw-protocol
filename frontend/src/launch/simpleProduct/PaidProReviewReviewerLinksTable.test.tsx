/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaidProReviewReviewerLinksTable } from "./PaidProReviewReviewerLinksTable";
import type { ReviewerLinkRow } from "./reviewerLinkRowModel";

describe("PaidProReviewReviewerLinksTable", () => {
  it("renders per-row Copy and copies the correct URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    const rows: ReviewerLinkRow[] = [
      {
        displayName: "A",
        reviewHref: "https://example.com/review?a=1&t=tok_a",
        party_name: "Party A",
        recipientEmail: "a@x.com",
      },
      {
        displayName: "B",
        reviewHref: "https://example.com/review?b=1&t=tok_b",
        party_name: "Party B",
        recipientEmail: "b@x.com",
      },
    ];
    const statuses: Array<"waiting" | "approved" | "requested_changes" | "not_participating"> = [
      "waiting",
      "waiting",
    ];
    const flashes: Record<string, boolean> = {};

    render(
      <PaidProReviewReviewerLinksTable
        rows={rows}
        statuses={statuses}
        rowCopyFlashByKey={flashes}
        onCopyRow={(_k, href) => {
          void writeText(href);
        }}
        onOpenRow={() => {}}
      />,
    );

    expect(screen.getByTestId("paid-pro-reviewer-links-table")).toBeTruthy();
    await userEvent.click(screen.getByTestId("paid-pro-reviewer-copy-0"));
    expect(writeText).toHaveBeenCalledWith("https://example.com/review?a=1&t=tok_a");
    await userEvent.click(screen.getByTestId("paid-pro-reviewer-copy-1"));
    expect(writeText).toHaveBeenCalledWith("https://example.com/review?b=1&t=tok_b");
    vi.unstubAllGlobals();
  });
});
