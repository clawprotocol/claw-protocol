import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementWizardShell owner jump to recipients", () => {
  it("wires onOwnerJumpToRecipientsStep to the Recipients wizard step", () => {
    const p = join(__dirname, "AgreementWizardShell.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("onOwnerJumpToRecipientsStep={ownerJumpToRecipientsStep}");
    expect(s).toContain("const ownerJumpToRecipientsStep = useCallback(() => {");
    expect(s).toContain("guardedSetStep(3);");
  });
});
