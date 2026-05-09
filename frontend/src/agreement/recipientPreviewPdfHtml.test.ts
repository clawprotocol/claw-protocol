import { describe, expect, it } from "vitest";
import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildLegalRedlineDocumentViewModel, mergeAdjacentRedlineSegmentsAllTypes } from "./legalRedlineBlocks";
import {
  RECIPIENT_EXPORT_PDF_APPENDIX_EXTRACTED_NOTES_HEADING,
  RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE,
  RECIPIENT_EXPORT_SECTION_SUBSTANTIALLY_REVISED,
} from "./portableReviewCopy";
import {
  buildRecipientRedlinePdfHtml,
  sanitizeHtmlForRecipientPdfExport,
  wrapRecipientVersionPdfHtml,
} from "./recipientPreviewPdfHtml";

function statsForBlocks(blocks: LegalRedlineBlock[]): LegalRedlineDocumentViewModel["stats"] {
  let insertCount = 0;
  let deleteCount = 0;
  let sameCount = 0;
  let segmentCount = 0;
  let changedBlockCount = 0;
  for (const b of blocks) {
    insertCount += b.insertCount;
    deleteCount += b.deleteCount;
    sameCount += b.sameCount;
    segmentCount += b.segments.length;
    if (b.hasChange) changedBlockCount++;
  }
  return {
    blockCount: blocks.length,
    changedBlockCount,
    insertCount,
    deleteCount,
    sameCount,
    segmentCount,
    currentLen: 800,
    proposedLen: 800,
  };
}

describe("mergeAdjacentRedlineSegmentsAllTypes", () => {
  it("merges consecutive insert and delete chains", () => {
    expect(
      mergeAdjacentRedlineSegmentsAllTypes([
        { type: "delete", text: "on receipt" },
        { type: "delete", text: " and late fees" },
        { type: "insert", text: "Net 30" },
      ]),
    ).toEqual([
      { type: "delete", text: "on receipt and late fees" },
      { type: "insert", text: "Net 30" },
    ]);
  });
});

