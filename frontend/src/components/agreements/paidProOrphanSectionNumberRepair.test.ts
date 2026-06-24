import { describe, expect, it } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasFalseFragmentSectionHeading,
  hasOrphanStandaloneSectionNumberLines,
  repairOrphanNumberFragmentContinuationLines,
  repairPaidProOrphanSectionNumbers,
  repairStrandedThisSectionReference,
  renumberTopLevelHeadingsAfterOrphanRemoval,
} from "./paidProOrphanSectionNumberRepair";
import { validateAndRepairPremiumAgreementStructure } from "./premiumAgreementStructure";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";

function test364BrokenMiscellaneousTail(): string {
  return [
    "14. NOTICES",
    "Notices must be sent to the addresses in the signature blocks.",
    "",
    "15. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Texas.",
    "",
    "16. Miscellaneous",
    "This Agreement constitutes the entire agreement between the Parties.",
    "No waiver is effective unless in writing.",
    "The following provisions survive expiration or termination of this Agreement to the extent applicable: payment obligations accrued before termination, intellectual property and license rights, confidentiality, liability allocation, governing law and venue, notices and this Section",
    "",
    "16.",
    "",
    "This Agreement may be executed in counterparts, each of which is deemed an original.",
    "",
    "17.",
    "",
    "18. ELECTRONIC SIGNATURES",
    "This Agreement may be executed electronically through LawDog with the same effect as original signatures.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT: Red Mesa Logistics LLC",
    "By: _________________________",
    "Name: Rand Mann",
    "Title: CEO",
    "",
    "SERVICE PROVIDER: Harbor Peak Automation LLC",
    "By: _________________________",
    "Name: Rasta Benning",
    "Title: Member",
  ].join("\n");
}

function cleanAgreement(): string {
  return [
    "1. PURPOSE",
    "The Parties wish to collaborate on services.",
    "",
    "2. TERM",
    "The term begins on the Effective Date.",
    "",
    "3. ELECTRONIC SIGNATURES",
    "Electronic signatures are permitted.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT: Alpha LLC",
    "By: _________________________",
    "",
    "SERVICE PROVIDER: Beta LLC",
    "By: _________________________",
  ].join("\n");
}

function test365TerminalOrphanBeforeWitness(): string {
  return [
    "11. General Provisions",
    "11.7 Survival.",
    "The following provisions survive expiration or termination of this Agreement to the extent applicable: payment obligations accrued before termination, confidentiality, and this Section 11.7.",
    "",
    "11.8 Counterparts and Electronic Signatures",
    "",
    "This Agreement may be signed in counterparts, each of which is deemed an original, and electronic signatures are permitted.",
    "",
    "12.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "Red Mesa Logistics LLC",
    "By: _________________________",
    "Name: Rand Mann",
    "Title: CEO",
    "",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: _________________________",
    "Name: Rasta Benning",
    "Title: Member",
  ].join("\n");
}

