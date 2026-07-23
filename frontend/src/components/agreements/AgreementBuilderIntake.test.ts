import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import { shouldKeepReviewDisplayAfterProHydrate } from "./sendHandoffAuthoritativeCorpus";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "./signerSetupPartyIdentity";

/** Extract a brace-balanced declaration body starting at `decl` (avoids brittle char windows). */
function extractBalancedDecl(source: string, decl: string): string {
  const start = source.indexOf(decl);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let begun = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      begun = true;
    } else if (ch === "}") {
      depth -= 1;
      if (begun && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced declaration starting at ${decl}`);
}

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

  it("production GET resume merges authoritative Pro fields after coerceDraftFromApiPayload", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("mergePaidProAuthoritativeDraftFieldsFromApi");
    expect(s).toMatch(/coerceDraftFromApiPayload\([\s\S]{0,220}mergePaidProAuthoritativeDraftFieldsFromApi/m);
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
    expect(s).toContain('"Create review link"');
    expect(s).toContain('"Confirm and send for signature"');
    expect(s).toContain("Add at least one recipient email to create review links.");
    expect(s).toContain("Add at least one signer email to continue.");
    expect(s).toContain("I&apos;ll sign first");
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

  it("paid authoritative recipient handoff uses advancePaidPro when inline signers surface is ready (handOff + runPrimary)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const matches = [
      ...s.matchAll(/paidProInlineRecipientReady[\s\S]*?advancePaidProToRecipientSetup\(\)/g),
    ];
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(s).toContain("peekPremiumRecipientsSurfaceReleased()");
  });

  it("handOffProductionDraftToRecipients gates advancePaidPro on inline signers readiness", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const handOffProductionDraftToRecipients");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const handlePremiumReviewFirstContinueToSigners", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toContain("paidProInlineRecipientReady");
    expect(block).toMatch(/if\s*\(\s*paidProInlineRecipientReady\s*\)[\s\S]*advancePaidProToRecipientSetup/);
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
    const frag = s.slice(i, i + 900);
    expect(frag).toContain("paidProFallback");
    expect(frag).toContain("isPaidProAgreementAuthoritative");
    expect(frag).toContain('setDisplayPhase("review")');
    expect(frag).toMatch(/commitFreeDraftForReview|paidProFallback/);
  });

  it("shows Pro refine “What changed” under preview when host wires onProRefineWhatChanged", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("proRefineWhatChangedSummary");
    expect(s).toContain("onProRefineWhatChanged=");
    expect(s).toContain("What changed:");
  });

  it("paid persisted refine uses executePremiumRefineUpdate (surgical retry + fallbacks)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("const runPersistedRefineFromStepBuffer =");
    const j = s.indexOf("const resolveComplexityChoice =", i);
    const block = s.slice(i, j);
    expect(block).toContain("executePremiumRefineUpdate({");
    expect(block).toContain("userInstruction: instruction");
    expect(block).toContain("setProRefineWhatChangedSummary");
  });

  it("starter tier gates premiumPaidDocumentSurface only on paid completion session or persisted premium flow", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const frag = extractBalancedDecl(s, "const premiumPaidDocumentSurface = useMemo");
    // Free/starter streamline must force the surface off (guard may sit deep in the memo).
    expect(frag).toContain("resolveIsFreeStreamlineDraftReview");
    const streamlineIdx = frag.indexOf("resolveIsFreeStreamlineDraftReview");
    expect(streamlineIdx).toBeGreaterThanOrEqual(0);
    expect(frag.slice(streamlineIdx, streamlineIdx + 900)).toMatch(/\{\s*return false;\s*\}/);
    expect(frag).toContain("hasPaidProSourceOfTruth()");
    expect(frag).toContain("hasPaidPremiumCompletionSession()");
    expect(frag).toContain("CRITICAL INVARIANT:");
    expect(frag).toContain("!tierAllowsAdvancedFullDraftReveal(tier)");
    expect(frag).toContain("hasPaidProChromeAuthority");
    expect(frag).toMatch(
      /\(hasPaidPremiumCompletionSession\(\) \|\| premiumPersistedFlowActive\) && chromeAuthority/,
    );
    expect(frag).not.toContain("peekAdvancedFullDraftCheckoutGrant()");
    const invariantIdx = frag.indexOf("CRITICAL INVARIANT:");
    expect(invariantIdx).toBeGreaterThanOrEqual(0);
    const starterGateReturn = frag.slice(invariantIdx, frag.indexOf("return chromeAuthority;", invariantIdx));
    // Starter gate must not reopen Pro paper via send-path unlock heuristics.
    expect(starterGateReturn).not.toContain("premiumSendPathUnlocked");
    // SoT / completion session still short-circuits the surface on for paid review.
    expect(frag).toMatch(
      /if \(hasPaidProSourceOfTruth\(\) \|\| hasPaidPremiumCompletionSession\(\)[\s\S]*?\) \{\s*return true;/,
    );
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
    expect(s).toContain("resolvePremiumAgreementParseTimeoutMs");
  });

  it("continue_basic_draft opens full-draft upgrade checkout when not paid authoritative and no premium session flags", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf('case "continue_basic_draft"');
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf('case "update_agreement_from_buffer"', i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toMatch(/\(paidProAuthoritative && premiumSignersSurfaceReady\)/);
    expect(block).toContain("premiumPersistedFlowActive");
    expect(block).toContain("hasPaidPremiumCompletionSession()");
    expect(block).toContain("launchCreateFlowProCheckoutRef");
    expect(block).toContain("handOffProductionDraftToRecipients");
    const k = block.indexOf("if (!eligibleForRecipientSetupAfterStarterPreview)");
    expect(k).toBeGreaterThanOrEqual(0);
    const untilHandOff = block.indexOf("await handOffProductionDraftToRecipients", k);
    const upgradeCall = block.indexOf("launchCreateFlowProCheckoutRef.current", k);
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
      /if\s*\(\s*!eligibleForRecipientSetupAfterStarterPreview\s*\)\s*\{[\s\S]*?launchCreateFlowProCheckoutRef\.current[\s\S]*?return;\s*\}/,
    );
    const gate = block.indexOf("if (!eligibleForRecipientSetupAfterStarterPreview)");
    const launch = block.indexOf("launchCreateFlowProCheckoutRef.current", gate);
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

  it("launchUpgradeCheckoutFromStarterDraft delegates to create-flow checkout (no paywall modal)", () => {
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
    expect(block).not.toContain("setAdvancedFullDraftPaywallOpen(true)");
    expect(block).toContain("launchCreateFlowProCheckoutRef.current");
  });

  it("free draft primary CTA uses Pro checkout labels (not Continue to send) when showUpgradeToFullDraftOnReview", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf("if (showUpgradeToFullDraftOnReview)");
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf("const firstBlocker = draft", i);
    expect(j).toBeGreaterThan(i);
    const block = s.slice(i, j);
    expect(block).toContain("PRO_CTA_CONTINUE");
    expect(block).not.toMatch(/label:\s*["']Upgrade to send["']/);
    expect(block).toContain("STARTER_PARTY_PRO_REQUIRED_CTA_LABEL");
    expect(block).toContain('action: "launch_pro_checkout"');
    expect(block).not.toContain("label: streamlineContinueLabelEarly");
    expect(block).not.toContain('action: "continue_basic_draft"');
  });

  it("launch_pro_checkout routes to stripe checkout with restored_starter_review_cta when checkout back restore is active", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    const i = s.indexOf('case "launch_pro_checkout"');
    expect(i).toBeGreaterThanOrEqual(0);
    const j = s.indexOf('case "continue_basic_draft"', i);
    const block = s.slice(i, j);
    expect(block).toContain("restored_starter_review_cta");
    expect(block).toContain("launchCreateFlowProCheckoutRef.current");
    expect(block).toContain("skipProCardScroll: true");
    expect(block).not.toContain("scrollToPremiumPosAnchor");
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

  it("free starter review skips transient placeholder block until server draft payload", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("starterReviewServerDraftReadyRef");
    expect(intake).toContain("markStarterReviewServerDraftReady");
    expect(intake).toContain("placeholderGate");
    expect(intake).toContain("shouldSkipPlaceholderScanForTransientPreview");
    expect(intake).toContain("resolveStarterPreviewLoadingReleaseReason");
    expect(intake).toContain("logStarterPreviewLoadingRelease");
    const previewDraft = readFileSync(join(__dirname, "agreementPreviewFromDraft.ts"), "utf8");
    expect(previewDraft).toContain("logPlaceholderScanSkippedTransient");
    expect(intake).toContain("showStarterPreviewLoadingShell");
    expect(intake).toContain("visibleStarterAgreementDocumentText");
    expect(intake).toContain("stripPlaceholderBlockerFromPersistPlain");
    expect(intake).toMatch(/payload\?\.draft != null[\s\S]{0,120}markStarterReviewServerDraftReady/);
    expect(intake).toMatch(
      /isPlaceholderSafetyBlockedPreviewText\(nextPreview\)[\s\S]{0,320}shouldSkipPlaceholderScanForTransientPreview/,
    );
  });

  it("paid authoritative Pro hides top adjust card and legacy finalize panel on canonical review", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("showTopProAdjustCard");
    expect(intake).toMatch(/showTopProAdjustCard\s*=\s*Boolean\([\s\S]*?!paidProAuthoritative/);
    expect(intake).toContain("Want to adjust this agreement?");
    expect(intake).toContain("{showTopProAdjustCard ?");
    expect(intake).toContain("FinalizeYourAgreementPanel");
    expect(intake).toMatch(/showProLawdogRefineAndFinalize[\s\S]*!acceptedPaidProAuthorityActive/);
    expect(intake).toContain("paidProCanonicalStickyCta");
    expect(intake).toContain("resolvePaidProStickyCta");
    expect(intake).toContain("resolveProReviewFooterState");
    expect(intake).toContain("FREE_STARTER_REVIEW_TITLE");
    expect(intake).toContain("resetStalePaidReviewShellForFreeStarter");
    expect(intake).toContain("freeStarterReviewShellActive");
    expect(intake).toContain("logFreeReviewPaidShellBlocked");
    expect(intake).not.toMatch(
      /isFreeStreamlineDraftReview\s*\?[\s\S]{0,240}Review your Pro agreement/,
    );
    expect(intake).toContain("lastKnownGoodAuthoritativeDraftRef");
    expect(intake).toContain("resolveGuidedCompletionRenderDocument");
    expect(intake).toContain("canDisplayPaidProAgreementDocument");
    expect(intake).toContain('key="paid-pro-agreement-document-stable"');
    expect(intake).toContain("suppressEmptyFallback={blockProEmptyDocumentFallback}");
    expect(intake).toContain("proReviewFooterMode={proReviewFooter.mode}");
    expect(intake).toContain('hideFreeformRefineSection={proReviewFooter.mode !== "freeform_edit"}');
    expect(intake).toContain("showPrimaryGuidedCompletion");
    expect(intake).toContain("guidedCompletionRenderState={guidedCompletionRenderState}");
    expect(intake).toContain("handleGuidedSaveAnswer");
    expect(intake).toContain("handleGuidedBulkApply");
    expect(intake).toContain("guidedCompletionPhase");
    expect(intake).toContain("appliedGuidedChanges");
    expect(intake).toContain("validateGuidedBulkRefinedOutputForApply");
    expect(intake).toContain("buildConsolidatedGuidedRegenerationPrompt");
    expect(intake).toContain("hideStickyForGuidedInProgress");
    expect(intake).toContain("guidedQuestionsRemain");
    expect(intake).toContain("onSaveAnswer={handleGuidedSaveAnswer}");
    expect(intake).toContain("guidedPhaseSuppressesSendCta");
    expect(intake).toContain("guidedProUxSuppressesProductionSendCta");
    expect(intake).toContain("guidedSessionQueueRenderable");
    expect(intake).toContain('id="guided-deal-completion-primary"');
    expect(intake).toContain("logGuidedSendCtaBlocked");
    expect(intake).not.toMatch(
      /showPrimaryGuidedCompletion[\s\S]{0,400}proReviewFooter\.mode === "guided_completion"/,
    );
    expect(intake).toContain("showProLawdogRefineAndFinalize");
    const finalize = readFileSync(join(__dirname, "FinalizeYourAgreementPanel.tsx"), "utf8");
    expect(finalize).toContain("Choose how to deliver");
    expect(finalize).toContain("Finish guided completion first");
    expect(finalize).toContain("guidedQuestionsRemain");
  });

  it("paid Pro finalize routes: review and signature advance via canonical recipient/sign handoff", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain('handleFinalizeRoutePrimaryAction("review")');
    expect(intake).toContain("handleProSendForSignature");
    expect(intake).toContain("logProReviewSendSignatureClick");
    expect(intake).toContain("void handleProSendForSignature()");
    expect(intake).toMatch(/mode === "signature" && paidProAuthoritative[\s\S]*handleProSendForSignature/);
    expect(intake).toContain("forceReviewDisplay: true");
    expect(intake).toContain("commitParsedDraftToReviewFlow(mergedDraftPersist, { forceReviewDisplay: true })");
    expect(intake).toContain("showSignatureRecipientContinue");
    expect(intake).toContain("onContinueToRecipientSetup");
    expect(intake).toContain("Share for review");
    expect(intake).toContain("premiumReviewMintPrimaryLabel");
    expect(intake).toContain("deliveryCtasOnDraftCard={canProceedWithPaidProDocument}");
    expect(intake).toContain("private review link");
    expect(intake).toContain("Save changes");
    expect(intake).toContain("Apply revision.");
    expect(intake).toContain("Tell LawDog what to change");
  });

  it("sign-first control is gated to paid signature recipients (not review mode)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(
      /\(createUiStage === CreateUiStage\.RECIPIENTS \|\| paidProRecipientSetupOnDraft\)[\s\S]*?effectivePremiumSendMode === "signature"[\s\S]*?I&apos;ll sign first/,
    );
  });

  it("paid authoritative advance keeps DRAFT and uses paidProRecipientSetupOnDraft for production send gates", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const adv = intake.indexOf("const advancePaidProToRecipientSetup = useCallback");
    expect(adv).toBeGreaterThanOrEqual(0);
    const advBlock = intake.slice(adv, adv + 1100);
    expect(advBlock).toContain("logRecipientSetupPhaseBlocked");
    expect(advBlock).toContain("armedFinalReviewSend");
    expect(advBlock).toContain("setCreateUiStage(CreateUiStage.DRAFT)");
    expect(advBlock).not.toContain("CreateUiStage.RECIPIENTS");
    expect(intake).toContain("paidProRecipientSetupOnDraft");
    expect(intake).toContain("paidProInlineRecipientShell");
    expect(intake).toContain("Create review link");
  });

  it("paid Pro canonical review mounts inline signer shell (not legacy Share headline constant)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(
      /\{paidProCanonicalReviewSignerSetupActive \? \([\s\S]*?id="claw-paid-pro-inline-signer-setup"[\s\S]*?<CreateFlowSendRecipientsPanel[\s\S]*?paidProInlineRecipientShell/,
    );
    expect(intake).toContain("paid-pro-inline-signer-setup-panel");
    expect(intake).toContain("PAID_PRO_INLINE_SIGNER_SECTION_TITLE");
    expect(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA).toBe("Complete signer details");
    expect(intake).not.toMatch(
      /showProLawdogRefineAndFinalize[\s\S]{0,240}&&\s*acceptedPaidProAuthorityActive/,
    );
    expect(intake).toMatch(/showProLawdogRefineAndFinalize[\s\S]*!acceptedPaidProAuthorityActive/);
  });

  it("paid Pro recipient_setup_required: productionReadyForPersist tolerates missing emails; inputs forced + CTA nudge", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toMatch(/recipientsDeferred \|\| hasAnyValidRecipientEmail \|\| paidProRecipientSetupOnDraft/);
    expect(intake).toContain("paidProRecipientBlockForceExpanded");
    expect(intake).toContain("recipientBlockForceExpanded");
    expect(intake).toContain("premiumRecipientPanelSendLabelOverride");
    expect(intake).toContain("editorOpen || recipientBlockForceExpanded");
    expect(intake).toContain("[paid-pro-recipient-fields]");
    expect(intake).toContain("[paid-pro-send-gate]");
    expect(intake).toMatch(/stickyRecipientBlockedNudge[\s\S]*"send_agreement"/);
    expect(intake).toContain("openForSendEmailGate");
    expect(intake).toMatch(/runPrimaryIntakeAction[\s\S]*flushSync/);
  });

  it("unified primary CTA: paid draft recipient surface resolves send_agreement before DRAFT continue_to_recipients", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const unifiedStart = intake.indexOf("const unifiedPrimaryCta = useMemo(");
    expect(unifiedStart).toBeGreaterThanOrEqual(0);
    const unifiedRegion = intake.slice(unifiedStart, unifiedStart + 14000);
    const sendSurface = unifiedRegion.indexOf(
      "if (createUiStage === CreateUiStage.RECIPIENTS || paidProRecipientSetupOnDraft) {",
    );
    const draftBranch = unifiedRegion.indexOf("if (createUiStage === CreateUiStage.DRAFT) {");
    expect(sendSurface).toBeGreaterThanOrEqual(0);
    expect(draftBranch).toBeGreaterThan(sendSurface);
    const draftAfterSendSurface = unifiedRegion.indexOf(
      "      if (createUiStage === CreateUiStage.DRAFT) {",
      sendSurface + 40,
    );
    expect(draftAfterSendSurface).toBeGreaterThan(sendSurface);
    const sendBlock = unifiedRegion.slice(sendSurface, draftAfterSendSurface);
    expect(sendBlock).toMatch(/action:\s*"send_agreement"/);
    expect(sendBlock).not.toMatch(/action:\s*"continue_to_recipients"/);
    expect(sendBlock).toContain("premiumReviewMintPrimaryLabel");
    expect(sendBlock).toContain('"Confirm and send for signature"');
  });

  it("send_agreement handler traces premium-send-draft-surface-submit when paidProRecipientSetupOnDraft", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("[premium-send-draft-surface-submit]");
    expect(intake).toMatch(
      /case\s+"send_agreement"\s*:\s*\{[\s\S]*?\[premium-send-draft-surface-submit\][\s\S]*?paidProRecipientSetupOnDraft/,
    );
  });

  it("send_agreement falls through to onGenerate when premium confirm gate is inactive", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const i = intake.indexOf('case "send_agreement":');
    expect(i).toBeGreaterThanOrEqual(0);
    const block = intake.slice(i, i + 3500);
    expect(block).toMatch(/if\s*\(\s*premiumSendConfirmGateActive\s*\)/);
    expect(block).toMatch(/await onGenerate\(\)/);
  });

  it("paid authoritative Pro: snapshot hydration prefers DRAFT; persist coerces RECIPIENTS; invariant self-heals", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    // Obsolete hydratePaidAuthoritative ternary is gone — paid Pro must still self-heal off RECIPIENTS.
    const invariantMarker = "[invariant-violation] paid Pro should not enter RECIPIENTS";
    const invariantIdx = intake.indexOf(invariantMarker);
    expect(invariantIdx).toBeGreaterThanOrEqual(0);
    const effectStart = intake.lastIndexOf("useEffect(() => {", invariantIdx);
    expect(effectStart).toBeGreaterThanOrEqual(0);
    const recipientsGuard = extractBalancedDecl(intake.slice(effectStart), "useEffect(() => {");
    expect(recipientsGuard).toContain(
      "if (!paidProAuthoritative || createUiStage !== CreateUiStage.RECIPIENTS) return;",
    );
    expect(recipientsGuard).toContain("inPersistedRecipientShell");
    expect(recipientsGuard).toContain("[recipient-stage-draft-restore-blocked]");
    expect(recipientsGuard).toContain(invariantMarker);
    expect(recipientsGuard).toMatch(/setCreateUiStage\(\s*CreateUiStage\.DRAFT\s*\)/);
    expect(recipientsGuard).toMatch(/setDisplayPhase\(\s*"review"\s*\)/);
    // True paid recipient UI advances on DRAFT — never the legacy RECIPIENTS shell.
    expect(intake).toContain("advancePaidProToRecipientSetup");
    expect(intake).toMatch(
      /Paid authoritative Pro: recipient setup stays on the Pro review surface \(DRAFT\)/,
    );
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
    expect(intake).toContain("hideStickyForGuidedInProgress");
    expect(intake).toMatch(
      /simpleCreateStickyBottomBarVisible\s*=\s*simpleCreateStickyBottomBarVisibleBaseGated\s*&&\s*!hideStickyForGuidedInProgress/,
    );
  });

  it("emits premium-send-shell-guard when paid Pro suppresses generic create shell paths", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("[premium-send-shell-guard]");
    expect(intake).toContain("devPremiumSendShellGuard");
    expect(intake).toContain("[premium-send-choice]");
    expect(intake).toContain("[premium-send-route]");
  });

  it("continue to send: authoritative without premium signers surface uses RECIPIENTS shell (basic recipient_setup_required visible)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("paidProInlineRecipientReady");
    expect(intake).toContain("premiumSignersSurfaceReady");
    expect(intake).toMatch(/Inline Pro recipient rail/);
  });

  it("runPersistAndOpen clears stale hardError before persist and after successful hydrate (free/basic retry)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handoff = intake.indexOf("async function runPersistAndOpen");
    expect(handoff).toBeGreaterThanOrEqual(0);
    const tryOpen = intake.indexOf("try {", handoff);
    expect(tryOpen).toBeGreaterThan(handoff);
    const slice = intake.slice(tryOpen, tryOpen + 320);
    expect(slice).toMatch(/setHardError\(null\);[\s\S]*?const existingId = reviewAgreementIdRef/);
    const hydrateOk = intake.indexOf('console.log("[AgreementIntake] persistence + hydrate OK');
    expect(hydrateOk).toBeGreaterThan(0);
    expect(intake).toContain("reviewAgreementIdRef.current = id");
    expect(intake).toContain("restorePinnedFinalizedSignerCorpus(\"runPersistAndOpen_hydrate\")");
    expect(intake).toContain("setCreateFlowPhaseGuarded(\"draft_ready_for_review\")");
    expect(intake).toContain("skipDraftReadyPhaseReset");
  });

  it("hardErrorForUi suppresses generic save banner when persisted agreement id matches draft id", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("persistedRowMatchesDraft");
    expect(intake).toMatch(
      /\!draftHasPlaceholderParties\(draft\) \|\| persistedRowMatchesDraft/,
    );
    expect(intake).toMatch(
      /workspaceUi\s*&&\s*\n\s*\!simpleProductFlow[\s\S]*persistedRowMatchesDraft/,
    );
  });

  it("paid Pro edit-return resume merges session snapshot and blocks auto local parse (not inline wording)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("mergePaidProEditReturnSnapshotIntoApiDraft");
    expect(intake).toContain("paidProEditReturnHasRecoverableBody");
    expect(intake).toContain("paidProEditReturnResumeActive");
    expect(intake).toContain("skip_local_parse:");
    expect(intake).toContain("logPaidProEditReturnSkipBasicGenerate");
  });

  it("review-first retry re-invokes completeGuidedPaidProReviewFirstHandoff without /app/send", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("simple_pro_review_first_retry");
    expect(intake).toContain("completeGuidedPaidProReviewFirstHandoff");
    expect(intake).toContain("reviewFirstSigningTokenSecretMissing");
    expect(intake).toContain("onRetryReviewFirstHandoff");
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 16000);
    expect(block).toContain("guidedReviewFirstHandoffInFlightRef.current = false");
    expect(block).toContain("setReviewFirstHandoffBusy(false)");
  });

  it("simplified Pro review flow uses SimpleProFinalReviewScreen and signing send verification", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("showSimplifiedProReviewSigningFlow");
    expect(intake).toContain("SimpleProFinalReviewScreen");
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("data-testid=\"simple-pro-send-for-signature\"");
    expect(screen).toContain("data-testid=\"simple-pro-send-for-review\"");
    expect(screen).toContain("simple-pro-edit-agreement-text-toggle");
    expect(screen).not.toContain("simple-pro-suggest-changes-toggle");
    expect(intake).toContain("processReviewEditedVersionUpload");
    expect(intake).toContain("verifySigningSendReady");
    expect(intake).toContain("assertSigningSendReadyOrBlock");
    expect(intake).toContain("guided_final_review");
    expect(intake).toContain("logGuidedAuthoritativeReviewSync");
    expect(intake).toContain("postGuidedAuthoritativeReview");
    expect(intake).toContain("resolveGuidedBulkCommitBody");
    expect(intake).toContain("logGuidedBulkCommitSuccess");
    expect(intake).toContain("finalReviewSendPathChosenRef");
    expect(intake).toContain("premiumRecipientHandoffDebounceRef");
    expect(intake).toMatch(/onSendForSignature=\{\(\) => void handleProSendForSignature\(\)\}/);
    expect(intake).toMatch(/onSendForReview=\{\(\) => void handleProSendForReview\(\)\}/);
  });

  it("recipient metadata debounce does not revert phase while signer fields change", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("recipientMetadataMutationRef");
    expect(intake).toContain("finalReviewSendPathChosenRef");
    expect(intake).toContain("guidedFrozenAfterApplyRef");
    expect(intake).toContain("shouldSkipRedundantPremiumHandoffWrite");
    expect(intake).toContain("logRecipientSetupStableWhileTyping");
    const continuity = readFileSync(join(__dirname, "authoritativeAgreementContinuity.ts"), "utf8");
    expect(continuity).toContain("logRecipientHandoffWriteDeduped");
    const debounceIdx = intake.indexOf("premiumRecipientHandoffDebounceRef.current = window.setTimeout");
    expect(debounceIdx).toBeGreaterThan(-1);
    const debounceBlock = intake.slice(debounceIdx, debounceIdx + 1200);
    expect(debounceBlock).toContain("logRecipientMetadataOnlyMutation");
    expect(debounceBlock).toContain("logRecipientSetupStableWhileTyping");
    expect(debounceBlock).not.toContain("partySignerNames");
    expect(intake).toContain("onRecipientMetadataPersist");
    expect(intake).toContain("readPremiumRecipientHandoffMemo");
    expect(intake).toContain("guidedCompletionFrozen");
    expect(intake).toContain("guidedProUxState");
    expect(intake).toContain("guidedProUxAllowsRecipientSetup");
    expect(intake).toContain("guidedProUxBlocksRecipientSetup");
    expect(intake).toContain("guidedBulkApplyingActive");
    expect(intake).toContain("logPostApplyQualityWarningNonblocking");
    expect(intake).toContain("suppressGuidedFreeformUx");
    expect(intake).toContain("GuidedUpdatedAgreementReadyCard");
    expect(intake).toContain("updated_agreement_ready");
    expect(intake).toContain("guidedQueueRebuildBlocked");
    expect(intake).toContain("Prepare signing packet first.");
    expect(intake).toContain("finalReviewSendPathChosenRef.current ||");
    expect(intake).toContain("paidProRecipientSetupOnDraft");
  });

  it("test18: guided_questions_active shows panel above draft and blocks send CTAs", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedProUxShowsQuestionPanel(guidedProUxState)");
    expect(intake).toContain("guidedSessionQueueRenderable");
    expect(intake).toContain("resolveGuidedProStickyCta(");
    expect(intake).toContain('setCreateFlowPhase("signer_setup_required")');
    expect(intake).toContain('id="claw-guided-pre-review-signers"');
    expect(intake).toContain('id="guided-deal-completion-primary"');
    const executeIdx = intake.indexOf('logGuidedSendCtaBlocked("executePrimaryCta"');
    expect(executeIdx).toBeGreaterThanOrEqual(0);
    expect(intake.slice(executeIdx - 700, executeIdx)).toMatch(/continue_to_recipients|premium_continue_to_signers/);
  });

  it("test18: armed recipient advance only after explicit guided final review phase", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const adv = intake.indexOf("const advancePaidProToRecipientSetup = useCallback");
    const advBlock = intake.slice(adv, adv + 900);
    expect(advBlock).toContain("armedFinalReviewSend");
    expect(advBlock).toContain("isGuidedFinalReviewPhase(createFlowPhase)");
    expect(advBlock).toContain("guidedFinalReviewExplicitlyOpened");
  });

  it("test31: final review continue recovers idle apply and sync corpus commit", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveGuidedFinalReviewApplyReadinessFromSession");
    expect(intake).toContain("commitGuidedApplyFromExistingCorpus");
    expect(intake).toContain("logGuidedFinalReviewApplyStatusRecovered");
    expect(intake).toContain("logGuidedFinalReviewSyncApplyStarted");
    expect(intake).toContain("pickBestAuthoritativeCorpusPlain");
    expect(intake).toContain("guidedSessionComplete");
    const corpusPicker = readFileSync(join(__dirname, "premiumReadonlyRenderCorpus.ts"), "utf8");
    expect(corpusPicker).toContain("shouldRejectFreeBasicDraftForPaidProPick");
    const readiness = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedFinalReviewApplyReadiness.ts"),
      "utf8",
    );
    expect(readiness).toContain("[guided-final-review-apply-readiness]");
    expect(readiness).toContain("[guided-final-review-apply-status-recovered]");
  });

  it("test33: guided final review CTA routes to signing, not legacy recipients", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guided_final_review_ready_to_sign");
    expect(intake).toContain("Create signing links");
    expect(intake).toContain("continueGuidedFinalReviewToSigning({ intent: \"signature\" })");
    const routeIdx = intake.indexOf('cta.reason === "guided_final_review_ready_to_sign"');
    expect(routeIdx).toBeGreaterThan(0);
    const routeBlock = intake.slice(routeIdx, routeIdx + 1200);
    expect(routeBlock).toContain("finalizeAndFreezeGuidedFinalCorpus");
    expect(routeBlock).toContain("continueGuidedFinalReviewToSigning");
    expect(routeBlock).not.toContain("advancePaidProToRecipientSetup");
    expect(routeBlock).not.toContain("handOffProductionDraftToRecipients");
    expect(intake).toContain('reviewSecondaryLabel="Send for review / compare edits"');
  });

  it("test20: answer apply waits for signer setup continue; explicit continue CTA only", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("continueGuidedSignerSetupToFinalReview");
    expect(intake).toContain("backgroundDuringSignerSetup");
    expect(intake).toContain("Keep signer setup interactive");
    expect(intake).toContain('setGuidedFinalizeModalStage("applying_answers")');
    expect(intake).toContain("signer_setup_ready_final_review");
    expect(intake).toContain("resolveGuidedPreReviewSignerSlots");
    expect(intake).toContain("logSignerSetupIncomplete");
    expect(intake).not.toContain("if (!paidProInlineSignersReady) return;");
    expect(intake).toContain("guided-pre-review-apply-inline");
    const card = readFileSync(
      join(__dirname, "guidedDealCompletion/GuidedSignerSetupBeforeReviewCard.tsx"),
      "utf8",
    );
    expect(card).toContain("guided-background-apply-progress");
    expect(card).not.toContain("guided-signer-setup-apply-cta");
  });

  it("test22: frozen answer count, no 0 answers copy, background apply + final review unlock", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveGuidedFrozenAnswerCount");
    expect(intake).toContain("listGuidedAnsweredVariableIds");
    expect(intake).toContain("guidedAnswerApplyStatus");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("shouldResolveGuidedApplyFromExistingBody");
    expect(intake).toContain("GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA");
    expect(intake).toContain("GUIDED_FINISHING_UPDATED_AGREEMENT");
    expect(intake).not.toMatch(/Applying your \$\{n\} answer/);
    expect(intake).not.toMatch(/session\.queue\.filter\(\(id\) => \(session\.answered\[id\]/);
    const ux = readFileSync(join(__dirname, "guidedDealCompletion/guidedSignerSetupUx.ts"), "utf8");
    expect(ux).toContain("Applying your answers to the Pro agreement");
    const orch = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedAnswerApplyOrchestration.ts"),
      "utf8",
    );
    expect(orch).toContain("resolveGuidedFrozenAnswerCount");
  });

  it("homepage submit: synchronous starter handoff and inactive guided phase", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("beginStarterDraftGeneration");
    expect(intake).toContain("GUIDED_COMPLETION_PHASE_INACTIVE");
    expect(intake).toContain("canActivateGuidedCompletionPhase");
    expect(intake).not.toContain("deferDraftStageForFreshInput");
    const handoff = readFileSync(join(__dirname, "starterCreateHandoff.ts"), "utf8");
    expect(handoff).toContain('GUIDED_COMPLETION_PHASE_INACTIVE');
    // Window allows for the paid-authority regeneration guard at the top of the callback
    // (shouldBlockStarterRegenerationAfterPaidAuthority) while still asserting the synchronous
    // generating_draft handoff that follows it.
    expect(intake).toMatch(
      /beginStarterDraftGeneration[\s\S]{0,700}setCreateFlowPhase\("generating_draft"\)/,
    );
    expect(intake).toMatch(
      /beginStarterDraftGeneration[\s\S]{0,700}setDisplayPhase\("generating_draft"\)/,
    );
    expect(intake).toMatch(
      /beginStarterDraftGeneration[\s\S]{0,700}setCreateUiStage\(CreateUiStage\.DRAFT\)/,
    );
    expect(intake).toContain('handoffSource: "home_create_submit"');
    expect(intake).toContain("commitFreeDraftForReview");
    expect(intake).toContain("StarterDraftDocumentSurface");
    // Authority-only final review flag still keys off simpleProFinalReviewActive (may OR with peers).
    expect(intake).toMatch(
      /finalReviewAuthorityOnly:\s*[\s\S]{0,220}?simpleProFinalReviewActive/,
    );
    expect(intake).toMatch(
      /useState<GuidedCompletionPhase>\(GUIDED_COMPLETION_PHASE_INACTIVE\)/,
    );
  });

  it("test28: signer identity patch preserves corpus and final review recovery", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedPreIdentityAuthoritativeRef");
    expect(intake).toContain("finalizeAndFreezeGuidedFinalCorpus");
    expect(intake).toContain("finalizeGuidedProAgreementCorpus");
    expect(intake).toContain("recoveryAuthoritativePlain");
    expect(intake).toContain("suppressPostReviewEditUx");
    expect(intake).toContain("corpusRecoveryMessage");
    const identity = readFileSync(
      join(__dirname, "guidedDealCompletion/signerPartyIdentity.ts"),
      "utf8",
    );
    expect(identity).toContain("[signer-party-identity-apply-rejected]");
    expect(identity).toContain("shouldRejectSignerIdentityCorpusShrink");
    expect(identity).toContain("findSignatureRegionStart");
    const finalizer = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedFinalCorpusFinalizer.ts"),
      "utf8",
    );
    expect(finalizer).toContain("identityApply.rejected");
    expect(finalizer).toContain("[guided-final-corpus-blocked-placeholder-identity-mismatch]");
    const corpus = readFileSync(join(__dirname, "simpleProFinalReviewCorpus.ts"), "utf8");
    expect(corpus).toContain("[guided-final-review-corpus-recovered]");
    expect(corpus).toContain("[guided-final-review-corpus-blocked]");
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("suppressPostReviewEditUx");
    expect(screen).toContain("simple-pro-final-review-corpus-recovery");
  });

  it("test29: guided review/signing continuity freezes corpus and signer manifest", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("authoritativeAgreementSnapshotRef");
    expect(intake).toContain("acceptedReviewCorpusRef");
    expect(intake).toContain("finalizedSigningCorpusRef");
    expect(intake).toContain("canonicalSignerManifestRef");
    expect(intake).toContain("reviewSessionState");
    expect(intake).toContain("reviewAcceptedByParties");
    expect(intake).toContain("uploadedRevisionCorpus");
    expect(intake).toContain("latestAcceptedCorpus");
    expect(intake).toContain("freezeGuidedAuthoritativeCorpusSnapshot");
    expect(intake).toContain("acceptGuidedReviewCorpus");
    expect(intake).toContain("assertGuidedTransitionReady");
    expect(intake).toContain("logSigningCorpusInitialized");
    const continuity = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedReviewSigningContinuity.ts"),
      "utf8",
    );
    expect(continuity).toContain("[authoritative-corpus-frozen]");
    expect(continuity).toContain("[review-corpus-accepted]");
    expect(continuity).toContain("[signing-corpus-initialized]");
    expect(continuity).toContain("[guided-transition-assertion-blocked]");
    expect(continuity).toContain("buildCanonicalSignerManifest");
    expect(continuity).toContain("acceptUploadedRevision");
  });

  it("test27: final review send routes to signing confirmation, not recipient_setup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("enterGuidedSigningConfirmationFromFinalReview");
    expect(intake).toContain("continueGuidedFinalReviewToSigning");
    expect(intake).toContain("canProceedGuidedFinalReviewToSigning");
    expect(intake).toContain("canProceedFromGuidedFinalReviewToSigning");
    expect(intake).toContain("resolveGuidedSigningAuthoritativePlain");
    expect(intake).toContain("guidedSigningConfirmationActive");
    expect(intake).toContain("GuidedProSigningConfirmationScreen");
    expect(intake).toContain("ensureGuidedSigningCorpusReady");
    expect(intake).toContain("completeGuidedSigningHandoff");
    const signing = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedSigningConfirmation.ts"),
      "utf8",
    );
    expect(signing).toContain("[guided-final-review-send-signature-start]");
    expect(signing).toContain("[guided-final-review-signing-packet-ready]");
    expect(signing).toContain("[guided-signing-confirmation-mounted]");
    expect(intake).toContain("logGuidedFinalReviewSendSignatureStart");
    expect(intake).toContain("handleGuidedSigningConfirmationContinue");
    expect(intake).toContain("openConfirmModal: true");
    expect(intake).toContain("enterGuidedSignatureTrackRoute");
    expect(intake).toContain("resolveGuidedSigningPersistAgreementId");
    expect(intake).toContain("pinnedFinalizedSignerCorpusHashRef");
    expect(intake).toContain("pinFinalizedSignerAppliedCorpus");
    expect(intake).toContain("restorePinnedFinalizedSignerCorpus");
    expect(intake).toContain("setCreateFlowPhaseGuarded");
    expect(intake).toContain("reviewAgreementIdRef.current = id");
    expect(intake).toContain("logGuidedSignatureGenericSendBypassed");
    expect(intake).toContain("preparing_signing_links");
    expect(intake).toContain("adding_signature_fields");
    expect(intake).toContain("signing_packet_ready");
    const sendIdx = intake.indexOf("const handleProSendForSignature = React.useCallback");
    const sendBlock = intake.slice(sendIdx, sendIdx + 2800);
    expect(sendBlock).toContain('continueGuidedFinalReviewToSigning({ intent: "signature" })');
    expect(sendBlock).toContain("canProceedGuidedFinalReviewToSigning");
    expect(sendBlock).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    const guidedProceedIdx = sendBlock.indexOf(
      "if (canProceedGuidedFinalReviewToSigning && paidProSignatureDetailsReady)",
    );
    expect(guidedProceedIdx).toBeGreaterThan(-1);
    const guidedBranch = sendBlock.slice(
      guidedProceedIdx,
      sendBlock.lastIndexOf('enterFinalReviewRecipientSetup("signature")'),
    );
    expect(guidedBranch).toContain('continueGuidedFinalReviewToSigning({ intent: "signature" })');
    expect(guidedBranch).toContain("return;");
    const screen = readFileSync(
      join(__dirname, "guidedDealCompletion/GuidedProSigningConfirmationScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain("guided-pro-signing-confirmation-screen");
    expect(screen).not.toContain("Describe a change");
    expect(screen).not.toContain("Add recipient emails");
    expect(screen).not.toContain("textarea");
    expect(intake).toContain("Add signers / prepare signature links");
    expect(intake).toContain('reviewSecondaryLabel="Send for review / compare edits"');
    expect(intake).toContain("onChangeSigningOrder");
    expect(screen).toContain("Back to final review");
    const enterIdx = intake.indexOf("const enterFinalReviewRecipientSetup = React.useCallback");
    const enterBlock = intake.slice(enterIdx, enterIdx + 4500);
    expect(enterBlock).toContain("continueGuidedFinalReviewToSigning({ intent })");
    expect(intake).toContain("GuidedFinalizeModal");
    expect(intake).toContain("logGuidedFinalizeModalEnter");
    expect(intake).toContain("preparing_final_signing_version");
    expect(intake).toContain("ready_to_sign");
  });

  it("paid Pro signature path uses signer setup copy and fields", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("Add signers / prepare signature links");
    expect(intake).toContain("Party 1 legal entity");
    expect(intake).toContain("Party 2 legal entity");
    expect(intake).toContain("Signer name");
    expect(intake).toContain("Signer title");
    expect(intake).toContain("Signer 1 email");
    expect(intake).toContain("Signer 2 email");
    expect(intake).toContain("I&apos;ll sign first");
    const panel = readFileSync(join(__dirname, "ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(panel).toContain("showReviewComparisonActions");
    expect(panel).toContain("Upload/compare is available from the review track");
  });

  it("paid Pro source-of-truth branch renders HTML without polish or fallback pickers", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const htmlBlock = extractBalancedDecl(intake, "const premiumReadonlyAgreementHtml = useMemo");
    expect(htmlBlock).toContain('getPaidProDocumentForSurface("display"');
    expect(htmlBlock).toContain("buildPremiumAgreementReadonlyHtml");
    // Paid display surface path must win before guided/picker fallback resolution.
    const paidDisplayIdx = htmlBlock.indexOf('getPaidProDocumentForSurface("display"');
    const guidedFallbackIdx = htmlBlock.indexOf("const session = guidedCompletionSessionRef.current");
    expect(paidDisplayIdx).toBeGreaterThanOrEqual(0);
    expect(guidedFallbackIdx).toBeGreaterThan(paidDisplayIdx);
    const paidDisplayBranch = htmlBlock.slice(paidDisplayIdx, guidedFallbackIdx);
    expect(paidDisplayBranch).toContain("buildPremiumAgreementReadonlyHtml");
    expect(paidDisplayBranch).toMatch(/if \(paidProDisplay\)/);
    // Empty SoT must not fall through to guided pickers.
    expect(paidDisplayBranch).toMatch(
      /hasPaidProSourceOfTruth\(\)\s*&&\s*!paidProDisplay\?\.text\?\.trim\(\)/,
    );
    // Guided picker fallback stays outside the paid display early-return path.
    expect(paidDisplayBranch).not.toContain("resolveGuidedCompletionRenderDocument");
    expect(paidDisplayBranch).not.toMatch(/pickerPlain:\s*premiumPaidReadonlyPick/);
  });

  it("paid Pro direct edits establish explicit source-of-truth revisions", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("const commitPaidProUserApprovedRevision = React.useCallback");
    expect(intake).toContain("establishPaidProSourceOfTruth");
    expect(intake).toContain('commitPaidProUserApprovedRevision(finalText, "paid_pro_card_edit_revision")');
    expect(intake).toContain('commitPaidProUserApprovedRevision(raw, "pro_final_review_plain_edit_revision")');
  });

  it("test26: signer party identity applied before final review", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveCanonicalPartyIdentitiesFromSignerSetup");
    expect(intake).toContain("resolveCanonicalFinalPartyManifest");
    expect(intake).toContain("guidedFinalPartyManifest");
    expect(intake).toContain("finalizeGuidedProAgreementCorpus");
    expect(intake).toContain("agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup");
    expect(intake).toContain("guidedSignerFinalVersionLines");
    expect(intake).toContain("finalVersionPartyLines");
    expect(intake).toContain("Edit signer details");
    const card = readFileSync(
      join(__dirname, "guidedDealCompletion/GuidedSignerSetupBeforeReviewCard.tsx"),
      "utf8",
    );
    expect(card).toContain("guided-signer-final-version-preview");
    const identity = readFileSync(
      join(__dirname, "guidedDealCompletion/signerPartyIdentity.ts"),
      "utf8",
    );
    const manifestModule = readFileSync(
      join(__dirname, "guidedDealCompletion/canonicalFinalPartyManifest.ts"),
      "utf8",
    );
    expect(manifestModule).toContain("[canonical-final-party-manifest]");
    expect(identity).toContain("[signer-party-identity-applied-to-corpus]");
    expect(identity).toContain("[signer-party-placeholder-blocked-final-review]");
    expect(identity).toContain("[signature-block-party-polish-applied]");
    const finalizer = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedFinalCorpusFinalizer.ts"),
      "utf8",
    );
    expect(finalizer).toContain("applySignerPartyIdentityToAuthoritativeAgreement");
    expect(finalizer).toContain("rebuildSignatureBlocksWithPartyIdentities");
  });

  it("test25: soft-pass apply outcome and retry CTA copy", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveGuidedBackgroundApplyOutcome");
    expect(intake).toContain("validateGuidedBulkRefinedOutputForApply");
    expect(intake).toContain("logPostApplyQualityWarningNonblocking");
    expect(intake).toContain("GUIDED_RETRY_APPLY_ANSWERS_CTA");
    expect(intake).not.toMatch(/Retry Pro update/);
    const quality = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedPostApplyQuality.ts"),
      "utf8",
    );
    expect(quality).toContain("guided-post-apply-quality-soft-pass");
    expect(quality).toContain("GUIDED_APPLY_SOFT_PASS_MIN_RATIO");
    const outcome = readFileSync(
      join(__dirname, "guidedDealCompletion/guidedApplyOutcome.ts"),
      "utf8",
    );
    expect(outcome).toContain("shouldSoftPassGuidedPostApplyQuality");
  });

  it("test24: explicit final review unlock, dedupe, and mutually exclusive CTAs", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedFinalReviewExplicitlyUnlockedRef");
    expect(intake).toContain("guidedFinalReviewNavigationInFlightRef");
    expect(intake).toContain("showGuidedFinalReviewInlineCta");
    expect(intake).toContain("resolveGuidedFinalReviewCtaVisibility");
    expect(intake).toContain("flushSync");
    expect(intake).toContain("logGuidedFinalReviewExplicitUnlockStarted");
    expect(intake).toContain("logGuidedFinalReviewNavigationDeduped");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("handleGuidedBackToSignerDetailsFromFinalReview");
    expect(intake).toContain("resolveGuidedFinalReviewCtaVisibility");
    const screen = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("SIMPLE_PRO_FINAL_REVIEW_HEADLINE");
    expect(screen).toContain("simple-pro-send-for-signature");
    expect(screen).toContain("simple-pro-send-for-review");
  });

  it("test23: no auto final review on apply; explicit unlock gate and blocked-signer log", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("logGuidedFinalReviewBlockedSignersIncomplete");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("guidedSignerMetadataDebouncingRef");
    expect(intake).toContain("stayOnSignerSetup");
    expect(intake).not.toContain("} else if (autoFinal) {");
    expect(intake).toContain("logGuidedFinalReviewExplicitUnlockBlocked");
    expect(intake).toContain("flushGuidedSignerMetadataBeforeFinalReview");
    const card = readFileSync(
      join(__dirname, "guidedDealCompletion/GuidedSignerSetupBeforeReviewCard.tsx"),
      "utf8",
    );
    expect(card).toContain("GUIDED_SIGNER_SETUP_APPLY_COMPLETE_SUBCOPY");
    expect(card).toContain("GUIDED_SIGNER_SETUP_HEADLINE");
  });

  it("test21: background apply orchestration, suppress signing links, applying + final review routing", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedApplyInFlightRef");
    expect(intake).toContain("guidedAnswerApplyStatus");
    expect(intake).toContain("hidePrimarySendCta");
    expect(intake).toContain("guided-pre-review-applying");
    expect(intake).toContain("GUIDED_APPLYING_HEADLINE");
    expect(intake).toContain("formatGuidedApplyingSubcopy");
    expect(intake).toContain('setCreateFlowPhase("guided_final_review")');
    expect(intake).toContain("backgroundDuringSignerSetup");
    expect(intake).toContain("guidedEarlySticky");
    expect(intake).toContain("runPrimaryIntakeAction");
    expect(intake).toContain("guided-pre-review-apply-inline");
    expect(intake).not.toMatch(
      /hideStickyForGuidedInProgress[\s\S]{0,220}guidedProUxShowsSignerSetup/,
    );
  });

  it("test19: guided flow uses signer_setup_required before apply and final review", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain('setCreateFlowPhase("signer_setup_required")');
    expect(intake).toContain("GuidedSignerSetupBeforeReviewCard");
    expect(intake).toContain("claw-guided-pre-review-signers");
    expect(intake).toContain("logSignerSetupActive");
    expect(intake).toContain("logSignerSetupComplete");
    expect(intake).toContain("logPostApplyQualityWarningNonblocking");
    expect(intake).toContain("logGuidedApplyingStuckCleared");
    expect(intake).toContain("resolveGuidedProStickyCta");
    expect(intake).toContain("guidedPreReviewSignerSetupActive");
    expect(intake).toContain("signersReady={paidProInlineSignersReady}");
    expect(intake).toContain("logBlockedAutoNavigationWhileSignersEditing");
  });

  it("test18: enterFinalReviewRecipientSetup review_only is independent from signer setup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const enterBlock = extractBalancedDecl(
      intake,
      "const enterFinalReviewRecipientSetup = React.useCallback",
    );
    expect(enterBlock).toContain('if (intent === "review_only")');
    expect(enterBlock).toContain('logPaidProReviewTrackLifecycle("review_recipient_setup"');
    expect(enterBlock).toContain("guidedProUxSuppressesProductionSendCta");
    expect(enterBlock).toContain("guidedProUxShowsQuestionPanel");
    expect(enterBlock).toContain('logGuidedSendCtaBlocked("enterFinalReviewRecipientSetup"');
    expect(enterBlock).toContain("continueGuidedFinalReviewToSigning({ intent })");
    expect(enterBlock).toContain("claw-paid-pro-inline-signer-setup");
    // Incomplete signer details still gate the non-review_only path (authority OR peers).
    expect(enterBlock).toMatch(
      /\(acceptedPaidProAuthorityActive[\s\S]*?\)\s*&&\s*!paidProSignatureDetailsReady/,
    );
    const reviewOnlyIdx = enterBlock.indexOf('if (intent === "review_only")');
    const signerGateIdx = enterBlock.search(
      /\(acceptedPaidProAuthorityActive[\s\S]*?\)\s*&&\s*!paidProSignatureDetailsReady/,
    );
    expect(reviewOnlyIdx).toBeGreaterThanOrEqual(0);
    expect(signerGateIdx).toBeGreaterThan(reviewOnlyIdx);
    const reviewBranch = enterBlock.slice(reviewOnlyIdx, signerGateIdx);
    // review_only must return before inline signer setup / signature continue.
    expect(reviewBranch).not.toContain("handlePremiumReviewFirstContinueToSigners");
    expect(reviewBranch).not.toContain("claw-paid-pro-inline-signer-setup");
    expect(reviewBranch).not.toContain("!paidProSignatureDetailsReady");
  });
});

describe("paid Pro runtime authority establishment (intake wiring)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("Prepare handoff fails closed without agreement id (cannot bypass Prepare authority)", () => {
    const frag = extractBalancedDecl(
      intake,
      "const handlePaidProPrepareSignaturesFromFirstReview = React.useCallback",
    );
    expect(frag).toContain("if (!agreementIdForAccept)");
    expect(frag).toContain(
      "Server review snapshot requires an agreement id before Prepare",
    );
    expect(frag).toContain("canEnableCommercialPrepareFromServerSnapshot(agreementIdForAccept)");
    // Empty id must return before accept/prepare progress — no silent bypass.
    const emptyIdx = frag.indexOf("if (!agreementIdForAccept)");
    const acceptIdx = frag.indexOf("acceptDisplayedCommercialReviewSnapshot");
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    expect(acceptIdx).toBeGreaterThan(emptyIdx);
  });

  it("blocks Pro review shell until runtime authority is established", () => {
    expect(intake).toContain("assessPaidProRuntimeAuthority");
    expect(intake).toContain("paidProAwaitingRuntimeAuthority");
    expect(intake).toContain("simpleProFinalReviewShellActive");
    expect(intake).toContain('data-testid="paid-pro-runtime-authority-finalizing"');
    expect(intake).toContain("paidProRuntimeAuthority.canRenderProReviewShell");
    expect(intake).toContain("paidProRuntimeAuthority.established");
    const proceedBlock = extractBalancedDecl(intake, "const canProceedWithPaidProDocument = useMemo");
    // Both established + canRender must gate proceed (may be combined in one condition).
    expect(proceedBlock).toMatch(
      /!paidProRuntimeAuthority\.established[\s\S]*?!paidProRuntimeAuthority\.canRenderProReviewShell/,
    );
    expect(proceedBlock).toMatch(/return false/);
  });

  it("normalizes false finalCorpusSource labels in dev panel", () => {
    expect(intake).toContain("normalizePaidProCorpusSourceLabel");
    const guidedIdx = intake.indexOf("const guidedFinalReviewAuthoritativeResolution = useMemo");
    const guidedBlock = intake.slice(guidedIdx, guidedIdx + 400);
    expect(guidedBlock).toContain("hasPaidProSourceOfTruth()");
  });

  it("gates Pro CTAs on runtime authority", () => {
    const deliveryIdx = intake.indexOf("const proDeliveryTrackBaseReady = Boolean");
    const deliveryBlock = intake.slice(deliveryIdx, deliveryIdx + 500);
    expect(deliveryBlock).toContain("paidProRuntimeAuthority.established");
    expect(deliveryBlock).toContain("paidProRuntimeAuthority.canShowProCtas");
    expect(deliveryBlock).toContain("canProceedWithPaidProDocument");
    expect(intake).toContain("firstReviewDeliveryTrackDecisionActive");
    expect(intake).toContain("paidProReviewDecisionPhase");
  });

  it("wires guided question gate for material corpus without blocking Pro paper", () => {
    expect(intake).toContain("resolveGuidedQuestionGateDecision");
    expect(intake).toContain("logGuidedQuestionGateDecision");
    expect(intake).toContain("guidedQuestionGateDecision.materialReviewAllowed");
    expect(intake).toContain("questionGate: guidedQuestionGateDecision");
    expect(intake).not.toMatch(
      /if \(hasPaidProSourceOfTruth\(\) \|\| premiumPersistedFlowActive \|\| premiumPaidDocumentSurface\) \{\s*return "";/,
    );
  });

  it("does not use live preview as paid Pro readonly HTML when authority is absent", () => {
    const htmlIdx = intake.indexOf("const premiumReadonlyAgreementHtml = useMemo");
    const htmlBlock = intake.slice(htmlIdx, htmlIdx + 1600);
    expect(htmlBlock).toContain("hasPaidProSourceOfTruth() && !paidProDisplay?.text?.trim()");
    expect(htmlBlock).toContain('return ""');
    expect(htmlBlock).toMatch(/hasPaidProSourceOfTruth\(\)[\s\S]{0,200}return "";/);
  });
});

describe("homepage starter_review mount (no paid Pro SoT)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("preview hooks read signer-session ref only after useRef(false) declaration", () => {
    const decl = intake.indexOf("const paidProSignerMetadataSessionActiveRef = useRef(false)");
    const previewMemo = intake.indexOf("const renderedAgreementPreview = useMemo");
    const buildPreview = intake.indexOf("const buildPreviewForCurrentTier = React.useCallback");
    expect(decl).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(buildPreview);
    expect(decl).toBeLessThan(previewMemo);
    const previewBlock = intake.slice(previewMemo, previewMemo + 400);
    expect(previewBlock).toContain("paidProSignerMetadataSessionActiveRef.current");
  });

  it("free/starter path does not require paid Pro signer setup before first preview", () => {
    expect(intake).toContain('handoffSource: "home_create_submit"');
    expect(intake).toContain("commitFreeDraftForReview");
    expect(intake).toContain("StarterDraftDocumentSurface");
    const buildIdx = intake.indexOf("const buildPreviewForCurrentTier = React.useCallback");
    const buildBlock = intake.slice(buildIdx, buildIdx + 1400);
    expect(buildBlock).toMatch(
      /\(paidProSignerMetadataSessionActiveRef\.current \|\| paidProPostSignerMetadataFreezeRef\.current\)/,
    );
    expect(buildBlock).toContain("hasPaidProSourceOfTruth()");
    expect(buildBlock).toContain('logIllegalPostFreezePreviewFallback({ path: "buildPreviewForCurrentTier" })');
    expect(buildBlock).not.toMatch(/paidProInlineSignerSetupLatched/);
    const previewIdx = intake.indexOf("const renderedAgreementPreview = useMemo");
    const previewBlock = intake.slice(previewIdx, previewIdx + 500);
    expect(previewBlock).toContain("paidProPostSignerMetadataFreezeRef.current");
  });
});
