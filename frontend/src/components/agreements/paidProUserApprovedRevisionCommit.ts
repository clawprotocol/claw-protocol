import { prepareCommercialReviewSnapshotAuthority } from "../../agreement/canonicalReviewSnapshotApi";
import { persistConfirmedContentAnswers } from "./paidProConfirmedContentAnswers";
import { replacePaidProPipelineAcceptedCorpusAfterApprovedRevision } from "./paidProPipelineAcceptedCorpus";
import {
  paidProRevisionOperationAllowsDisplay,
  paidProRevisionOperationAllowsPersist,
  type PaidProRevisionOperation,
} from "./paidProRevisionOperation";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type PaidProUserApprovedRevisionCommitResult = {
  ok: boolean;
  corpus: string;
  displayed: boolean;
  code?: string;
};

export function resolveOwnerApprovedRevisionCallerOutcome(
  result: PaidProUserApprovedRevisionCommitResult,
): { applied: boolean; corpus: string; paint: boolean; code?: string } {
  if (!result.ok || !result.corpus.trim()) {
    return { applied: false, corpus: "", paint: false, code: result.code || "commit_failed" };
  }
  return {
    applied: true,
    corpus: result.corpus,
    paint: Boolean(result.displayed),
    code: result.code,
  };
}

/**
 * Production Apply/save callers must not paint when persist succeeded with displayed:false.
 * Identity (owner, org, agreement, revision, active request) is re-checked here.
 */
export function applyOwnerApprovedRevisionCallerDisplay(args: {
  result: PaidProUserApprovedRevisionCommitResult;
  captured: Pick<PaidProRevisionOperation, "userId" | "organizationId" | "agreementId" | "revisionId" | "requestId">;
  live: Partial<Pick<PaidProRevisionOperation, "userId" | "organizationId" | "agreementId" | "revisionId">>;
  activeRequestId?: string | null;
  paint: (corpus: string) => void;
}): boolean {
  const outcome = resolveOwnerApprovedRevisionCallerOutcome(args.result);
  if (!outcome.applied || !outcome.paint) return false;
  const liveUser = String(args.live.userId || "").trim();
  const liveOrg = String(args.live.organizationId || "").trim();
  const liveAgreement = String(args.live.agreementId || "").trim();
  const liveRevision = String(args.live.revisionId || "").trim();
  if (
    !args.captured.userId ||
    !args.captured.organizationId ||
    !args.captured.agreementId ||
    args.captured.userId !== liveUser ||
    args.captured.organizationId !== liveOrg ||
    args.captured.agreementId !== liveAgreement
  ) {
    return false;
  }
  if (liveRevision && args.captured.revisionId !== liveRevision) return false;
  if (args.activeRequestId && args.captured.requestId !== args.activeRequestId) return false;
  args.paint(outcome.corpus);
  return true;
}

export async function commitPaidProUserApprovedRevisionCorpus(args: {
  text: string;
  reason: string;
  operation: PaidProRevisionOperation;
  generationSessionId?: string | null;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  customerConfirmedAnswers?: string | null;
  applyDisplayMutations?: (stable: string) => void;
}): Promise<PaidProUserApprovedRevisionCommitResult> {
  const raw = (args.text || "").trim();
  if (!raw || !args.operation.agreementId) {
    return { ok: false, corpus: "", displayed: false, code: "invalid_revision_args" };
  }
  if (!paidProRevisionOperationAllowsPersist(args.operation)) {
    return { ok: false, corpus: "", displayed: false, code: "stale_revision_operation" };
  }
  const prepared = await prepareCommercialReviewSnapshotAuthority({
    agreementId: args.operation.agreementId,
    corpusPlain: raw,
    generationSessionId: args.generationSessionId,
    requestId: args.operation.requestId,
    userId: args.operation.userId,
    organizationId: args.operation.organizationId,
    revisionId: args.operation.revisionId,
    customerConfirmedAnswers: args.customerConfirmedAnswers,
  });
  if (!prepared.ok) {
    return { ok: false, corpus: "", displayed: false, code: prepared.code };
  }
  const stable = (prepared.snapshot.corpus_plain || "").trim();
  if (!stable) {
    return { ok: false, corpus: "", displayed: false, code: "empty_revision_corpus" };
  }
  if (!paidProRevisionOperationAllowsPersist(args.operation)) {
    return { ok: false, corpus: stable, displayed: false, code: "stale_revision_operation" };
  }
  if (!paidProRevisionOperationAllowsDisplay(args.operation)) {
    return { ok: true, corpus: stable, displayed: false, code: "display_identity_changed" };
  }
  replacePaidProPipelineAcceptedCorpusAfterApprovedRevision(stable, {
    agreementId: args.operation.agreementId,
    organizationId: args.operation.organizationId,
  });
  if ((args.customerConfirmedAnswers || "").trim()) {
    persistConfirmedContentAnswers({
      userId: args.operation.userId,
      organizationId: args.operation.organizationId,
      agreementId: args.operation.agreementId,
      revisionId: args.operation.revisionId,
      answers: args.customerConfirmedAnswers || "",
      snapshotId: prepared.snapshot.snapshot_id,
      digest: prepared.snapshot.corpus_sha256,
    });
  }
  try {
    establishPaidProSourceOfTruth({
      text: stable,
      draft: args.draft ?? null,
      intakeText: args.intakeText,
      allowShorterOverwrite: true,
    });
  } catch {
    /* Server snapshot is already locked; display mutations still apply that corpus. */
  }
  args.applyDisplayMutations?.(stable);
  return { ok: true, corpus: stable, displayed: true };
}
