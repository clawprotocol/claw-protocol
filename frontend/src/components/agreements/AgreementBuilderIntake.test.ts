import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import { shouldKeepReviewDisplayAfterProHydrate } from "./sendHandoffAuthoritativeCorpus";

describe("AgreementBuilderIntake paid-pro resume + hydrate contract", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
    clearCreateReviewAgreementResumeId();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips agreement_id in session for /app/send → /app/create resume hydration", () => {
    writeCreateReviewAgreementResumeId("  agr-xyz  ");
    expect(readCreateReviewAgreementResumeId()).toBe("agr-xyz");
  });

  it("hydrate shape: server_full_document_text length + render source keeps review (not intake)", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "b".repeat(600),
      premium_full_document_text: "",
      premium_server_full_document_text: "",
    };
    expect(shouldKeepReviewDisplayAfterProHydrate(d)).toBe(true);
  });

  it("runPersistAndOpen must not clear premium completion state (regression: paid Pro → free intake)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).not.toMatch(/runPersistAndOpen[\s\S]{0,12000}clearPremiumCompletionStateAfterSend/);
  });

  it("paid authoritative recipient step uses intent-specific validation copy (review vs signature)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("paidProAuthoritative");
    expect(s).toContain('"Confirm and create review links"');
    expect(s).toContain('"Confirm and send for signature"');
    expect(s).toContain("Add at least one recipient email to create review links.");
    expect(s).toContain("Add at least one signer email to continue.");
    expect(s).toContain("Sign first before sending");
  });

  it("paid Pro durable send intent: ref + session keys + handoff resolution + dev trace", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("paidProPremiumSendIntentRef");
    expect(s).toMatch(/handlePremiumSendModePick[\s\S]{0,900}writePremiumSendIntent/m);
    expect(s).toMatch(/paidProResolvedHandoffIntent[\s\S]{0,900}premiumSendHandoffIntent/s);
    expect(s).toContain("[premium-send-intent]");
    expect(s).toMatch(/peekPremiumForkUserSendMode\(\)\s*\?\?\s*peekPremiumSendIntent\(\)/);
  });

  it("paid authoritative recipient handoff uses advancePaidProToRecipientSetup in both handOff and runPrimary paths", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const matches = [
      ...s.matchAll(/if\s*\(\s*paidProAuthoritative\s*\)\s*\{[\s\S]*?advancePaidProToRecipientSetup\(\)/g),
    ];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("handOffProductionDraftToRecipients advances paid authoritative via advancePaidProToRecipientSetup only when paid", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const handOffProductionDraftToRecipients");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const handlePremiumReviewFirstContinueToSigners", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toMatch(/if\s*\(\s*paidProAuthoritative\s*\)[\s\S]*advancePaidProToRecipientSetup/);
    expect(block).toMatch(/else\s*\{[\s\S]*setCreateFlowPhase\("recipient_setup_required"\)/);
  });

  it("guided intake reset effect bails out for paid authoritative Pro (no INPUT regression)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("if (guidedStructureComplete) return;");
    expect(i).toBeGreaterThanOrEqual(0);
    const slice = s.slice(i, i + 500);
    expect(slice).toContain("if (paidProAuthoritative) return;");
  });

  it("applyMissingAnswer keeps displayPhase review for authoritative paid Pro two-pane", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const applyMissingAnswer = async");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const paidProAuthoritative = useMemo", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toContain("isPaidProAgreementAuthoritative");
    expect(block).toContain('setDisplayPhase(authoritative ? "review" : "intake")');
  });

  it("runPersistAndOpen hydrate-fallback uses review displayPhase when authoritative", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("if (createProductionTwoPane && !hydrate && structuredOk)");
    expect(i).toBeGreaterThanOrEqual(0);
    const frag = s.slice(i, i + 550);
    expect(frag).toContain("isPaidProAgreementAuthoritative");
    expect(frag).toContain('? "review"');
    expect(frag).toContain(': "intake"');
  });

  it("shows Pro refine “What changed” under preview when host wires onProRefineWhatChanged", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("proRefineWhatChangedSummary");
    expect(s).toContain("onProRefineWhatChanged=");
    expect(s).toContain("What changed:");
  });

  it("paid persisted refine uses augmentPremiumRefineUserPrompt and resolvePremiumRefineApplyOutcome", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    const block = s.slice(i, j);
    expect(block).toContain("augmentPremiumRefineUserPrompt(instruction)");
    expect(block).toContain("resolvePremiumRefineApplyOutcome");
    expect(block).toContain("setProRefineWhatChangedSummary");
  });

  it("starter tier gates premiumPaidDocumentSurface only on paid completion session or persisted premium flow", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const premiumPaidDocumentSurface = useMemo");
    expect(i).toBeGreaterThanOrEqual(0);
    const frag = s.slice(i, i + 1400);
    expect(frag).toContain("CRITICAL INVARIANT:");
    expect(frag).toContain("!tierAllowsAdvancedFullDraftReveal(tier)");
    expect(frag).toContain(
      "return Boolean(hasPaidPremiumCompletionSession() || premiumPersistedFlowActive);",
    );
    expect(frag).not.toContain("peekAdvancedFullDraftCheckoutGrant()");
    expect(frag).not.toContain("premiumSendPathUnlocked");
    expect(frag).toContain("return true");
  });

  it("premiumCompletion URL is honored via hasPaidPremiumCompletionSession (starter Pro surface path)", () => {
    const p = join(__dirname, "premiumCompletionStorage.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain('get("premiumCompletion") === "1"');
  });

  it("basic parse path uses basic_parse_timeout abort reason (not premium_parse_timeout)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toMatch(
      /controller\.abort\(\s*isPremium\s*\?\s*"premium_parse_timeout"\s*:\s*"basic_parse_timeout"\s*\)/,
    );
  });

  it("continue_basic_draft opens full-draft upgrade checkout when not paid authoritative and no premium session flags", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf('case "continue_basic_draft"');
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf('case "update_agreement_from_buffer"', i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toContain("paidProAuthoritative");
    expect(block).toContain("premiumPersistedFlowActive");
    expect(block).toContain("hasPaidPremiumCompletionSession()");
    expect(block).toContain("launchUpgradeCheckoutFromStarterDraft");
    expect(block).toContain("handOffProductionDraftToRecipients");
    const k = block.indexOf("if (!eligibleForRecipientSetupAfterStarterPreview)");
    expect(k).toBeGreaterThanOrEqual(0);
    const untilHandOff = block.indexOf("await handOffProductionDraftToRecipients", k);
    const upgradeCall = block.indexOf("await launchUpgradeCheckoutFromStarterDraft()", k);
    expect(upgradeCall).toBeGreaterThanOrEqual(0);
    expect(untilHandOff).toBeGreaterThan(upgradeCall);
    const earlyReturn = block.indexOf("return;", upgradeCall);
    expect(earlyReturn).toBeGreaterThanOrEqual(0);
    expect(earlyReturn).toBeLessThan(untilHandOff);
  });

  it("continue_basic_draft unpaid branch does not call handOffProductionDraftToRecipients before return", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf('case "continue_basic_draft"');
    const j = s.indexOf('case "update_agreement_from_buffer"', i);
    const block = s.slice(i, j);
    expect(block).toMatch(
      /if\s*\(\s*!eligibleForRecipientSetupAfterStarterPreview\s*\)\s*\{[\s\S]*?await launchUpgradeCheckoutFromStarterDraft\(\);\s*return;\s*\}/,
    );
    const gate = block.indexOf("if (!eligibleForRecipientSetupAfterStarterPreview)");
    const launch = block.indexOf("await launchUpgradeCheckoutFromStarterDraft()", gate);
    const ret = block.indexOf("return;", launch);
    const hand = block.indexOf("handOffProductionDraftToRecipients", gate);
    expect(launch).toBeGreaterThan(gate);
    expect(ret).toBeGreaterThan(launch);
    expect(ret).toBeLessThan(hand);
    const unpaidSlice = block.slice(gate, ret + "return;".length);
    expect(unpaidSlice).toContain("continue_basic_draft → upgrade_checkout");
    expect(unpaidSlice).not.toContain("handOffProductionDraftToRecipients");
    expect(unpaidSlice).not.toContain("recipient_setup_required");
    expect(unpaidSlice).not.toContain("finalizeIntakeCapture");
  });

  it("launchUpgradeCheckoutFromStarterDraft does not gate on simpleProductFlow or call parseDraft before paywall", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const launchUpgradeCheckoutFromStarterDraft = React.useCallback");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const runProductionLocalDraftParse = React.useCallback", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).not.toMatch(/if\s*\(\s*!createProductionTwoPane\s*\|\|\s*!simpleProductFlow\s*\)\s*return/);
    expect(block).not.toContain("await parseDraft(");
    expect(block).not.toContain("finalizeIntakeCapture");
    expect(block).toContain("setAdvancedFullDraftPaywallOpen(true)");
    expect(block).toContain("stashCreateComplexityResume");
  });

  it("continue_basic_draft paid or premium-session path still calls handOffProductionDraftToRecipients after clearUpgradeLockAndResume", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf('case "continue_basic_draft"');
    const j = s.indexOf('case "update_agreement_from_buffer"', i);
    const block = s.slice(i, j);
    expect(block).toMatch(
      /clearUpgradeLockAndResume\(\);\s*await handOffProductionDraftToRecipients\(\);\s*return;/,
    );
  });

  it("paid authoritative Pro hides top adjust card but keeps lower Finalize panel", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("showTopProAdjustCard");
    expect(intake).toMatch(/showTopProAdjustCard\s*=\s*Boolean\([\s\S]*?!paidProAuthoritative/);
    expect(intake).toContain("Want to adjust this agreement?");
    expect(intake).toContain("{showTopProAdjustCard ?");
    expect(intake).toContain("FinalizeYourAgreementPanel");
    expect(intake).toContain("showProLawdogRefineAndFinalize");
    const finalize = readFileSync(join(__dirname, "FinalizeYourAgreementPanel.tsx"), "utf8");
    expect(finalize).toContain("Choose how to deliver");
  });

  it("paid Pro finalize routes: review pick+continue; authoritative signature waits on draft then continue control", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain('handleFinalizeRoutePrimaryAction("review")');
    expect(intake).toContain('handleFinalizeRoutePrimaryAction("signature")');
    expect(intake).toMatch(/!paidProAuthoritative\s*\|\|\s*mode\s*===\s*["']review["']/);
    expect(intake).toContain("draft_signature_options");
    expect(intake).toContain("showSignatureRecipientContinue");
    expect(intake).toContain("onContinueToRecipientSetup");
    expect(intake).toContain("Share for review");
    expect(intake).toContain("Create review links");
    expect(intake).toContain("Nothing changes unless you accept it");
  });

  it("sign-first control is gated to paid signature recipients (not review mode)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(
      /\(createUiStage === CreateUiStage\.RECIPIENTS \|\| paidProRecipientSetupOnDraft\)[\s\S]*?effectivePremiumSendMode === "signature"\s*\?[\s\S]*?Sign first before sending/,
    );
  });

  it("paid authoritative advance keeps DRAFT and uses paidProRecipientSetupOnDraft for production send gates", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const adv = intake.indexOf("const advancePaidProToRecipientSetup = useCallback");
    expect(adv).toBeGreaterThanOrEqual(0);
    const advBlock = intake.slice(adv, adv + 420);
    expect(advBlock).toContain("setCreateUiStage(CreateUiStage.DRAFT)");
    expect(advBlock).not.toContain("CreateUiStage.RECIPIENTS");
    expect(intake).toContain("paidProRecipientSetupOnDraft");
    expect(intake).toContain("paidProInlineRecipientShell");
    expect(intake).toContain("Confirm and create review links");
  });

  it("paid Pro recipient fields mount below finalize with inline shell (not legacy Share headline constant)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(
      /\{paidProRecipientSetupOnDraft \? \([\s\S]*?<CreateFlowSendRecipientsPanel[\s\S]*?paidProInlineRecipientShell/,
    );
    expect(intake).toMatch(
      /\{paidProInlineRecipientShell \? "Add recipient emails" : "Share this agreement"\}/,
    );
  });

  it("paid authoritative Pro: snapshot hydration prefers DRAFT; persist coerces RECIPIENTS; invariant self-heals", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("hydratePaidAuthoritative");
    expect(intake).toMatch(/setCreateUiStage\(\s*hydratePaidAuthoritative \? CreateUiStage\.DRAFT : CreateUiStage\.RECIPIENTS\s*\)/);
    expect(intake).toMatch(
      /paidProAuthoritative\s*\?[\s\S]*?createUiStage === CreateUiStage\.DRAFT \|\| createUiStage === CreateUiStage\.RECIPIENTS/,
    );
    expect(intake).toMatch(/if \(paidProAuthoritative\) \{[\s\S]*?setCreateUiStage\(CreateUiStage\.DRAFT\)/);
    expect(intake).toContain("[invariant-violation] paid Pro should not enter RECIPIENTS");
  });

  it("paid Pro send confirmation modal includes I will sign first for signature mode only", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("premiumSendConfirmSignFirst");
    expect(intake).toContain("I&apos;ll sign first");
    expect(intake).toContain("Sign your copy before the other party receives their signing link.");
  });

  it("paid authoritative production send passes premium intent into runPersistAndOpen handoff", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("premiumSendHandoffIntent");
    expect(intake).toMatch(/inlineContextualSend\s*\|\|\s*paidProAuthoritative/);
  });

  it("paid Pro post-checkout success card no longer pushes vague Continue to recipient setup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).not.toContain("Continue to recipient setup");
    expect(intake).toContain("Send for review");
    expect(intake).toContain("Send for signature");
  });

  it("hides sticky bottom CTA while finalize panel owns paid Pro delivery choice", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("hideStickyForPaidProFinalizeDeliveryChoice");
    expect(intake).toContain("simpleCreateStickyBottomBarVisibleBase");
    expect(intake).toMatch(
      /simpleCreateStickyBottomBarVisible\s*=\s*simpleCreateStickyBottomBarVisibleBase\s*&&\s*!hideStickyForPaidProFinalizeDeliveryChoice/,
    );
  });

  it("emits premium-send-shell-guard when paid Pro suppresses generic create shell paths", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("[premium-send-shell-guard]");
    expect(intake).toContain("devPremiumSendShellGuard");
    expect(intake).toContain("[premium-send-choice]");
    expect(intake).toContain("[premium-send-route]");
  });
});
