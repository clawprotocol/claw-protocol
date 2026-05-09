import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { collapseRecipientRedlineDuplicateInsertBlocks } from "./recipientRedlineDisplayDedupe";

describe("collapseRecipientRedlineDuplicateInsertBlocks", () => {
  it("returns the same VM for short proposed text (no-op guard)", () => {
    const cur = "Short.";
    const prop = "Short revised.";
    const vm = buildLegalRedlineDocumentViewModel(cur, prop);
    const out = collapseRecipientRedlineDuplicateInsertBlocks(vm, prop);
    expect(out.blocks.length).toBe(vm.blocks.length);
  });
});
