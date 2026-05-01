import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vs01Wizard agreement bridge (static)", () => {
  it("handles agreement_bridge query and session handoff", () => {
    const p = join(__dirname, "Vs01Wizard.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("agreement_bridge");
    expect(s).toContain("readAgreementVs01BridgeSession");
    expect(s).toContain("goToStep(2)");
  });
});
