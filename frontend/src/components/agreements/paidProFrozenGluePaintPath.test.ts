import { describe, expect, it } from "vitest";
import { classifyPaidProDocumentBlocks } from "./paidProDocumentBlockClassifier";
import { splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import { projectPaidProFrozenSoTDisplayPlain } from "./paidProDisplayPlainAuthority";
import { isDisallowedPartyPhrase } from "./paidProPartyNamePreserve";

describe("frozen / classify paint path — letter-glued subsections", () => {
  it("splits short General Terms9.1 before length gate", () => {
    const split = splitGluedSectionHeadingFromLine("9. General Terms9.1");
    expect(split).toMatch(/^9\.\s+General Terms\n9\.1$/);
  });

  it("projectPaidProFrozenSoTDisplayPlain repairs General Terms9.1", () => {
    const projected = projectPaidProFrozenSoTDisplayPlain(
      [
        "SERVICES AGREEMENT",
        "",
        "9. General Terms9.1",
        "Notices",
        "Any notice must be in writing.",
        "",
        "10. NOTICES",
        "If to Party 1:",
        "",
        "9.2 Force Majeure",
        "Neither party is liable for delays.",
      ].join("\n"),
    );
    expect(projected).not.toMatch(/General Terms9\.1/);
    expect(projected).toMatch(/^9\.\s+General Terms/m);
    expect(projected).toMatch(/^9\.1\b/m);
    const idx92 = projected.search(/^9\.2\s+Force Majeure/m);
    const idx10 = projected.search(/^10\.\s+NOTICES/im);
    expect(idx92).toBeGreaterThan(0);
    expect(idx10).toBeGreaterThan(idx92);
  });

  it("classifyPaidProDocumentBlocks does not emit glued General Terms9.1 as one heading", () => {
    const blocks = classifyPaidProDocumentBlocks("9. General Terms9.1\nNotices\nBody.");
    const headings = blocks.filter((b) => b.kind === "main_section_heading").map((b) => b.firstLine);
    expect(headings.some((h) => /General Terms9\.1/.test(h))).toBe(false);
    expect(headings.some((h) => /^9\.\s+General Terms/.test(h))).toBe(true);
  });

  it("rejects greeting tokens as party names", () => {
    expect(isDisallowedPartyPhrase("Hey LawDog")).toBe(true);
    expect(isDisallowedPartyPhrase("I need help")).toBe(true);
    expect(isDisallowedPartyPhrase("Alex Rivera")).toBe(false);
  });
});
