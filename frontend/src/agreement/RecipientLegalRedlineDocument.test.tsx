/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  RecipientLegalRedlineDocument,
  splitSegmentTextToParagraphLines,
  lineLooksLikeSectionHeading,
} from "./RecipientLegalRedlineDocument";
import {
  RECIPIENT_BUSINESS_REVIEW_GROUPED_READABILITY,
  RECIPIENT_SHOW_ADVANCED_LEGAL_MARKUP,
} from "./portableReviewCopy";

describe("splitSegmentTextToParagraphLines", () => {
  it("splits double newlines into separate paragraph blocks", () => {
    expect(splitSegmentTextToParagraphLines("First block.\n\nSecond block.")).toEqual([
      ["First block."],
      ["Second block."],
    ]);
  });

  it("preserves single newlines as multiple lines within one paragraph", () => {
    expect(splitSegmentTextToParagraphLines("Line one\nLine two")).toEqual([["Line one", "Line two"]]);
  });
});

describe("lineLooksLikeSectionHeading", () => {
  it("detects short numbered title lines only", () => {
    expect(lineLooksLikeSectionHeading("3. Compensation and Payment")).toBe(true);
    expect(lineLooksLikeSectionHeading("3.1 Payment Schedule")).toBe(true);
    expect(lineLooksLikeSectionHeading("Plain sentence.")).toBe(false);
  });

  it("rejects merged heading+body paragraphs so same-line typography stays normal", () => {
    const merged =
      "2. Fees and Payment 2.1 Total Project Fee. The total fee for the services under this Agreement is Seven Thousand Five Hundred Dollars (US $7,500).";
    expect(lineLooksLikeSectionHeading(merged)).toBe(false);
  });
});

