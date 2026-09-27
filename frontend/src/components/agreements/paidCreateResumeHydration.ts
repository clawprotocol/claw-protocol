/**
 * Create-route resume hydration.
 *
 * `/view` always GETs the canonical review snapshot when local verified paper is
 * missing. `/app/create?agreementId=` must do the same — draft pipeline fields
 * must not gate snapshot retrieval, and a successful GET must paint those bytes.
 *
 * Post-accept reopen must bind the current accepted snapshot for this agreement.
 * Local length, pending/superseded records, and a different agreement cannot
 * promote review chrome.
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
        status?: string;
      };
      status?: string;
    }
  | { ok: false; code: string };

export type PaidCreateResumeCorpusSource = "verified_snapshot" | "draft_pipeline" | "hydrated_ref" | "none";

export type PaidCreateResumeCorpusResolution = {
  corpus: string;
  source: PaidCreateResumeCorpusSource;
  snapshotId?: string;
  digest?: string;
  status?: string;
  hydrateAttempted: boolean;
  hydrateCode?: string;
  renderKey?: string;
};

export type CreateResumeSnapshotCandidate = {
  agreement_id?: string;
  snapshot_id?: string;
  corpus_sha256?: string;
  corpus_plain?: string;
  corpus_length?: number;
  status?: string;
};

export type CreateResumeSnapshotAuthority = {
  agreementId: string;
  snapshotId: string;
  digest: string;
  status: "accepted";
  corpus: string;
  corpusLength: number;
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

/** Skip a second GET only after this exact agreement already hydrated in the current mount. */
export function shouldReuseCreateResumeHydration(args: {
  agreementId: string;
  hydratedAgreementId?: string | null;
}): boolean {
  const id = String(args.agreementId || "").trim();
  const hydrated = String(args.hydratedAgreementId || "").trim();
  return Boolean(id && hydrated && id === hydrated);
}

export function createResumeRenderKey(args: {
  agreementId: string;
  snapshotId: string;
  digest: string;
}): string {
  return `${String(args.agreementId || "").trim()}:${String(args.snapshotId || "").trim()}:${String(args.digest || "").trim().toLowerCase()}`;
}

