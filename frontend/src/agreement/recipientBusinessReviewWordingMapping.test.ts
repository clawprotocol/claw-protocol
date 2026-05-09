import { describe, expect, it } from "vitest";
import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  extractStrongFocusedWordingForSemanticId,
  getFocusedWordingPickForSemanticId,
} from "./recipientBusinessReviewCardsModel";

function vm(blocks: LegalRedlineBlock[]): LegalRedlineDocumentViewModel {
  let ic = 0,
    dc = 0,
    sc = 0,
    seg = 0,
    cc = 0;
  for (const b of blocks) {
    ic += b.insertCount;
    dc += b.deleteCount;
    sc += b.sameCount;
    seg += b.segments.length;
    if (b.hasChange) cc++;
  }
  return {
    blocks,
    stats: {
      blockCount: blocks.length,
      changedBlockCount: cc,
      insertCount: ic,
      deleteCount: dc,
      sameCount: sc,
      segmentCount: seg,
      currentLen: 500,
      proposedLen: 500,
    },
    hasChanges: cc > 0,
  };
}

describe("focused wording semantic mapping", () => {
  it("payment card wording contains payment language, not confidentiality-only blocks", () => {
    const confidential: LegalRedlineBlock = {
      id: "c1",
      kind: "clause",
      label: "7 — Confidentiality",
      segments: [
        { type: "delete", text: "Recipient shall keep secrets." },
        { type: "insert", text: "Recipient shall keep confidential information strictly private." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const payment: LegalRedlineBlock = {
      id: "p1",
      kind: "clause",
      label: "4 — Payment",
      segments: [
        { type: "delete", text: "Fees due on receipt of invoice." },
        { type: "insert", text: "Net 30 from invoice date." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const doc = vm([confidential, payment]);
    const w = extractStrongFocusedWordingForSemanticId(doc, "payment_terms");
    expect(w).not.toBeNull();
    const joined = `${w!.oldText} ${w!.newText}`.toLowerCase();
    expect(joined).toMatch(/invoice|net|payment/);
    expect(joined).not.toMatch(/confidential strictly private/);
  });

  it("ownership card wording contains ownership / IP language", () => {
    const noise: LegalRedlineBlock = {
      id: "n1",
      kind: "clause",
      label: "5 — Term",
      segments: [{ type: "insert", text: "Term extended." }],
      insertCount: 1,
      deleteCount: 0,
      sameCount: 0,
      hasInsert: true,
      hasDelete: false,
      hasChange: true,
    };
    const own: LegalRedlineBlock = {
      id: "o1",
      kind: "clause",
      label: "6 — IP",
      segments: [
        { type: "delete", text: "Client owns work product." },
        { type: "insert", text: "Client owns work product including background materials license-back." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const w = extractStrongFocusedWordingForSemanticId(vm([noise, own]), "ownership");
    expect(w).not.toBeNull();
    expect(`${w!.oldText} ${w!.newText}`.toLowerCase()).toMatch(/work\s+product|background|own/);
  });

  it("scope card wording contains scope / deliverables language", () => {
    const scope: LegalRedlineBlock = {
      id: "s1",
      kind: "clause",
      label: "2 — Scope",
      segments: [
        { type: "delete", text: "Deliverables: website only." },
        { type: "insert", text: "Deliverables: website and analytics milestones per exhibit A." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 0,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
    };
    const w = extractStrongFocusedWordingForSemanticId(vm([scope]), "scope");
    expect(w).not.toBeNull();
    expect(`${w!.oldText} ${w!.newText}`.toLowerCase()).toMatch(/deliverable|scope|milestone/);
  });

  it("returns none when no keyword-aligned block exists for payment", () => {
    const onlyConfidential = vm([
      {
        id: "c",
        kind: "clause",
        label: "Confidentiality",
        segments: [
          { type: "delete", text: "Keep information confidential." },
          { type: "insert", text: "Enhanced confidentiality obligations." },
        ],
        insertCount: 1,
        deleteCount: 1,
        sameCount: 0,
        hasInsert: true,
        hasDelete: true,
        hasChange: true,
      },
    ]);
    expect(getFocusedWordingPickForSemanticId(onlyConfidential, "payment_terms").quality).toBe("none");
  });
});
