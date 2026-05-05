import { describe, expect, it } from "vitest";
import { htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import {
  alignParsedBlocksToLegalRedline,
  buildLegalRedlineDocumentViewModel,
  extractClauseNumberFromFirstLine,
  normalizeClauseNumberKey,
  parsePlainTextIntoLegalBlocks,
} from "./legalRedlineBlocks";

describe("htmlToPlainTextForLegalRedline", () => {
  it("maps block-level tags to paragraph breaks for block parsing", () => {
    const html = "<p>3.2 Payment</p><p>Due on receipt.</p><p>IN WITNESS WHEREOF</p><p>Sign.</p>";
    const plain = htmlToPlainTextForLegalRedline(html);
    expect(plain).toContain("3.2 Payment");
    expect(plain).toMatch(/Payment[\s\S]*Due on receipt/);
    expect(plain).toMatch(/receipt[\s\S]*IN WITNESS WHEREOF/);
    const blocks = parsePlainTextIntoLegalBlocks(plain);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.some((b) => b.kind === "signature")).toBe(true);
  });
});

describe("parsePlainTextIntoLegalBlocks", () => {
  it("splits numbered clauses into separate blocks on double newline", () => {
    const text = "3.1 Definitions\nBody one.\n\n3.2 Payment Schedule\nBody two.";
    const blocks = parsePlainTextIntoLegalBlocks(text);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.clauseNumber).toBe("3.1");
    expect(blocks[1]!.clauseNumber).toBe("3.2");
  });

  it("preserves paragraph breaks and signature-style blocks", () => {
    const text = "3.1 Terms\nLine.\n\nIN WITNESS WHEREOF\nSign.";
    const blocks = parsePlainTextIntoLegalBlocks(text);
    expect(blocks.length).toBe(2);
    expect(blocks[1]!.kind).toBe("signature");
  });

  it("normalizes 3-2 clause key to dotted form for extraction", () => {
    expect(extractClauseNumberFromFirstLine("3-2 Payment")).toBe("3.2");
    expect(normalizeClauseNumberKey("3-2")).toBe("3.2");
  });
});

describe("buildLegalRedlineDocumentViewModel", () => {
  it("aligns 3.2 Payment Schedule and isolates Net 30 insert inside that block", () => {
    const cur = "3.2 Payment Schedule\nInvoices are due on receipt.\n\nFooter note.";
    const prop = "3.2 Payment Schedule\nInvoices are due Net 30.\n\nFooter note.";
    const doc = buildLegalRedlineDocumentViewModel(cur, prop);
    const payBlock = doc.blocks.find((b) => b.clauseNumber === "3.2");
    expect(payBlock).toBeDefined();
    const joinedInserts = payBlock!.segments
      .filter((s) => s.type === "insert")
      .map((s) => s.text)
      .join("");
    expect(joinedInserts).toMatch(/Net\s*30/i);
    expect(payBlock!.segments.some((s) => s.type === "delete")).toBe(true);
  });

  it("isolates Net 30 in 3.2 block when HTML is converted with paragraph-preserving plain text", () => {
    const baseHtml = "<p>3.2 Payment Schedule<br/>Invoices are due on receipt.</p>";
    const propHtml = "<p>3.2 Payment Schedule<br/>Invoices are due Net 30.</p>";
    const cur = htmlToPlainTextForLegalRedline(baseHtml);
    const prop = htmlToPlainTextForLegalRedline(propHtml);
    const doc = buildLegalRedlineDocumentViewModel(cur, prop);
    const payBlock = doc.blocks.find((b) => b.clauseNumber === "3.2");
    expect(payBlock).toBeDefined();
    expect(
      payBlock!.segments
        .filter((s) => s.type === "insert")
        .map((s) => s.text)
        .join(""),
    ).toMatch(/Net\s*30/i);
  });

  it("treats proposed-only trailing clause as insert-only block", () => {
    const cur = "2.1 Alpha\n\n2.2 Beta";
    const prop = "2.1 Alpha\n\n2.2 Beta\n\n3.0 New Section\nOnly proposed.";
    const doc = buildLegalRedlineDocumentViewModel(cur, prop);
    const last = doc.blocks[doc.blocks.length - 1]!;
    expect(last.proposedText).toMatch(/3\.0 New Section/);
    expect(last.segments.some((s) => s.type === "insert")).toBe(true);
    expect(last.currentText).toBeUndefined();
  });

  it("emits current-only block as delete when not in proposed", () => {
    const cur = "1.1 Keep\n\n9.9 Orphan\nOld.";
    const prop = "1.1 Keep";
    const doc = buildLegalRedlineDocumentViewModel(cur, prop);
    const orphan = doc.blocks.find((b) => b.clauseNumber === "9.9");
    expect(orphan).toBeDefined();
    expect(orphan!.currentText).toMatch(/Orphan/);
    expect(orphan!.segments.some((s) => s.type === "delete")).toBe(true);
  });
});

describe("alignParsedBlocksToLegalRedline", () => {
  it("pairs unnumbered blocks in document order", () => {
    const a = parsePlainTextIntoLegalBlocks("Intro line.\n\n3.1 X");
    const b = parsePlainTextIntoLegalBlocks("Intro changed.\n\n3.1 X");
    const out = alignParsedBlocksToLegalRedline(a, b);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});
