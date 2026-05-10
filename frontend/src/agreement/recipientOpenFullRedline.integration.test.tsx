/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import { RecipientFocusedWordingDialog } from "./RecipientFocusedWordingDialog";
import { getScrollTargetBlockIdForSemanticOrFallback } from "./recipientBusinessReviewCardsModel";
import { scrollRecipientRedlineClausePanel } from "./recipientRedlineDomScroll";
import { recipientSemanticAnchorForBlockId } from "./recipientWholeDocSemanticRender";

function OpenRedlineHarnessFromDialog(): ReactElement {
  const vm = useRef(
    applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(
        "WEB DEVELOPMENT AGREEMENT\n\nBackground and Purpose\nContext.\n\n2. Payment\nNet 30.",
        "WEB DEVELOPMENT AGREEMENT\n\nBackground and Purpose\nContext.\n\n2. Payment\nNet 45 from invoice.",
      ),
    ),
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const [scrollMatched, setScrollMatched] = useState<string>("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleOpen = useCallback(async () => {
    setAuditOpen(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await new Promise<void>((r) => setTimeout(r, 30));
    const bid = getScrollTargetBlockIdForSemanticOrFallback(vm.current, "payment_terms");
    expect(bid).toBeTruthy();
    const outcome = await scrollRecipientRedlineClausePanel({
      root: scrollRef.current,
      detailsBoundary: scrollRef.current,
      semanticAnchorId: bid ? recipientSemanticAnchorForBlockId(bid) : null,
      blockId: bid,
      onHighlight: () => {},
      highlightClearMs: 40,
    });
    setScrollMatched(outcome.matchedBy);
  }, []);

  return (
    <>
      <RecipientFocusedWordingDialog
        open
        variant="compare_fallback"
        sectionTitle="Payment"
        sectionSubline="2. Payment"
        oldText="Fees are Net 30 from invoice date with standard late terms."
        newText="Fees are Net 45 from invoice date with suspension after notice."
        onClose={() => {}}
        onOpenFullRedline={handleOpen}
      />
      {auditOpen ? (
        <details data-testid="recipient-audit-mode-details" open>
          <summary>audit</summary>
          <span data-testid="recipient-test-scroll-matched-by" style={{ display: "none" }}>
            {scrollMatched}
          </span>
          <div data-testid="recipient-suggested-changes-document">
            <div
              ref={scrollRef}
              data-testid="recipient-redline-scrollport"
              style={{ height: 120, overflow: "auto", position: "relative" }}
            >
              <div style={{ height: 500 }}>spacer</div>
              <div
                data-recipient-semantic-anchor={recipientSemanticAnchorForBlockId(
                  getScrollTargetBlockIdForSemanticOrFallback(vm.current, "payment_terms")!,
                )}
                data-block-id={getScrollTargetBlockIdForSemanticOrFallback(vm.current, "payment_terms")!}
                style={{ height: 40, border: "1px solid red" }}
              >
                payment clause
              </div>
            </div>
          </div>
        </details>
      ) : null}
    </>
  );
}

describe("Open in full redline (integration harness)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("from focused dialog: opens audit details, scrollport exists, scroll reaches payment anchor", async () => {
    render(<OpenRedlineHarnessFromDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("recipient-focused-wording-open-redline"));
    await waitFor(() => {
      expect(screen.getByTestId("recipient-audit-mode-details")).toBeTruthy();
    });
    expect(screen.getByTestId("recipient-redline-scrollport")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("recipient-test-scroll-matched-by").textContent).not.toBe("idle");
    });
    expect(["semantic", "block"]).toContain(screen.getByTestId("recipient-test-scroll-matched-by").textContent);
    expect(screen.queryByTestId("recipient-focused-wording-fallback-summary")).toBeNull();
  });
});
