import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Non-integration guard: the review step-buffer handoff should call the persisted
 * refine path (not a fresh local parse) so edit instructions are not re-intake.
 */
describe("AgreementBuilderIntake review refine path", () => {
  it("wires /refine for handoff and step buffer", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("runPersistedRefineFromStepBuffer");
    expect(s).toContain("update_agreement_from_buffer");
    expect(s).toContain("/refine");
    expect(s).not.toMatch(/runProductionLocalDraftParse\([^\)]*draft_reparse_intake_buffer/);
  });
});
