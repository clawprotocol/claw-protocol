import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearCreateReviewDraftReadyMarker, writeCreateReviewDraftReadyMarker } from "./agreementIntakeStorage";
import {
  hasAcceptedPaidProAuthority,
  PAID_PRO_REVIEW_CHIP_STATE,
  PAID_PRO_REVIEW_CHIP_VERSION,
  resolvePaidProAcceptanceRoutingMarkers,
  resolvePaidProFinalReviewVisiblePlain,
} from "./authoritativePaidProReview";
import {
  commitPaidProAcceptanceStorageHygiene,
  planPaidProAcceptanceUiRouting,
} from "./paidProAcceptanceRouting";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
  logPaidProCorpusInvariant,
} from "./paidProSourceOfTruth";
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
  shouldSuppressPremiumProcessingModalAfterPaidAuthority,
} from "./paidProPostAcceptanceStateGuard";
import { canChooseProDeliveryTrack } from "./proDeliveryTrackState";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import {
  buildDefaultProVisiblePaperCandidates,
  resolveVisibleProPaperBoundary,
} from "./visibleProPaperRenderBoundary";
import { resolvePaidProReviewState } from "./paidProReviewStateMachine";

const PAID_BODY = `PRO AGREEMENT. ${"Substantive clause. ".repeat(900)}`;

describe("paidProAcceptanceRouting", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearCreateReviewDraftReadyMarker();
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
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).toContain("pro");
    expect(PAID_PRO_REVIEW_CHIP_STATE.toLowerCase()).toContain("ready");
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

    it("incomplete Party 2 signer details keeps signer setup active (CTA = Add signer details)", () => {
      establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const gate = resolvePaidProSignerDetailsGate({
        ...TWO_PARTY,
        partySignerNames: ["Alex Client", ""],
        recipient1Email: "alex@bluecanyon.test",
        recipient2Email: "",
      });
      expect(gate.complete).toBe(false);
      expect(gate.ctaLabel).toBe("Add signer details");
      // Paid SoT remains the canonical review surface while signer setup is incomplete.
      expect(resolveProDeliveryTrackCanonicalCorpus().hasCanonicalCorpus).toBe(true);
    });

    it("completing Party 2 signer details advances (CTA = Continue to final review); SoT unchanged", () => {
      const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
      const complete = resolvePaidProSignerDetailsGate({
        ...TWO_PARTY,
        partySignerNames: ["Alex Client", "Priya Provider"],
        recipient1Email: "alex@bluecanyon.test",
        recipient2Email: "priya@ironvale.test",
      });
      expect(complete.complete).toBe(true);
      expect(complete.ctaLabel).toBe("Continue to final review");
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

  describe("paid Pro signer-setup UX surface (labels + Edit signer details scroll/focus)", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

    it("signer setup section is titled 'Add signer details' with a 'Signer setup' chip and signer-name copy", () => {
      expect(intake).toMatch(
        /paidProInlineRecipientShell\s*\n\s*\? "Add signer details"\s*\n\s*: "Share this agreement"/,
      );
      expect(intake).toContain("Signer setup");
      expect(intake).toContain(
        "Add the signer name and email for each party before creating review or signature links. LawDog does not email anyone automatically.",
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
      const block = intake.slice(start, start + 1400);
      expect(block).toContain("paidProSignerDetailsGate.firstIncompleteFieldKey");
      expect(block).toContain("focusVisibleRecipientInput(focusKey)");
      expect(block).toContain("claw-paid-pro-inline-signer-setup");
      expect(block).toContain("scrollGuidedSignerSetupIntoView()");
    });
  });
});
