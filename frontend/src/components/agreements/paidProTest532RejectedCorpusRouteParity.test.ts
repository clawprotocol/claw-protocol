/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
import {
  shouldBlockPaidProReviewReadinessFromFallbackCorpus,
  shouldSuppressPaidProCorpusRenderForRejectedPipeline,
} from "./paidProApiFailureAuthorityGuard";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { resolveCreateFlowPaidReviewDisplayPlain } from "./paidProCreateFlowReviewHandoff";
import {
  resolvePaidProPostCheckoutRecoveryDisplayPlain,
  hasRenderablePaidProFirstReviewCorpus,
} from "./paidProPostCheckoutRenderGate";
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_STARTER_PREVIEW,
  test501Draft,
} from "./paidProTest501Fixtures";
import { buildTest531ThinLocalRecoveryCandidates } from "./paidProTest531Fixtures";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";

function rejectedPaidCorpusDraft(thinBody: string): AgreementDraft {
  return {
    id: "ag-test-532-rejected",
    premium_render_source: "rejected_paid_corpus",
    premium_full_document_text: thinBody,
    premium_server_full_document_text: thinBody,
    server_full_document_text: thinBody,
    document_text: thinBody,
    purpose: thinBody,
    parties: [
      { name: "Alpha Corp", role: "Client" },
      { name: "Beta LLC", role: "Service Provider" },
    ],
  } as unknown as AgreementDraft;
}

function acceptedPaidCreateDraft(paidBody: string): AgreementDraft {
  return {
    ...test501Draft(TEST501_STARTER_PREVIEW, paidBody),
    id: "ag-test-532-accepted",
    premium_render_source: "server_full_draft",
  } as unknown as AgreementDraft;
}

describe("TEST532 — rejected_paid_corpus route parity (create vs dashboard/admin)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearCurrentSessionProEntitlementMarkers();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
  });

  it("shouldSuppressPaidProCorpusRenderForRejectedPipeline is true only for rejected_paid_corpus without SoT", () => {
    expect(
      shouldSuppressPaidProCorpusRenderForRejectedPipeline({
        pipelineSource: "rejected_paid_corpus",
      }),
    ).toBe(true);
    expect(
      shouldSuppressPaidProCorpusRenderForRejectedPipeline({
        pipelineSource: "server_full_draft",
      }),
    ).toBe(false);
    expect(
      shouldSuppressPaidProCorpusRenderForRejectedPipeline({
        draft: rejectedPaidCorpusDraft(buildTest531ThinLocalRecoveryCandidates()[2]!),
      }),
    ).toBe(true);
  });

  it("dashboard owner_done resolveReviewFirstDisplayCorpus does not surface thin local fallback after rejection", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[2]!;
    expect(thin.length).toBeGreaterThanOrEqual(1500);
    const draft = rejectedPaidCorpusDraft(thin);
    expect(resolveReviewFirstDisplayCorpus(draft, "owner_done")).toBeNull();
    expect(resolveReviewFirstDisplayCorpus(draft, "reviewer")).toBeNull();
  });

  it("admin/send handoff pickAuthoritativePlainForSendHandoff does not pick thin draft fields after rejection", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[1]!;
    const draft = rejectedPaidCorpusDraft(thin);
    expect(pickAuthoritativePlainForSendHandoff(draft)).toBeNull();
  });

  it("post-checkout recovery display returns empty for rejected_paid_corpus even with thin candidates", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[0]!;
    expect(
      resolvePaidProPostCheckoutRecoveryDisplayPlain({
        premiumRenderSource: "rejected_paid_corpus",
        winningPremiumBodyText: thin,
        hydratedPremiumBody: thin,
        draft: rejectedPaidCorpusDraft(thin) as unknown as ParsedDraftShape,
      }),
    ).toBe("");
  });

  it("guided final review authoritative body stays empty when pipeline is rejected_paid_corpus", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[2]!;
    const resolution = resolveGuidedFinalReviewAuthoritativeBody({
      pipelineRenderSource: "rejected_paid_corpus",
      candidates: [
        { source: "agreement_document", body: thin },
        { source: "picker_authoritative", body: thin },
        { source: "last_accepted_premium_candidate", body: thin },
      ],
    });
    expect(resolution.body).toBe("");
    expect(resolution.source).toBe("none");
    expect(resolution.len).toBe(0);
  });

  it("resolveAuthoritativePaidProReviewPlain returns empty — no blank thin review body", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[2]!;
    expect(
      resolveAuthoritativePaidProReviewPlain({
        draft: rejectedPaidCorpusDraft(thin) as unknown as ParsedDraftShape,
        premiumRenderSource: "rejected_paid_corpus",
      }).length,
    ).toBe(0);
  });

  it("shouldBlockPaidProReviewReadinessFromFallbackCorpus blocks review readiness on rejected_paid_corpus", () => {
    expect(
      shouldBlockPaidProReviewReadinessFromFallbackCorpus({
        premiumRenderSource: "rejected_paid_corpus",
        corpusLen: buildTest531ThinLocalRecoveryCandidates()[2]!.length,
      }),
    ).toBe(true);
    expect(
      hasRenderablePaidProFirstReviewCorpus({
        premiumRenderSource: "rejected_paid_corpus",
        winningPremiumBodyText: buildTest531ThinLocalRecoveryCandidates()[2],
        draft: rejectedPaidCorpusDraft(
          buildTest531ThinLocalRecoveryCandidates()[2]!,
        ) as unknown as ParsedDraftShape,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);
  });

  it("premium readonly picker draft-server shortcut does not surface thin draft fields on rejected_paid_corpus", () => {
    const thin = buildTest531ThinLocalRecoveryCandidates()[2]!;
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumWinningBodyText: thin,
      draft: rejectedPaidCorpusDraft(thin) as unknown as ParsedDraftShape,
      agreementDocumentText: thin,
      premiumCheckoutCompleted: true,
      lastPremiumPipelineRenderSource: "rejected_paid_corpus",
    });
    expect(pick.plainText).toBe("");
    expect(pick.sourceUsed).toBe("none");
    expect(pick.audit.candidates[0]?.reason).toBe("rejected_paid_corpus_no_local_fallback");
  });

  it("accepted paid corpus still uses draft server-full shortcut (guard does not over-block)", () => {
    const paidBody = TEST501_ACCEPTED_PAID_BODY;
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumWinningBodyText: paidBody,
      draft: acceptedPaidCreateDraft(paidBody) as unknown as ParsedDraftShape,
      agreementDocumentText: "",
      premiumCheckoutCompleted: true,
      lastPremiumPipelineRenderSource: "server_full_draft",
    });
    expect(pick.plainText.length).toBeGreaterThanOrEqual(1500);
    expect(pick.sourceUsed).toBe("server_full_document_text");
  });

  it("first-time create and dashboard routes resolve the same accepted paid corpus for the same agreement", () => {
    const paidBody = TEST501_ACCEPTED_PAID_BODY;
    const draft = acceptedPaidCreateDraft(paidBody);
    const createFlowPlain = resolveCreateFlowPaidReviewDisplayPlain({
      winningBody: paidBody,
      snapshotPlain: "",
      pipelineSource: "server_full_draft",
      handoffEstablished: true,
      handoffBody: paidBody,
    });
    const dashboardCorpus = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expect(createFlowPlain.length).toBeGreaterThanOrEqual(1500);
    expect(dashboardCorpus?.text.trim()).toBe(createFlowPlain.trim());
    expect(dashboardCorpus?.source).toBe("premium_server_full_document_text");
    expect(String(draft.server_full_document_text ?? "").trim()).toContain("Starter preview");
  });
});