describe("buildRecipientRedlinePdfHtml", () => {
  const auditTs = new Date(2026, 4, 6, 21, 24, 0);

  it("emits inline insert/delete styling without slab backgrounds per line token", () => {
    const vm = buildLegalRedlineDocumentViewModel("Fee is due on receipt.", "Fee is Net 30.");
    const html = buildRecipientRedlinePdfHtml(vm);
    expect(html.toUpperCase()).not.toContain("CLAW");
    expect(html).toMatch(/text-decoration:underline/i);
    expect(html).toMatch(/line-through/i);
    expect(html).toContain("<article");
    /** Flowing paragraph: multiple spans inside one <p> when no \\n\\n between segments */
    const pOpenCount = (html.match(/<p style=/g) ?? []).length;
    expect(pOpenCount).toBeGreaterThanOrEqual(1);
  });

  it("flows adjacent word-diff segments in shared paragraphs (fewer isolated slabs)", () => {
    const vm = buildLegalRedlineDocumentViewModel(
      "Payment is due on receipt. Late fees apply.",
      "Payment is Net 30. Late fees apply.",
    );
    const html = buildRecipientRedlinePdfHtml(vm);
    /** Should not explode into dozens of top-level block wrappers per micro-token */
    expect((html.match(/<\/p>/g) ?? []).length).toBeLessThan(80);
  });

  it("places structured human review before section A in the HTML stream", () => {
    const vm = buildLegalRedlineDocumentViewModel("Fee is due on receipt.", "Fee is Net 30.");
    const html = buildRecipientRedlinePdfHtml(
      vm,
      {
        agreementId: "ag_x",
        agreementTitle: "T",
        reviewerDisplayName: "Pat",
        reviewerEmail: null,
        generatedAt: auditTs,
      },
      {
        structuredHumanReview: {
          headlinePlain: "Pat proposed 2 meaningful revisions.",
          importantBullets: ["payment timing updated"],
          clarificationBullets: [],
          negativeAssuranceLines: ["No governing law changes."],
          recommendedFocusLines: [],
          confidenceHeadline: "Compare confidence: High",
          confidenceBody: "Major sections matched successfully.",
          nothingSentFootnote: "Nothing is sent until the sender accepts.",
        },
      },
    );
    const idxHuman = html.indexOf("Pat proposed 2 meaningful revisions");
    const idxA = html.indexOf(RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE);
    expect(idxHuman).toBeGreaterThan(-1);
    expect(idxA).toBeGreaterThan(-1);
    expect(idxHuman).toBeLessThan(idxA);
  });

  it("suppresses duplicate block headers when the same label repeats", () => {
    const vm: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "t1",
          kind: "title",
          label: "Master Services Agreement",
          segments: [{ type: "same", text: "Intro A." }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
        },
        {
          id: "t2",
          kind: "title",
          label: "Master Services Agreement",
          segments: [{ type: "insert", text: "Intro B." }],
          insertCount: 1,
          deleteCount: 0,
          sameCount: 0,
          hasInsert: true,
          hasDelete: false,
          hasChange: true,
        },
      ],
      stats: {
        blockCount: 2,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 0,
        sameCount: 1,
        segmentCount: 2,
        currentLen: 1,
        proposedLen: 1,
      },
      hasChanges: true,
    };
    const html = buildRecipientRedlinePdfHtml(vm);
    const upper = html.toUpperCase();
    const first = upper.indexOf("MASTER SERVICES AGREEMENT");
    const second = upper.indexOf("MASTER SERVICES AGREEMENT", first + 1);
    /** Second block should not repeat the uppercase section header row */
    expect(second).toBe(-1);
  });

  it("includes human summary and reviewer appendix when extras provided", () => {
    const vm = buildLegalRedlineDocumentViewModel("Fee is due on receipt.", "Fee is Net 30.");
    const html = buildRecipientRedlinePdfHtml(
      vm,
      {
        agreementId: "ag_x",
        agreementTitle: "T",
        reviewerDisplayName: "Sarah Collins",
        reviewerEmail: null,
        generatedAt: auditTs,
      },
      {
        summaryHtml: "<p>Focused edits to payment timing.</p><ul><li>Payment terms updated</li></ul>",
        reviewerNotesPlain: "Please confirm by Friday.",
      },
    );
    expect(html).toContain("Summary");
    expect(html).toContain(RECIPIENT_EXPORT_PDF_SECTION_DETAILED_REDLINE);
    expect(html).toContain(RECIPIENT_EXPORT_PDF_APPENDIX_EXTRACTED_NOTES_HEADING);
    expect(html).toContain("Please confirm by Friday.");
  });

  it("does not use internal audit reference wording in optional appendix titles", () => {
    const vm = buildLegalRedlineDocumentViewModel("a", "b");
    const html = buildRecipientRedlinePdfHtml(
      vm,
      null,
      {
        technicalAppendixPlain: "For reference: 1 additions.",
      },
    );
    expect(html).not.toMatch(/audit reference/i);
    expect(html).toMatch(/reference counts/i);
  });

  it("includes audit metadata when provided", () => {
    const vm = buildLegalRedlineDocumentViewModel("a", "b");
    const html = buildRecipientRedlinePdfHtml(vm, {
      agreementId: "ag_review_export",
      agreementTitle: "Web Development Agreement",
      reviewerDisplayName: "Sarah Collins",
      reviewerEmail: "sarah@example.com",
      generatedAt: auditTs,
    });
    expect(html).toContain("Redline Review PDF");
    expect(html).toContain("Generated by LawDog Review Export");
    expect(html).toContain("Reviewer:");
    expect(html).toContain("Sarah Collins");
    expect(html).toContain("sarah@example.com");
    expect(html).toContain("Agreement:");
    expect(html).toContain("Web Development Agreement");
    expect(html).toContain("ID: ag_review_export");
  });

  it("returns a minimal article when there are no blocks", () => {
    const html = buildRecipientRedlinePdfHtml({
      blocks: [],
      stats: {
        blockCount: 0,
        changedBlockCount: 0,
        insertCount: 0,
        deleteCount: 0,
        sameCount: 0,
        segmentCount: 0,
        currentLen: 0,
        proposedLen: 0,
      },
      hasChanges: false,
    });
    expect(html).toContain("No redline content.");
  });

  it("Sarah Collins–style export: does not replay duplicate title, draft label, or signature boilerplate", () => {
    const body =
      "WEB DEVELOPMENT AGREEMENT\n\nDraft Agreement (non-binding template)\n\n1. Parties. Client Anthem Blanchard and Developer Sarah Collins.\n\n" +
      "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.\n\n" +
      "_________________________\nSarah Collins, Developer";
    const block = (id: string, label: string): LegalRedlineBlock => ({
      id,
      kind: "paragraph",
      label,
      segments: [{ type: "same", text: body }],
      insertCount: 0,
      deleteCount: 0,
      sameCount: 1,
      hasInsert: false,
      hasDelete: false,
      hasChange: false,
    });
    const blocks = [block("dup-a", "Preamble"), block("dup-b", "Repeated preamble")];
    const vm: LegalRedlineDocumentViewModel = {
      blocks,
      stats: statsForBlocks(blocks),
      hasChanges: false,
    };
    const html = buildRecipientRedlinePdfHtml(vm, null, { exportCompareConfidenceLevel: "high" });
    expect((html.match(/WEB DEVELOPMENT AGREEMENT/g) ?? []).length).toBe(1);
    expect((html.match(/Draft Agreement \(non-binding template\)/g) ?? []).length).toBe(1);
    expect((html.match(/IN WITNESS WHEREOF/gi) ?? []).length).toBe(1);
    expect((html.match(/Sarah Collins, Developer/g) ?? []).length).toBe(1);
  });

  it("low compare confidence collapses the first dense changed block to a signer-safe summary line", () => {
    const denseSegs = [
      ...Array.from({ length: 7 }, (_, i) => ({ type: "delete" as const, text: `oldbit${i} ` })),
      ...Array.from({ length: 7 }, (_, i) => ({ type: "insert" as const, text: `newbit${i} ` })),
    ];
    const blocks: LegalRedlineBlock[] = [
      {
        id: "dense-1",
        kind: "clause",
        label: "2. Fees and Payment",
        segments: denseSegs,
        insertCount: 7,
        deleteCount: 7,
        sameCount: 0,
        hasInsert: true,
        hasDelete: true,
        hasChange: true,
      },
      {
        id: "dense-2",
        kind: "clause",
        label: "3. Other",
        segments: [
          { type: "delete", text: "x" },
          { type: "insert", text: "y" },
        ],
        insertCount: 1,
        deleteCount: 1,
        sameCount: 0,
        hasInsert: true,
        hasDelete: true,
        hasChange: true,
      },
    ];
    const vm: LegalRedlineDocumentViewModel = {
      blocks,
      stats: statsForBlocks(blocks),
      hasChanges: true,
    };
    const html = buildRecipientRedlinePdfHtml(vm, null, { exportCompareConfidenceLevel: "low" });
    expect(html).toContain(RECIPIENT_EXPORT_SECTION_SUBSTANTIALLY_REVISED);
    expect(html.split(RECIPIENT_EXPORT_SECTION_SUBSTANTIALLY_REVISED).length - 1).toBe(1);
  });

  it("starts a new PDF paragraph when a segment contains \\n\\n", () => {
    const vm: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "single-block",
          kind: "paragraph",
          label: "Clause",
          segments: [{ type: "same", text: "First paragraph.\n\nSecond paragraph." }],
          insertCount: 0,
          deleteCount: 0,
          sameCount: 1,
          hasInsert: false,
          hasDelete: false,
          hasChange: false,
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 0,
        insertCount: 0,
        deleteCount: 0,
        sameCount: 1,
        segmentCount: 1,
        currentLen: 0,
        proposedLen: 0,
      },
      hasChanges: false,
    };
    const html = buildRecipientRedlinePdfHtml(vm);
    expect(html).toMatch(/<\/p>\s*<p style=/);
  });
});

describe("wrapRecipientVersionPdfHtml + sanitize", () => {
  it("wraps clean versions without scripts", () => {
    const html = wrapRecipientVersionPdfHtml('<p onclick="evil()">Hi</p><script>x</script>');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("article");
    expect(html).toContain("<p");
  });

  it("sanitize strips scripts", () => {
    expect(sanitizeHtmlForRecipientPdfExport('<p>x</p><script>1</script>')).not.toContain("<script");
  });

  it("does not use redline styling or audit header — original/proposed exports are single-version HTML only", () => {
    const html = wrapRecipientVersionPdfHtml("<p>Baseline agreement text only.</p>");
    expect(html).not.toMatch(/line-through/i);
    expect(html).not.toMatch(/Redline Review PDF/);
    expect(html).not.toMatch(/text-decoration:underline/i);
  });
});
