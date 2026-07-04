/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldShowCreateFlowStarterProRefineUpsell,
  shouldSuppressPaidAcceptedDegradedRecoveryUi,
  shouldSuppressPaidAcceptedFreeStarterSurfaces,
} from "./authoritativeCreateFlowReviewShell";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { createAuthoritativeSigningSnapshot, clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import {
  commitAcceptedPaidProCorpusHandoffSync,
  planCanonicalPaidProStaleUiReset,
  planEnterCanonicalPaidProReviewFlow,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import {
  alignIntakeSignerMetadataToLegalEntities,
  extractCanonicalIntakeSignerMetadata,
  parseAuthorizedSignersBulletLine,
  resolveAuthorityPartyLegalNameField,
} from "./intakeSignerMetadataAuthority";
import { buildLivePaidProSignerMetadataAuthority, buildCanonicalFinalPartyManifestFromAuthority } from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { hashPaidProCorpus, establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
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
  TEST505_ACCEPTED_PAID_BODY,
  TEST505_AUTHORIZED_SIGNER_BULLET_1,
  TEST505_AUTHORIZED_SIGNER_BULLET_2,
  TEST505_HARBOR_PEAK,
  TEST505_INTAKE,
  TEST505_PREPARED_FREEZE_CANDIDATE_HASH,
  TEST505_RECIPIENT_CANDIDATES,
  TEST505_RED_MESA,
  TEST505_SIGNER_NAMES,
  TEST505_SIGNER_TITLES,
  test505Draft,
} from "./paidProTest505Fixtures";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

function seedReturningPaidAcceptance(): void {
  markPaidProPipelineValidationPassed({
    text: TEST505_ACCEPTED_PAID_BODY,
    source: "server_full_draft",
  });
  commitAcceptedPaidProCorpusHandoffSync({
    corpusPlain: TEST505_ACCEPTED_PAID_BODY,
    pipelineSource: "server_full_draft",
  });
  establishPaidProSourceOfTruth({
    text: TEST505_ACCEPTED_PAID_BODY,
    source: "server_full_draft",
    intakeText: TEST505_INTAKE,
  });
}

describe("TEST505 — returning paid stale UI suppression + metadata-only signer finalize", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearAuthoritativeSigningSnapshot();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(true);
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearAuthoritativeSigningSnapshot();
    clearCurrentSessionProEntitlementMarkers();
    invalidateWorkspaceProEntitlementCache();
    vi.unstubAllGlobals();
  });

  it("parses authorized-signers bullets into signer metadata and legal entities", () => {
    const row1 = parseAuthorizedSignersBulletLine(TEST505_AUTHORIZED_SIGNER_BULLET_1);
    expect(row1).toEqual({
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      legalEntity: TEST505_RED_MESA,
    });
    const row2 = parseAuthorizedSignersBulletLine(TEST505_AUTHORIZED_SIGNER_BULLET_2);
    expect(row2?.signerName).toBe("Michael Torres");
    expect(row2?.signerTitle).toBe("President");
    expect(row2?.legalEntity).toBe(TEST505_HARBOR_PEAK);

    const rows = extractCanonicalIntakeSignerMetadata(TEST505_INTAKE).filter(
      (r) => r.source === "authorized_signers_bullet",
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.legalEntity)).toEqual([TEST505_RED_MESA, TEST505_HARBOR_PEAK]);
  });

  it("never stores raw authorized-signers bullet lines as legal entity fields", () => {
    const aligned = alignIntakeSignerMetadataToLegalEntities(TEST505_INTAKE, [
      TEST505_RED_MESA,
      TEST505_HARBOR_PEAK,
    ]);
    expect(aligned.map((s) => s.partyLegalName)).toEqual([TEST505_RED_MESA, TEST505_HARBOR_PEAK]);
    expect(aligned.map((s) => s.signerName)).toEqual([...TEST505_SIGNER_NAMES]);
    expect(aligned.map((s) => s.signerTitle)).toEqual([...TEST505_SIGNER_TITLES]);

    expect(resolveAuthorityPartyLegalNameField(TEST505_AUTHORIZED_SIGNER_BULLET_1)).toBe(
      TEST505_RED_MESA,
    );
    expect(
      sanitizeSignerPartyLegalEntityDisplay(TEST505_AUTHORIZED_SIGNER_BULLET_1, { log: false }),
    ).toBe(TEST505_RED_MESA);
  });

  it("returning paid acceptance suppresses retry banner, conversion card, and free shell", () => {
    seedReturningPaidAcceptance();
    const draft = test505Draft("", TEST505_ACCEPTED_PAID_BODY);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      corpusPlain: TEST505_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST505_INTAKE,
      recipientCandidates: TEST505_RECIPIENT_CANDIDATES,
      alreadyOpened: false,
      respectAlreadyOpened: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(TEST505_PREPARED_FREEZE_CANDIDATE_HASH.length).toBeGreaterThan(0);

    const shellInput = { workspaceProEntitled: true, tier: "free" as const };
    expect(resolveAuthoritativeCreateFlowReviewShell(shellInput)).toBe("paid_pro");
    expect(
      shouldSuppressPaidAcceptedDegradedRecoveryUi({
        shellInput,
        guidedCompletionPhase: "applied",
        simpleProFinalReviewActive: true,
      }),
    ).toBe(true);
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput,
        hasPaidPremiumCompletionSession: () => false,
        authoritativePremiumUiCommitted: true,
        paidProAuthoritative: true,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: true,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: true,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);
    expect(
      resolveFreeStarterReviewShellActive({
        ...shellInput,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: true,
      }),
    ).toBe(false);
    expect(shouldSuppressPaidAcceptedFreeStarterSurfaces({ shellInput })).toBe(true);

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
  });

  it("signer finalize preserves frozen canonical corpus hash", () => {
    seedReturningPaidAcceptance();
    const frozenHash = hashPaidProCorpus(TEST505_ACCEPTED_PAID_BODY);
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: TEST505_RED_MESA,
        recipient2Name: TEST505_HARBOR_PEAK,
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        partySignerNames: [...TEST505_SIGNER_NAMES],
        partySignerTitles: [...TEST505_SIGNER_TITLES],
        partyAddresses: ["", ""],
        extraPartyLegalNames: [],
        extraPartyReviewEmails: [],
      },
      "live_ui",
      { intakeText: TEST505_INTAKE, draftPartyNames: [TEST505_RED_MESA, TEST505_HARBOR_PEAK] },
    );
    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST505_INTAKE,
      draftPartyNames: [TEST505_RED_MESA, TEST505_HARBOR_PEAK],
    });
    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST505_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hashPaidProCorpus(hydrated.corpus)).toBe(frozenHash);
    expect(hydrated.corpus).toBe(TEST505_ACCEPTED_PAID_BODY.trim());

    const snapshot = createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: {
        recipient1Name: TEST505_RED_MESA,
        recipient2Name: TEST505_HARBOR_PEAK,
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        partySignerNames: [...TEST505_SIGNER_NAMES],
        partySignerTitles: [...TEST505_SIGNER_TITLES],
        partyAddresses: ["", ""],
        partyLegalNames: [TEST505_RED_MESA, TEST505_HARBOR_PEAK],
        partyIds: [],
        extraPartyReviewEmails: [],
      },
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: TEST505_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    expect(snapshot.hash).toBe(frozenHash);
  });

  it("canonical entry clears stale recovery pipeline markers in intake wiring", () => {
    expect(planCanonicalPaidProStaleUiReset("server_full_draft")).toEqual({
      hardError: null,
      premiumTruthPipelineSource: "server_full_draft",
      lastPremiumPipelineRenderSource: "server_full_draft",
      proFullDraftQualityRetry: false,
      proFullDraftCustomGateMessage: null,
      premiumPostCheckoutPhase: null,
      premiumPipelineUserMessage: null,
    });
    expect(intakeSrc).toContain("planCanonicalPaidProStaleUiReset");
    expect(intakeSrc).toContain("shouldSuppressPaidAcceptedDegradedRecoveryUi");
    expect(intakeSrc).toContain("paidAcceptedDegradedRecoveryUiSuppressed");
    expect(intakeSrc).toContain("repairRecital: false");
  });

  it("first-time post-checkout canonical plan remains unchanged", () => {
    const draft = test505Draft("", TEST505_ACCEPTED_PAID_BODY);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "post_checkout_apply_success",
      corpusPlain: TEST505_ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST505_INTAKE,
      recipientCandidates: TEST505_RECIPIENT_CANDIDATES,
      alreadyOpened: false,
      respectAlreadyOpened: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.ui.guidedCompletionPhase).toBe("applied");
    expect(plan.ui.premiumPostCheckoutPhase).toBeNull();
    expect(plan.signerHandoff?.partyLegalNames).toEqual([TEST505_RED_MESA, TEST505_HARBOR_PEAK]);
    expect(plan.signerHandoff?.signerNames).toEqual([...TEST505_SIGNER_NAMES]);
    expect(plan.signerHandoff?.signerTitles).toEqual([...TEST505_SIGNER_TITLES]);
  });
});