describe("Test365 terminal orphan before witness", () => {
  it("removes standalone 12. before IN WITNESS WHEREOF", () => {
    const { text, repairs } = repairPaidProOrphanSectionNumbers(test365TerminalOrphanBeforeWitness());
    expect(text).not.toMatch(/^\s*12\.\s*$/m);
    expect(repairs.some((r) => r.includes("terminal_orphan_before_witness:12."))).toBe(true);
    expect(text).toMatch(
      /counterparts[\s\S]*IN WITNESS WHEREOF/i,
    );
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("preparePaidProReviewDisplayPlain removes terminal orphan after flattening", () => {
    const { text } = preparePaidProReviewDisplayPlain(test365TerminalOrphanBeforeWitness());
    expect(text).not.toMatch(/^\s*12\.\s*$/m);
    expect(text).toMatch(/IN WITNESS WHEREOF/i);
  });

  it("preserves real headings like 11. General Provisions and 12. Governing Law", () => {
    const input = [
      "11. General Provisions",
      "Operative text.",
      "",
      "12. Governing Law",
      "Texas law governs.",
      "",
      "IN WITNESS WHEREOF",
    ].join("\n");
    const { text, repairs } = repairPaidProOrphanSectionNumbers(input);
    expect(text).toContain("11. General Provisions");
    expect(text).toContain("12. Governing Law");
    expect(repairs).toHaveLength(0);
  });
});

describe("Test364 paid Pro orphan section number repair", () => {
  it("repairs survival clause stranded before orphan 16.", () => {
    const input = "notices and this Section\n\n16.\n\nCounterparts follow.";
    const { text, repairs } = repairStrandedThisSectionReference(input);
    expect(repairs).toContain("stranded_this_section:16");
    expect(text).toMatch(/notices and this Section 16\./i);
    expect(text).not.toMatch(/^\s*16\.\s*$/m);
  });

  it("removes orphan 17. and renumbers 18. ELECTRONIC SIGNATURES to 17.", () => {
    const { text, repairs } = repairPaidProOrphanSectionNumbers(test364BrokenMiscellaneousTail());
    expect(text).not.toMatch(/^\s*16\.\s*$/m);
    expect(text).not.toMatch(/^\s*17\.\s*$/m);
    expect(text).toMatch(/notices and this Section 16\./i);
    expect(text).toMatch(/17\.\s+ELECTRONIC SIGNATURES/i);
    expect(text).not.toMatch(/18\.\s+ELECTRONIC SIGNATURES/i);
    expect(text).toContain("This Agreement may be executed in counterparts");
    expect(repairs.some((r) => r.startsWith("orphan_section_line_removed:"))).toBe(true);
    expect(repairs.some((r) => r.startsWith("section_renumber:"))).toBe(true);
  });

  it("premium-structure-repair applies Test364 orphan section repair", () => {
    const result = validateAndRepairPremiumAgreementStructure(test364BrokenMiscellaneousTail(), {
      surface: "test364",
    });
    expect(result.repairs.some((r) => r.startsWith("stranded_this_section:"))).toBe(true);
    expect(hasOrphanStandaloneSectionNumberLines(result.text)).toBe(false);
    expect(result.text).toMatch(/17\.\s+ELECTRONIC SIGNATURES/i);
  });

  it("preserves exactly one execution block", () => {
    const { text } = repairPaidProOrphanSectionNumbers(test364BrokenMiscellaneousTail());
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("does not alter already-clean agreements", () => {
    const { text, repairs } = repairPaidProOrphanSectionNumbers(cleanAgreement());
    expect(repairs).toHaveLength(0);
    expect(text).toBe(cleanAgreement());
  });

  it("renumberTopLevelHeadingsAfterOrphanRemoval only fixes trailing offset", () => {
    const input = "16. Miscellaneous\nBody.\n\n18. ELECTRONIC SIGNATURES\nE-sign ok.";
    const { text, repairs } = renumberTopLevelHeadingsAfterOrphanRemoval(input);
    expect(repairs).toContain("section_renumber:18->17");
    expect(text).toMatch(/17\.\s+ELECTRONIC SIGNATURES/i);
    expect(text).toContain("16. Miscellaneous");
  });
});

describe("TEST427 orphan number + Service + Provider fragment merge", () => {
  const fragmentBlock = [
    "10. Suspension, Force Majeure and Transition",
    "Service Provider may suspend performance when required by law.",
    "5.",
    "Service",
    "Provider will resume performance promptly after the issue is resolved.",
    "11. Governing Law",
    "Oklahoma law governs.",
  ].join("\n");

  it("merges 5. / Service / Provider into operative paragraph", () => {
    const { text, repairs } = repairPaidProOrphanSectionNumbers(fragmentBlock);
    expect(text).not.toMatch(/^\s*5\.\s*$/m);
    expect(text).not.toMatch(/^\s*5\.\s+Service\s*$/im);
    expect(text).toContain(
      "Service Provider will resume performance promptly after the issue is resolved.",
    );
    expect(repairs.some((r) => r.includes("orphan_number_fragment_merged") || r.includes("orphan_fragment"))).toBe(
      true,
    );
    expect(hasFalseFragmentSectionHeading(text)).toBe(false);
  });

  it("merges Service / Provider after standalone orphan number was already removed", () => {
    const afterOrphanRemoval = [
      "10. Suspension, Force Majeure and Transition",
      "Service Provider may suspend performance when required by law.",
      "Service",
      "Provider will resume performance promptly after the issue is resolved.",
      "11. Governing Law",
      "Oklahoma law governs.",
    ].join("\n");
    const { text, repairs } = repairOrphanNumberFragmentContinuationLines(afterOrphanRemoval);
    expect(text).toContain(
      "Service Provider will resume performance promptly after the issue is resolved.",
    );
    expect(repairs.some((r) => r.includes("orphan_title_fragment_merged"))).toBe(true);
    expect(text).not.toMatch(/^\s*Service\s*$/m);
  });
});
