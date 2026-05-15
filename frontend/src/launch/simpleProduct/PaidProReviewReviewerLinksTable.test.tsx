/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaidProReviewReviewerLinksTable } from "./PaidProReviewReviewerLinksTable";
import type { ReviewerLinkRow } from "./reviewerLinkRowModel";

describe("PaidProReviewReviewerLinksTable", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
  });

  it("Open reviewer view passes row 2 href to window.open", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const rows: ReviewerLinkRow[] = [
      {
        displayName: "A",
        reviewHref: "https://example.com/review?a=1&t=tok_a",
        party_name: "Party A",
        party_index: 1,
        recipientPartyId: "p-a",
      },
      {
        displayName: "B",
        reviewHref: "https://example.com/review?b=1&t=tok_b",
        party_name: "Party B",
        party_index: 2,
        recipientPartyId: "p-b",
      },
    ];
    const statuses: Array<"waiting" | "approved" | "requested_changes" | "not_participating"> = [
      "approved",
      "waiting",
    ];

    render(
      <PaidProReviewReviewerLinksTable
        rows={rows}
        statuses={statuses}
        rowCopyFlashByKey={{}}
        onCopyRow={() => {}}
        onOpenRow={(href) => {
          if (href.trim()) window.open(href, "_blank", "noopener,noreferrer");
        }}
      />,
    );

    await userEvent.click(within(screen.getByTestId("paid-pro-reviewer-links-table")).getByTestId("paid-pro-reviewer-open-1"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/review?b=1&t=tok_b",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
