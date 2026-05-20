import { describe, expect, it } from "vitest";
import { renumberVisibleSubsections } from "./premiumExecutionNormalization";
import { finalizeAgreementOutput } from "./agreementOutputQuality";

describe("premiumNumberingContinuity", () => {
  it("renumbers skipped subsections sequentially within a major section", () => {
    const input = [
      "5. FEES AND PAYMENT",
      "5.2 First tranche.",
      "5.3 Second tranche.",
      "5.5 Final tranche.",
      "9. GENERAL",
      "9.2 Survival.",
      "9.4 Miscellaneous.",
    ].join("\n");
    const { text, fixed } = renumberVisibleSubsections(input);
    expect(fixed).toBeGreaterThan(0);
    expect(text).toMatch(/5\.1\s+First tranche/);
    expect(text).toMatch(/5\.2\s+Second tranche/);
    expect(text).toMatch(/5\.3\s+Final tranche/);
    expect(text).not.toMatch(/5\.5\s+Final/);
    expect(text).toMatch(/9\.1\s+Survival/);
    expect(text).toMatch(/9\.2\s+Miscellaneous/);
  });

  it("finalizeAgreementOutput premium path applies subsection renumbering", () => {
    const raw = [
      "AGREEMENT",
      "2. SCOPE",
      "2.1 Alpha.",
      "2.5 Beta.",
      "2.6 Gamma.",
    ].join("\n");
    const out = finalizeAgreementOutput(raw, {
      intakeRaw: "parties and scope",
      surface: "test",
      tier: "premium",
    });
    expect(out.text).toMatch(/2\.1\s+Alpha/);
    expect(out.text).toMatch(/2\.2\s+Beta/);
    expect(out.text).toMatch(/2\.3\s+Gamma/);
    expect(out.text).not.toMatch(/2\.5\s+Beta/);
  });
});
