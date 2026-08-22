import { getOrInitSessionAgreementGenerationId, shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import type { PremiumCompletionInput, PremiumCompletionResult } from "./premiumCompletionPipeline";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { readPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { gapTraceNeedlesHit } from "./gapTraceNeedles";
import { hasUsablePremiumBodyText, isPremiumRecoverablePipelineResult } from "./premiumPostCheckoutApplyEligible";
import { resolveAuthoritativePremiumCommittedFromResult } from "./premiumAuthoritativeCommitted";
import { markPaidReviewSessionPremiumGeneration } from "./paidProReviewSessionCorpusInvariantState";

/** Snapshot as the same shape as a fresh pipeline result (for hydration / ensure). */
export function premiumSnapshotToResult(snap: NonNullable<ReturnType<typeof readPremiumCompletionSnapshot>>): PremiumCompletionResult {
  const hasServerFull = Boolean((snap.premiumDraft?.premium_full_document_text || "").trim());
  return {
    premiumDraft: snap.premiumDraft,
    premiumParties: snap.premiumParties,
    recipientCandidates: snap.recipientCandidates,
    winningPremiumBodyText: (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim(),
    premiumRenderSource: (snap.premiumPipelineRenderSource as PremiumCompletionResult["premiumRenderSource"]) ||
      (hasServerFull ? "snapshot_server_full_draft" : "snapshot_fallback"),
    premiumReview: snap.premiumReview ?? null,
    premiumFinalizeAudit: snap.premiumFinalizeAudit ?? null,
    premiumReviewRoute: snap.premiumReviewRoute ?? null,
    agreementGenerationId: snap.agreementGenerationId,
    premiumRequestIntakeFingerprint: snap.intakeTextFingerprint,
    staleIntakeOrGeneration: false,
    founderDetailsGateMessage: null,
    proIntentGateMessage: null,
    serverGenerationDegraded: snap.serverGenerationDegraded ?? null,
  };
}

/**
 * Prefer persisted premium snapshot; otherwise run local pipeline.
 * Future: swap body for POST /v1/premium/complete while keeping this call site.
 */
function snapshotMatchesCurrentRequest(
  snap: NonNullable<ReturnType<typeof readPremiumCompletionSnapshot>>,
  input: PremiumCompletionInput,
): boolean {
  const currentGen = getOrInitSessionAgreementGenerationId();
  if (snap.agreementGenerationId && snap.agreementGenerationId !== currentGen) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[ensure-premium] snapshot generation mismatch; ignoring snapshot", {
        snapshot_generation: snap.agreementGenerationId,
        session_generation: currentGen,
      });
    }
    return false;
  }
  const curFp = shortIntakeFingerprint(input.intakeText.trim());
  if (snap.intakeTextFingerprint && snap.intakeTextFingerprint !== curFp) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[ensure-premium] snapshot intake fingerprint mismatch; ignoring snapshot", {
        snapshot_fingerprint: snap.intakeTextFingerprint,
        current_fingerprint: curFp,
      });
    }
    return false;
  }
  if (input.premiumRequestIntakeFingerprint && input.premiumRequestIntakeFingerprint !== curFp) {
    return false;
  }
  return true;
}

function markPremiumGenerationWhenAuthoritative(
  result: PremiumCompletionResult,
  reviewSessionId: string,
  source: string,
  snapshot?: NonNullable<ReturnType<typeof readPremiumCompletionSnapshot>> | null,
): void {
  if (result.staleIntakeOrGeneration) return;
  if (isPremiumRecoverablePipelineResult(result)) return;
  if (!hasUsablePremiumBodyText(result.winningPremiumBodyText)) return;
  const { committed } = resolveAuthoritativePremiumCommittedFromResult(result, {
    snapshot: snapshot ?? null,
  });
  if (!committed) return;
  markPaidReviewSessionPremiumGeneration(reviewSessionId, source);
}

export async function ensurePremiumCompletion(input: PremiumCompletionInput): Promise<PremiumCompletionResult> {
  const reviewSessionId = input.agreementGenerationId ?? getOrInitSessionAgreementGenerationId();
  const snap = readPremiumCompletionSnapshot();
  if (snap && snapshotMatchesCurrentRequest(snap, input) && !input.postGenerateTenetRecall) {
    if (import.meta.env.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.info("[CLAW] premium hydration start", { source: "session_snapshot" });
    }
    const txt = (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim();
    const hit = gapTraceNeedlesHit(txt);
    console.info("[gap-trace] stage=ensure_premium_completion_snapshot_short_circuit", {
      snapshot_present: true,
      snapshot_len: txt.length,
      snapshot_contains_needles: hit.length > 0,
      needles_hit: hit,
      input_user_gap_answers_len: (input.userGapAnswers || "").trim().length,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[dev-premium-bind]", {
        raw_intake_hash: shortIntakeFingerprint(input.intakeText.trim()),
        active_generation_id: getOrInitSessionAgreementGenerationId(),
        premium_response_generation_id: snap.agreementGenerationId,
        render_source: (snap as { premiumPipelineRenderSource?: string }).premiumPipelineRenderSource,
      });
    }
    const result = premiumSnapshotToResult(snap);
    markPremiumGenerationWhenAuthoritative(result, reviewSessionId, "ensure_premium_completion_snapshot", snap);
    return result;
  }
  console.info("[gap-trace] stage=ensure_premium_completion_run_pipeline", {
    snapshot_present: false,
    input_user_gap_answers_len: (input.userGapAnswers || "").trim().length,
  });
  const result = await runPremiumCompletion(input);
  markPremiumGenerationWhenAuthoritative(result, reviewSessionId, "ensure_premium_completion");
  return result;
}
