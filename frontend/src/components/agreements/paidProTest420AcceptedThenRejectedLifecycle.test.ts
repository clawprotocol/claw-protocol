/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { shouldImmediateAuthoritativePremiumCommit } from "./premiumImmediateAuthoritativeCommitGate";
import {
  buildPaidProFreezeCandidate,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { corpusHasPaidProSyntheticMalformedSectionHeadings } from "./paidProSyntheticMalformedSectionHeadings";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import {
  clearPaidProSourceOfTruth,
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
  buildTest420HierarchyBreakVariant,
  buildTest420MalformedServerDraft,
  TEST420_PARTY_EMAILS,
  TEST420_PRODUCTION_INTAKE,
  test420Draft,
} from "./paidProTest420Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

describe("TEST420 — unify Pro acceptance, SoT freeze, recovery, and render authority", () => {
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

  it(
    "recovery freeze candidate passes and matches acceptance path for production intake",
    () => {
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      surface: "test420_recovery",
    });
    expect(recovery.ok).toBe(true);
    expect(recovery.text.length).toBeGreaterThan(4000);
    expect(recovery.hash).toBeTruthy();

    const reGate = buildPaidProFreezeCandidate({
      text: recovery.text,
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft_retry",
      surface: "test420_recovery_regate",
    });
    expect(reGate.ok).toBe(true);
    const stable = buildPaidProFreezeCandidate({
      text: reGate.text,
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft_retry",
      surface: "test420_recovery_stable",
    });
    expect(stable.ok).toBe(true);
    expect(stable.hash).toBe(reGate.hash);
  },
  30_000,
  );

  it(
    "production malformed server draft: freeze fails, validation accepts via recovery, establish recovers SoT",
    () => {
    const serverDraft = buildTest420MalformedServerDraft();
    expect(serverDraft.length).toBeGreaterThan(5000);

    const compat = evaluatePaidProCorpusSoTFreezeCompatibility(serverDraft, {
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "test420_compat",
    });
    expect(compat.ok).toBe(false);
    expect(compat.rejectReason).toMatch(/section_structure|clause_family|missing_notices|document_boundary/);

    const validation = validatePaidProOutput({
      text: serverDraft,
      rawIntake: TEST420_PRODUCTION_INTAKE,
      draft: test420Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(true);
    expect(validation.reasons).toContain("deterministic_recovery_freeze_candidate_ok");

    markPaidProPipelineValidationPassed({ text: serverDraft, source: "server_full_draft" });

    expect(() =>
      establishPaidProSourceOfTruth({
        text: serverDraft,
        source: "server_full_draft",
        draft: test420Draft(),
        intakeText: TEST420_PRODUCTION_INTAKE,
      }),
    ).toThrow();

    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(hasCanonicalReviewCorpusForRender()).toBe(false);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBe(0);

    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(true);
    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(4000);
    for (const email of Object.values(TEST420_PARTY_EMAILS)) {
      expect(sot).toContain(email);
    }

    const render = resolvePaidProReviewRenderPlain({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
    });
    expect(render.trim().length).toBeGreaterThan(4000);
  },
  45_000,
  );

  it("hierarchy-break variant fails validation without substantive server draft recovery substitution", () => {
    const broken = buildTest420HierarchyBreakVariant();
    const validation = validatePaidProOutput({
      text: broken,
      rawIntake: TEST420_PRODUCTION_INTAKE,
      draft: test420Draft(),
      premiumPipelineSource: "server_full_draft_retry",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons.length).toBeGreaterThan(0);
  });

  it("body-bearing intermediate subsections are not synthetic empty shells", () => {
    const corpus = [
      "MUTUAL CONSULTING SERVICES AGREEMENT",
      "",
      "3. PAYMENT AND CONSIDERATION",
      "",
      "3.1 Initial Payment.",
      "Initial payment of $75,000 is due upon execution of this Agreement.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n\n");
    expect(corpusHasPaidProSyntheticMalformedSectionHeadings(corpus)).toBe(false);
  });

  it(
    "accepted recovery corpus: freeze candidate hash is stable across re-gate and establish",
    () => {
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;

    const candidate = buildPaidProFreezeCandidate({
      text: recovery.text,
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(candidate.ok).toBe(true);

    const reGate = buildPaidProFreezeCandidate({
      text: candidate.text,
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(reGate.ok).toBe(true);
    expect(reGate.hash).toBe(candidate.hash);

    markPaidProPipelineValidationPassed({ text: candidate.text, source: "server_full_draft" });
    clearPaidProSourceOfTruth();
    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test420Draft(),
      intakeText: TEST420_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(hasPaidProSourceOfTruth()).toBe(true);
  },
  30_000,
  );

  it("does not commit authoritative UI without frozen SoT", () => {
    const serverDraft = buildTest420MalformedServerDraft();
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
  });

  it("structural establish failure is classified for explicit retry routing", () => {
    const msg = "[paid-pro-section-structure-completeness-blocked] section_structure_completeness_unresolved";
    expect(isPaidProSoTEstablishmentFailure(msg)).toBe(true);
  });
});
