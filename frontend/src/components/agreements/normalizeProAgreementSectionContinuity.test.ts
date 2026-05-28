import { describe, expect, it } from "vitest";
import { normalizeProAgreementSectionContinuity } from "./normalizeProAgreementSectionContinuity";

describe("normalizeProAgreementSectionContinuity", () => {
  it("renumbers skipped top-level sections sequentially after gaps", () => {
    const input = [
      "1. Scope. Provider delivers services.",
      "2.1 Payment detail subsection.",
      "5.1 Confidentiality duplicate heading.",
      "8.1 Governing law subsection.",
      "IN WITNESS WHEREOF, the Parties execute.",
    ].join("\n");
    const { text, repairs } = normalizeProAgreementSectionContinuity(input);
    expect(repairs.some((r) => r.includes("section_renumber"))).toBe(true);
    expect(text).toMatch(/^1\.\s+Scope/m);
    expect(text).toMatch(/2\.1\s+Payment detail/);
    expect(text).not.toMatch(/^5\.1\s+/m);
    expect(text).not.toMatch(/^8\.1\s+/m);
    const tops = [...text.matchAll(/^(\d+)\.\s+[A-Za-z]/gm)].map((m) => Number(m[1]));
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBe(tops[i - 1]! + 1);
    }
  });

  it("deduplicates repeated confidentiality sections", () => {
    const input = [
      "1. Scope. Work.",
      "2. Confidentiality. First block.",
      "Mutual confidentiality obligations apply.",
      "3. Confidentiality. Duplicate block.",
      "Same mutual confidentiality obligations apply.",
      "4. Fees. Fixed fee.",
    ].join("\n\n");
    const { text } = normalizeProAgreementSectionContinuity(input);
    const confMatches = text.match(/^2\. Confidentiality/gm) ?? [];
    const confMatches3 = text.match(/^3\. Confidentiality/gm) ?? [];
    expect(confMatches.length + confMatches3.length).toBeLessThanOrEqual(1);
  });

  it("creates parent heading for orphan subsection 2.1", () => {
    const input = "2.1 Payment. Client pays $5,000 within thirty days.";
    const { text } = normalizeProAgreementSectionContinuity(input);
    expect(text).toMatch(/^1\.\s+/m);
    expect(text).toMatch(/1\.1\s+Payment/);
    expect(text).toContain("$5,000");
  });
});
