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
    expect(src).toContain(PAID_RECOVERY_USER_COPY);
    expect(src).toContain("premium_network_local_recovery");
  });

  it("starter Pro refine upsell is suppressed when paid completion session is active", () => {
    const m = src.match(/const showStarterProRefineUpsell = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(m, "showStarterProRefineUpsell useMemo block").not.toBeNull();
    expect(m![1].trimStart()).toMatch(/^\s*if \(hasPaidPremiumCompletionSession\(\)\) return false;/);
    expect(m![1]).toContain("if (authoritativePremiumUiCommitted) return false;");
  });

  it("free starter review surface is false when paid completion session is active", () => {
    const m = src.match(/const isFreeStarterReviewSurface = useMemo\(\(\) => \{([\s\S]*?)\}, \[/);
    expect(m, "isFreeStarterReviewSurface useMemo block").not.toBeNull();
    expect(m![1]).toContain("if (hasPaidPremiumCompletionSession()) return false;");
  });

  it("applyFailureFallback keeps runPremiumModelPassRef when paidCheckoutRecovery is true", () => {
    expect(src).toMatch(/if \(!paidRecovery\) \{\s*runPremiumModelPassRef\.current = null;\s*\}/);
    expect(src).toContain("paidCheckoutRecovery: true");
  });

  it("clears runPremiumModelPassRef after failure only when not retryable and not in paid completion session", () => {
    expect(src).toContain(
      "if (!retryableResult && (result != null || !hasPaidPremiumCompletionSession()))",
    );
    expect(src).toContain("runPremiumModelPassRef.current = null");
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
  });

  it("amber Pro recovery stays tied to premiumPaidDocumentSurface (starter cannot get surface without session flags)", () => {
    expect(src).toContain("const showProAmberRecoveryPanel = Boolean(");
    expect(src).toMatch(/premiumPaidDocumentSurface\s*&&\s*!proUpgradeUseStarterView/);
    const i = src.indexOf("const premiumPaidDocumentSurface = useMemo");
    expect(i).toBeGreaterThan(-1);
    const frag = src.slice(i, i + 1400);
    expect(frag).toContain("!tierAllowsAdvancedFullDraftReveal(tier)");
    expect(frag).toContain("hasPaidPremiumCompletionSession()");
  });

  it("paid Pro upgrade failure copy remains available for real paid recovery panels", () => {
    expect(src).toContain("PREMIUM_NETWORK_RECOVERABLE_HEADLINE");
    expect(src).toContain("PREMIUM_NETWORK_RECOVERABLE_RETRY_LABEL");
  });

  it("suppresses amber recovery while premium return wait is active (patience / in-flight)", () => {
    expect(src).toContain("const premiumReturnWaitActive = Boolean(");
    expect(src).toMatch(/showProAmberRecoveryPanel = Boolean\([\s\S]*?!premiumReturnWaitActive/);
  });

  it("suppresses amber recovery when authoritative premium UI is committed", () => {
    expect(src).toMatch(/showProAmberRecoveryPanel = Boolean\([\s\S]*?!authoritativePremiumUiCommitted/);
  });

  it("120s hard ceiling defers to patience extended when authoritative request is in flight", () => {
    expect(src).toContain("onHardPatienceThresholdTimeout");
    expect(src).toContain("[premium-modal-hard-ceiling-nonterminal]");
    expect(src).toContain("[premium-return-wait-extended]");
    expect(src).toContain("setPremiumReturnPatienceExtended(true)");
  });

  it("does not call applyPremiumModalFailopen from hard ceiling while request is in flight", () => {
    const start = src.indexOf("const onHardPatienceThresholdTimeout = () => {");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("const runModelPass = async", start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toContain("premiumAuthoritativeRequestInFlightRef.current");
    expect(block).toContain("return;");
    expect(block).not.toMatch(/applyPremiumModalFailopen\([\s\S]*premiumAuthoritativeRequestInFlightRef/);
  });

  it("logs explicit user fallback to starter draft", () => {
    expect(src).toContain("[premium-return-user-fallback]");
    expect(src).toContain("PREMIUM_RETURN_USE_STARTER_LABEL");
    expect(src).toContain("PremiumProGenerationWaitPanel");
    expect(src).toContain("logPremiumProWaitSuccessTransition");
    expect(src).not.toContain("Still finishing your Pro agreement");
  });

  it("logs late premium success after patience or failopen wait", () => {
    expect(src).toContain("[premium-return-late-success-applied]");
    expect(src).toContain("shouldLogPremiumReturnLateSuccess");
  });

  it("logs terminal premium completion boundary timeout", () => {
    expect(src).toContain("[premium-return-terminal-timeout]");
    expect(src).toContain("PREMIUM_COMPLETION_ATTEMPT_MAX_MS");
  });

  it("network recoverable preserves paid session and reuses intake fingerprint on retry", () => {
    expect(src).toContain("premium_network_recoverable");
    expect(src).toContain("handlePremiumRecoverableContinueWithStarterDraft");
    expect(src).toContain("preserve_paid: true");
    expect(src).not.toMatch(
      /handlePremiumRecoverableContinueWithStarterDraft[\s\S]{0,400}clearPaidPremiumCompletionSession/,
    );
    expect(src).toContain("premiumGapBaseIntakeRef");
    expect(src).toContain("shortIntakeFingerprint(base)");
  });
});
