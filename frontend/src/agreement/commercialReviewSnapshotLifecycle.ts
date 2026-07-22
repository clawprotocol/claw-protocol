/**
 * Pure commercial review-snapshot lifecycle helpers (unit-testable).
 *
 * Product authority chain:
 *   persist pending → GET hydrate/render → accept(id+digest) → prepare/dispatch
 */

import type { CanonicalReviewSnapshot } from "./canonicalReviewSnapshotApi";

export type CommercialDisplayAuthority = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
};

export function assertServerSnapshotDisplayParity(args: {
  displayed: CommercialDisplayAuthority;
  fromGet: Pick<CanonicalReviewSnapshot, "snapshot_id" | "corpus_sha256" | "corpus_length" | "corpus_plain">;
  renderedCorpusPlain: string;
}): { ok: true } | { ok: false; code: string } {
  const getDigest = String(args.fromGet.corpus_sha256 || "").toLowerCase();
  const getLen = Number(args.fromGet.corpus_length || 0);
  if (args.displayed.snapshotId !== args.fromGet.snapshot_id) {
    return { ok: false, code: "display_snapshot_id_mismatch" };
  }
  if (args.displayed.corpusSha256.toLowerCase() !== getDigest) {
    return { ok: false, code: "display_digest_mismatch" };
  }
  if (args.displayed.corpusLength !== getLen) {
    return { ok: false, code: "display_length_mismatch" };
  }
  if ((args.renderedCorpusPlain || "").trim() !== (args.fromGet.corpus_plain || "").trim()) {
    return { ok: false, code: "rendered_corpus_differs_from_get" };
  }
  if ((args.renderedCorpusPlain || "").trim().length !== getLen) {
    return { ok: false, code: "rendered_length_differs_from_get" };
  }
  return { ok: true };
}

export function assertAcceptTargetsDisplayedAuthority(args: {
  displayed: CommercialDisplayAuthority;
  acceptSnapshotId: string;
  acceptDigest: string;
  acceptIncludesCorpusPlain?: unknown;
}): { ok: true } | { ok: false; code: string } {
  if (args.acceptIncludesCorpusPlain !== undefined && args.acceptIncludesCorpusPlain !== null) {
    return { ok: false, code: "accept_must_not_include_corpus" };
  }
  if (args.acceptSnapshotId !== args.displayed.snapshotId) {
    return { ok: false, code: "accept_targets_non_displayed_snapshot" };
  }
  if (String(args.acceptDigest || "").toLowerCase() !== args.displayed.corpusSha256.toLowerCase()) {
    return { ok: false, code: "accept_targets_non_displayed_digest" };
  }
  return { ok: true };
}

export function assertPrepareAllowedAfterServerAccept(args: {
  display: CommercialDisplayAuthority | null;
  accepted: CommercialDisplayAuthority | null;
  serverAcceptAwaitedOk: boolean;
}): { ok: true } | { ok: false; code: string } {
  if (!args.serverAcceptAwaitedOk) {
    return { ok: false, code: "prepare_blocked_before_server_accept" };
  }
  if (!args.display || !args.accepted) {
    return { ok: false, code: "prepare_blocked_missing_authority" };
  }
  if (
    args.display.snapshotId !== args.accepted.snapshotId ||
    args.display.corpusSha256.toLowerCase() !== args.accepted.corpusSha256.toLowerCase() ||
    args.display.corpusLength !== args.accepted.corpusLength
  ) {
    return { ok: false, code: "prepare_blocked_display_accepted_mismatch" };
  }
  return { ok: true };
}
