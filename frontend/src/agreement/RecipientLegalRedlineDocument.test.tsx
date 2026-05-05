/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  RecipientLegalRedlineDocument,
  splitSegmentTextToParagraphLines,
  lineLooksLikeSectionHeading,
} from "./RecipientLegalRedlineDocument";

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
  it("detects numbered section lines", () => {
    expect(lineLooksLikeSectionHeading("3. Compensation and Payment")).toBe(true);
    expect(lineLooksLikeSectionHeading("3.1 Payment Schedule")).toBe(true);
    expect(lineLooksLikeSectionHeading("Plain sentence.")).toBe(false);
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
});
