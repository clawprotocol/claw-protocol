/**
 * Seed the ephemeral frozen-corpus cache from authenticated canonical-review GET.
 * Browser storage is never a grant. Backend ownership is enforced by the GET.
 */

import { hydrateCommercialReviewFromServerSnapshot } from "../../agreement/canonicalReviewSnapshotApi";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";
import { rememberImmutableFrozenLegalCorpus } from "./paidProFrozenLegalCorpus";

export type RestoreFrozenLegalCorpusFromCanonicalResult =
  | { ok: true; body: string; hash: string; sha256: string }
  | {
      ok: false;
      reason:
        | "missing_authority"
        | "server_get_failed"
        | "agreement_mismatch"
        | "length_mismatch"
        | "hash_mismatch";
      code?: string;
    };

export async function restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot(args: {
  agreementId?: string | null;
  expectedSha256?: string | null;
}): Promise<RestoreFrozenLegalCorpusFromCanonicalResult> {
  const agreementId = (args.agreementId || "").trim();
  if (!agreementId) return { ok: false, reason: "missing_authority" };

  const hydrated = await hydrateCommercialReviewFromServerSnapshot({ agreementId });
  if (!hydrated.ok) {
    if (hydrated.code === "agreement_id_mismatch") {
      return { ok: false, reason: "agreement_mismatch", code: hydrated.code };
    }
    return { ok: false, reason: "server_get_failed", code: hydrated.code };
  }

  const snap = hydrated.snapshot;
  const returnedId = String(snap.agreement_id || "").trim();
  const body = (snap.corpus_plain || "").trim();
  const sha256 = String(snap.corpus_sha256 || "").toLowerCase();
  if (!returnedId || returnedId !== agreementId) {
    return { ok: false, reason: "agreement_mismatch" };
  }
  if (!body || Number(snap.corpus_length) !== body.length) {
    return { ok: false, reason: "length_mismatch" };
  }
  if (!sha256 || sha256 !== hydrated.display.corpusSha256.toLowerCase()) {
    return { ok: false, reason: "hash_mismatch" };
  }
  const expectedSha256 = (args.expectedSha256 || "").trim().toLowerCase();
  if (expectedSha256 && expectedSha256 !== sha256) {
    return { ok: false, reason: "hash_mismatch" };
  }

  rememberImmutableFrozenLegalCorpus(body, { agreementId });
  return { ok: true, body, hash: hashPaidProCorpus(body), sha256 };
}
