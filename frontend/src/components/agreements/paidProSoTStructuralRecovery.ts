/**
 * Recovery when paid Pro SoT establishment fails on structural / section-structure freeze gates.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { evaluatePaidProSectionStructureFreezeGate } from "./paidProSectionStructureCompletenessAuthority";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export function isPaidProSoTStructuralEstablishmentFailure(message: string): boolean {
  return (
    message.includes("[paid-pro-sot-freeze-blocked]") ||
    message.includes("section_structure_synthetic_malformed_headings") ||
    message.includes("section_structure_completeness_unresolved") ||
    message.includes("[paid-pro-section-structure-completeness-blocked]")
  );
}

export function isPaidProSoTEstablishmentFailure(message: string): boolean {
  return (
    isPaidProSoTStructuralEstablishmentFailure(message) ||
    message.includes("[paid-pro-clause-family-structural-blocked]") ||
    message.includes("[paid-pro-document-boundary-blocked]") ||
    message.includes("missing_notices_heading")
  );
}

/** Structural freeze failures must not hydrate a partial SoT — use deterministic fallback or retry UI. */
export function shouldHydratePaidProSoTAfterEstablishmentFailure(message: string): boolean {
  return !isPaidProSoTEstablishmentFailure(message);
}

/** True when paid Pro review may treat corpus as authoritative for fallback suppression. */
export function hasFrozenPaidProAuthoritativeSnapshot(): boolean {
  return hasPaidProSourceOfTruth();
}

/**
 * Mirror SoT pre-freeze boundary + clause-family + section-structure gates for acceptance.
 * Uses the same repair passes as freeze without throwing.
 */
export function evaluatePaidProCorpusSoTFreezeCompatibility(
  text: string,
  opts?: {
    draft?: ParsedDraftShape | null;
    intakeText?: string | null;
    parties?: readonly PaidProSignerMetadataParty[];
    draftPartyCount?: number;
    handoffPartySlots?: number;
    source?: string;
  },
): { ok: boolean; rejectReason: string | null; text: string } {
  const source = opts?.source ?? "sot_freeze_compatibility_preview";
  const boundary = applyPaidProDocumentBoundaryAuthority(text, {
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
    parties: opts?.parties,
    draftPartyCount: opts?.draftPartyCount,
    handoffPartySlots: opts?.handoffPartySlots,
    surface: source,
    blockOnViolation: false,
    blockOnUnresolved: false,
  });
  if (!boundary.ok || boundary.violations.length > 0) {
    return {
      ok: false,
      rejectReason: boundary.violations[0] ?? "document_boundary_violation",
      text: boundary.text,
    };
  }
  const clauseFamily = validateClauseFamilyStructuralIntegrity(boundary.text, {
    parties: opts?.parties,
    surface: source,
    phase: "post_acceptance",
    draftPartyCount: opts?.draftPartyCount,
    handoffPartySlots: opts?.handoffPartySlots,
  });
  if (!clauseFamily.ok) {
    const code = clauseFamily.violations[0]?.code ?? "clause_family_structural";
    return { ok: false, rejectReason: code, text: boundary.text };
  }
  const structure = evaluatePaidProSectionStructureFreezeGate(boundary.text, source);
  if (!structure.ok) {
    return {
      ok: false,
      rejectReason: structure.rejectReason ?? "section_structure_incomplete",
      text: structure.text,
    };
  }
  return { ok: true, rejectReason: null, text: structure.text };
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
