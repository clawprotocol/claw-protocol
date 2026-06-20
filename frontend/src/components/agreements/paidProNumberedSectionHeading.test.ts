import { describe, expect, it } from "vitest";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";

describe("paidProNumberedSectionHeading", () => {
  it("classifies the exact Section 7 compliance heading as a section heading", () => {
    expect(
      isPaidProNumberedSectionHeadingLine("7. Representations, Warranties and Compliance"),
    ).toBe(true);
  });

  it("classifies punctuation-rich compound headings", () => {
    const headings = [
      "7. Representations, Warranties and Compliance",
      "8. Relationship of the Parties; Personnel; Non-Solicitation",
      "9. Termination, Suspension and Effect of Termination",
      "10. Confidentiality; Client Materials",
      "11. Intellectual Property / Work Product",
      "12. Limitation of Liability",
      "13. General Terms",
      "8. Independent Contractor; Assignment; Force Majeure",
      "10. INDEPENDENT CONTRACTOR AND ACCESS",
      "5. Ownership, Work Product and Client Materials",
    ];
    for (const heading of headings) {
      expect(isPaidProNumberedSectionHeadingLine(heading), heading).toBe(true);
    }
  });

  it.each([
    "1. The Client shall pay all fees within thirty (30) days.",
    "2. The Service Provider will deliver services as described herein.",
    "3. Each party agrees to comply with applicable law.",
    "4. Project Coordination, Reviews and Changes The parties will each designate a primary contact.",
    "7. Representations, Warranties and Compliance Each party represents compliance with applicable law.",
    "1.1 Provider shall deliver services.",
    "8.1 Confidential Information",
    "Name: Sarah Mitchell",
    "Date: _____________________________",
  ])("rejects non-heading line %s", (line) => {
    expect(isPaidProNumberedSectionHeadingLine(line)).toBe(false);
  });
});
