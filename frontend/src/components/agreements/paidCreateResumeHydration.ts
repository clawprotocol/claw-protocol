/**
 * Create-route resume hydration.
 *
 * `/view` always GETs the canonical review snapshot when local verified paper is
 * missing. `/app/create?agreementId=` must do the same — draft pipeline fields
 * must not gate snapshot retrieval, and a successful GET must paint those bytes.
 */
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

export type PaidCreateResumeHydrateResult =
  | {
      ok: true;
      snapshot: {
        agreement_id?: string;
        corpus_plain?: string;
        snapshot_id?: string;
        corpus_sha256?: string;
        corpus_length?: number;
      };
    }
  | { ok: false; code: string };

export type PaidCreateResumeCorpusSource = "verified_snapshot" | "draft_pipeline" | "none";

export type PaidCreateResumeCorpusResolution = {
  corpus: string;
  source: PaidCreateResumeCorpusSource;
  snapshotId?: string;
  digest?: string;
  hydrateAttempted: boolean;
  hydrateCode?: string;
};

export function longestDraftPipelineCorpus(fields: readonly (string | null | undefined)[]): string {
  return fields
    .map((value) => String(value ?? "").trim())
    .reduce((best, text) => (text.length > best.length ? text : best), "");
}

/** Always attempt canonical GET on create resume. Draft length is not a prerequisite. */
export function shouldAttemptCanonicalSnapshotOnCreateResume(
  _draftPipelineCorpus?: string | null,
): boolean {
  void _draftPipelineCorpus;
  return true;
}

export function resolvePaidCreateResumeDisplayPhase(args: {
  signerSetupResume: boolean;
  snapshotOrPipelineCorpus: string;
  draftKeepsReview: boolean;
  minLen?: number;
}): "review" | "intake" {
  if (args.signerSetupResume) return "review";
  const corpus = String(args.snapshotOrPipelineCorpus || "").trim();
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  if (corpus.length >= minLen || args.draftKeepsReview) return "review";
  return "intake";
}

export function selectPaidCreateResumeCorpus(args: {
  verifiedSnapshotCorpus: string;
  draftPipelineCorpus: string;
  minLen?: number;
}): { corpus: string; source: PaidCreateResumeCorpusSource } {
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  const verified = String(args.verifiedSnapshotCorpus || "").trim();
  const draft = String(args.draftPipelineCorpus || "").trim();
  if (verified.length >= minLen) return { corpus: verified, source: "verified_snapshot" };
  if (draft.length >= minLen) return { corpus: draft, source: "draft_pipeline" };
  return { corpus: "", source: "none" };
}

export async function resolvePaidCreateResumeCorpus(args: {
  agreementId: string;
  draftPipelineCorpus: string;
  hydrateSnapshot: (input?: { agreementId: string }) => Promise<PaidCreateResumeHydrateResult>;
  minLen?: number;
}): Promise<PaidCreateResumeCorpusResolution> {
  const agreementId = String(args.agreementId || "").trim();
  const draftPipelineCorpus = String(args.draftPipelineCorpus || "").trim();
  let verified = "";
  let snapshotId: string | undefined;
  let digest: string | undefined;
  let hydrateAttempted = false;
  let hydrateCode: string | undefined;

  if (agreementId && shouldAttemptCanonicalSnapshotOnCreateResume(draftPipelineCorpus)) {
    hydrateAttempted = true;
    try {
      const hydrated = await args.hydrateSnapshot({ agreementId });
      if (hydrated.ok) {
        const returnedId = String(hydrated.snapshot.agreement_id || agreementId).trim();
        if (returnedId && returnedId !== agreementId) {
          hydrateCode = "agreement_id_mismatch";
        } else {
          verified = String(hydrated.snapshot.corpus_plain || "").trim();
          snapshotId = String(hydrated.snapshot.snapshot_id || "").trim() || undefined;
          digest = String(hydrated.snapshot.corpus_sha256 || "").trim().toLowerCase() || undefined;
        }
      } else {
        hydrateCode = hydrated.code;
      }
    } catch {
      hydrateCode = "hydrate_threw";
    }
  }

  const selected = selectPaidCreateResumeCorpus({
    verifiedSnapshotCorpus: verified,
    draftPipelineCorpus,
    minLen: args.minLen,
  });
  return {
    ...selected,
    snapshotId: selected.source === "verified_snapshot" ? snapshotId : undefined,
    digest: selected.source === "verified_snapshot" ? digest : undefined,
    hydrateAttempted,
    hydrateCode,
  };
}
