import { describe, expect, it } from "vitest";
import { repairMoneyCommaBracketPlaceholderCorruption } from "./agreementMoneyPlaceholderRepair";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";

const FEE_PROMPT_SNIPPET =
  "$120,000 total project fee. 40% build/configuration. 30% rollout and onboarding. 30% support and acceptance.";

describe("agreementMoneyPlaceholderRepair", () => {
  it("repairs $120, [ADDRESS_1] corruption back to $120,000", () => {
    const raw = `Total fee is $120, [ADDRESS_1] for the project. ${FEE_PROMPT_SNIPPET}`;
    const { text, repairs } = repairMoneyCommaBracketPlaceholderCorruption(raw);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toContain("$120,000");
    expect(text).not.toMatch(/\[ADDRESS_1\]/i);
  });

  it("repairAgreementTemplatePlaceholders applies money repair before party scan", () => {
    const raw = "Compensation: $120, [ADDRESS_1] total.";
    const { text, repaired } = repairAgreementTemplatePlaceholders(raw, { intakeRaw: FEE_PROMPT_SNIPPET });
    expect(repaired.some((r) => r.startsWith("money_comma"))).toBe(true);
    expect(text).toMatch(/\$120,000/);
    expect(text).not.toMatch(/\[ADDRESS_1\]/i);
  });
});
