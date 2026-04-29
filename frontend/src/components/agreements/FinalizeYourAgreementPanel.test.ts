import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FinalizeYourAgreementPanel Pro refine → host summary", () => {
  it("declares optional onProRefineWhatChanged and invokes it when refine applies", () => {
    const p = join(__dirname, "FinalizeYourAgreementPanel.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("onProRefineWhatChanged?:");
    expect(s).toContain("onProRefineWhatChanged?.(");
    expect(s).toContain("summary_changes");
  });
});
