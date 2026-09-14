import { prepareCommercialReviewSnapshotAuthority } from "../../agreement/canonicalReviewSnapshotApi";
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

export async function commitPaidProUserApprovedRevisionCorpus(args: {
  text: string;
  reason: string;
  operation: PaidProRevisionOperation;
  generationSessionId?: string | null;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
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
