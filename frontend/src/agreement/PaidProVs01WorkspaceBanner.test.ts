import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PaidProVs01WorkspaceBanner (static)", () => {
  it("AgreementWizardShell mounts banner when workspace is ready", () => {
    const shell = readFileSync(join(__dirname, "AgreementWizardShell.tsx"), "utf8");
    expect(shell).toContain("PaidProVs01WorkspaceBanner");
    expect(shell).toContain("wizardBoot === \"ready\"");
  });

  it("banner surfaces saved state and proof affordances", () => {
    const p = join(__dirname, "PaidProVs01WorkspaceBanner.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Saved in LawDog");
    expect(s).toContain("Copy signing link");
    expect(s).toContain("View proof");
    expect(s).toContain("Proof status and receipt details");
    expect(s).toContain("readPaidProVs01PostSignHandoff");
  });
});
