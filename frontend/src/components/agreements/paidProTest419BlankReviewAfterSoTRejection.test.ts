/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { shouldImmediateAuthoritativePremiumCommit } from "./premiumImmediateAuthoritativeCommitGate";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  evaluatePaidProCorpusSoTFreezeCompatibility,
  hasFrozenPaidProAuthoritativeSnapshot,
  isPaidProSoTEstablishmentFailure,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import {
  buildTest419AcceptedServerDraftMissingNoticesHeading,
  TEST419_PRODUCTION_INTAKE,
  TEST419_PARTY_EMAILS,
  test419Draft,
} from "./paidProTest419Fixtures";
import { buildTest418HierarchyBreakCorpus } from "./paidProTest418Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

describe("TEST419 — blank Pro review after SoT pre-freeze structural rejection", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("accepted server draft missing notices heading fails SoT compatibility before acceptance", () => {
    const serverDraft = buildTest419AcceptedServerDraftMissingNoticesHeading();
    expect(serverDraft.length).toBeGreaterThan(5000);

    const compat = evaluatePaidProCorpusSoTFreezeCompatibility(serverDraft, {
      draft: test419Draft(),
      intakeText: TEST419_PRODUCTION_INTAKE,
      draftPartyCount: 4,
      source: "test419_compat",
    });
    expect(compat.ok).toBe(false);
    expect(compat.rejectReason).toBe("missing_notices_heading");

    const validation = validatePaidProOutput({
      text: serverDraft,
      rawIntake: TEST419_PRODUCTION_INTAKE,
      draft: test419Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(true);
    expect(validation.reasons).toContain("deterministic_recovery_freeze_candidate_ok");
  });

  it("production lifecycle: accepted server_full_draft + SoT reject → deterministic recovery mounts review", () => {
    const serverDraft = buildTest419AcceptedServerDraftMissingNoticesHeading();
    const prep = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      test419Draft(),
      TEST419_PRODUCTION_INTAKE,
      { surface: "test419_production_lifecycle" },
    );
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });

    expect(() =>
      establishPaidProSourceOfTruth({
        text: prep.text,
        source: "server_full_draft",
        draft: test419Draft(),
        intakeText: TEST419_PRODUCTION_INTAKE,
      }),
    ).toThrow(/paid-pro-clause-family-structural-blocked|missing_notices_heading|paid-pro-sot-freeze-blocked/);

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(false);

    const msg = "[paid-pro-clause-family-structural-blocked] codes=missing_notices_heading";
    expect(isPaidProSoTEstablishmentFailure(msg)).toBe(true);

    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test419Draft(),
      intakeText: TEST419_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(4000);
    for (const email of Object.values(TEST419_PARTY_EMAILS)) {
      expect(sot).toContain(email);
    }

    const render = resolvePaidProReviewRenderPlain({
      draft: test419Draft(),
      intakeText: TEST419_PRODUCTION_INTAKE,
    });
    expect(render.trim().length).toBeGreaterThan(4000);
  });

  it("does not treat pipeline acceptance as authoritative UI without frozen SoT", () => {
    const serverDraft = buildTest419AcceptedServerDraftMissingNoticesHeading();
    markPaidProPipelineValidationPassed({ text: serverDraft, source: "server_full_draft" });

    expect(
      shouldImmediateAuthoritativePremiumCommit({
        usePaidAuthoritativeBody: true,
        snapshotPlainTrimLen: serverDraft.length,
        premiumPipelineSource: "server_full_draft",
        validatePaidProOutputOk: true,
        premiumRenderResolveSource: "server_full_document_text",
        frozenSourceOfTruthEstablished: false,
      }),
    ).toBe(false);
    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(false);
  });

  it("unified freeze candidate repairs hierarchy-break glued corpora", () => {
    const broken = buildTest418HierarchyBreakCorpus();
    const compat = evaluatePaidProCorpusSoTFreezeCompatibility(broken, {
      draft: test419Draft(),
      intakeText: TEST419_PRODUCTION_INTAKE,
      source: "test419_hierarchy",
    });
    expect(compat.ok).toBe(true);
    expect(compat.text.length).toBeGreaterThanOrEqual(broken.length);
  });
});
