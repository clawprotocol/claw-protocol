import { describe, expect, it } from "vitest";
import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { collapseRecipientRedlineDuplicateInsertBlocks, mergeRecipientRedlineLowSignalFragments } from "./recipientRedlineDisplayDedupe";

describe("collapseRecipientRedlineDuplicateInsertBlocks", () => {
  it("returns the same VM for short proposed text (no-op guard)", () => {
    const cur = "Short.";
    const prop = "Short revised.";
    const vm = buildLegalRedlineDocumentViewModel(cur, prop);
    const out = collapseRecipientRedlineDuplicateInsertBlocks(vm, prop);
    expect(out.blocks.length).toBe(vm.blocks.length);
  });
});

describe("mergeRecipientRedlineLowSignalFragments", () => {
  it("merges a tiny (b) list-style tail into the following clause block", () => {
    const base: LegalRedlineBlock = {
      id: "main",
      kind: "clause",
      label: "2 — Scope",
      clauseNumber: "2",
      segments: [
        { type: "delete", text: "Deliverables: site only." },
        { type: "insert", text: "Deliverables: site and analytics." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const frag: LegalRedlineBlock = {
      id: "frag",
      kind: "paragraph",
      label: "",
      segments: [{ type: "insert", text: "(b) mobile optimization" }],
      insertCount: 1,
      deleteCount: 0,
      sameCount: 0,
      hasInsert: true,
      hasDelete: false,
      hasChange: true,
    };
    const vm: LegalRedlineDocumentViewModel = {
      blocks: [base, frag],
      stats: {
        blockCount: 2,
        changedBlockCount: 2,
        insertCount: 2,
        deleteCount: 1,
        sameCount: 0,
        segmentCount: 3,
        currentLen: 100,
        proposedLen: 120,
      },
      hasChanges: true,
    };
    const out = mergeRecipientRedlineLowSignalFragments(vm);
    expect(out.blocks.length).toBe(1);
    const joined = out.blocks[0]!.segments.map((s) => s.text).join("");
    expect(joined).toContain("(b) mobile optimization");
    expect(joined).toContain("Deliverables");
  });

  it("merges a trailing fragment into the previous block when it appears after a substantive change", () => {
    const frag: LegalRedlineBlock = {
      id: "f",
      kind: "paragraph",
      label: "",
      segments: [{ type: "insert", text: "interest in" }],
      insertCount: 1,
      deleteCount: 0,
      sameCount: 0,
      hasInsert: true,
      hasDelete: false,
      hasChange: true,
    };
    const main: LegalRedlineBlock = {
      id: "m",
      kind: "clause",
      label: "3 — Fees",
      segments: [
        { type: "delete", text: "Net 15." },
        { type: "insert", text: "Net 30." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const vm: LegalRedlineDocumentViewModel = {
      blocks: [main, frag],
      stats: {
        blockCount: 2,
        changedBlockCount: 2,
        insertCount: 2,
        deleteCount: 1,
        sameCount: 0,
        segmentCount: 3,
        currentLen: 50,
        proposedLen: 60,
      },
      hasChanges: true,
    };
    const out = mergeRecipientRedlineLowSignalFragments(vm);
    expect(out.blocks.length).toBe(1);
  });
});