export function evaluateCreateResumeSnapshotAuthority(args: {
  requestedAgreementId: string;
  snapshot: CreateResumeSnapshotCandidate;
  expectedDigest?: string | null;
}): { ok: true; authority: CreateResumeSnapshotAuthority } | { ok: false; code: string } {
  const requested = String(args.requestedAgreementId || "").trim();
  if (!requested) return { ok: false, code: "missing_agreement_id" };
  const returnedId = String(args.snapshot.agreement_id || "").trim();
  if (!returnedId) return { ok: false, code: "missing_snapshot_agreement_id" };
  if (returnedId !== requested) return { ok: false, code: "agreement_id_mismatch" };
  const status = String(args.snapshot.status || "").trim().toLowerCase();
  if (status === "pending" || status === "superseded") return { ok: false, code: `rejected_${status}` };
  if (status !== "accepted") return { ok: false, code: "status_not_accepted" };
  const corpus = String(args.snapshot.corpus_plain || "").trim();
  const snapshotId = String(args.snapshot.snapshot_id || "").trim();
  const digest = String(args.snapshot.corpus_sha256 || "").trim().toLowerCase();
  if (!snapshotId) return { ok: false, code: "missing_snapshot_id" };
  if (!digest) return { ok: false, code: "missing_digest" };
  if (corpus.length < PAID_PRO_AUTHORITY_MIN_LEN) return { ok: false, code: "missing_corpus" };
  if (Number(args.snapshot.corpus_length || 0) !== corpus.length) return { ok: false, code: "length_mismatch" };
  const expected = String(args.expectedDigest || "").trim().toLowerCase();
  if (expected && expected !== digest) return { ok: false, code: "digest_mismatch" };
  return {
    ok: true,
    authority: {
      agreementId: requested,
      snapshotId,
      digest,
      status: "accepted",
      corpus,
      corpusLength: corpus.length,
    },
  };
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

/** Promote off intake only after accepted snapshot identity for this agreement is known. */
export function shouldPromoteCreateResumeToReviewChrome(args: {
  agreementId: string;
  verifiedPaperLength: number;
  currentStage: "INPUT" | "DRAFT" | "RECIPIENTS" | string;
  minLen?: number;
  snapshotStatus?: string | null;
  snapshotId?: string | null;
  digest?: string | null;
  expectedAgreementId?: string | null;
  expectedDigest?: string | null;
  corpusPlain?: string | null;
}): boolean {
  if (args.currentStage !== "INPUT") return false;
  const evaluated = evaluateCreateResumeSnapshotAuthority({
    requestedAgreementId: args.expectedAgreementId || args.agreementId,
    snapshot: {
      agreement_id: args.agreementId,
      snapshot_id: String(args.snapshotId || ""),
      corpus_sha256: String(args.digest || ""),
      corpus_plain: String(args.corpusPlain || "").trim() || "x".repeat(Math.max(0, Number(args.verifiedPaperLength) || 0)),
      corpus_length: Number(args.verifiedPaperLength) || 0,
      status: String(args.snapshotStatus || ""),
    },
    expectedDigest: args.expectedDigest,
  });
  if (!evaluated.ok) return false;
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  return evaluated.authority.corpusLength >= minLen;
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

/**
 * Paint-only: reuse already-committed accepted/server bytes instead of rebuilding
 * premium deliverable preview on every review tick. Does not grant entitlement.
 */
export function selectExistingPaidReviewPlainForPreview(args: {
  verifiedSnapshotCorpus?: string | null;
  draftPipelineCorpus?: string | null;
  hydratedCorpus?: string | null;
  minLen?: number;
}): { corpus: string; source: PaidCreateResumeCorpusSource } {
  const selected = selectPaidCreateResumeCorpus({
    verifiedSnapshotCorpus: args.verifiedSnapshotCorpus || "",
    draftPipelineCorpus: args.draftPipelineCorpus || "",
    minLen: args.minLen,
  });
  if (selected.corpus) return selected;
  const hydrated = String(args.hydratedCorpus || "").trim();
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  if (hydrated.length >= minLen) return { corpus: hydrated, source: "hydrated_ref" };
  return { corpus: "", source: "none" };
}

function resumeHydrateStatus(hydrated: Extract<PaidCreateResumeHydrateResult, { ok: true }>): string {
  return String(hydrated.snapshot.status || hydrated.status || "").trim();
}

export async function resolvePaidCreateResumeCorpus(args: {
  agreementId: string;
  draftPipelineCorpus: string;
  hydrateSnapshot: (input?: { agreementId: string }) => Promise<PaidCreateResumeHydrateResult>;
  minLen?: number;
  expectedDigest?: string | null;
}): Promise<PaidCreateResumeCorpusResolution> {
  const agreementId = String(args.agreementId || "").trim();
  const draftPipelineCorpus = String(args.draftPipelineCorpus || "").trim();
  let verified = "";
  let snapshotId: string | undefined;
  let digest: string | undefined;
  let status: string | undefined;
  let hydrateAttempted = false;
  let hydrateCode: string | undefined;
  let renderKey: string | undefined;

  if (agreementId && shouldAttemptCanonicalSnapshotOnCreateResume(draftPipelineCorpus)) {
    hydrateAttempted = true;
    try {
      const hydrated = await args.hydrateSnapshot({ agreementId });
      if (hydrated.ok) {
        const evaluated = evaluateCreateResumeSnapshotAuthority({
          requestedAgreementId: agreementId,
          snapshot: {
            ...hydrated.snapshot,
            status: resumeHydrateStatus(hydrated),
            corpus_length:
              hydrated.snapshot.corpus_length ?? String(hydrated.snapshot.corpus_plain || "").trim().length,
          },
          expectedDigest: args.expectedDigest,
        });
        if (!evaluated.ok) {
          hydrateCode = evaluated.code;
        } else {
          verified = evaluated.authority.corpus;
          snapshotId = evaluated.authority.snapshotId;
          digest = evaluated.authority.digest;
          status = evaluated.authority.status;
          renderKey = createResumeRenderKey(evaluated.authority);
        }
      } else {
        hydrateCode = hydrated.code;
      }
    } catch {
      hydrateCode = "hydrate_threw";
    }
  }

  const allowDraftFallback =
    !hydrateCode || hydrateCode === "snapshot_unavailable" || hydrateCode === "hydrate_threw";
  const selected = selectPaidCreateResumeCorpus({
    verifiedSnapshotCorpus: verified,
    draftPipelineCorpus: allowDraftFallback ? draftPipelineCorpus : "",
    minLen: args.minLen,
  });
  return {
    ...selected,
    snapshotId: selected.source === "verified_snapshot" ? snapshotId : undefined,
    digest: selected.source === "verified_snapshot" ? digest : undefined,
    status: selected.source === "verified_snapshot" ? status : undefined,
    hydrateAttempted,
    hydrateCode,
    renderKey: selected.source === "verified_snapshot" ? renderKey : undefined,
  };
}
