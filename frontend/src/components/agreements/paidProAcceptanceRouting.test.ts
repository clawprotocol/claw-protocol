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
});
