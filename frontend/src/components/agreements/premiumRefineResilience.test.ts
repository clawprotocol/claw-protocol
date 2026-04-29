import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRO_REFINE_UNAVAILABLE_USER_MESSAGE } from "./premiumRefineApi";

describe("Pro refine resilience (paid update path)", () => {
  it("maps HTTP 503 from premium-refine to a safe user-facing message", () => {
    const p = join(__dirname, "premiumRefineApi.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("res.status === 503");
    expect(s).toContain("PRO_REFINE_UNAVAILABLE_USER_MESSAGE");
    expect(s).toContain("PREMIUM_REFINE_FETCH_TIMEOUT_MS");
  });

  it("runPersistedRefineFromStepBuffer clears generating/working phases in finally", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    if (i < 0) throw new Error("missing runPersistedRefineFromStepBuffer");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    if (j < 0) throw new Error("missing end anchor");
    const block = s.slice(i, j);
    expect(block).toContain("premiumPersistedFlowActive");
    expect(block).toContain('setDisplayPhase("review")');
    const finallyI = block.indexOf("} finally {");
    if (finallyI < 0) throw new Error("missing finally");
    const finallyEnd = block.indexOf("}, [", finallyI);
    const finallyBlock = block.slice(finallyI, finallyEnd > 0 ? finallyEnd : undefined);
    expect(finallyBlock).toContain('setDisplayPhase("review")');
    expect(finallyBlock).toContain('setDisplayPhase("intake")');
    expect(finallyBlock).toContain('setCreateFlowPhase("draft_ready_for_review")');
    expect(finallyBlock).toContain("setLoading(false)");
  });

  it("paid premium refine failure sets hardError when premium-refine returns the unavailable message", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    if (i < 0) throw new Error("missing runPersistedRefineFromStepBuffer");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    const block = s.slice(i, j);
    expect(block).toContain("PRO_REFINE_UNAVAILABLE_USER_MESSAGE");
    expect(block).toContain("setHardError(PRO_REFINE_UNAVAILABLE_USER_MESSAGE)");
  });

  it("persisted refine callback does not launch checkout", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    const block = s.slice(i, j);
    expect(block).not.toContain("beginAdvancedFullDraftCheckout");
    expect(block).not.toContain("checkout_launch");
  });

  it("documents advisory endpoints as best-effort vs refine", () => {
    const p = join(__dirname, "premiumAdvisoryPostAccept.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("must not block");
    expect(s).toContain("premium-review");
  });
});

describe("PRO_REFINE_UNAVAILABLE_USER_MESSAGE export", () => {
  it("matches copy used in premium-refine API", () => {
    expect(PRO_REFINE_UNAVAILABLE_USER_MESSAGE).toContain("unchanged");
    expect(PRO_REFINE_UNAVAILABLE_USER_MESSAGE.length).toBeGreaterThan(40);
  });
});

describe("Premium refine no-op apply guard", () => {
  it("paid path rejects unchanged candidates without showing Change applied", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('evaluatePremiumRefineCandidate(out, currentDoc, currentProLen, r.summary_changes)');
    expect(s).toContain('acceptance.decision === "rejected_unchanged"');
    expect(s).toContain("PRO_REFINE_UNAVAILABLE_USER_MESSAGE");
  });
});

describe("Pro display phase guard", () => {
  it("warns and repairs intake when a Pro document is present", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("[STATE GUARD VIOLATION] Pro document fell back to intake");
    expect(s).toContain("guardProDocumentDisplayPhase");
  });
});

describe("Pro refine preserves authoritative pipeline source on apply", () => {
  it("pins premiumPipelineRenderSource when merging snapshot after refine", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("premiumPipelineRenderSource: PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE");
    expect(s).toContain("premiumRenderResolveSource: PREMIUM_REFINE_AUTHORITATIVE_PIPELINE_SOURCE");
  });
});
