/**
 * Compare completed / view-signed corpus text against frozen SoT — clause body only.
 * Normalizes away execution overlay (signatures, dates, proof metadata) after IN WITNESS WHEREOF.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { isPostFreezeAuthorizedSignerOverlayDrift } from "./paidProPostFreezeCorpusInvariant";
import { normalizeCorpusForCopyCompare } from "./qa/paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";

export type CompletedVersusFrozenBodyClassification =
  | "identical_body"
  | "execution_overlay_only"
  | "substantive_body_change";

/** Agreement clause body through (but not including) the authoritative witness block. */
export function extractClauseBodyBeforeWitness(text: string): string {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const idx = resolveAuthoritativeWitnessIndex(normalized);
  return (idx >= 0 ? normalized.slice(0, idx) : normalized).trimEnd();
}

/** Strip proof / verification footer noise that may trail the witness block in completed artifacts. */
export function stripCompletedProofMetadataTail(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(
      /\n+(?:Document verified|Verification ID|Proof hash|Certificate ID|Public verification)[^\n]*(?:\n[^\n]+){0,8}$/gi,
      "",
    )
    .trimEnd();
}

export function normalizeFrozenAgreementBodyForCompare(text: string): string {
  return normalizeCorpusForCopyCompare(extractClauseBodyBeforeWitness(text));
}

export function completedCorpusBodyMatchesFrozen(completed: string, frozen: string): boolean {
  return (
    normalizeFrozenAgreementBodyForCompare(completed) === normalizeFrozenAgreementBodyForCompare(frozen)
  );
}

export function classifyCompletedVersusFrozenBodyDiff(
  completed: string,
  frozen: string,
): CompletedVersusFrozenBodyClassification {
  const frozenNorm = normalizeFrozenAgreementBodyForCompare(frozen);
  const completedNorm = normalizeFrozenAgreementBodyForCompare(
    stripCompletedProofMetadataTail(completed),
  );
  if (frozenNorm === completedNorm) {
    const frozenTrim = (frozen || "").replace(/\r\n/g, "\n").trimEnd();
    const completedTrim = stripCompletedProofMetadataTail(completed).replace(/\r\n/g, "\n").trimEnd();
    if (frozenTrim === completedTrim) return "identical_body";
    if (isPostFreezeAuthorizedSignerOverlayDrift(frozen, completedTrim)) {
      return "execution_overlay_only";
    }
    return "execution_overlay_only";
  }
  return "substantive_body_change";
}
