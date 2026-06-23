/**
 * Recovery when paid Pro SoT establishment fails on structural / section-structure freeze gates.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  establishPaidProSourceOfTruth,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export function isPaidProSoTStructuralEstablishmentFailure(message: string): boolean {
  return (
    message.includes("[paid-pro-sot-freeze-blocked]") ||
    message.includes("section_structure_synthetic_malformed_headings") ||
    message.includes("[paid-pro-section-structure-completeness-blocked]")
  );
}

/** Structural freeze failures must not hydrate a partial SoT — use deterministic fallback or retry UI. */
export function shouldHydratePaidProSoTAfterEstablishmentFailure(message: string): boolean {
  return !isPaidProSoTStructuralEstablishmentFailure(message);
}

export type PaidProSoTStructuralRecoveryResult =
  | { ok: true; record: PaidProSourceOfTruth; recoverySource: string; body: string }
  | { ok: false; reason: string };

/**
 * Deterministic quad-party mutual-services fallback when server corpus cannot pass SoT freeze.
 */
export function tryRecoverPaidProSourceOfTruthFromStructuralFailure(args: {
  draft: ParsedDraftShape | null;
  intakeText: string;
  source?: string;
  agreementGenerationId?: string | null;
  generationOutcome?: string | null;
}): PaidProSoTStructuralRecoveryResult {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: args.intakeText,
    draft: args.draft ?? {
      title: "Agreement",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    },
  });
  if (!fallback.ok) {
    return {
      ok: false,
      reason: `deterministic_fallback_failed:${fallback.reasons.join(",") || "unknown"}`,
    };
  }
  const prep = preparePaidProServerDocumentForAcceptance(
    fallback.body,
    args.draft,
    args.intakeText,
    { surface: "paid_pro_sot_structural_recovery" },
  );
  try {
    const record = establishPaidProSourceOfTruth({
      text: prep.text,
      source: args.source ?? "server_full_draft_retry",
      draft: args.draft,
      intakeText: args.intakeText,
      agreementGenerationId: args.agreementGenerationId,
      generationOutcome: args.generationOutcome ?? "ok",
    });
    return {
      ok: true,
      record,
      recoverySource: "deterministic_quad_party_mutual_services_fallback",
      body: record.text,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
