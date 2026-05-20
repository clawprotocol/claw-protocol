import { describe, expect, it } from "vitest";
import {
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import {
  LAWDOG_ESIGN_CLAUSE,
  LAWDOG_WITNESS_EXECUTION_SENTENCE,
  applyPremiumExecutionNormalization,
  bodyHasManualSignatureFields,
} from "./premiumExecutionNormalization";

describe("premiumExecutionNormalization", () => {
  it("strips manual By/Name/Title/Date/Email blocks and keeps one LawDog execution sentence", () => {
    const raw = buildIroncladPremiumFullDraftBody();
    expect(bodyHasManualSignatureFields(raw)).toBe(true);
    const { text, repairs } = applyPremiumExecutionNormalization(raw, { tier: "premium" });
    expect(repairs.some((r) => r.startsWith("manual_signature"))).toBe(true);
    expect(bodyHasManualSignatureFields(text)).toBe(false);
    expect(text).not.toMatch(/^\s*By:\s*_{2,}/m);
    expect(text).not.toMatch(/^\s*Name:\s*Signatory/m);
    expect(text).toContain(LAWDOG_WITNESS_EXECUTION_SENTENCE);
    expect(text).toContain(LAWDOG_ESIGN_CLAUSE);
    const witnessCount = (text.match(/IN WITNESS WHEREOF/gi) || []).length;
    expect(witnessCount).toBe(1);
    for (const party of IRONCLAD_PARTIES) {
      expect(text).toContain(party);
    }
  });

  it("signer cards remain separate from body (body has no manual fields after normalize)", () => {
    const { text } = applyPremiumExecutionNormalization(buildIroncladPremiumFullDraftBody(), {
      tier: "premium",
    });
    expect(text).not.toMatch(/\bEmail:\s*signer\d+@/i);
  });
});
