/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { resolveAuthoritativeIntakePartyNames } from "./partySlotIdentityNormalize";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  hasAcceptedPipelineReviewCorpusForRender,
  readAcceptedPipelineReviewCorpusPlain,
} from "./paidProAcceptedPipelineReviewCorpus";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  assessProfessionalProClauseCoverage,
  intakeRequestsProfessionalProClauseCoverage,
  shouldRejectProfessionalProCorpus,
} from "./paidProProfessionalClauseCoverage";
import {
  clearPaidProPostAcceptanceValidatorCache,
  commitPaidProPipelineValidationAcceptance,
  hasPaidProPipelineValidationForCorpus,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  resolvePaidProReviewRenderPlain,
  resolvePaidProReviewRenderSource,
} from "./paidProReviewRenderCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isDisallowedPartyPhrase } from "./paidProPartyNamePreserve";
import {
  resolvePaidProInlineSignerSetupMounted,
  shouldArmPaidProFirstReviewSignerSetupLatch,
} from "./signerSetupPartyIdentity";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST519_REDWOOD,
  TEST519_SUMMIT,
  test519Draft,
} from "./paidProTest519Fixtures";
import { buildTest518ConciseServerBody } from "./paidProTest518Fixtures";

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
});

describe("TEST519 — professional validation gates paid Pro review render", () => {
  it("detects four intake parties and rejects Total Contract Value as a party label", () => {
    const intake = TEST519_PRODUCTION_QUAD_PARTY_INTAKE;
    const parties = resolveAuthoritativeIntakePartyNames(intake);
    expect(parties).toHaveLength(4);
    expect(parties.some((p) => /redwood biologics/i.test(p))).toBe(true);
    expect(parties.some((p) => /summit ai/i.test(p))).toBe(true);
    expect(parties.some((p) => /blue harbor systems/i.test(p))).toBe(true);
    expect(parties.some((p) => /iron gate security/i.test(p))).toBe(true);
    expect(parties.some((p) => /total contract value/i.test(p))).toBe(false);
    expect(isDisallowedPartyPhrase("Total Contract Value:")).toBe(true);

    expect(
      resolveAuthoritativeSignerCount({
        intakeText: intake,
        draftPartyNames: [TEST519_REDWOOD, TEST519_SUMMIT],
      }).count,
    ).toBe(4);
  });

  it("rejects malformed ~2.5k server draft for professional intake — no render without validation", () => {
    const intake = TEST519_PRODUCTION_QUAD_PARTY_INTAKE;
    const draft = test519Draft();
    const malformed = buildTest519MalformedProfessionalServerBody();
    expect(malformed.length).toBeGreaterThanOrEqual(2400);
    expect(intakeRequestsProfessionalProClauseCoverage(intake)).toBe(true);

    const professional = assessProfessionalProClauseCoverage({ text: malformed, intake });
    expect(shouldRejectProfessionalProCorpus(professional)).toBe(true);

    const validation = validatePaidProOutput({
      text: malformed,
      rawIntake: intake,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons.some((r) => r.includes("professional_"))).toBe(true);
    expect(hasPaidProPipelineValidationForCorpus({ text: malformed, source: "server_full_draft" })).toBe(
      false,
    );

    const freeze = buildPaidProFreezeCandidate({
      text: malformed,
      draft,
      intakeText: intake,
      source: "server_full_draft",
    });
    expect(freeze.ok).toBe(true);
    expect(hasPaidProPipelineValidationForCorpus({ text: freeze.text, source: "server_full_draft" })).toBe(
      false,
    );

    markPaidProPipelineAcceptedCorpusHash(malformed);
    expect(hasPaidProPipelineValidationForCorpus({ text: malformed, source: "server_full_draft" })).toBe(
      false,
    );
    expect(readAcceptedPipelineReviewCorpusPlain()).toBe("");
    expect(hasAcceptedPipelineReviewCorpusForRender()).toBe(false);
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);

    const renderMeta = resolvePaidProReviewRenderSource({ draft, intakeText: intake });
    expect(renderMeta.source).toBe("none");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(reviewPlain).not.toContain("Total Contract Value");

    expect(() =>
      establishPaidProSourceOfTruth({
        text: malformed,
        source: "server_full_draft",
        draft,
        intakeText: intake,
      }),
    ).toThrow(/professional-pro-clause-coverage-blocked|paid-pro-sot-establishment-blocked/);
  });

  it("arms signer setup when professionally validated review corpus exists with incomplete metadata", () => {
    const intake = TEST519_PRODUCTION_QUAD_PARTY_INTAKE;
    const draft = test519Draft();
    const accepted = buildTest518ConciseServerBody();
    commitPaidProPipelineValidationAcceptance({ text: accepted, source: "server_full_draft" });

    expect(hasAcceptedPipelineReviewCorpusForRender()).toBe(true);
    expect(
      shouldArmPaidProFirstReviewSignerSetupLatch({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        firstReviewSurfaceActive: true,
        hasCanonicalReviewCorpus: true,
        paidProSignatureDetailsReady: false,
        signerMetadataFinalized: false,
        signaturePreparationRequested: false,
        alreadyLatched: false,
      }),
    ).toBe(true);
    expect(
      resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
      }),
    ).toBe(true);

    const renderMeta = resolvePaidProReviewRenderSource({ draft, intakeText: intake });
    expect(renderMeta.source).not.toBe("none");
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(reviewPlain).toContain("Redwood Biologics");
    expect(reviewPlain).toContain("Iron Gate Security");
    expect(reviewPlain).not.toContain("Total Contract Value");
  });
});
