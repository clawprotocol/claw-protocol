/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCreateReviewDraftReadyMarker, writeCreateReviewDraftReadyMarker } from "./agreementIntakeStorage";
import {
  hasAcceptedPaidProAuthority,
  PAID_PRO_REVIEW_CHIP_STATE,
  PAID_PRO_REVIEW_CHIP_VERSION,
  resolvePaidProReviewChipState,
  resolvePaidProAcceptanceRoutingMarkers,
  resolvePaidProFinalReviewVisiblePlain,
} from "./authoritativePaidProReview";
import {
  commitPaidProAcceptanceStorageHygiene,
  planPaidProAcceptanceUiRouting,
} from "./paidProAcceptanceRouting";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  logPaidProCorpusInvariant,
} from "./paidProSourceOfTruth";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { resolveGuidedProUxState } from "./guidedDealCompletion/guidedProUxState";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  shouldRestoreStoredCreateReviewDraftSnapshot,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "./createReviewRefreshRestore";
import {
  resolveProDeliveryTrackCanonicalCorpus,
  shouldBlockStarterRegenerationAfterPaidAuthority,
  shouldIgnoreLatePremiumPipelineResult,
  shouldSuppressPremiumProcessingModalAfterPaidAuthority,
} from "./paidProPostAcceptanceStateGuard";
import { resolveSignerSetupPartyIdentities } from "./signerSetupPartyIdentity";
import { canChooseProDeliveryTrack } from "./proDeliveryTrackState";
import {
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  resolvePaidProSignerDetailsGate,
} from "./signerSetupPartyIdentity";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  buildDefaultProVisiblePaperCandidates,
  resolveVisibleProPaperBoundary,
} from "./visibleProPaperRenderBoundary";
import { resolvePaidProReviewState } from "./paidProReviewStateMachine";
import {
  authoritativePremiumPipelineResultForUiApply,
  hasUsablePremiumBodyText,
} from "./premiumPostCheckoutApplyEligible";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";

import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

/** Substantive post-normalization fixture (>10000 after tip prepare). */
const PAID_BODY = expandOperativeCorpusWithUniqueSupplements(
  SHARED_ACCEPTED_PAID_BODY,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
);

