import { describe, expect, it } from "vitest";
import { applyPremiumExecutionNormalization } from "./premiumExecutionNormalization";
import { KNOWN_BOILERPLATE_SENTENCES } from "./agreementOutputQuality/boilerplateContaminationGuard";

describe("premiumSectionIntegrity", () => {
  it("suppresses misplaced invoice sentence in White-Label Rights", () => {
    const body = [
      "8. WHITE-LABEL RIGHTS",
      "License grant for white-label use.",
      "Invoices shall reference the applicable milestone or service period and are due within thirty (30) days of receipt.",
      "9. WARRANTIES",
      "Each Party represents that it has authority to enter into this Agreement.",
    ].join("\n\n");
    const { text, repairs } = applyPremiumExecutionNormalization(body, { tier: "premium" });
    expect(repairs.some((r) => r.startsWith("misplaced_clause"))).toBe(true);
    expect(text).not.toMatch(/Invoices shall reference the applicable milestone/i);
    expect(text).toMatch(/WHITE-LABEL/i);
  });

  it("suppresses authority warranty helper duplicated in SLA/support section", () => {
    const body = [
      "6. SUPPORT AND SERVICE LEVELS",
      "Uptime targets apply.",
      "Each Party represents that it has authority to enter into this Agreement.",
      "10. WARRANTIES",
      "Each Party represents that it has authority to enter into this Agreement.",
    ].join("\n\n");
    const { text } = applyPremiumExecutionNormalization(body, { tier: "premium" });
    const hits = (text.match(/Each Party represents that it has authority/gi) || []).length;
    expect(hits).toBeLessThanOrEqual(1);
  });

  it("dedupes repeated limitation helper outside Limitation of Liability", () => {
    const helper = "Except as expressly stated in this Agreement, indirect damages are excluded.";
    const body = [
      "3. SCOPE",
      helper,
      "12. LIMITATION OF LIABILITY",
      helper,
      "13. TERMINATION",
      helper,
    ].join("\n\n");
    const { text, repairs } = applyPremiumExecutionNormalization(body, { tier: "premium" });
    expect(
      repairs.some((r) => r.startsWith("boilerplate") || r.startsWith("misplaced_clause")),
    ).toBe(true);
    const count = (text.match(/Except as expressly stated in this Agreement/gi) || []).length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it("known boilerplate list includes orphan splice phrases", () => {
    expect(
      KNOWN_BOILERPLATE_SENTENCES.some((s) => /invoices shall reference/i.test(s)),
    ).toBe(true);
    expect(
      KNOWN_BOILERPLATE_SENTENCES.some((s) => /each party represents/i.test(s)),
    ).toBe(true);
  });
});
