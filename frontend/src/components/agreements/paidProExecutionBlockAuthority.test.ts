import { describe, expect, it } from "vitest";
import {
  analyzePaidProExecutionBlockInvariant,
  countPaidProExecutionBlocks,
  forbidPaidProExecutionBlockSynthesis,
  paidProCorpusHasAuthoritativeExecutionBlock,
} from "./paidProExecutionBlockAuthority";

const SINGLE_BLOCK = `
SERVICES AGREEMENT

1. SCOPE
Work.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: __________________________
Name: Jane Doe
Date: _________________________

SERVICE PROVIDER:
Beta Inc
By: __________________________
Name: John Smith
Date: _________________________
`.trim();

describe("paidProExecutionBlockAuthority", () => {
  it("counts one execution block for standard witness + party headings", () => {
    expect(countPaidProExecutionBlocks(SINGLE_BLOCK)).toBe(1);
    expect(paidProCorpusHasAuthoritativeExecutionBlock(SINGLE_BLOCK)).toBe(true);
    expect(forbidPaidProExecutionBlockSynthesis(SINGLE_BLOCK)).toBe(true);
  });

  it("counts zero when no witness or signature tail", () => {
    expect(countPaidProExecutionBlocks("AGREEMENT\n\n1. SCOPE\nOnly operative text.")).toBe(0);
  });

  it("counts two when duplicate witness clauses exist", () => {
    const duped = `${SINGLE_BLOCK}\n\nIN WITNESS WHEREOF, again.\n\nCLIENT:\nOther\nBy: ___\n`;
    expect(countPaidProExecutionBlocks(duped)).toBe(2);
    expect(analyzePaidProExecutionBlockInvariant(duped).ok).toBe(false);
  });
});
