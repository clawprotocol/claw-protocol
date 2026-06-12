/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { initializeNewAgreementSession } from "../../launch/newAgreementSessionReset";
import { writeCreateReviewAgreementResumeId } from "./agreementIntakeStorage";
import {
  isPaidProAgreementAuthoritative,
  resolvePaidProAgreementAuthoritative,
} from "./paidProAgreementAuthority";
import {
  shouldHydrateStoredAgreementResumeId,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "./createReviewRefreshRestore";
import { resolveAuthoritativePremiumSnapshotPlain } from "./premiumAuthoritativeBodyPreservation";
import { hydrateAcceptedPremiumCanonicalCorpusFromSnapshot } from "./acceptedPremiumCanonicalCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  hasCurrentSessionProEntitlement,
  markCurrentSessionFreeStarterIntent,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  clearPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
  persistPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { resetStalePaidReviewShellForFreeStarter } from "./freeStarterReviewShell";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const PRO_BODY = `CONSULTING AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"x".repeat(900)}`;

const PRO_DRAFT: PaidProAgreementAuthorityDraft = {
  title: "Consulting Agreement",
  jurisdiction: "Oklahoma",
  purpose: "AI workflow setup",
  payment_terms: "",
  parties: [
    { name: "Red Mesa Logistics LLC", role: "Client" },
    { name: "Harbor Peak Automation LLC", role: "Service Provider" },
  ],
  premium_render_source: "server_full_document_text",
  premium_server_full_document_text: PRO_BODY,
};

type PaidProAgreementAuthorityDraft = Parameters<typeof isPaidProAgreementAuthoritative>[0]["draft"];

describe("paidProAuthorityEstablishmentAudit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidPremiumCompletionSession();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidPremiumCompletionSession();
  });

  it("free starter submit cannot establish Paid Pro SoT", () => {
    markCurrentSessionFreeStarterIntent();
    expect(() =>
      establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" }),
    ).toThrow(/establishment-suppressed/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("async server_full_document_text resolve cannot establish SoT without entitlement", () => {
    markCurrentSessionFreeStarterIntent();
    resolvePremiumRenderSource({
      draft: {
        premium_server_full_document_text: PRO_BODY,
      } as ParsedDraftShape,
      serverFullDocumentText: PRO_BODY,
      paidAuthoritativeProBody: PRO_BODY,
      premiumWinningCorpusFallback: PRO_BODY,
      buildLivePreview: () => "starter",
    });
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("resolveAuthoritativePremiumSnapshotPlain does not establish SoT during free starter", () => {
    markCurrentSessionFreeStarterIntent();
    const r = resolveAuthoritativePremiumSnapshotPlain({
      winningBody: PRO_BODY,
      resolvedText: PRO_BODY,
      pipelineSource: "server_full_draft",
      resolvedSource: "server_full_document_text",
    });
    expect(r.text.length).toBeGreaterThanOrEqual(500);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("stored resume id cannot hydrate during fresh free starter", () => {
    writeCreateReviewAgreementResumeId("prior-pro-agreement");
    markCurrentSessionFreeStarterIntent();
    expect(shouldHydrateStoredAgreementResumeId()).toBe(false);
    expect(shouldSkipHomeAutoGenerateForStoredReview({ freshHomeHeroHandoff: true })).toBe(false);
  });

  it("previous Pro session markers cannot contaminate new free session after initializeNewAgreementSession", () => {
    markPaidPremiumCompletionSession({ source: "qa_bypass" });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" });
    persistPremiumCompletionSnapshot({
      premiumDraft: PRO_DRAFT as ParsedDraftShape,
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: PRO_BODY,
      premiumReadonlyPlainText: PRO_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    initializeNewAgreementSession();
    resetStalePaidReviewShellForFreeStarter("home_create_submit");

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasCurrentSessionProEntitlement()).toBe(false);
    expect(() =>
      establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" }),
    ).toThrow(/establishment-suppressed/);
    expect(
      resolvePaidProAgreementAuthoritative({
        premiumCompletionSnapshot: {
          premiumAccepted: true,
          premiumWinningBodyText: PRO_BODY,
          premiumReadonlyPlainText: PRO_BODY,
        } as never,
      }).authoritative,
    ).toBe(false);
  });

  it("intentional Pro CTA + checkout still establishes Paid Pro SoT", () => {
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    establishPaidProSourceOfTruth({ text: PRO_BODY, source: "server_full_draft" });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(hasCurrentSessionProEntitlement()).toBe(true);
  });

  it("dashboard-style Pro draft row remains authoritative from API fields without in-tab SoT", () => {
    markCurrentSessionFreeStarterIntent();
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(
      isPaidProAgreementAuthoritative({
        draft: PRO_DRAFT,
        agreementId: "existing-pro-agreement-id",
        includeLocalCompletionMarker: false,
      }),
    ).toBe(true);
  });

  it("hydrateAcceptedPremiumCanonicalCorpusFromSnapshot is suppressed during free starter", () => {
    markCurrentSessionFreeStarterIntent();
    const hydrated = hydrateAcceptedPremiumCanonicalCorpusFromSnapshot({
      premiumAccepted: true,
      paidProSourceOfTruthText: PRO_BODY,
      acceptedPremiumCanonicalText: PRO_BODY,
      paidProSourceOfTruthSource: "server_full_draft",
      acceptedPremiumCanonicalPipelineSource: "server_full_draft",
      premiumPipelineRenderSource: "server_full_draft",
      premiumWinningBodyText: PRO_BODY,
      savedAt: Date.now(),
    } as never);
    expect(hydrated).toBeNull();
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("stale paid completion session marker ignored for authority during free starter", () => {
    markCurrentSessionFreeStarterIntent();
    sessionStorage.setItem(
      "claw_paid_premium_completion_session_v1",
      JSON.stringify({ v: 1, source: "qa_bypass", markedAt: Date.now() }),
    );
    expect(
      resolvePaidProAgreementAuthoritative({
        includeLocalCompletionMarker: false,
      }).authoritative,
    ).toBe(false);
  });
});
