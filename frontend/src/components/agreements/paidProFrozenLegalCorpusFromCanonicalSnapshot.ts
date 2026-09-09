/**
 * Seed the ephemeral frozen-corpus cache from authenticated canonical-review GET.
 * Browser storage is never a grant. Backend ownership is enforced by the GET.
 */

import { hydrateCommercialReviewFromServerSnapshot } from "../../agreement/canonicalReviewSnapshotApi";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";
import {
  readImmutableFrozenLegalCorpusRecord,
  rememberImmutableFrozenLegalCorpus,
  resolveFrozenLegalCorpusScope,
} from "./paidProFrozenLegalCorpus";

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

export type SignerFinalizeFrozenAuthorityGate =
  | {
      ok: true;
      organizationId: string;
      agreementId: string;
      body: string;
      hash: string;
    }
  | Extract<RestoreFrozenLegalCorpusFromCanonicalResult, { ok: false }>;

export async function restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot(args: {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedSha256?: string | null;
}): Promise<RestoreFrozenLegalCorpusFromCanonicalResult> {
  const scoped = resolveFrozenLegalCorpusScope({
    agreementId: args.agreementId,
    organizationId: args.organizationId,
  });
  if (!scoped) return { ok: false, reason: "missing_authority" };

  const hydrated = await hydrateCommercialReviewFromServerSnapshot({
    agreementId: scoped.agreementId,
  });
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
  if (!returnedId || returnedId !== scoped.agreementId) {
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

  if (
    !rememberImmutableFrozenLegalCorpus(body, {
      agreementId: scoped.agreementId,
      organizationId: scoped.organizationId,
    })
  ) {
    return { ok: false, reason: "missing_authority" };
  }
  return { ok: true, body, hash: hashPaidProCorpus(body), sha256 };
}

/**
 * Commercial signer finalize reads the exact org+agreement record. If the client
 * cache is empty, restore through authenticated GET. Missing, failed, or
 * mismatched authority must block before hydration.
 */
export async function gateSignerFinalizeOnVerifiedFrozenAuthority(args: {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
}): Promise<SignerFinalizeFrozenAuthorityGate> {
  const scoped = resolveFrozenLegalCorpusScope({
    agreementId: args.agreementId,
    organizationId: args.organizationId,
  });
  if (!scoped) return { ok: false, reason: "missing_authority" };

  const expectedHash = (args.expectedHash || "").trim();
  let record = readImmutableFrozenLegalCorpusRecord({
    agreementId: scoped.agreementId,
    organizationId: scoped.organizationId,
    expectedHash: expectedHash || null,
  });
  if (!record) {
    if (expectedHash) {
      const existing = readImmutableFrozenLegalCorpusRecord({
        agreementId: scoped.agreementId,
        organizationId: scoped.organizationId,
      });
      if (existing && existing.hash !== expectedHash) {
        return { ok: false, reason: "hash_mismatch" };
      }
    }
    const restored = await restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot({
      agreementId: scoped.agreementId,
      organizationId: scoped.organizationId,
    });
    if (!restored.ok) return restored;
    if (expectedHash && restored.hash !== expectedHash) {
      return { ok: false, reason: "hash_mismatch" };
    }
    record = readImmutableFrozenLegalCorpusRecord({
      agreementId: scoped.agreementId,
      organizationId: scoped.organizationId,
      expectedHash: expectedHash || null,
    });
  }
  if (!record) return { ok: false, reason: "missing_authority" };
  if (record.agreementId !== scoped.agreementId) {
    return { ok: false, reason: "agreement_mismatch" };
  }
  if (expectedHash && expectedHash !== record.hash) {
    return { ok: false, reason: "hash_mismatch" };
  }
  return {
    ok: true,
    organizationId: record.organizationId,
    agreementId: record.agreementId,
    body: record.body,
    hash: record.hash,
  };
}
