import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAID_RECOVERY_USER_COPY =
  "We had a connection issue while finishing your Pro agreement. Your payment was detected. Try again to finish Pro generation.";

/**
 * Contract tests on AgreementBuilderIntake source: paid checkout return must not surface unpaid starter
 * upsell paths or drop the user to intake when premium-full-draft fails; retry must reuse runPremiumModelPassRef.
 */
describe("AgreementBuilderIntake paid premium completion recovery (source contract)", () => {
  const intakePath = join(__dirname, "AgreementBuilderIntake.tsx");
  const src = readFileSync(intakePath, "utf8");

  it("defines paid connection recovery copy for amber panel and custom gate", () => {
    expect(src).toContain(`const PAID_PREMIUM_CONNECTION_RECOVERY_COPY =\n  "${PAID_RECOVERY_USER_COPY}";`);
  });

  it("starter Pro refine upsell is suppressed when paid completion session is active", () => {
    const m = src.match(/const showStarterProRefineUpsell = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(m, "showStarterProRefineUpsell useMemo block").not.toBeNull();
    expect(m![1].trimStart()).toMatch(/^\s*if \(hasPaidPremiumCompletionSession\(\)\) return false;/);
  });

  it("free starter review surface is false when paid completion session is active", () => {
    const m = src.match(/const isFreeStarterReviewSurface = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(m, "isFreeStarterReviewSurface useMemo block").not.toBeNull();
    expect(m![1].trimStart()).toMatch(/^\s*if \(hasPaidPremiumCompletionSession\(\)\) return false;/);
  });

  it("applyFailureFallback keeps runPremiumModelPassRef when paidCheckoutRecovery is true", () => {
    expect(src).toMatch(/if \(!paidRecovery\) \{\s*runPremiumModelPassRef\.current = null;\s*\}/);
    expect(src).toContain("paidCheckoutRecovery: true");
  });

  it("clears runPremiumModelPassRef after failure only when not in paid completion session (retry without checkout)", () => {
    expect(src).toContain(
      "if (result != null || !hasPaidPremiumCompletionSession()) {\n            runPremiumModelPassRef.current = null;\n          }",
    );
  });

  it("optional full-draft upgrade failure keeps review phase when paid completion session is active", () => {
    expect(src).toContain('setDisplayPhase(hasPaidPremiumCompletionSession() ? "review" : "intake")');
  });

  it("applyFailureFallback after paid draft handoff sets review phase in simple product two-pane", () => {
    expect(src).toMatch(
      /commitParsedDraftToReviewFlow\([\s\S]*?\);\s*if \(createProductionTwoPane && simpleProductFlow\) \{\s*setDisplayPhase\("review"\);\s*\}/,
    );
  });

  it("handleRetryProFullDraft invokes stored premium pass without opening checkout", () => {
    const start = src.indexOf("const handleRetryProFullDraft = React.useCallback(");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("}, [draft, resolveRawIntakeForPremiumCheckout]);", start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toContain("runPremiumModelPassRef.current");
    expect(block).toContain("void m(");
    expect(block).not.toContain("beginAdvancedFullDraftCheckout");
  });

  it("starter upgrade card remains gated behind showStarterProRefineUpsell", () => {
    expect(src).toMatch(/\{showStarterProRefineUpsell \? \(/);
    expect(src).toContain("STARTER_PRO_REFINE_IMPROVEMENT_HEADING");
  });
});
