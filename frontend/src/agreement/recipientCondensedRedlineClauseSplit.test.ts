import { describe, expect, it } from "vitest";
import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { splitRecipientCondensedGiantChangedBlock } from "./recipientCondensedRedlineClauseSplit";

function giantVm(): LegalRedlineDocumentViewModel {
  const cur = [
    "1.1 Services\n" + "Old services body ".repeat(40),
    "2.1 Project Timing\n" + "Old timing body ".repeat(40),
    "3.2 Payment Schedule\n" + "Due on receipt. ".repeat(20),
    "5.1 Ownership\n" + "Client owns deliverables. ".repeat(20),
  ].join("\n");
  const prop = [
    "1.1 Services\n" + "Revised services body ".repeat(40),
    "2.1 Project Timing\n" + "Revised timing body ".repeat(40),
    "3.2 Payment Schedule\n" + "Net 60 from invoice. ".repeat(20),
    "5.1 Ownership\n" + "Developer retains IP. ".repeat(20),
  ].join("\n");
  const b: LegalRedlineBlock = {
    id: "blob",
    kind: "clause",
    clauseNumber: "1",
    currentText: cur,
    proposedText: prop,
    segments: [
      { type: "delete", text: cur },
      { type: "insert", text: prop },
    ],
    insertCount: 1,
    deleteCount: 1,
    sameCount: 0,
    hasInsert: true,
    hasDelete: true,
    hasChange: true,
    label: "Condensed extract",
  };
  return {
    blocks: [b],
    stats: {
      blockCount: 1,
      changedBlockCount: 1,
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      segmentCount: 2,
      currentLen: cur.length,
      proposedLen: prop.length,
    },
    hasChanges: true,
  };
}

describe("splitRecipientCondensedGiantChangedBlock", () => {
  it("splits one giant changed block into multiple clause-level blocks when numbered headings align", () => {
    const vm = giantVm();
    const next = splitRecipientCondensedGiantChangedBlock(vm);
    expect(next.blocks.length).toBeGreaterThanOrEqual(3);
    expect(next.blocks.some((x) => String(x.clauseNumber) === "3.2")).toBe(true);
  });

  it("is a no-op when no giant numbered block is present", () => {
    const small: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "a",
          kind: "clause",
          segments: [
            { type: "delete", text: "Old." },
            { type: "insert", text: "New." },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 0,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 1,
        sameCount: 0,
        segmentCount: 2,
        currentLen: 4,
        proposedLen: 4,
      },
      hasChanges: true,
    };
    const next = splitRecipientCondensedGiantChangedBlock(small);
    expect(next.blocks.length).toBe(1);
  });
});
