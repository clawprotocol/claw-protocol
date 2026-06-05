import { describe, expect, it } from "vitest";
import { buildReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";
import { extractSectionHeadingAnchors, resolveClauseLabel } from "./reviewFirstChangeCardModel";

const CONSULTING_AGREEMENT_SHELL = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "1. Parties; Effective Date; Purpose",
  "1.1 Parties. The parties to this Agreement are: (a) Blue Canyon Analytics LLC, Client; and (b) Iron Vale Systems Inc., Service Provider.",
  "1.2 Effective Date. This Agreement is effective as of the date last signed below.",
  "",
  "2. Scope of Services",
  "2.1 Services. Service Provider shall perform the consulting services described in mutually agreed statements of work.",
  "",
  "3. Fees, Invoicing and Payment",
  "3.1 Fixed Fee. Client shall pay Service Provider a fixed fee of $8,500 for the initial implementation engagement.",
  "3.2 Invoicing and Payment Timing. Client will pay each undisputed invoice within thirty (30) days after receipt of invoice.",
  "",
  "4. Deliverables, Acceptance and Ownership",
  "4.1 Deliverables. Service Provider shall deliver the implementation plan, source code archive, and acceptance checklist.",
  "4.2 Ownership. Client owns project deliverables upon full payment. Service Provider retains reusable background technology.",
  "",
  "5. Term and Termination",
  "5.1 Term. The initial term is twelve (12) months from the Effective Date.",
  "",
  "6. Liability",
  "6.1 Liability. Provider's aggregate liability shall not exceed fees paid in the prior three months.",
].join("\n");

describe("resolveClauseLabel", () => {
  it("anchors payment timing edits to 3.2 instead of 1.1 Parties", () => {
    const proposed = CONSULTING_AGREEMENT_SHELL.replace(
      "within thirty (30) days after receipt",
      "within fifteen (15) days after receipt",
    );
    const section = buildReviewFirstTextDiffSummary(CONSULTING_AGREEMENT_SHELL, proposed).changedSections[0];

    expect(section?.title).toBe("Payment timing changed");
    expect(section?.clauseLabel).toBe("3.2 Invoicing and Payment Timing");
    expect(section?.clauseLabel).not.toContain("1.1 Parties");
  });

  it("returns ownership clause for ownership edits", () => {
    const proposed = CONSULTING_AGREEMENT_SHELL.replace(
      "Client owns project deliverables upon full payment. Service Provider retains reusable background technology.",
      "Client owns project deliverables and related work product upon full payment. Service Provider retains reusable background technology.",
    );
    const section = buildReviewFirstTextDiffSummary(CONSULTING_AGREEMENT_SHELL, proposed).changedSections[0];
    expect(section?.title).toBe("Ownership changed");
    expect(section?.beforePhrase).toMatch(/deliverables|work product/i);
    expect(section?.afterPhrase).toMatch(/work product/i);
    expect(section?.clauseLabel).toMatch(/^4\.2 Ownership/);
  });

  it("returns liability clause for liability edits", () => {
    const proposed = CONSULTING_AGREEMENT_SHELL.replace("prior three months", "prior six months");
    const section = buildReviewFirstTextDiffSummary(CONSULTING_AGREEMENT_SHELL, proposed).changedSections[0];
    expect(section?.title).toBe("Liability changed");
    expect(section?.clauseLabel).toMatch(/^6\.1 Liability/);
  });

  it("returns party clause for party-name edits", () => {
    const proposed = CONSULTING_AGREEMENT_SHELL.replace(
      "(b) Iron Vale Systems Inc., Service Provider.",
      "(b) Summit Ridge Systems Inc., Service Provider.",
    );
    const section = buildReviewFirstTextDiffSummary(CONSULTING_AGREEMENT_SHELL, proposed).changedSections[0];
    expect(section?.clauseLabel).toMatch(/^1\.1 Parties/);
    expect(section?.clauseLabel).not.toMatch(/^2\./);
  });

  it("does not attribute a Section 3 payment edit to Section 1 headings (cross-section regression)", () => {
    const headings = extractSectionHeadingAnchors(CONSULTING_AGREEMENT_SHELL);
    expect(headings.some((heading) => heading.label.startsWith("1.1 Parties"))).toBe(true);
    expect(headings.some((heading) => heading.label.startsWith("3.2 Invoicing"))).toBe(true);

    const label = resolveClauseLabel({
      previous: CONSULTING_AGREEMENT_SHELL,
      proposed: CONSULTING_AGREEMENT_SHELL.replace(
        "within thirty (30) days after receipt",
        "within fifteen (15) days after receipt",
      ),
      changedPhrase: "within fifteen (15) days after receipt",
    });
    expect(label).toBe("3.2 Invoicing and Payment Timing");
    expect(label).not.toMatch(/^1\./);
  });
});