describe("RecipientLegalRedlineDocument", () => {
  afterEach(() => cleanup());

  it("renders insert with data-redline insert and legal highlight class", () => {
    render(<RecipientLegalRedlineDocument segments={[{ type: "insert", text: "Net 30" }]} />);
    const root = screen.getByTestId("recipient-legal-redline-document");
    const el = root.querySelector('[data-redline="insert"]');
    expect(el).toBeTruthy();
    expect(el?.className).toMatch(/recipient-legal-redline-insert/);
    expect(el?.textContent).toContain("Net 30");
  });

  it("renders delete with data-redline delete, highlight class, and line-through", () => {
    render(<RecipientLegalRedlineDocument segments={[{ type: "delete", text: "old terms" }]} />);
    const root = screen.getByTestId("recipient-legal-redline-document");
    const el = root.querySelector('[data-redline="delete"]');
    expect(el).toBeTruthy();
    expect(el?.className).toMatch(/recipient-legal-redline-delete/);
    expect(el?.className).toMatch(/line-through/);
  });

  it("renders same segments with data-redline same", () => {
    render(<RecipientLegalRedlineDocument segments={[{ type: "same", text: "Unchanged " }]} />);
    expect(screen.getByTestId("recipient-legal-redline-document").querySelector('[data-redline="same"]')).toBeTruthy();
  });

  it("does not collapse double newlines into a single line element", () => {
    render(
      <RecipientLegalRedlineDocument
        segments={[{ type: "same", text: "Paragraph A.\n\nParagraph B." }]}
      />,
    );
    const root = screen.getByTestId("recipient-legal-redline-document");
    const blocks = root.querySelectorAll(".recipient-legal-redline-same");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("does not apply heading-only chrome to merged numbered+body same text", () => {
    const merged =
      "2. Fees and Payment 2.1 Total Project Fee. The total fee for the services under this Agreement is Seven Thousand Five Hundred Dollars (US $7,500).";
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "pay",
          kind: "paragraph",
          segments: [
            { type: "same", text: merged },
            { type: "delete", text: "upon receipt" },
            { type: "insert", text: "Net 30" },
            { type: "same", text: " for payment." },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 2,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
          label: "payment",
        },
        {
          id: "caps",
          kind: "paragraph",
          segments: [{ type: "same", text: "CONFIDENTIALITY. Recipient shall not disclose." }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
          label: "caps",
        },
        {
          id: "sig",
          kind: "signature",
          segments: [{ type: "same", text: "IN WITNESS WHEREOF, the parties execute below." }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
          label: "sig",
        },
        {
          id: "foot",
          kind: "paragraph",
          segments: [{ type: "same", text: "Created with LawDog — Draft for Review." }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
          label: "footer",
        },
      ],
      stats: {
        blockCount: 4,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 1,
        sameCount: 4,
        segmentCount: 6,
        currentLen: 1,
        proposedLen: 1,
      },
      hasChanges: true,
    };
    render(<RecipientLegalRedlineDocument document={document} variant="suggested" />);
    const root = screen.getByTestId("recipient-legal-redline-document");
    const sameSpans = root.querySelectorAll('[data-redline="same"]');
    const mergedSame = [...sameSpans].find((el) => (el.textContent || "").includes("2. Fees and Payment"));
    expect(mergedSame).toBeTruthy();
    expect(mergedSame?.className).toMatch(/font-normal/);
    expect(mergedSame?.className).not.toMatch(/font-semibold/);

    const ins = root.querySelector('[data-redline="insert"]');
    expect(ins?.textContent).toMatch(/Net\s*30/i);
    expect(ins?.textContent).not.toMatch(/IN WITNESS WHEREOF/i);
    expect(ins?.textContent).not.toMatch(/LawDog/i);
    const del = root.querySelector('[data-redline="delete"]');
    expect(del?.textContent).toMatch(/upon receipt/i);
  });

  it("keeps standalone short numbered titles on same segments at normal weight (no injected semibold)", () => {
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "h1",
          kind: "paragraph",
          segments: [{ type: "same", text: "2. FEES AND PAYMENT" }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
          label: "h",
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 0,
        insertCount: 0,
        deleteCount: 0,
        sameCount: 1,
        segmentCount: 1,
        currentLen: 1,
        proposedLen: 1,
      },
      hasChanges: false,
    };
    render(<RecipientLegalRedlineDocument document={document} variant="suggested" />);
    const el = screen.getByTestId("recipient-legal-redline-document").querySelector('[data-redline="same"]');
    expect(el?.textContent).toContain("2. FEES");
    expect(el?.className).toMatch(/font-normal/);
    expect(el?.className).not.toMatch(/font-semibold/);
  });

  it("changed-only mode does not render blocks with isMeaningfullyChanged false", () => {
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "ghost",
          kind: "paragraph",
          label: "Ghost",
          segments: [
            { type: "delete", text: "old" },
            { type: "insert", text: "new" },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 0,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
          isMeaningfullyChanged: false,
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 1,
        sameCount: 0,
        segmentCount: 2,
        currentLen: 3,
        proposedLen: 3,
      },
      hasChanges: true,
    };
    render(<RecipientLegalRedlineDocument document={document} variant="suggested" hideUnchangedBlocks />);
    expect(screen.queryByTestId("recipient-redline-changed-block")).toBeNull();
  });

  it("wraps suggested non-panel changes in a closed Show advanced legal markup disclosure", () => {
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "c32",
          kind: "clause",
          clauseNumber: "3.2",
          currentText: "Due on receipt.",
          proposedText: "Due Net 30.",
          segments: [
            { type: "same", text: "Due " },
            { type: "delete", text: "on receipt" },
            { type: "insert", text: "Net 30" },
            { type: "same", text: "." },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 2,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
          isMeaningfullyChanged: true,
          label: "3.2",
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 0,
        sameCount: 2,
        segmentCount: 3,
        currentLen: 10,
        proposedLen: 12,
      },
      hasChanges: true,
    };
    render(<RecipientLegalRedlineDocument document={document} variant="suggested" />);
    expect(screen.getByTestId("recipient-redline-clause-inline-wrap")).toBeTruthy();
    expect(screen.getByText(RECIPIENT_SHOW_ADVANCED_LEGAL_MARKUP)).toBeTruthy();
  });

  it("renders block document model as multiple sections with insert markers", () => {
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "t0",
          kind: "title",
          segments: [{ type: "same", text: "Services Agreement" }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
          label: "Services Agreement",
        },
        {
          id: "c32",
          kind: "clause",
          clauseNumber: "3.2",
          segments: [
            { type: "same", text: "Due " },
            { type: "insert", text: "Net 30" },
            { type: "same", text: "." },
          ],
          insertCount: 1,
          deleteCount: 0,
          sameCount: 2,
          hasInsert: true,
          hasDelete: false,
          hasChange: true,
          label: "3.2",
        },
      ],
      stats: {
        blockCount: 2,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 0,
        sameCount: 2,
        segmentCount: 3,
        currentLen: 10,
        proposedLen: 12,
      },
      hasChanges: true,
    };
    render(<RecipientLegalRedlineDocument document={document} />);
    const root = screen.getByTestId("recipient-legal-redline-document");
    expect(root.querySelectorAll('[data-testid="recipient-legal-redline-block"]').length).toBe(1);
    expect(root.querySelectorAll('[data-testid="recipient-redline-changed-block"]').length).toBe(1);
    const ins = root.querySelector('[data-redline="insert"]');
    expect(ins?.textContent).toContain("Net 30");
  });

  it("adds data-recipient-redline-anchor for narrow payment timing + pause inserts", () => {
    const pause =
      "If payment is more than fifteen (15) days late, Developer may pause work until all overdue undisputed amounts are paid.";
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "pay",
          kind: "paragraph",
          segments: [
            { type: "same", text: "Invoices are payable " },
            { type: "delete", text: "upon receipt" },
            { type: "insert", text: `Net 30. ${pause}` },
            { type: "same", text: "." },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 2,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
          label: "Payment",
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 1,
        sameCount: 2,
        segmentCount: 4,
        currentLen: 1,
        proposedLen: 1,
      },
      hasChanges: true,
    };
    render(
      <RecipientLegalRedlineDocument
        document={document}
        variant="suggested"
        recipientNarrowIntentAnchors
        highlightedRecipientAnchor="payment_timing"
      />,
    );
    const root = screen.getByTestId("recipient-legal-redline-document");
    expect(root.querySelector('[data-recipient-redline-anchor="payment_timing"]')).toBeTruthy();
    expect(root.querySelector('[data-recipient-redline-anchor="pause_suspend_work"]')).toBeTruthy();
  });

  it("collapses dense micro-diff into summary card with bullets and focused wording callback", () => {
    const segments = Array.from({ length: 6 }, (_, i) =>
      i % 2 === 0
        ? ({ type: "delete" as const, text: `old${i} invoice payable ` })
        : ({ type: "insert" as const, text: `new${i} net 30 fee ` }),
    );
    const document: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "densePay",
          kind: "paragraph",
          label: "3. Payment",
          segments,
          insertCount: 3,
          deleteCount: 3,
          sameCount: 0,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 3,
        deleteCount: 3,
        sameCount: 0,
        segmentCount: 6,
        currentLen: 1,
        proposedLen: 1,
      },
      hasChanges: true,
    };
    const onDense = vi.fn();
    render(
      <RecipientLegalRedlineDocument
        document={document}
        variant="suggested"
        collapseDenseMicroDiff
        onDenseBlockViewExactWording={onDense}
      />,
    );
    const card = screen.getByTestId("recipient-human-section-revised-card");
    expect(card.textContent).toContain("3. Payment substantially revised");
    expect(card.textContent).toContain(RECIPIENT_BUSINESS_REVIEW_GROUPED_READABILITY);
    expect(card.textContent).toContain("Changes include:");
    expect(card.textContent).toMatch(/revised payment timing/i);
    expect(card.textContent).not.toContain("Detailed line comparison is grouped");

    fireEvent.click(screen.getByTestId("recipient-dense-block-view-exact-wording"));
    expect(onDense).toHaveBeenCalledTimes(1);
    expect(onDense.mock.calls[0]![0]).toMatchObject({
      sectionLabel: "3. Payment",
    });
    expect(String(onDense.mock.calls[0]![0].oldText)).toMatch(/old\d/);
    expect(String(onDense.mock.calls[0]![0].newText)).toMatch(/new\d/);
  });
});
