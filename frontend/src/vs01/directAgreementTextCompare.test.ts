import { describe, expect, it } from "vitest";
import { analyzeDirectTextCompare } from "./directAgreementTextCompare";

describe("analyzeDirectTextCompare", () => {
  it("flags changed governing law between Delaware and New York", () => {
    const before = [
      "1. Governing law.",
      "The laws of the State of Delaware govern this agreement, without regard to choice of law.",
    ].join("\n\n");
    const after = [
      "1. Governing law.",
      "The laws of the State of New York govern this agreement, without regard to choice of law.",
    ].join("\n\n");
    const r = analyzeDirectTextCompare(before, after);
    const g = r.topicHighlights.find((h) => h.id === "governing_law");
    expect(g).toBeDefined();
    expect(g!.changed).toBe(true);
    expect(g!.before).toMatch(/Delaware/i);
    expect(g!.after).toMatch(/New York/i);
  });

  it("flags changed payment terms (amounts)", () => {
    const before = "4. The fee is $500, payable in advance.";
    const after = "4. The fee is $5,000, payable in advance.";
    const r = analyzeDirectTextCompare(before, after);
    const p = r.topicHighlights.find((h) => h.id === "payment");
    expect(p).toBeDefined();
    expect(p!.changed).toBe(true);
    expect(p!.before).toMatch(/500/);
    expect(p!.after).toMatch(/5,000/);
  });

  it("flags changed dates (effective date)", () => {
    const before = "5. The effective date is January 1, 2025.";
    const after = "5. The effective date is April 1, 2026.";
    const r = analyzeDirectTextCompare(before, after);
    const d = r.topicHighlights.find((h) => h.id === "dates");
    expect(d).toBeDefined();
    expect(d!.changed).toBe(true);
    expect(d!.before).toMatch(/2025/);
    expect(d!.after).toMatch(/2026/);
  });

  it("flags changed IP ownership / license language", () => {
    const before = "6. The Vendor retains all intellectual property rights in the deliverables.";
    const after = "6. The Client shall own all intellectual property rights in the deliverables, subject to payment in full.";
    const r = analyzeDirectTextCompare(before, after);
    const ip = r.topicHighlights.find((h) => h.id === "ip");
    expect(ip).toBeDefined();
    expect(ip!.changed).toBe(true);
    expect(ip!.before).toMatch(/retains/);
    expect(ip!.after).toMatch(/Client shall own/);
  });

  it("flags changed termination language", () => {
    const before = "7. This agreement may be terminated for convenience on 7 days' notice.";
    const after = "7. This agreement may be terminated for convenience on 30 days' written notice.";
    const r = analyzeDirectTextCompare(before, after);
    const t = r.topicHighlights.find((h) => h.id === "termination");
    expect(t).toBeDefined();
    expect(t!.changed).toBe(true);
    expect(t!.after).toMatch(/30/);
  });

  it("detects deletions and additions in redline and clause alignment", () => {
    const before = "A.\n\nB.\n\nC.";
    const after = "A.\n\nB modified.\n\nC.\n\nD.";
    const r = analyzeDirectTextCompare(before, after);
    expect(r.additionWordsApprox + r.deletionWordsApprox).toBeGreaterThan(0);
    expect(r.clauseRows.some((c) => c.kind === "edit" || c.kind === "add")).toBe(true);
  });
});
