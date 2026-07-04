/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldShowCreateFlowStarterProRefineUpsell,
  shouldSuppressPaidAcceptedDegradedRecoveryUi,
  shouldSuppressPaidAcceptedFreeStarterSurfaces,
} from "./authoritativeCreateFlowReviewShell";
import {
  commitAcceptedPaidProCorpusHandoffSync,
  planCanonicalPaidProStaleUiReset,
  planEnterCanonicalPaidProReviewFlow,
  planFinalizeCanonicalPaidProPipelineSuccess,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import {
  alignIntakeSignerMetadataToLegalEntities,
  extractCanonicalIntakeSignerMetadata,
  parseAuthorizedSignersBulletLine,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { scrubAuthorizedSignerBulletPartyLabelsFromCorpus } from "./paidProAuthorizedSignerBulletCorpusScrub";
import {
  assessProfessionalProClauseCoverage,
  intakeRequestsProfessionalProClauseCoverage,
  PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN,
} from "./paidProProfessionalClauseCoverage";
import { buildPaidProModelRouteLogPayload } from "./paidProModelRouteLog";
import {
  preparePaidProServerDocumentForAcceptance,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { sanitizeSignerPartyLegalEntityDisplay } from "./signerPartyLegalEntityDisplaySanitizer";
import {
  TEST506_ACCEPTED_PAID_BODY,
  TEST506_AUTHORIZED_SIGNER_BULLET_1,
  TEST506_AUTHORIZED_SIGNER_BULLET_2,
  TEST506_HARBOR_PEAK,
  TEST506_INTAKE,
  TEST506_POLLUTED_THIN_BODY,
  TEST506_PREPARED_FREEZE_CANDIDATE_HASH,
  TEST506_RECIPIENT_CANDIDATES,
  TEST506_RED_MESA,
  TEST506_SIGNER_NAMES,
  TEST506_SIGNER_TITLES,
  TEST506_THIN_STARTER_STYLE_BODY,
  test506Draft,
} from "./paidProTest506Fixtures";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

function seedReturningPaidAcceptance(body = TEST506_ACCEPTED_PAID_BODY): void {
  markPaidProPipelineValidationPassed({
    text: body,
    source: "server_full_draft",
  });
  commitAcceptedPaidProCorpusHandoffSync({
    corpusPlain: body,
    pipelineSource: "server_full_draft",
  });
  establishPaidProSourceOfTruth({
    text: body,
    source: "server_full_draft",
    intakeText: TEST506_INTAKE,
  });
}

describe("TEST506 — paid SoT UI suppression, signer parsing, professional corpus gate, model route", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProSourceOfTruth();
    clearFrozenPremiumSessionBodiesForTests();
    clearCurrentSessionProEntitlementMarkers();
    markCurrentSessionProEntitlementComplete();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A — accepted paid SoT suppresses Retry/connection/free/pro-conversion UI helpers", () => {
    seedReturningPaidAcceptance();
    const shellInput = { workspaceProEntitled: true, tier: "free" as const };
    expect(
      shouldSuppressPaidAcceptedDegradedRecoveryUi({
        shellInput,
        guidedCompletionPhase: "applied",
        simpleProFinalReviewActive: true,
      }),
    ).toBe(true);
    expect(shouldSuppressPaidAcceptedFreeStarterSurfaces({ shellInput })).toBe(true);
    expect(
      resolveFreeStarterReviewShellActive({
        ...shellInput,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: true,
      }),
    ).toBe(false);
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput,
        hasPaidPremiumCompletionSession: () => true,
        authoritativePremiumUiCommitted: true,
        paidProAuthoritative: true,
        suppressIntakePremiumUpsell: true,
        proAgreementEntitled: true,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: true,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);

    const staleReset = planCanonicalPaidProStaleUiReset("server_full_draft");
    expect(staleReset.proFullDraftQualityRetry).toBe(false);
    expect(staleReset.proFullDraftCustomGateMessage).toBeNull();
    expect(staleReset.premiumPostCheckoutPhase).toBeNull();
    expect(intakeSrc).toContain("paidAcceptedDegradedRecoveryUiSuppressed");
    expect(intakeSrc).toContain("setProFullDraftQualityRetry(staleUiReset.proFullDraftQualityRetry)");
  });

  it("B — authorized signer bullets do not pollute legal party names in corpus scrub", () => {
    const scrubbed = scrubAuthorizedSignerBulletPartyLabelsFromCorpus(
      TEST506_POLLUTED_THIN_BODY,
      TEST506_INTAKE,
      [TEST506_RED_MESA, TEST506_HARBOR_PEAK],
    );
    expect(scrubbed).toContain(TEST506_RED_MESA);
    expect(scrubbed).toContain(TEST506_HARBOR_PEAK);
    expect(scrubbed).not.toContain(TEST506_AUTHORIZED_SIGNER_BULLET_1);
    expect(scrubbed).not.toContain(TEST506_AUTHORIZED_SIGNER_BULLET_2);

    const prepared = preparePaidProServerDocumentForAcceptance(
      TEST506_POLLUTED_THIN_BODY,
      test506Draft(TEST506_POLLUTED_THIN_BODY, TEST506_POLLUTED_THIN_BODY),
      TEST506_INTAKE,
    );
    expect(prepared.text).toContain(TEST506_RED_MESA);
    expect(prepared.text).toContain(TEST506_HARBOR_PEAK);
    expect(prepared.text).not.toMatch(/\* Sarah Mitchell, CEO, Red Mesa Logistics LLC/);
  });

  it("C — signer metadata hydrates Sarah/Michael names and titles separately", () => {
    const bullets = parseAuthorizedSignersBulletLine(TEST506_AUTHORIZED_SIGNER_BULLET_1);
    expect(bullets?.signerName).toBe(TEST506_SIGNER_NAMES[0]);
    expect(bullets?.signerTitle).toBe(TEST506_SIGNER_TITLES[0]);
    expect(bullets?.legalEntity).toBe(TEST506_RED_MESA);

    const rows = extractCanonicalIntakeSignerMetadata(TEST506_INTAKE).filter(
      (r) => r.source === "authorized_signers_bullet",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.signerName)).toEqual([...TEST506_SIGNER_NAMES]);
    expect(rows.map((r) => r.signerTitle)).toEqual([...TEST506_SIGNER_TITLES]);

    const legalField = resolveAuthorityPartyLegalNameField(TEST506_AUTHORIZED_SIGNER_BULLET_2);
    expect(legalField).toBe(TEST506_HARBOR_PEAK);
    expect(sanitizeSignerPartyLegalEntityDisplay(TEST506_AUTHORIZED_SIGNER_BULLET_2, { log: false })).toBe(
      TEST506_HARBOR_PEAK,
    );
  });

  it("D — metadata-only signer finalize preserves clean legal party names", () => {
    seedReturningPaidAcceptance();
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: TEST506_RED_MESA,
        recipient2Name: TEST506_HARBOR_PEAK,
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        partySignerNames: [...TEST506_SIGNER_NAMES],
        partySignerTitles: [...TEST506_SIGNER_TITLES],
        partyAddresses: ["", ""],
        extraPartyLegalNames: [],
        extraPartyReviewEmails: [],
      },
      "live_ui",
      {
        intakeText: TEST506_INTAKE,
        draftPartyNames: [TEST506_RED_MESA, TEST506_HARBOR_PEAK],
      },
    );
    expect(authority.parties[0]?.partyLegalName).toBe(TEST506_RED_MESA);
    expect(authority.parties[1]?.partyLegalName).toBe(TEST506_HARBOR_PEAK);
    expect(authority.parties[0]?.signerName).toBe(TEST506_SIGNER_NAMES[0]);
    expect(authority.parties[1]?.signerName).toBe(TEST506_SIGNER_NAMES[1]);
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST506_INTAKE, [
      TEST506_RED_MESA,
      TEST506_HARBOR_PEAK,
    ]);
    expect(aligned.map((s) => s.partyLegalName)).toEqual([TEST506_RED_MESA, TEST506_HARBOR_PEAK]);
  });

  it("E — thin Pro corpus missing requested clauses is rejected, not accepted as Pro", () => {
    expect(intakeRequestsProfessionalProClauseCoverage(TEST506_INTAKE)).toBe(true);
    const thinAssessment = assessProfessionalProClauseCoverage({
      text: TEST506_THIN_STARTER_STYLE_BODY,
      intake: TEST506_INTAKE,
    });
    expect(thinAssessment.applies).toBe(true);
    expect(thinAssessment.ok).toBe(false);
    expect(thinAssessment.docLen).toBeLessThan(PROFESSIONAL_PRO_INTAKE_MIN_CORPUS_LEN);

    const substance = validateProMinimumSubstance({
      text: TEST506_THIN_STARTER_STYLE_BODY,
      rawIntake: TEST506_INTAKE,
      source: "server_full_draft",
    });
    expect(substance.ok).toBe(false);

    const validation = validatePaidProOutput({
      text: TEST506_THIN_STARTER_STYLE_BODY,
      rawIntake: TEST506_INTAKE,
      draft: test506Draft("", TEST506_THIN_STARTER_STYLE_BODY),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);

    expect(() =>
      establishPaidProSourceOfTruth({
        text: TEST506_THIN_STARTER_STYLE_BODY,
        source: "server_full_draft",
        intakeText: TEST506_INTAKE,
      }),
    ).toThrow(/professional-pro-clause-coverage-blocked|paid-pro-sot-establishment-blocked/);

    const substantive = assessProfessionalProClauseCoverage({
      text: TEST506_ACCEPTED_PAID_BODY,
      intake: TEST506_INTAKE,
    });
    expect(substantive.ok).toBe(true);
  });

  it("F — paid Pro model route is logged safely", () => {
    const pipelineSrc = readFileSync(
      join(__dirname, "premiumCompletionPipeline.ts"),
      "utf8",
    );
    expect(
      buildPaidProModelRouteLogPayload({
        route: "premium_full_draft",
        model: "gpt-4.1",
        tier: "paid_pro",
        source: "premium_completion_pipeline",
        generationOutcome: "ok",
        serverFullLen: 4200,
        documentLen: 4200,
        callReason: "checkout_completion",
      }),
    ).toEqual(
      expect.objectContaining({
        route: "premium_full_draft",
        model: "gpt-4.1",
        tier: "paid_pro",
      }),
    );
    expect(pipelineSrc).toContain("logPaidProModelRoute");
    const routeLogSrc = readFileSync(join(__dirname, "paidProModelRouteLog.ts"), "utf8");
    expect(routeLogSrc).toContain("[paid-pro-model-route]");
  });

  it("G — first-time post-checkout and returning paid create share canonical review entry", () => {
    const draft = test506Draft("", TEST506_ACCEPTED_PAID_BODY);
    for (const source of ["post_checkout_apply_success", "returning_paid_create"] as const) {
      const finalized = planFinalizeCanonicalPaidProPipelineSuccess({
        source,
        corpusPlain: TEST506_ACCEPTED_PAID_BODY,
        pipelineSource: "server_full_draft",
        draft,
        intakeText: TEST506_INTAKE,
        recipientCandidates: TEST506_RECIPIENT_CANDIDATES,
        winningBody: TEST506_ACCEPTED_PAID_BODY,
      });
      expect(finalized.canEnterCanonicalReview).toBe(true);
      expect(finalized.canonicalPlan.shouldApply).toBe(true);
      expect(finalized.canonicalPlan.ui.guidedFinalReviewExplicitlyOpened).toBe(true);
    }

    const returningPlan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      corpusPlain: TEST506_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST506_INTAKE,
      recipientCandidates: TEST506_RECIPIENT_CANDIDATES,
    });
    expect(returningPlan.shouldApply).toBe(true);
    expect(returningPlan.signerHandoff?.partyLegalNames).toEqual([
      TEST506_RED_MESA,
      TEST506_HARBOR_PEAK,
    ]);
    expect(
      shouldMountSimpleProFinalReviewForCanonicalEntry({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "applied",
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);

    seedReturningPaidAcceptance();
    const shellInput = { workspaceProEntitled: true, tier: "free" as const };
    expect(resolveAuthoritativeCreateFlowReviewShell(shellInput)).toBe("paid_pro");
    expect(TEST506_PREPARED_FREEZE_CANDIDATE_HASH.length).toBeGreaterThan(0);
  });
});
