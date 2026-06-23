import { describe, expect, it } from "vitest";
import {
  isDanglingPaidProMainHeadingPrefix,
  isPaidProHeadingContinuationFragment,
  repairSplitPaidProHeadingFragments,
} from "./repairSplitPaidProHeadingFragments";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { isMainSectionHeadingLine } from "./paidProDocumentBlockClassifier";

describe("repairSplitPaidProHeadingFragments", () => {
  const splitHeadingCorpus = () =>
    [
      "4. Project Coordination, Reviews and Changes",
      "The parties will coordinate in good faith.",
      "5. Ownership, Work Product and",
      "Client Materials",
      "",
      "5.1 Client Ownership of Paid Deliverables",
      "Client owns paid deliverables upon payment.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Acme LLC",
    ].join("\n");

  it("merges dangling main heading with title-case continuation fragment", () => {
    const { text, repairs } = repairSplitPaidProHeadingFragments(splitHeadingCorpus());
    expect(text).toContain("5. Ownership, Work Product and Client Materials");
    expect(text).not.toMatch(/\nClient Materials\n/);
    expect(text).toMatch(/5\.1 Client Ownership of Paid Deliverables/);
    expect(repairs).toContain("split_heading_fragment:5");
    expect(isMainSectionHeadingLine("5. Ownership, Work Product and Client Materials")).toBe(true);
  });

  it("is idempotent for already-clean headings", () => {
    const clean = "5. Ownership, Work Product and Client Materials\n\n5.1 Client Ownership of Paid Deliverables";
    const once = repairSplitPaidProHeadingFragments(clean);
    const twice = repairSplitPaidProHeadingFragments(once.text);
    expect(once.repairs).toHaveLength(0);
    expect(twice.text).toBe(once.text);
    expect(twice.repairs).toHaveLength(0);
  });

  it("does not merge with a body sentence on the next line", () => {
    const input = "5. Ownership, Work Product and\nThe Service Provider will deliver work product.";
    const { text, repairs } = repairSplitPaidProHeadingFragments(input);
    expect(repairs).toHaveLength(0);
    expect(text).toContain("5. Ownership, Work Product and\nThe Service Provider");
  });

  it("does not merge with numbered subsections", () => {
    const input = "5. Ownership, Work Product and\n5.1 Client Ownership of Paid Deliverables";
    const { text, repairs } = repairSplitPaidProHeadingFragments(input);
    expect(repairs).toHaveLength(0);
    expect(text).toBe(input.replace(/\r\n/g, "\n"));
  });

  it("does not merge signature block lines after witness", () => {
    const input = [
      "5. Ownership, Work Product and",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
    ].join("\n");
    const { text, repairs } = repairSplitPaidProHeadingFragments(input);
    expect(repairs).toHaveLength(0);
    expect(text).toContain("IN WITNESS WHEREOF");
    expect(text).toContain("CLIENT:");
  });

  it("preparePaidProReviewDisplayPlain merges split heading lines from classifier regression", () => {
    const raw = [
      "5. Ownership, Work Product and",
      "Client Materials",
      "",
      "5.1 Client Ownership of Paid Deliverables",
      "Client owns paid deliverables upon payment.",
      "5.2 Service Provider Retained Materials",
      "Service Provider retains pre-existing tools and methods.",
    ].join("\n");
    const { text, repairs } = preparePaidProReviewDisplayPlain(raw);
    expect(text).toContain("5. Ownership, Work Product and Client Materials");
    expect(repairs.some((r) => r.startsWith("split_heading_fragment:"))).toBe(true);
  });

  it("preparePaidProReviewDisplayPlain repairs glued-then-split heading fragments", () => {
    const gluedOneLine = "5. Ownership, Work Product and Client Materials";
    const { text } = preparePaidProReviewDisplayPlain(
      `${gluedOneLine}\n\n5.1 Client Ownership of Paid Deliverables`,
    );
    expect(text).toContain("5. Ownership, Work Product and Client Materials");
    expect(text).not.toMatch(/\nClient Materials\n/);
  });

  it("classifies dangling prefix and continuation fragment helpers", () => {
    expect(isDanglingPaidProMainHeadingPrefix("Ownership, Work Product and")).toBe(true);
    expect(isDanglingPaidProMainHeadingPrefix("Ownership, Work Product and Client Materials")).toBe(
      false,
    );
    expect(isPaidProHeadingContinuationFragment("Client Materials")).toBe(true);
    expect(isPaidProHeadingContinuationFragment("Client Responsibility for Payment.")).toBe(true);
    expect(isPaidProHeadingContinuationFragment("The Service Provider will deliver.")).toBe(false);
    expect(isPaidProHeadingContinuationFragment("5.1 Client Ownership")).toBe(false);
  });

  it("merges 3.7 Joint / Client Responsibility for Payment subsection split (TEST403)", () => {
    const raw = [
      "3. Compensation",
      "Fees are payable as described.",
      "3.7 Joint",
      "Client Responsibility for Payment.",
      "Red Mesa Logistics LLC and Blue Canyon Analytics LLC are jointly responsible for payment.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n");
    const { text, repairs } = repairSplitPaidProHeadingFragments(raw);
    expect(text).toContain("3.7 Joint Client Responsibility for Payment.");
    expect(text).not.toMatch(/3\.7 Joint\s*\n\s*Client Responsibility for Payment/i);
    expect(repairs).toContain("split_subsection_heading_fragment:3.7");
  });
});
