/**
 * Recovery when paid Pro SoT establishment fails on structural / section-structure freeze gates.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  buildPaidProFreezeCandidate,
  clearPartialPaidProAuthoritativeState,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { resolvePaidProNoticeAuthorityPartiesForFreeze } from "./paidProNoticeContactAuthority";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
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

/**
 * A professional-clause-coverage rejection (a thin/incomplete server draft that omits intake-requested
 * operative clauses such as confidentiality or limitation of liability) is a RECOVERABLE establishment
 * failure, not a terminal one. The deterministic N-party recovery corpus contains every professional
 * clause the coverage gate checks, so it can pass where the raw server body could not — this is the
 * intended `server_full_draft → professional validation → deterministic recovery → review render` path.
 * Without classifying it here the recovery pipeline never runs and the paid user is stranded on the
 * "needs another pass before review" surface (TEST536).
 */
export function isPaidProSoTProfessionalCoverageEstablishmentFailure(message: string): boolean {
  return message.includes("[professional-pro-clause-coverage-blocked]");
}

export function isPaidProSoTEstablishmentFailure(message: string): boolean {
  return (
    isPaidProSoTStructuralEstablishmentFailure(message) ||
    isPaidProSoTProfessionalCoverageEstablishmentFailure(message) ||
    message.includes("[paid-pro-sot-establishment-blocked]") ||
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
 * Canonical freeze-candidate gate — same prepare + assert path as SoT establishment.
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
  const previewSurface = opts?.source ?? "sot_freeze_compatibility_preview";
  if (/(?:compat|compatibility_preview)/i.test(previewSurface)) {
    const parties =
      opts?.parties ??
      resolvePaidProNoticeAuthorityPartiesForFreeze({
        draft: opts?.draft ?? null,
        intakeText: opts?.intakeText ?? null,
        acceptedCorpus: text,
      });
    const violations = validateNoticesClauseFamilyStructuralIntegrity(text, {
      parties,
      intakeText: opts?.intakeText ?? null,
      draftPartyNames: (opts?.draft?.parties ?? [])
        .map((p) => String(p?.name ?? "").trim())
        .filter(Boolean),
      acceptedCorpus: text,
    });
    const missingHeading = violations.find((v) => v.code === "missing_notices_heading");
    if (missingHeading) {
      return { ok: false, rejectReason: "missing_notices_heading", text: text.trim() };
    }
  }
  const result = buildPaidProFreezeCandidate({
    text,
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
    source: "server_full_draft",
    surface: opts?.source ?? "sot_freeze_compatibility_preview",
  });
  return {
    ok: result.ok,
    rejectReason: result.rejectReason,
    text: result.ok ? result.text : result.text,
  };
}

export { clearPartialPaidProAuthoritativeState };

export type PaidProSoTStructuralRecoveryResult =
  | { ok: true; record: PaidProSourceOfTruth; recoverySource: string; body: string }
  | { ok: false; reason: string };

/**
 * Deterministic N-party intake recovery when server corpus cannot pass SoT freeze.
 */
export function tryRecoverPaidProSourceOfTruthFromStructuralFailure(args: {
  draft: ParsedDraftShape | null;
  intakeText: string;
  source?: string;
  agreementGenerationId?: string | null;
  generationOutcome?: string | null;
}): PaidProSoTStructuralRecoveryResult {
  const draft =
    args.draft ??
    ({
      title: "Agreement",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    } as ParsedDraftShape);

  const preview = previewRecoverPaidProFreezeCandidate({
    draft,
    intakeText: args.intakeText,
    surface: "paid_pro_sot_structural_recovery",
  });
  if (!preview.ok) {
    return {
      ok: false,
      reason: `deterministic_fallback_failed:${preview.rejectReason ?? "freeze_preview_rejected"}`,
    };
  }

  markPaidProPipelineValidationPassed({
    text: preview.text,
    source: args.source ?? "deterministic_recovery_freeze_candidate",
  });
  try {
    const record = establishPaidProSourceOfTruth({
      text: preview.text,
      source: args.source ?? "deterministic_recovery_freeze_candidate",
      draft,
      intakeText: args.intakeText,
      agreementGenerationId: args.agreementGenerationId,
      generationOutcome: args.generationOutcome ?? "ok",
    });
    return {
      ok: true,
      record,
      recoverySource: "deterministic_n_party_intake_recovery",
      body: record.text,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
