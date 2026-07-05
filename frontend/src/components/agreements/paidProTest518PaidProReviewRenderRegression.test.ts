/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { buildCanonicalFinalPartyManifestFromIdentities } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  hasAcceptedPipelineReviewCorpusForRender,
  readAcceptedPipelineReviewCorpusPlain,
} from "./paidProAcceptedPipelineReviewCorpus";
import {
  hasCanonicalReviewCorpusForRender,
  PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  enablePaidProReviewInstrumentationForTests,
  resolvePaidProReviewBranchPath,
  resetPaidProReviewBranchInstrumentationForTests,
} from "./paidProReviewBranchInstrumentation";
import {
  clearPaidProPostAcceptanceValidatorCache,
  commitPaidProPipelineValidationAcceptance,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
} from "./paidProPipelineAcceptedCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { logPremiumAuthoritativeCommit } from "./premiumAuthoritativeCommitted";
import { logSimpleProFinalReviewMounted, resetSimpleProFinalReviewMountedLogDedupeForTests } from "./simpleProFinalReviewPhase";
import {
  resolvePaidProReviewRenderPlain,
  resolvePaidProReviewRenderSource,
} from "./paidProReviewRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  buildTest518ConciseServerBody,
  TEST518_BLUE_HARBOR,
  TEST518_IRON_GATE,
  TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST518_REDWOOD,
  TEST518_SUMMIT,
  test518Draft,
} from "./paidProTest518Fixtures";

beforeEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  getOrInitSessionAgreementGenerationId();
  markCurrentSessionProIntent();
  markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
});

afterEach(() => {
  sessionStorage.clear();
  clearCurrentSessionProEntitlementMarkers();
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  resetPaidProReviewBranchInstrumentationForTests();
  resetSimpleProFinalReviewMountedLogDedupeForTests();
});

describe("TEST518 — paid Pro review mounts pipeline-accepted concise corpus", () => {
  it("detects all four intake parties including Iron Gate Security LLC", () => {
    const intake = TEST518_PRODUCTION_QUAD_PARTY_INTAKE;
    const slotCount = resolveAuthoritativePartySlotCount({
      intakeText: intake,
      draftPartyNames: [TEST518_REDWOOD, TEST518_SUMMIT],
    });
    expect(slotCount).toBe(4);

    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftPartyNames: [TEST518_REDWOOD, TEST518_SUMMIT],
    }).count;
    expect(signerCount).toBe(4);

    const manifest = buildCanonicalFinalPartyManifestFromIdentities(
      [TEST518_REDWOOD, TEST518_SUMMIT, TEST518_BLUE_HARBOR, TEST518_IRON_GATE].map((name, index) => ({
        index,
        partyDisplayName: name,
        blockHeading: `Party ${index + 1}`,
        email: "",
        representativeName: null,
        title: null,
        isIndividual: false,
      })),
    );
    expect(manifest.parties).toHaveLength(4);
    expect(manifest.parties.map((p) => p.partyName)).toEqual([
      TEST518_REDWOOD,
      TEST518_SUMMIT,
      TEST518_BLUE_HARBOR,
      TEST518_IRON_GATE,
    ]);
  });

  it("after premium-authoritative-commit, pipeline corpus mounts review without frozen SoT", () => {
    const draft = test518Draft();
    const intake = TEST518_PRODUCTION_QUAD_PARTY_INTAKE;
    const serverBody = buildTest518ConciseServerBody();
    expect(serverBody.length).toBeGreaterThanOrEqual(1500);
    expect(serverBody.length).toBeLessThan(10_000);

    commitPaidProPipelineValidationAcceptance({ text: serverBody, source: "server_full_draft" });

    logPremiumAuthoritativeCommit({
      bodyLen: serverBody.length,
      source: "server_full_draft",
      generationOutcome: "ok",
    });

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasAcceptedPipelineReviewCorpusForRender()).toBe(true);
    expect(readAcceptedPipelineReviewCorpusPlain()).toBe(serverBody);
    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThanOrEqual(
      PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN,
    );

    const renderMeta = resolvePaidProReviewRenderSource({ draft, intakeText: intake });
    expect(renderMeta.source).not.toBe("none");
    expect(renderMeta.hash.length).toBeGreaterThan(0);

    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(reviewPlain.length).toBeGreaterThan(0);
    expect(reviewPlain).toContain("Redwood Biologics");
    expect(reviewPlain).toContain("Iron Gate Security");

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: serverBody,
      finalReviewAuthorityOnly: true,
      pipelineWinningPlain: serverBody,
    });
    expect(finalReview.plainText.length).toBeGreaterThan(0);
    expect(finalReview.source).not.toBe("rendered_preview");

    logSimpleProFinalReviewMounted({
      bodyLen: serverBody.length,
      phase: "draft_ready_for_review",
      guidedApplied: true,
      recipientUxActive: false,
    });

    enablePaidProReviewInstrumentationForTests();
    const branch = resolvePaidProReviewBranchPath({
      premiumPaidDocumentSurface: true,
      showPaidProReviewDocumentCard: true,
      proUpgradeUseStarterView: false,
      paidProForcedFirstReviewActive: true,
      guidedPreReviewSignerSetupActive: false,
      paidProAwaitingRuntimeAuthority: false,
      simpleProFinalReviewShellActive: true,
      failedPremiumCorpusActive: false,
      premiumReturnWaitActive: false,
    });
    expect(branch.path).toBe("forced_embedded");

    const documentMounted =
      branch.path === "forced_embedded" &&
      hasCanonicalReviewCorpusForRender() &&
      resolveCanonicalReviewCorpusLenForRender() >= PAID_PRO_DOCUMENT_BODY_SOT_MIN_LEN;
    expect(documentMounted).toBe(true);
  });
});
