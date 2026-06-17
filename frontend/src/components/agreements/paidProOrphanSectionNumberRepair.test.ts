import { describe, expect, it } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasOrphanStandaloneSectionNumberLines,
  repairPaidProOrphanSectionNumbers,
  repairStrandedThisSectionReference,
  renumberTopLevelHeadingsAfterOrphanRemoval,
} from "./paidProOrphanSectionNumberRepair";
import { validateAndRepairPremiumAgreementStructure } from "./premiumAgreementStructure";

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
