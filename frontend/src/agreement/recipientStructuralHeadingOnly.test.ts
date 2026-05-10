import { describe, expect, it } from "vitest";
import {
  isStructuralHeadingOnlyParsedPlain,
  isStructuralHeadingOnlyPlainText,
} from "./recipientStructuralHeadingOnly";

describe("isStructuralHeadingOnlyPlainText", () => {
  it("treats Background and Purpose as structural", () => {
    expect(isStructuralHeadingOnlyPlainText("Background and Purpose", { kind: "paragraph" })).toBe(true);
  });

  it("treats duplicated title lines as structural", () => {
    expect(
      isStructuralHeadingOnlyPlainText("WEB DEVELOPMENT AGREEMENT\nWEB DEVELOPMENT AGREEMENT", { kind: "paragraph" }),
    ).toBe(true);
  });

  it("rejects substantive clause bodies", () => {
    expect(
      isStructuralHeadingOnlyPlainText(
        "The Developer shall deliver milestones within forty-five days including expanded deliverables.",
        { kind: "paragraph" },
      ),
    ).toBe(false);
  });

  it("rejects numbered clause blocks via clauseNumber meta", () => {
    expect(
      isStructuralHeadingOnlyPlainText("2. Payment\nNet 30.", { kind: "paragraph", clauseNumber: "2" }),
    ).toBe(false);
  });
});

describe("isStructuralHeadingOnlyParsedPlain", () => {
  it("treats title and heading kinds as structural regardless of length guard on kind", () => {
    expect(
      isStructuralHeadingOnlyParsedPlain({
        kind: "title",
        rawText: "Any",
      }),
    ).toBe(true);
  });
});
