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

  it("keeps the persisted refine error path on inline copy, not a cleared buffer in catch", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("REFINE_PERSISTED_UPDATE_FAIL_INLINE");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    if (i < 0) throw new Error("missing runPersistedRefineFromStepBuffer");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    if (j < 0) throw new Error("missing end anchor");
    const block = s.slice(i, j);
    expect(block).toContain("REFINE_PERSISTED_UPDATE_FAIL_INLINE");
    const catchI = block.indexOf("} catch (e) {");
    if (catchI < 0) throw new Error("missing catch in runPersistedRefine");
    const finallyI = block.indexOf("} finally {", catchI);
    if (finallyI < 0) throw new Error("missing finally");
    const catchBlock = block.slice(catchI, finallyI);
    expect(catchBlock).not.toMatch(/setIntakeStepBuffer\s*\(/);
    expect(catchBlock).not.toMatch(/setDebouncedStepBuffer/);
  });

  it("does not call local draft parse from inside the persisted refine callback", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    if (i < 0) throw new Error("missing");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    if (j < 0) throw new Error("missing end");
    const block = s.slice(i, j);
    expect(block).not.toMatch(/runProductionLocalDraftParse/);
  });

  it("gates large persisted refine box on Pro/unlocked; starter uses Pro checkout upsell card", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("showPersistedRefineBelowDocument");
    expect(s).toContain("showStarterProRefineUpsell");
    expect(s).toContain("claw-refine-starter-pro-upsell");
    expect(s).toContain("beginAdvancedFullDraftCheckout");
    expect(s).toContain("starter_pro_refine_upsell_control_click");
    expect(s).toContain("starter_pro_refine_upsell_variant_click");
    expect(s).toContain("starterProRefineCtaExperiment");
    expect(s).toContain("starterProRefineImpressionFunnelEvent");
    expect(s).toContain("starterProRefineUpsellCardRef");
    expect(s).toContain("IntersectionObserver");
  });

  it("emits Starter Pro experiment checkout success on create-flow completion from stashed context", () => {
    const checkout = join(__dirname, "../../launch/simpleProduct/SimpleCheckoutPage.tsx");
    const sc = readFileSync(checkout, "utf8");
    expect(sc).toContain("trackStarterProRefineCheckoutSuccessFromContext");
    expect(sc).toContain("readUpgradeCheckoutContext");
  });
});
