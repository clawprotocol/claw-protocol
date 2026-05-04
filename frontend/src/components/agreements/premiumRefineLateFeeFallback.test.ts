import { describe, expect, it } from "vitest";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";
import {
  augmentPremiumRefineUserPrompt,
  documentAlreadyHasLateFeeClause,
  looksLikeClientDeliverablesFinalPaymentInstruction,
  resolvePremiumRefineApplyOutcome,
  tryPremiumRefineClientDeliverablesFinalPaymentLocalFallback,
  tryPremiumRefineLateFeeLocalFallback,
} from "./premiumRefineLateFeeFallback";

const LATE_FEE_INSTR =
  "Add late fee of 5% after 10 days overdue. Preserve all other terms.";

describe("tryPremiumRefineLateFeeLocalFallback", () => {
  it("inserts a late-payment clause when no matching late-fee language exists", () => {
    const base = `${"x".repeat(16900)}\n\n## Payment\nPay within 30 days.\n\nIN WITNESS WHEREOF\n`;
    const r = tryPremiumRefineLateFeeLocalFallback({
      currentDocumentText: base,
      userInstruction: LATE_FEE_INSTR,
    });
    expect(r).not.toBeNull();
    expect(r!.text.length).toBeGreaterThan(base.length);
    expect(r!.text).toMatch(/late fee equal to 5%/i);
    expect(r!.summaryLine).toMatch(/5%/);
    expect(r!.summaryLine).toMatch(/10 days/);
  });

  it("returns null when a late-payment / overdue percentage clause already exists (duplicate protection)", () => {
    const base = `Payment terms. Late fee of 5% on overdue amounts after 10 days.\n\n${"y".repeat(5000)}`;
    expect(documentAlreadyHasLateFeeClause(base)).toBe(true);
    expect(
      tryPremiumRefineLateFeeLocalFallback({ currentDocumentText: base, userInstruction: LATE_FEE_INSTR }),
    ).toBeNull();
  });
});

describe("resolvePremiumRefineApplyOutcome", () => {
  it("accepts via late-fee local fallback when API returns unchanged body but instruction requests late fee", () => {
    const base = `${"z".repeat(16926)}\n\nIN WITNESS WHEREOF\n`;
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: base,
      baselineText: base,
      baselineLen: base.length,
      summaryChanges: ["(model) minor wording pass"],
      userInstruction: LATE_FEE_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.usedLocalLateFeeFallback).toBe(true);
    expect(resolved.whatChangedLine).toMatch(/late-payment clause/i);
  });

  it("does not run local fallback when summary is API fail-open unchanged", () => {
    const base = "z".repeat(8000);
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: base,
      baselineText: base,
      baselineLen: base.length,
      summaryChanges: [PRO_REFINE_UNAVAILABLE_USER_MESSAGE],
      userInstruction: LATE_FEE_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("rejected_unchanged");
    expect(resolved.usedLocalLateFeeFallback).toBe(false);
  });

  it("marks unchangedDuplicateLateFee when doc already covers late fee and API echoes baseline", () => {
    const base = `Intro\n\nLate Payment: overdue amounts incur five percent (5%) after ten (10) days.\n\n${"p".repeat(9000)}`;
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: base,
      baselineText: base,
      baselineLen: base.length,
      summaryChanges: [],
      userInstruction: LATE_FEE_INSTR,
    });
    expect(resolved.unchangedDuplicateLateFee).toBe(true);
    expect(resolved.usedLocalLateFeeFallback).toBe(false);
    expect(resolved.acceptance.decision).toBe("rejected_unchanged");
  });
});

describe("augmentPremiumRefineUserPrompt", () => {
  it("includes the user instruction and a full-document apply directive", () => {
    const u = "Add a governing-law footnote.";
    const out = augmentPremiumRefineUserPrompt(u);
    expect(out.startsWith(u)).toBe(true);
    expect(out).toMatch(/complete updated document/i);
    expect(out).toMatch(/preserve-first editing/i);
    expect(out).toMatch(/COMPLETE agreement/i);
    expect(out).toMatch(/Do not summarize/i);
  });
});

describe("client deliverables / final payment deterministic fallback", () => {
  const QA_INSTR = "add in the client will need to approve deliverables before final payment is due";

  it("classifies QA-style instruction", () => {
    expect(looksLikeClientDeliverablesFinalPaymentInstruction(QA_INSTR)).toBe(true);
  });

  it("inserts before IN WITNESS WHEREOF and preserves witness block", () => {
    const base =
      "# Agreement\n\n## Scope\n\nDeliverables monthly.\n\n## 4 Final Payment\n\nNet 30.\n\n" +
      "IN WITNESS WHEREOF\n\nsig\n";
    const r = tryPremiumRefineClientDeliverablesFinalPaymentLocalFallback({
      currentDocumentText: base,
      userInstruction: QA_INSTR,
    });
    expect(r).not.toBeNull();
    expect(r!.text).toContain("IN WITNESS WHEREOF");
    expect(r!.text.indexOf("Client approval of deliverables")).toBeLessThan(r!.text.indexOf("IN WITNESS WHEREOF"));
    expect(r!.text.toLowerCase()).toContain("final payment");
  });
});
