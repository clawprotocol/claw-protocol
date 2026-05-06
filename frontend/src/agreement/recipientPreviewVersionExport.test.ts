import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { legalRedlineDocumentVmToPlainSummary } from "./recipientPreviewVersionExport";

describe("legalRedlineDocumentVmToPlainSummary", () => {
  it("encodes inserts and deletes without HTML", () => {
    const vm = buildLegalRedlineDocumentViewModel("Hello world.", "Hello brave new world.");
    const t = legalRedlineDocumentVmToPlainSummary(vm);
    expect(t).not.toMatch(/<[^>]+>/);
    expect(t.length).toBeGreaterThan(0);
  });
});