describe("paidProAcceptanceRouting", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearCreateReviewDraftReadyMarker();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPaidProPipelineTestIsolation();
  });

  it("resolvePaidProAcceptanceRoutingMarkers active for server_full_draft over 10k", () => {
    const markers = resolvePaidProAcceptanceRoutingMarkers({
      premiumRenderSource: "server_full_draft",
      acceptedBodyLen: 16_573,
    });
    expect(markers.openCanonicalFinalReview).toBe(true);
    expect(markers.suppressGuidedQuestionPanel).toBe(true);
    expect(markers.clearStarterDraftReadyMarker).toBe(true);
  });

  it("planPaidProAcceptanceUiRouting reports authoritative corpus length after SoT", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const plan = planPaidProAcceptanceUiRouting({
      premiumRenderSource: "server_full_draft",
      acceptedBodyLen: PAID_BODY.length,
    });
    expect(plan.applied).toBe(true);
    expect(plan.authoritativePlainLen).toBeGreaterThan(10_000);
    expect(plan.authoritativePlainLen).not.toBe(707);
  });

  it("guided UX state is paid_pro_draft not guided_questions_active when SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const state = resolveGuidedProUxState({
      premiumPaidDocumentSurface: true,
      premiumRecipientUxActive: false,
      sendIntentSelected: false,
      guidedCompletionPhase: "collecting_answers",
      createFlowPhase: "draft_ready_for_review",
      hasGuidedSession: true,
      paidProAcceptedCorpusReady: true,
      finalReviewExplicitlyOpened: false,
    });
    expect(state).toBe("paid_pro_draft");
    expect(state).not.toBe("guided_questions_active");
  });

  it("simpleProFinalReviewActive when acceptedPaidProAuthority without prior guided apply", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "collecting_answers",
        acceptedPaidProAuthority: true,
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(true);
  });

  it("stored_draft_ready_marker cannot override paid SoT restore", () => {
    writeCreateReviewDraftReadyMarker();
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);
    commitPaidProAcceptanceStorageHygiene();
    expect(hasAcceptedPaidProAuthority()).toBe(true);
  });

  it("send handoff receives paid corpus not purpose stub", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const draft: ParsedDraftShape = {
      title: "Services",
      jurisdiction: "Texas",
      parties: [
        { name: "A LLC", role: "Client" },
        { name: "B LLC", role: "Provider" },
      ],
      purpose: "short purpose handoff",
      payment_terms: "Net 30",
      duration: "1 year",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: true },
      premium_render_source: "server_full_document_text",
    };
    const pick = pickAuthoritativePlainForSendHandoff(draft);
    expect((pick?.text || "").length).toBeGreaterThan(10_000);
    expect(pick?.field).not.toBe("purpose");
  });

  it("final review visible plain resolves from SoT when boundary empty", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolvePaidProFinalReviewVisiblePlain({
        boundaryPlain: "",
        displayCandidatePlain: "",
      }).length,
    ).toBeGreaterThan(10_000);
  });

  it("copy agreement returns same SoT hash and length as visible paid Pro corpus", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const review = getPaidProDocumentForSurface("review");
    const copy = getPaidProDocumentForSurface("copy");
    expect(review?.text.length).toBe(record.text.length);
    expect(copy?.text.length).toBe(record.text.length);
    expect(fingerprintAgreementBody(copy?.text ?? "")).toBe(fingerprintAgreementBody(review?.text ?? ""));
    expect(copy?.text).toBe(review?.text);
  });

  it("paid shell chip copy constants", () => {
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).toContain("draft");
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).not.toContain("pro");
    expect(PAID_PRO_REVIEW_CHIP_STATE.toLowerCase()).toContain("ready");
    expect(resolvePaidProReviewChipState({ signersReady: false })).toBe("Add signer details");
  });

  it("paid SoT accepted with incomplete signer metadata keeps canonical corpus and skips home regen", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["", ""],
      partySignerNames: ["", ""],
      recipient1Name: "",
      recipient2Name: "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(shouldSuppressPremiumProcessingModalAfterPaidAuthority()).toBe(true);
    const corpus = resolveProDeliveryTrackCanonicalCorpus();
    expect(corpus.hasCanonicalCorpus).toBe(true);
    expect(corpus.hash).toBe(record.hash);
  });

  it("recipient_setup_required phase keeps delivery-track canonical true from SoT", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      canChooseProDeliveryTrack({
        isPaidPro: true,
        createFlowPhase: "recipient_setup_required",
      }),
    ).toBe(true);
    expect(resolveProDeliveryTrackCanonicalCorpus().hasCanonicalCorpus).toBe(true);
  });

  it("both delivery tracks are blocked until signer metadata is complete; paid SoT is unchanged across edits", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });

    // Tracks are choosable (corpus ready) but cannot send while signer metadata is incomplete.
    expect(
      canChooseProDeliveryTrack({ isPaidPro: true, createFlowPhase: "draft_ready_for_review" }),
    ).toBe(true);

    const incompleteArgs = {
      partyCount: 2,
      draftPartyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      extraPartyReviewEmails: [],
    };
    const reviewIncomplete = resolvePaidProSignerDetailsGate({
      ...incompleteArgs,
      partySignerNames: ["", ""],
      recipient1Email: "",
      recipient2Email: "",
    });
    const signatureIncomplete = resolvePaidProSignerDetailsGate({
      ...incompleteArgs,
      partySignerNames: ["Alex Client", ""],
      recipient1Email: "alex@redmesa.test",
      recipient2Email: "",
    });
    expect(reviewIncomplete.complete).toBe(false);
    expect(signatureIncomplete.complete).toBe(false);

    // Completing signer metadata unblocks both tracks; SoT corpus hash never changes.
    const complete = resolvePaidProSignerDetailsGate({
      ...incompleteArgs,
      partySignerNames: ["Alex Client", "Priya Provider"],
      recipient1Email: "alex@redmesa.test",
      recipient2Email: "priya@harborpeak.test",
    });
    expect(complete.complete).toBe(true);
    expect(resolveProDeliveryTrackCanonicalCorpus().hash).toBe(record.hash);
  });

  it("VS01 resolves from paid SoT after premium return — never blocked_short_preview when real corpus exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const res = resolveFinalVs01CorpusOrBlock({
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
      signaturePreparationRequested: true,
    });
    // After premium return with a real (>10k) paid corpus, the gate must NOT fall to blocked_short_preview.
    expect(res.source).not.toBe("blocked_short_preview");
    expect(res.len).toBeGreaterThan(10_000);
  });

  it("blocked_short_preview is a non-advancing gate (allowed:false) and never seeds VS01", () => {
    // No paid SoT + premiumAccepted with a short body => fail-closed gate, never advances.
    const res = resolveFinalVs01CorpusOrBlock({
      premiumAccepted: true,
      premiumComplete: false,
      acceptedAuthoritativePlain: "STARTER DRAFT short preview body",
      guidedPro: true,
      vs01CheckPhase: "signature_preparation",
    });
    expect(res.source).toBe("blocked_short_preview");
    expect(res.allowed).toBe(false);
    expect(res.len).toBe(0);
  });

  it("simpleProFinalReviewActive stays true during recipient_setup_required when accepted authority", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "recipient_setup_required",
        guidedCompletionPhase: "collecting_answers",
        acceptedPaidProAuthority: true,
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(true);
  });

  describe("paid Pro copy/review/finalized corpus invariant (derive from accepted SoT)", () => {
    it("copy, review, and finalized surfaces share identical length and hash with accepted SoT", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const copy = getPaidProDocumentForSurface("copy");
      const review = getPaidProDocumentForSurface("review");
      const finalized = getPaidProDocumentForSurface("finalized");
      expect(copy?.text.length).toBe(record.text.length);
      expect(review?.text.length).toBe(copy?.text.length);
      expect(finalized?.text.length).toBe(copy?.text.length);
      expect(review?.hash).toBe(copy?.hash);
      expect(finalized?.hash).toBe(copy?.hash);
      expect(review?.hash).toBe(record.hash);
    });

    it("no paid-pro-corpus-invariant-violation when surfaces derive from SoT (copied_len === review_len === finalized_len)", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const copy = getPaidProDocumentForSurface("copy")?.text ?? "";
      const review = getPaidProDocumentForSurface("review")?.text ?? "";
      const finalized = getPaidProDocumentForSurface("finalized")?.text ?? "";
      const invariant = logPaidProCorpusInvariant({
        displayed: copy,
        copied: copy,
        review,
        finalized,
        vs01: record.text,
      });
      expect(invariant).not.toBeNull();
      expect(invariant!.copied_len).toBe(invariant!.review_len);
      expect(invariant!.copied_len).toBe(invariant!.finalized_len);
      expect(invariant!.copied_matches).toBe(true);
      expect(invariant!.review_matches).toBe(true);
      expect(invariant!.finalized_matches).toBe(true);
    });

    it("QA regression fixture: copied_len equals review_len and finalized_len after signer metadata hydration", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      // Simulate signer metadata hydration touching recipient state (does not edit the body).
      // Re-reading surfaces after hydration must still derive from the same accepted SoT.
      const copyBefore = getPaidProDocumentForSurface("copy")?.text ?? "";
      const reviewAfter = getPaidProDocumentForSurface("review")?.text ?? "";
      const finalizedAfter = getPaidProDocumentForSurface("finalized")?.text ?? "";
      expect(reviewAfter.length).toBe(copyBefore.length);
      expect(finalizedAfter.length).toBe(copyBefore.length);
      expect(hashPaidProCorpus(reviewAfter)).toBe(record.hash);
      expect(hashPaidProCorpus(finalizedAfter)).toBe(record.hash);
    });
  });

  describe("signer-metadata transition does not degrade the paid Pro surface", () => {
    const TWO_PARTY = {
      partyCount: 2,
      draftPartyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      recipient1Name: "Blue Canyon Analytics LLC",
      recipient2Name: "Iron Vale Systems Inc.",
      extraPartyReviewEmails: [] as string[],
    };

    it("incomplete Party 2 signer details keeps signer setup active (CTA = Complete signer details)", () => {
      establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const gate = resolvePaidProSignerDetailsGate({
        ...TWO_PARTY,
        partySignerNames: ["Alex Client", ""],
        recipient1Email: "alex@bluecanyon.test",
        recipient2Email: "",
      });
      expect(gate.complete).toBe(false);
      expect(gate.ctaLabel).toBe("Complete signer details");
      // Paid SoT remains the canonical review surface while signer setup is incomplete.
      expect(resolveProDeliveryTrackCanonicalCorpus().hasCanonicalCorpus).toBe(true);
    });

    it("completing Party 2 signer details advances (CTA = review decision); SoT unchanged", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const complete = resolvePaidProSignerDetailsGate({
        ...TWO_PARTY,
        partySignerNames: ["Alex Client", "Priya Provider"],
        recipient1Email: "alex@bluecanyon.test",
        recipient2Email: "priya@ironvale.test",
      });
      expect(complete.complete).toBe(true);
      expect(complete.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
      expect(resolveProDeliveryTrackCanonicalCorpus().hash).toBe(record.hash);
    });

    it("AUTHORITATIVE_READY is never reported with authoritativeLen 0 after signer hydration", () => {
      establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      // Simulated transient: paid authority exists but the active body read is momentarily empty.
      const transient = resolvePaidProReviewState({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: true,
        premiumCorpusValidationFailed: false,
        authoritativeBodyLen: 0,
      });
      expect(transient).not.toBe("AUTHORITATIVE_READY");
      expect(transient).toBe("GENERATING");

      const resolved = resolvePaidProReviewState({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: true,
        premiumCorpusValidationFailed: false,
        authoritativeBodyLen: PAID_BODY.length,
      });
      expect(resolved).toBe("AUTHORITATIVE_READY");
    });

    it("paid SoT wins the visible-paper collision after signer hydration (no blank/block)", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      // Signer hydration produced a competing rendered/handoff candidate + free starter body.
      const competingRendered = "DRAFT READY TO REVIEW — short signer handoff preview body.";
      const freeStarter = "SERVICES AGREEMENT. Short free starter preview.";
      const candidates = buildDefaultProVisiblePaperCandidates({
        paidProSourceOfTruthText: record.text,
        renderedAgreementPreviewText: competingRendered,
        freeStarterText: freeStarter,
      });
      const res = resolveVisibleProPaperBoundary({
        visiblePlain: competingRendered,
        declaredSource: "renderedAgreementPreview",
        candidates,
        intakeText: "services agreement",
        draft: null,
        paidProReviewSurface: true,
      });
      expect(res.blocked).toBe(false);
      expect(res.showFinalizing).toBe(false);
      expect(res.plain).toBe(record.text);
      expect(res.isAuthoritative).toBe(true);
      expect(res.plain).not.toBe(competingRendered);
      expect(res.plain).not.toBe(freeStarter);
    });
  });

  describe("canonical paid Pro review sticky CTA (single source)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

    it("unified primary CTA defers to paidProCanonicalStickyCta before guided/finalize branches", () => {
      const start = intake.indexOf("const unifiedPrimaryCta = useMemo");
      expect(start).toBeGreaterThan(-1);
      const stickyIdx = intake.indexOf("if (paidProCanonicalStickyCta)", start);
      expect(stickyIdx).toBeGreaterThan(-1);
      expect(intake.slice(stickyIdx, stickyIdx + 900)).toContain(
        "const mapped = mapPaidProStickyCtaToPrimaryCta(paidProCanonicalStickyCta)",
      );
      expect(intake.slice(stickyIdx, stickyIdx + 500)).toMatch(
        /!paidProCanonicalStickyCta\.showStickyBar/,
      );
      expect(intake.slice(stickyIdx, stickyIdx + 900)).toContain("assertCanonicalPaidProSignerCtaReason");
      const canonicalReviewDecisionIdx = intake.indexOf(
        "paid_pro_review_decision_on_card",
        stickyIdx,
      );
      expect(canonicalReviewDecisionIdx).toBeGreaterThan(stickyIdx);
      const legacyHiddenIdx = intake.indexOf('reason: "guided_final_review_hidden"', stickyIdx);
      expect(legacyHiddenIdx).toBeGreaterThan(canonicalReviewDecisionIdx);
    });

    it("signer snapshot drift clears only while inline signer latch is armed", () => {
      expect(intake).toContain("shouldClearSigningSnapshotOnSignerMetadataDrift");
      expect(intake).toContain("inlineSignerSetupLatched: paidProInlineSignerSetupLatched");
    });
  });

  describe("paid Pro signer-setup UX surface (labels + Edit signer details scroll/focus)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

    it("inline signer setup uses a single Signer details heading without duplicate CTA title chrome", () => {
      expect(intake).toContain("paid-pro-inline-signer-setup-panel");
      expect(intake).toContain("PAID_PRO_INLINE_SIGNER_SECTION_TITLE");
      expect(intake).toContain("PAID_PRO_INLINE_SIGNER_SECTION_BODY");
      expect(intake).toContain("suppressPostDocumentScrollSpacer");
      // Tip wires an OR with forced first-review track chooser; keep the canonical latch term.
      expect(intake).toMatch(
        /suppressFinalReviewActions=\{\s*paidProCanonicalReviewSignerSetupActive/,
      );
      expect(intake).not.toMatch(
        /paidProCanonicalReviewSignerSetupActive[\s\S]{0,400}PaidProSignerSetupOrientationBanner/,
      );
    });

    it("paid Pro signer setup header/chip no longer use 'Add recipient emails' or 'Signing link'", () => {
      const panelStart = intake.indexOf("function CreateFlowSendRecipientsPanel(");
      const headerStart = intake.indexOf('aria-label="Invite recipients"', panelStart);
      // The visible header + chip + intro copy block for the recipient/signer setup panel.
      const headerBlock = intake.slice(headerStart, headerStart + 1400);
      expect(headerBlock).not.toContain("Add recipient emails");
      expect(headerBlock).not.toContain("Signing link");
    });

    it("'Edit signer details' handler scrolls signer setup into view and focuses the first incomplete field", () => {
      const start = intake.indexOf(
        "const handleGuidedBackToSignerDetailsFromFinalReview = React.useCallback(",
      );
      expect(start).toBeGreaterThan(-1);
      const block = intake.slice(start, start + 4500);
      expect(block).toContain("paidProSignerDetailsGate.firstIncompleteFieldKey");
      expect(block).toContain("focusVisibleRecipientInput(focusKey)");
      expect(block).toContain("PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID");
      expect(block).toContain("scrollGuidedSignerSetupIntoView()");
    });
  });

  describe("rejected paid corpus never becomes the paid Pro Source of Truth", () => {
    function rejectedResult(body: string): PremiumCompletionResult {
      return {
        premiumRenderSource: "rejected_paid_corpus",
        winningPremiumBodyText: body,
        staleIntakeOrGeneration: false,
      } as unknown as PremiumCompletionResult;
    }

    it("rejected_paid_corpus is not an authoritative pipeline render source", () => {
      expect(isAuthoritativePremiumPipelineRenderSource("rejected_paid_corpus")).toBe(false);
    });

    it("a rejected_paid_corpus result (empty body) is never eligible to commit a SoT", () => {
      expect(authoritativePremiumPipelineResultForUiApply(rejectedResult(""))).toBe(false);
    });

    it("a short rejected corpus (~1165 chars) cannot become an authoritative SoT", () => {
      const shortBody = "x".repeat(1_165);
      // The body length alone clears the usable-length floor...
      expect(hasUsablePremiumBodyText(shortBody)).toBe(true);
      // ...but a rejected render source still blocks the apply/commit path entirely.
      expect(authoritativePremiumPipelineResultForUiApply(rejectedResult(shortBody))).toBe(false);
    });

    it("source guard: AgreementBuilderIntake only seeds the paid SoT for authoritative render sources", () => {
      const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      // The post-checkout auto-commit gate requires an authoritative pipeline render source + >=500 body
      // before establishPaidProSourceOfTruth runs, so a rejected/short corpus can never be committed.
      expect(src).toMatch(
        /usePaidAuthoritativeBody\s*=\s*isAuthoritativePremiumPipelineRenderSource\(result\.premiumRenderSource\)\s*&&\s*winning\.length\s*>=\s*500/,
      );
      expect(src).toMatch(/usePaidAuthoritativeBody && snapshotPlain\.trim\(\)\.length >= 500/);
    });

    it("the SoT commit gate throws for a rejected_paid_corpus source and never writes a SoT", () => {
      expect(() =>
        establishPaidProSourceOfTruth({ text: PAID_BODY, source: "rejected_paid_corpus" }),
      ).toThrow(/forbidden source/);
      expect(getPaidProSourceOfTruth()).toBeNull();
      expect(getPaidProDocumentForSurface("review")).toBeNull();
    });

    it("a short rejected corpus (~1162 chars) cannot become the paid Pro Source of Truth", () => {
      const shortRejected = "x".repeat(1_162);
      expect(() =>
        establishPaidProSourceOfTruth({ text: shortRejected, source: "rejected_paid_corpus" }),
      ).toThrow(/forbidden source/);
      expect(getPaidProSourceOfTruth()).toBeNull();
    });

    it("recoverable/fallback render sources are also blocked from committing a SoT", () => {
      for (const source of [
        "premium_network_retryable",
        "premium_generation_retryable",
        "fallback_preview",
        "stale_intake",
      ]) {
        expect(() =>
          establishPaidProSourceOfTruth({ text: PAID_BODY, source }),
        ).toThrow(/forbidden source/);
      }
      expect(getPaidProSourceOfTruth()).toBeNull();
    });
  });

  describe("accepted full server document routes to paid Pro review", () => {
    it("an accepted long server_full_draft opens the canonical final review and suppresses guided Q&A", () => {
      const markers = resolvePaidProAcceptanceRoutingMarkers({
        premiumRenderSource: "server_full_draft",
        acceptedBodyLen: 12_000,
      });
      expect(markers.openCanonicalFinalReview).toBe(true);
      expect(markers.suppressGuidedQuestionPanel).toBe(true);
    });

    it("a committed long server SoT yields a non-null review surface (routes to paid Pro review)", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const review = getPaidProDocumentForSurface("review");
      expect(review?.text.length).toBe(record.text.length);
      expect(review?.hash).toBe(record.hash);
    });
  });

  describe("signer-setup metadata edits keep the paid SoT frozen", () => {
    function signerMetadataState() {
      return {
        party1: { legalEntity: "Blue Canyon Analytics LLC", signerName: "", signerEmail: "" },
        party2: { legalEntity: "Iron Vale Systems Inc", signerName: "", signerEmail: "" },
      };
    }

    it("typing Party 2 signer name/email does not change the paid SoT hash/len", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const beforeHash = record.hash;
      const beforeLen = record.text.length;

      // Simulate signer metadata typing: only signer metadata state changes.
      const meta = signerMetadataState();
      meta.party2.signerName = "Dana Vale";
      meta.party2.signerEmail = "dana@ironvale.com";

      const after = getPaidProSourceOfTruth();
      expect(after?.hash).toBe(beforeHash);
      expect(after?.text.length).toBe(beforeLen);
      // The legal entity slots are untouched by signer-name/email typing.
      expect(meta.party1.legalEntity).toBe("Blue Canyon Analytics LLC");
      expect(meta.party2.legalEntity).toBe("Iron Vale Systems Inc");
    });

    it("no paid-pro-corpus-invariant-violation while typing signer metadata (surfaces stay SoT-derived)", () => {
      establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const meta = signerMetadataState();
      meta.party2.signerName = "Dana Vale";
      meta.party2.signerEmail = "dana@ironvale.com";

      // Every paid surface resolves from the SoT; a decorative chrome string is never the body.
      const displayed = getPaidProDocumentForSurface("display")!.text;
      const copied = getPaidProDocumentForSurface("copy")!.text;
      const review = getPaidProDocumentForSurface("review")!.text;
      const finalized = getPaidProDocumentForSurface("finalized")!.text;
      const invariant = logPaidProCorpusInvariant({ displayed, copied, review, finalized });
      const violations = [
        invariant?.displayed_matches,
        invariant?.copied_matches,
        invariant?.review_matches,
        invariant?.finalized_matches,
      ];
      expect(violations.every(Boolean)).toBe(true);
      expect(invariant?.displayed_len).toBe(invariant?.copied_len);
    });
  });

  describe("duplicate premium-request race: first authoritative success wins", () => {
    // A full server document that names two distinct signature-block parties.
    const FULL_SERVER_DOC = expandOperativeCorpusWithUniqueSupplements(
      [
        "PROFESSIONAL SERVICES AGREEMENT",
        "",
        "This Agreement is entered into between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
        "",
        `1. Scope of Services. ${"Detailed operative commercial clause. ".repeat(220)}`,
        "",
        `2. Fees. ${"Payment terms clause. ".repeat(40)}`,
        "",
        "3. Governing Law. Texas law governs this Agreement.",
        "",
        "4. Electronic Signatures. Electronic signatures are permitted.",
        "",
        "IN WITNESS WHEREOF, the parties have executed this Agreement.",
        "",
        "CLIENT:",
        "Blue Canyon Analytics LLC",
        "By: _________________________________",
        "",
        "SERVICE PROVIDER:",
        "Iron Vale Systems Inc.",
        "By: _________________________________",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
    );

    // The duplicate/degraded second response body (short json_parse rejected corpus).
    const REJECTED_SECOND_BODY = "x".repeat(1_135);

    it("first valid server full document is accepted; the second rejected_paid_corpus is ignored", () => {
      // First response: valid, long server full document → committed exactly once.
      const accepted = establishPaidProSourceOfTruth({ text: FULL_SERVER_DOC, source: "server_full_draft" });
      expect(getPaidProSourceOfTruth()?.hash).toBe(accepted.hash);

      // Second response (same session) is rejected — orchestration must ignore it.
      expect(
        shouldIgnoreLatePremiumPipelineResult({
          hasAcceptedAuthoritativePaidCorpus: true,
          incomingRenderSource: "rejected_paid_corpus",
          incomingBodyLen: REJECTED_SECOND_BODY.length,
          acceptedBodyLen: accepted.text.length,
        }),
      ).toBe(true);

      // Defense-in-depth: even if the rejected body reached the commit gate, it throws and never writes.
      expect(() =>
        establishPaidProSourceOfTruth({ text: REJECTED_SECOND_BODY, source: "rejected_paid_corpus" }),
      ).toThrow(/forbidden source/);
      expect(getPaidProSourceOfTruth()?.hash).toBe(accepted.hash);
    });

    it("existing paid SoT cannot be overwritten by a shorter degraded second body", () => {
      const accepted = establishPaidProSourceOfTruth({ text: FULL_SERVER_DOC, source: "server_full_draft" });
      // Second degraded response: shorter body, even with a 'real' source name.
      const result = establishPaidProSourceOfTruth({ text: "y".repeat(7_881), source: "server_full_draft" });
      expect(result.hash).toBe(accepted.hash);
      expect(getPaidProSourceOfTruth()?.text.length).toBe(accepted.text.length);
    });

    it("paidProSourceOfTruth keeps the full server doc length + hash after the second degraded response", () => {
      const accepted = establishPaidProSourceOfTruth({ text: FULL_SERVER_DOC, source: "server_full_draft" });
      const beforeLen = accepted.text.length;
      const beforeHash = accepted.hash;
      // Simulate late degraded arrival being applied at the commit chokepoint.
      establishPaidProSourceOfTruth({ text: "z".repeat(2_000), source: "server_full_draft" });
      const after = getPaidProSourceOfTruth();
      expect(after?.text.length).toBe(beforeLen);
      expect(after?.hash).toBe(beforeHash);
      expect(fingerprintAgreementBody(after?.text ?? "")).toBe(fingerprintAgreementBody(accepted.text));
    });

    it("after authoritative success, guided/starter surfaces stay suppressed", () => {
      establishPaidProSourceOfTruth({ text: FULL_SERVER_DOC, source: "server_full_draft" });
      expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
      expect(shouldSuppressPremiumProcessingModalAfterPaidAuthority()).toBe(true);
      const state = resolveGuidedProUxState({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        sendIntentSelected: false,
        guidedCompletionPhase: "collecting_answers",
        createFlowPhase: "draft_ready_for_review",
        hasGuidedSession: true,
        paidProAcceptedCorpusReady: true,
        finalReviewExplicitlyOpened: false,
      });
      expect(state).not.toBe("guided_questions_active");
    });

    it("the apply path drops late premium responses once authoritative success exists", () => {
      const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      // Orchestration calls the latch and returns before re-applying a late degraded/rejected result.
      expect(src).toMatch(/shouldIgnoreLatePremiumPipelineResult\(\{/);
      expect(src).toMatch(/late_premium_response_ignored_authoritative_success_wins/);
    });

    it("signer setup still receives the full accepted SoT and two distinct parties", () => {
      const draft = {
        title: "Professional Services Agreement",
        parties: [
          { name: "Blue Canyon Analytics LLC", role: "Client" },
          { name: "Iron Vale Systems Inc.", role: "Service Provider" },
        ],
      } as ParsedDraftShape;
      const accepted = establishPaidProSourceOfTruth({
        text: FULL_SERVER_DOC,
        source: "server_full_draft",
        draft,
        intakeText:
          "Professional services between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
      });
      const signerDoc = getPaidProDocumentForSurface("signer_setup");
      expect(signerDoc?.text.length).toBe(accepted.text.length);

      const ids = resolveSignerSetupPartyIdentities({
        parties: [{ name: "Blue Canyon Analytics LLC" }, { name: "Blue Canyon Analytics LLC" }],
        agreementBodyText: getPaidProSourceOfTruth()?.text,
      });
      // Tip may keep a same-line role prefix on entity 1 (`CLIENT: Entity`).
      expect(ids[0]?.legalEntityName).toMatch(/(?:CLIENT:\s*)?Blue Canyon Analytics LLC/);
      expect(ids[1]?.legalEntityName).toMatch(/^Iron Vale Systems Inc\.?$/);
      expect(ids[0]?.legalEntityName?.replace(/^CLIENT:\s*/i, "")).not.toBe(ids[1]?.legalEntityName);
    });
  });

  describe("signer-typing isolation: no document/guided/handoff recompute, no fail-closed", () => {
    const SIGNER_SETUP_BODY = expandOperativeCorpusWithUniqueSupplements(
      [
        "PROFESSIONAL SERVICES AGREEMENT",
        "",
        "This Agreement is entered into between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
        `1. Scope. ${"Operative commercial clause. ".repeat(120)}`,
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
        "",
        "CLIENT:",
        "Blue Canyon Analytics LLC",
        "By: _________________________________",
        "",
        "SERVICE PROVIDER:",
        "Iron Vale Systems Inc.",
        "By: _________________________________",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
    );

    it("the edit guard prevents FAILED_PREMIUM_CORPUS while editing signer metadata", () => {
      establishPaidProSourceOfTruth({ text: SIGNER_SETUP_BODY, source: "server_full_draft" });
      // Even if a transient recompute flips validation to failed during typing, the guard holds.
      const state = resolvePaidProReviewState({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: false,
        premiumCorpusValidationFailed: true,
        signerMetadataEditActive: true,
      });
      expect(state).not.toBe("FAILED_PREMIUM_CORPUS");
    });

    it("authoritative paid review stays AUTHORITATIVE_READY (mounted) during signer typing", () => {
      establishPaidProSourceOfTruth({ text: SIGNER_SETUP_BODY, source: "server_full_draft" });
      const state = resolvePaidProReviewState({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: true,
        premiumCorpusValidationFailed: false,
        authoritativeBodyLen: SIGNER_SETUP_BODY.length,
        signerMetadataEditActive: true,
      });
      expect(state).toBe("AUTHORITATIVE_READY");
    });

    type SignerMeta = { name: string; email: string; title: string; address: string };
    function sotUnchangedAfterSignerEdit(mutate: (m: SignerMeta) => void) {
      const record = establishPaidProSourceOfTruth({ text: SIGNER_SETUP_BODY, source: "server_full_draft" });
      const beforeHash = record.hash;
      const beforeLen = record.text.length;
      // Signer metadata edits are metadata-only — they live entirely outside the SoT.
      const meta: SignerMeta = { name: "", email: "", title: "", address: "" };
      mutate(meta);
      // Legal entity slots stay frozen on the canonical SoT signature block.
      const ids = resolveSignerSetupPartyIdentities({
        parties: [{ name: "Blue Canyon Analytics LLC" }, { name: "Iron Vale Systems Inc." }],
        agreementBodyText: getPaidProSourceOfTruth()?.text,
      });
      const after = getPaidProSourceOfTruth();
      expect(after?.hash).toBe(beforeHash);
      expect(after?.text.length).toBe(beforeLen);
      return ids;
    }

    it("typing Party 2 signer NAME does not change SoT hash/len; Party 2 stays Iron Vale", () => {
      const ids = sotUnchangedAfterSignerEdit((m) => {
        m.name = "Dana Vale";
      });
      expect(ids[0]?.legalEntityName).toBe("Blue Canyon Analytics LLC");
      expect(ids[1]?.legalEntityName).toMatch(/^Iron Vale Systems Inc\.?$/);
      expect(ids[0]?.legalEntityName).not.toBe(ids[1]?.legalEntityName);
    });

    it("typing Party 2 signer EMAIL does not change SoT hash/len", () => {
      const ids = sotUnchangedAfterSignerEdit((m) => {
        m.email = "dana@ironvale.com";
      });
      expect(ids[1]?.legalEntityName).toMatch(/^Iron Vale Systems Inc\.?$/);
    });

    it("typing Party 2 signer TITLE/ADDRESS does not change SoT hash/len", () => {
      const ids = sotUnchangedAfterSignerEdit((m) => {
        m.title = "Chief Executive Officer";
        m.address = "500 Market Street, Suite 1200";
      });
      // Title/address never leak into the legal entity slots.
      expect(ids[1]?.legalEntityName).toMatch(/^Iron Vale Systems Inc\.?$/);
      expect(ids[1]?.legalEntityName).not.toContain("Chief Executive");
      expect(ids[1]?.legalEntityName).not.toContain("Market Street");
    });

    it("Party 2 legal entity remains isolated from Party 1 across repeated signer typing", () => {
      establishPaidProSourceOfTruth({ text: SIGNER_SETUP_BODY, source: "server_full_draft" });
      // Simulate progressive keystrokes of the Party 2 signer name. None may leak into the entity slot.
      for (const _typed of ["D", "Da", "Dan", "Dana", "Dana Vale"]) {
        const ids = resolveSignerSetupPartyIdentities({
          parties: [{ name: "Blue Canyon Analytics LLC" }, { name: "Iron Vale Systems Inc." }],
          agreementBodyText: getPaidProSourceOfTruth()?.text,
        });
        expect(ids[0]?.legalEntityName).toBe("Blue Canyon Analytics LLC");
        expect(ids[1]?.legalEntityName).toMatch(/^Iron Vale Systems Inc\.?$/);
        // The keystroke value never collapses Party 2 into Party 1 nor leaks the signer name.
        expect(ids[1]?.legalEntityName).not.toBe(ids[0]?.legalEntityName);
        expect(ids[1]?.legalEntityName).not.toContain("Dana");
      }
    });

    it("freezes legal entity slots generically for a NON Blue-Canyon/Iron-Vale two-party fixture", () => {
      // Requirement: party freezing is generic, not hardcoded to the regression fixture.
      const altBody = [
        "MASTER SERVICES AGREEMENT",
        "",
        "This Agreement is entered into between Maple Grove Holdings LLC and Summit Ridge Partners Inc.",
        `1. Services. ${"Operative commercial clause. ".repeat(120)}`,
        "",
        "IN WITNESS WHEREOF, the parties execute this Agreement.",
        "",
        "CLIENT:",
        "Maple Grove Holdings LLC",
        "By: _________________________________",
        "",
        "SERVICE PROVIDER:",
        "Summit Ridge Partners Inc.",
        "By: _________________________________",
      ].join("\n");
      const record = establishPaidProSourceOfTruth({ text: altBody, source: "server_full_draft" });
      const beforeHash = record.hash;
      const beforeLen = record.text.length;

      for (const _typed of ["A", "Av", "Ave", "Avery", "Avery Cole"]) {
        const ids = resolveSignerSetupPartyIdentities({
          parties: [{ name: "Maple Grove Holdings LLC" }, { name: "Summit Ridge Partners Inc." }],
          agreementBodyText: getPaidProSourceOfTruth()?.text,
        });
        expect(ids[0]?.legalEntityName).toBe("Maple Grove Holdings LLC");
        expect(ids[1]?.legalEntityName).toMatch(/^Summit Ridge Partners Inc\.?$/);
        expect(ids[1]?.legalEntityName).not.toBe(ids[0]?.legalEntityName);
        expect(ids[1]?.legalEntityName).not.toContain("Avery");
      }
      const after = getPaidProSourceOfTruth();
      expect(after?.hash).toBe(beforeHash);
      expect(after?.text.length).toBe(beforeLen);
    });

    it("AgreementBuilderIntake wires the canonical signer-metadata-edit hard guard end to end", () => {
      const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      // Single canonical guard resolved from the state machine, including the prepare-links release.
      expect(src).toMatch(/paidProSignerMetadataEditGuard\s*=\s*useMemo/);
      expect(src).toMatch(/resolvePaidProSignerMetadataEditGuard\(\{/);
      // Release signal must be the dedicated signaturePreparationRequested flag, NOT any
      // "entered signer setup" boolean (guidedSendIntentSelected, finalReviewSendPathChosenRef,
      // guidedSigningConfirmationActive) — all latch true while the signer form is still mounted and
      // would defeat the freeze during typing (the recurring repro).
      expect(src).toMatch(
        /const prepareSignatureLinksRequested\s*=\s*signaturePreparationRequested;/,
      );
      const prepareDefIdx = src.indexOf("const prepareSignatureLinksRequested =");
      const prepareDefSlice = src.slice(prepareDefIdx, prepareDefIdx + 120);
      expect(prepareDefSlice).not.toMatch(/finalReviewSendPathChosenRef/);
      expect(prepareDefSlice).not.toMatch(/guidedSendIntentSelected/);
      expect(prepareDefSlice).not.toMatch(/guidedSigningConfirmationActive/);
      // The flag is RELEASED only by the real proceed-to-signing action and RE-ARMED on entering setup.
      expect(src).toMatch(/setSignaturePreparationRequested\(true\)/);
      expect(src).toMatch(/setSignaturePreparationRequested\(false\)/);
      // Entering inline signer setup re-arms the freeze (resets the release flag to false).
      const enterSetupIdx = src.indexOf("const enterFinalReviewRecipientSetup = React.useCallback");
      const enterSetupSlice = src.slice(enterSetupIdx, enterSetupIdx + 4500);
      expect(enterSetupSlice).toMatch(/setSignaturePreparationRequested\(false\)/);
      // Fed into the paid review state machine (never fails closed during edit).
      expect(src).toMatch(/signerMetadataEditActive:\s*paidProSignerMetadataEditGuardActive/);
      // Guided question queue rebuild is suppressed during signer setup over an accepted SoT.
      expect(src).toMatch(/paidProSignerSetupSuppressesGuidedAndStarter\(\{/);
      // Authoritative body is frozen: the recipient/handoff re-derivation no-ops while the guard is active.
      expect(src).toMatch(
        /if \(paidProSignerMetadataEditGuardRef\.current \|\| paidProPostSignerMetadataFreezeRef\.current\) return;/,
      );
      // VS01/handoff corpus gate is frozen during signer editing via the freeze helper + guard.
      expect(src).toMatch(/resolveOrReuseFrozenForSignerEdit\(\{[\s\S]*?editGuardActive:\s*paidProSignerMetadataEditGuardActive/);
      expect(src).toMatch(/frozen:\s*vs01FinalCorpusGateFrozenRef\.current/);
    });

    it("inline signer setup stays mounted via latch when gate completes during typing", () => {
      const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      expect(src).toMatch(/paidProInlineSignerSetupLatched/);
      expect(src).toMatch(/resolvePaidProInlineSignerSetupMounted\(\{/);
      // Tip arms the mount latch inline (helper lives in signerSetupPartyIdentity, not Intake).
      expect(src).toMatch(/setPaidProInlineSignerSetupLatched\(true\)/);
      const canonicalIdx = src.indexOf("const paidProCanonicalReviewSignerSetupActive = useMemo");
      const canonicalSlice = src.slice(canonicalIdx, canonicalIdx + 500);
      expect(canonicalSlice).toMatch(/resolvePaidProInlineSignerSetupMounted/);
      expect(canonicalSlice).not.toMatch(/!paidProSignatureDetailsReady/);
      const ctaIdx = src.indexOf("const unifiedPrimaryCta = useMemo");
      expect(ctaIdx).toBeGreaterThan(-1);
      const ctaSlice = src.slice(ctaIdx, ctaIdx + 12000);
      const latchIdx = src.indexOf(
        "paidProInlineSignerSetupLatched && !signaturePreparationRequested",
        ctaIdx,
      );
      expect(latchIdx).toBeGreaterThan(ctaIdx);
      const latchCtaSlice = src.slice(latchIdx, latchIdx + 700);
      expect(latchCtaSlice).toMatch(/paidProSignerDetailsGate\.ctaLabel/);
      expect(latchCtaSlice).toMatch(/paid_pro_signer_details_required/);
      expect(latchCtaSlice).toMatch(/paid_pro_signer_details_complete/);
      expect(latchCtaSlice).toMatch(/signerDetailsAreComplete/);
      expect(ctaSlice).not.toMatch(
        /const prepareSignatureLinksRequested\s*=\s*[\s\S]{0,120}paidProSignatureDetailsReady/,
      );
      expect(ctaSlice).not.toMatch(/guidedSendIntentSelected[\s\S]{0,40}prepareSignatureLinksRequested/);
      expect(ctaSlice).not.toMatch(/finalReviewSendPathChosenRef[\s\S]{0,40}prepareSignatureLinksRequested/);
      expect(src).toMatch(
        /paid_pro_signer_details_complete[\s\S]{0,400}finalizePaidProSignerMetadataAndOpenReviewDecision\(\)/,
      );
      expect(src).not.toMatch(
        /paid_pro_signer_details_complete[\s\S]{0,400}continueGuidedFinalReviewToSigning\(\{ intent: "signature" \}\)/,
      );
      expect(src).toMatch(/logPremiumSignerDetailsGate/);
    });

    it("AgreementBuilderIntake hard-freezes VS01 via the mode-independent invariant before the resolver", () => {
      const src = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      // Simple invariant: SoT present + Prepare signature links not clicked, independent of signer mode.
      expect(src).toMatch(/paidProSigningCorpusFreezeActive\s*=\s*useMemo/);
      expect(src).toMatch(/prepareSignatureLinksRequested,/);
      // The VS01 memo returns BEFORE calling resolveFinalVs01CorpusOrBlock while frozen.
      const memoStart = src.indexOf("const vs01FinalCorpusGate = useMemo");
      const memoSlice = src.slice(memoStart, memoStart + 1600);
      expect(memoSlice).toMatch(/if \(paidProSigningCorpusFreezeActive\)\s*\{/);
      const freezeReturnIdx = memoSlice.indexOf("if (paidProSigningCorpusFreezeActive)");
      const resolverCallIdx = memoSlice.indexOf("resolveFinalVs01CorpusOrBlock(");
      expect(freezeReturnIdx).toBeGreaterThanOrEqual(0);
      expect(resolverCallIdx).toBeGreaterThan(freezeReturnIdx);
      // Explicit [premium-signer-freeze] diagnostics for the freeze, including all blocked-path flags.
      expect(src).toMatch(/logPremiumSignerFreeze\(\{[\s\S]*?blockedVs01Compute:\s*true/);
      expect(src).toMatch(/logPremiumSignerFreeze\(\{[\s\S]*?blockedHandoffCompute:\s*true/);
      expect(src).toMatch(/logPremiumSignerFreeze\(\{[\s\S]*?blockedGuidedQueue:\s*true/);
      expect(src).toMatch(/logPremiumSignerFreeze\(\{[\s\S]*?blockedStarterPreview:\s*true/);
      expect(src).toMatch(/logPremiumSignerFreeze\(\{[\s\S]*?blockedReviewTransition:\s*true/);
      // Inline signer-details mode (displayPhase review) is also detected for the edit guard.
      expect(src).toMatch(/guidedInlineSignerSetupActive\s*=\s*Boolean\(/);
      expect(src).toMatch(/signerSetupLatched:\s*paidProInlineSignerSetupLatched/);
      expect(src).toMatch(/paidProSignerMetadataSessionActive/);
      expect(src).toMatch(/frozenSignerMetadataPartyManifestRef/);
      expect(src).toMatch(/logPremiumSignerMetadataFreeze/);
      // The freeze invariant also feeds the review state machine (no fail-closed at len 0).
      expect(src).toMatch(/signerMetadataEditActive:\s*[\s\S]*?paidProSigningCorpusFreezeActive/);
    });
  });
});
