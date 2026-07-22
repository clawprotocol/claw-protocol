/**
 * Server-authoritative canonical review snapshot API.
 * Client SoT coordinates review; server accepted snapshot is commercial authority.
 */

import { apiUrl } from "../lib/clawApi";
import { sha256Hex } from "../utils/agreements/hash";
import { clawAgreementHeaders } from "./agreementOrgHeaders";

export type CanonicalReviewSnapshot = {
  snapshot_id: string;
  agreement_id: string;
  corpus_plain: string;
  corpus_sha256: string;
  corpus_length: number;
  generation_session_id?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
  schema_version?: string | null;
  status: string;
};

export type PersistCanonicalReviewSnapshotResult =
  | { ok: true; snapshot: CanonicalReviewSnapshot }
  | { ok: false; code: string };

export type AcceptCanonicalReviewSnapshotResult =
  | { ok: true; accepted: CanonicalReviewSnapshot }
  | { ok: false; code: string };

const SESSION_KEY = "claw_accepted_review_snapshot_v1";

export type StoredAcceptedReviewSnapshotRef = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
};

export function storeAcceptedReviewSnapshotRef(ref: StoredAcceptedReviewSnapshotRef): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function readAcceptedReviewSnapshotRef(
  agreementId?: string | null,
): StoredAcceptedReviewSnapshotRef | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAcceptedReviewSnapshotRef;
    if (!parsed?.snapshotId || !parsed?.corpusSha256) return null;
    if (agreementId && parsed.agreementId && parsed.agreementId !== agreementId.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function sha256CorpusDigest(corpusPlain: string): Promise<string> {
  return (await sha256Hex((corpusPlain || "").trim())).toLowerCase();
}

export async function persistCanonicalReviewSnapshot(args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
  createdBySession?: string | null;
}): Promise<PersistCanonicalReviewSnapshotResult> {
  const id = args.agreementId.trim();
  const corpus = (args.corpusPlain || "").trim();
  if (!id || corpus.length < 500) return { ok: false, code: "invalid_snapshot_args" };
  const claimed = await sha256CorpusDigest(corpus);
  try {
    const res = await fetch(apiUrl(`/api/agreements/${encodeURIComponent(id)}/canonical-review-snapshot`), {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        corpus_plain: corpus,
        generation_session_id: args.generationSessionId ?? null,
        claimed_digest: claimed,
        created_by_session: args.createdBySession ?? args.generationSessionId ?? null,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } };
      return {
        ok: false,
        code:
          typeof j.detail === "object" && j.detail?.code
            ? String(j.detail.code)
            : `http_${res.status}`,
      };
    }
    const j = (await res.json()) as { snapshot?: CanonicalReviewSnapshot };
    if (!j.snapshot?.snapshot_id) return { ok: false, code: "snapshot_missing" };
    return { ok: true, snapshot: j.snapshot };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export async function acceptCanonicalReviewSnapshot(args: {
  agreementId: string;
  snapshotId: string;
  expectedDigest: string;
  acceptingSession?: string | null;
  expectedAcceptedSnapshotId?: string | null;
  allowRevision?: boolean;
}): Promise<AcceptCanonicalReviewSnapshotResult> {
  const id = args.agreementId.trim();
  if (!id || !args.snapshotId || !args.expectedDigest) {
    return { ok: false, code: "invalid_accept_args" };
  }
  try {
    const res = await fetch(
      apiUrl(`/api/agreements/${encodeURIComponent(id)}/canonical-review-snapshot/accept`),
      {
        method: "POST",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          snapshot_id: args.snapshotId,
          expected_digest: args.expectedDigest,
          accepting_session: args.acceptingSession ?? null,
          expected_accepted_snapshot_id:
            args.expectedAcceptedSnapshotId === undefined
              ? null
              : args.expectedAcceptedSnapshotId,
          allow_revision: Boolean(args.allowRevision),
        }),
      },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } };
      return {
        ok: false,
        code:
          typeof j.detail === "object" && j.detail?.code
            ? String(j.detail.code)
            : `http_${res.status}`,
      };
    }
    const j = (await res.json()) as { accepted?: CanonicalReviewSnapshot };
    if (!j.accepted?.snapshot_id) return { ok: false, code: "accepted_missing" };
    storeAcceptedReviewSnapshotRef({
      agreementId: id,
      snapshotId: j.accepted.snapshot_id,
      corpusSha256: j.accepted.corpus_sha256,
      corpusLength: j.accepted.corpus_length,
    });
    return { ok: true, accepted: j.accepted };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

/**
 * After client SoT establish: persist pending snapshot from established bytes, then accept.
 * Server digest/bytes become commercial authority; local SoT remains review coordinator.
 */
export async function establishServerAcceptedReviewSnapshot(args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
  allowRevision?: boolean;
}): Promise<AcceptCanonicalReviewSnapshotResult> {
  const prior = readAcceptedReviewSnapshotRef(args.agreementId);
  const persisted = await persistCanonicalReviewSnapshot({
    agreementId: args.agreementId,
    corpusPlain: args.corpusPlain,
    generationSessionId: args.generationSessionId,
    createdBySession: args.generationSessionId,
  });
  if (!persisted.ok) return { ok: false, code: persisted.code };
  // Idempotent path: already-accepted identical corpus returned as accepted status.
  if (persisted.snapshot.status === "accepted") {
    storeAcceptedReviewSnapshotRef({
      agreementId: args.agreementId.trim(),
      snapshotId: persisted.snapshot.snapshot_id,
      corpusSha256: persisted.snapshot.corpus_sha256,
      corpusLength: persisted.snapshot.corpus_length,
    });
    return { ok: true, accepted: persisted.snapshot };
  }
  return acceptCanonicalReviewSnapshot({
    agreementId: args.agreementId,
    snapshotId: persisted.snapshot.snapshot_id,
    expectedDigest: persisted.snapshot.corpus_sha256,
    acceptingSession: args.generationSessionId,
    expectedAcceptedSnapshotId: prior?.snapshotId ?? "",
    allowRevision: Boolean(args.allowRevision),
  });
}
