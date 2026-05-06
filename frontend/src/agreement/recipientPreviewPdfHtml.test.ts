import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildRecipientRedlinePdfHtml } from "./recipientPreviewPdfHtml";

describe("buildRecipientRedlinePdfHtml", () => {
  it("emits inline insert/delete styling and no CLAW branding", () => {
    const vm = buildLegalRedlineDocumentViewModel("Fee is due on receipt.", "Fee is Net 30.");
    const html = buildRecipientRedlinePdfHtml(vm);
    expect(html.toUpperCase()).not.toContain("CLAW");
    expect(html).toMatch(/text-decoration:underline/i);
    expect(html).toMatch(/line-through/i);
    expect(html).toContain("<article");
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
});
