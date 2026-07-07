/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  hasFrozenPaidProAuthoritativeSnapshot,
  isPaidProSoTEstablishmentFailure,
  isPaidProSoTProfessionalCoverageEstablishmentFailure,
  isPaidProSoTStructuralEstablishmentFailure,
  shouldHydratePaidProSoTAfterEstablishmentFailure,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import {
  assessProfessionalProClauseCoverage,
  shouldRejectProfessionalProCorpus,
} from "./paidProProfessionalClauseCoverage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_BLUE_HARBOR,
  TEST519_IRON_GATE,
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  TEST519_REDWOOD,
  TEST519_SUMMIT,
} from "./paidProTest519Fixtures";

/** Full 4-party draft manifest matching the quad-party intake (deterministic recovery needs all N). */
function test536QuadPartyDraft(): ParsedDraftShape {
  return {
    title: "Multi-Party Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST519_REDWOOD, role: "Client" } as never,
      { name: TEST519_SUMMIT, role: "Lead Provider" } as never,
      { name: TEST519_BLUE_HARBOR, role: "Implementation Partner" } as never,
      { name: TEST519_IRON_GATE, role: "Cybersecurity Auditor" } as never,
    ],
    purpose:
      "Clinical data, AI model development, cloud infrastructure hosting, and cybersecurity monitoring.",
    payment_terms: "$450,000 milestone installments",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 450000, cadence: "milestone", valid: true },
  };
}

describe("TEST536 — post-validation deterministic recovery after professional clause rejection", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
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
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("classifies a professional-clause-coverage rejection as a recoverable establishment failure", () => {
    const msg = "[professional-pro-clause-coverage-blocked] missing=confidentiality,limitation_of_liability;len=2889";
    // The precise diagnostic gap that stranded TEST536: the coverage failure was NOT recognized as an
    // establishment failure, so deterministic recovery never triggered and hydration of the deficient
    // body was (wrongly) allowed.
    expect(isPaidProSoTProfessionalCoverageEstablishmentFailure(msg)).toBe(true);
    expect(isPaidProSoTEstablishmentFailure(msg)).toBe(true);
    // A coverage failure is recoverable but not a *structural* one.
    expect(isPaidProSoTStructuralEstablishmentFailure(msg)).toBe(false);
    // The thin/deficient body must never be hydrated as SoT — recovery must produce a compliant corpus.
    expect(shouldHydratePaidProSoTAfterEstablishmentFailure(msg)).toBe(false);
  });

  it("does not misclassify unrelated messages as professional coverage failures", () => {
    expect(
      isPaidProSoTProfessionalCoverageEstablishmentFailure("[paid-pro-sot-freeze-blocked] reason=x"),
    ).toBe(false);
    expect(isPaidProSoTProfessionalCoverageEstablishmentFailure("some other error")).toBe(false);
  });

  it("professional-deficient ~2.9k server_full_draft is rejected, then deterministic recovery mounts a compliant review", () => {
    const intake = TEST519_PRODUCTION_QUAD_PARTY_INTAKE;
    const draft = test536QuadPartyDraft();
    const malformed = buildTest519MalformedProfessionalServerBody();

    // The server body is substantive (not a thin stub) but omits required professional clauses.
    expect(malformed.length).toBeGreaterThanOrEqual(2000);
    const coverage = assessProfessionalProClauseCoverage({ text: malformed, intake });
    expect(shouldRejectProfessionalProCorpus(coverage)).toBe(true);
    expect(coverage.missingClauses).toContain("confidentiality");

    // Mark pipeline acceptance so establishment reaches the professional-coverage gate (not the
    // sub-substantive "mislabeled" guard) — this reproduces the exact throw seen in production.
    markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft" });

    let establishMsg = "";
    expect(() => {
      try {
        establishPaidProSourceOfTruth({
          text: malformed,
          source: "server_full_draft",
          draft,
          intakeText: intake,
        });
      } catch (err) {
        establishMsg = err instanceof Error ? err.message : String(err);
        throw err;
      }
    }).toThrow(/professional-pro-clause-coverage-blocked/);

    // The raw deficient body must not have become the SoT.
    expect(hasPaidProSourceOfTruth()).toBe(false);

    // The regression fix: this failure is now recognized, so the caller enters deterministic recovery.
    expect(isPaidProSoTEstablishmentFailure(establishMsg)).toBe(true);

    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft,
      intakeText: intake,
      source: "server_full_draft",
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    // Recovery produced a compliant, professional-grade corpus that itself passes coverage —
    // validation was NOT weakened.
    expect(hasFrozenPaidProAuthoritativeSnapshot()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    const recoveredCoverage = assessProfessionalProClauseCoverage({ text: sot, intake });
    expect(shouldRejectProfessionalProCorpus(recoveredCoverage)).toBe(false);

    // All four canonical parties survive into the recovered corpus (TEST535 invariants preserved).
    // Tolerate canonical comma/whitespace normalization (e.g. "Redwood Biologics, Inc." vs
    // "Redwood Biologics Inc") — identity, not punctuation, is the invariant under test.
    const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
    const sotNorm = normalizeForMatch(sot);
    for (const party of [TEST519_REDWOOD, TEST519_SUMMIT, TEST519_BLUE_HARBOR, TEST519_IRON_GATE]) {
      expect(sotNorm).toContain(normalizeForMatch(party));
    }

    // Review surface renders an authoritative body rather than the blank "needs another pass" surface.
    const render = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(render.trim().length).toBeGreaterThan(3000);
  });
});
