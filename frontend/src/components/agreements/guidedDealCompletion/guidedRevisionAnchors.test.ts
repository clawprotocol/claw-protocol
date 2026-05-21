import { describe, expect, it } from "vitest";
import {
  buildSectionOnlyRefineInstruction,
  resolveGuidedQuestionTarget,
  validateGuidedPatchPlacement,
} from "./guidedRevisionAnchors";

const SECTION_1 = "1. SERVICES\nProvider will deliver automation support.\n\n";
const BODY = [
  "AGREEMENT",
  "",
  "Between Client and Service Provider.",
  "",
  SECTION_1,
  "2. FEES AND PAYMENT",
  "Total fee to be confirmed.",
  "",
  "3. CONFIDENTIALITY",
  "Mutual duties apply.",
  "",
  "4. INTELLECTUAL PROPERTY",
  "Work product TBD.",
  "",
  "5. SUPPORT",
  "Business hours.",
  "",
  "6. TERM",
  "30 days notice.",
].join("\n");

describe("resolveGuidedQuestionTarget", () => {
  it("maps fees question to Section 2", () => {
    const t = resolveGuidedQuestionTarget("payment_timing");
    expect(t.sectionNumber).toBe(2);
    expect(t.sectionLabel).toMatch(/Fees/i);
  });

  it("maps IP question to Section 4", () => {
    const t = resolveGuidedQuestionTarget("ip_ownership");
    expect(t.sectionNumber).toBe(4);
  });

  it("maps SLA to Section 5", () => {
    expect(resolveGuidedQuestionTarget("saas_sla").sectionNumber).toBe(5);
  });
});

describe("validateGuidedPatchPlacement", () => {
  it("rejects IP clause inserted before Section 1", () => {
    const bad = "Ownership of deliverables shall vest in Client.\n\n" + BODY;
    const v = validateGuidedPatchPlacement(BODY, bad, resolveGuidedQuestionTarget("ip_ownership"));
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("ip_before") || r.includes("misplaced"))).toBe(true);
  });

  it("rejects orphan fragments", () => {
    const bad = BODY.replace("2. FEES", "build and\n\n2. FEES");
    const v = validateGuidedPatchPlacement(BODY, bad, resolveGuidedQuestionTarget("payment_timing"));
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("orphan_fragment");
  });

  it("accepts fees change only in Section 2", () => {
    const good = BODY.replace("Total fee to be confirmed.", "Total fee is $120,000 USD.");
    const v = validateGuidedPatchPlacement(BODY, good, resolveGuidedQuestionTarget("total_fee_confirmation"));
    expect(v.ok).toBe(true);
  });

  it("strict instruction mentions section only", () => {
    const t = resolveGuidedQuestionTarget("ip_ownership");
    const inst = buildSectionOnlyRefineInstruction(t, "Client owns deliverables", "IP", true);
    expect(inst).toMatch(/ONLY/i);
    expect(inst).toMatch(/Section 4/i);
    expect(inst).not.toMatch(/Revise only the most appropriate/);
  });
});
