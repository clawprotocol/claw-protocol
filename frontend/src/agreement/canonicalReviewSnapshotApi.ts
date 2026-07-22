/**
 * Server-authoritative canonical review snapshot API.
 *
 * Commercial lifecycle:
 *  1. Persist pending snapshot BEFORE review UI
 *  2. Hydrate review from GET (id + SHA-256 + length + bytes)
 *  3. Accept by snapshot id + expected digest only (no corpus bytes)
 *  4. Await accept before Prepare / dispatch / signing handoff
 *
 * Client SoT coordinates review display; server accepted snapshot is commercial authority.
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
  | { ok: true; snapshot: CanonicalReviewSnapshot; registryVersion?: number | null }
  | { ok: false; code: string };

export type AcceptCanonicalReviewSnapshotResult =
  | { ok: true; accepted: CanonicalReviewSnapshot; registryVersion?: number | null }
  | { ok: false; code: string };

export type FetchCanonicalReviewSnapshotResult =
  | {
      ok: true;
      status: "pending" | "accepted" | string;
      snapshot: CanonicalReviewSnapshot;
      registryVersion?: number | null;
    }
  | { ok: false; code: string };

const ACCEPTED_SESSION_KEY = "claw_accepted_review_snapshot_v1";
const DISPLAY_SESSION_KEY = "claw_display_review_snapshot_v1";

export type StoredAcceptedReviewSnapshotRef = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
};

export type StoredDisplayReviewSnapshotAuthority = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
  status: string;
};

export function storeAcceptedReviewSnapshotRef(ref: StoredAcceptedReviewSnapshotRef): void {
  try {
    sessionStorage.setItem(ACCEPTED_SESSION_KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function readAcceptedReviewSnapshotRef(
  agreementId?: string | null,
): StoredAcceptedReviewSnapshotRef | null {
  try {
    const raw = sessionStorage.getItem(ACCEPTED_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAcceptedReviewSnapshotRef;
    if (!parsed?.snapshotId || !parsed?.corpusSha256) return null;
    if (agreementId && parsed.agreementId && parsed.agreementId !== agreementId.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAcceptedReviewSnapshotRef(): void {
  try {
    sessionStorage.removeItem(ACCEPTED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function storeDisplayReviewSnapshotAuthority(
  ref: StoredDisplayReviewSnapshotAuthority,
): void {
  try {
    sessionStorage.setItem(DISPLAY_SESSION_KEY, JSON.stringify(ref));
  } catch {
    /* ignore */
  }
}

export function readDisplayReviewSnapshotAuthority(
  agreementId?: string | null,
): StoredDisplayReviewSnapshotAuthority | null {
  try {
    const raw = sessionStorage.getItem(DISPLAY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDisplayReviewSnapshotAuthority;
    if (!parsed?.snapshotId || !parsed?.corpusSha256) return null;
    if (agreementId && parsed.agreementId && parsed.agreementId !== agreementId.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDisplayReviewSnapshotAuthority(): void {
  try {
    sessionStorage.removeItem(DISPLAY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function displayAuthorityMatchesSnapshot(
  display: StoredDisplayReviewSnapshotAuthority | null | undefined,
  snapshot: Pick<CanonicalReviewSnapshot, "snapshot_id" | "corpus_sha256" | "corpus_length"> | null | undefined,
): boolean {
  if (!display || !snapshot) return false;
  return (
    display.snapshotId === snapshot.snapshot_id &&
    display.corpusSha256.toLowerCase() === String(snapshot.corpus_sha256 || "").toLowerCase() &&
    display.corpusLength === Number(snapshot.corpus_length || 0)
  );
}

export function acceptedMatchesDisplayAuthority(
  accepted: StoredAcceptedReviewSnapshotRef | null | undefined,
  display: StoredDisplayReviewSnapshotAuthority | null | undefined,
): boolean {
  if (!accepted || !display) return false;
  if (accepted.agreementId && display.agreementId && accepted.agreementId !== display.agreementId) {
    return false;
  }
  return (
    accepted.snapshotId === display.snapshotId &&
    accepted.corpusSha256.toLowerCase() === display.corpusSha256.toLowerCase() &&
    accepted.corpusLength === display.corpusLength
  );
}

/** Prepare/dispatch gate: server accept must match the displayed GET authority. */
export function canEnableCommercialPrepareFromServerSnapshot(agreementId?: string | null): boolean {
  const display = readDisplayReviewSnapshotAuthority(agreementId);
  const accepted = readAcceptedReviewSnapshotRef(agreementId);
  return acceptedMatchesDisplayAuthority(accepted, display);
}

export async function sha256CorpusDigest(corpusPlain: string): Promise<string> {
  return (await sha256Hex((corpusPlain || "").trim())).toLowerCase();
}

function _errorCodeFromResponse(j: { detail?: { code?: string } | string }, status: number): string {
  if (typeof j.detail === "object" && j.detail?.code) return String(j.detail.code);
  if (typeof j.detail === "string" && j.detail.trim()) return j.detail.trim();
  return `http_${status}`;
}

export async function persistCanonicalReviewSnapshot(args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
  createdBySession?: string | null;
  expectedRegistryVersion?: number | null;
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
        expected_registry_version:
          args.expectedRegistryVersion === undefined || args.expectedRegistryVersion === null
            ? null
            : args.expectedRegistryVersion,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } | string };
      return { ok: false, code: _errorCodeFromResponse(j, res.status) };
    }
    const j = (await res.json()) as {
      snapshot?: CanonicalReviewSnapshot;
      registry_version?: number | null;
    };
    if (!j.snapshot?.snapshot_id) return { ok: false, code: "snapshot_missing" };
    return { ok: true, snapshot: j.snapshot, registryVersion: j.registry_version ?? null };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export async function fetchCanonicalReviewSnapshot(args: {
  agreementId: string;
}): Promise<FetchCanonicalReviewSnapshotResult> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false, code: "invalid_snapshot_args" };
  try {
    const res = await fetch(
      apiUrl(`/api/agreements/${encodeURIComponent(id)}/canonical-review-snapshot`),
      {
        method: "GET",
        headers: clawAgreementHeaders(),
      },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } | string };
      return { ok: false, code: _errorCodeFromResponse(j, res.status) };
    }
    const j = (await res.json()) as {
      status?: string;
      snapshot?: CanonicalReviewSnapshot;
      registry_version?: number | null;
    };
    if (!j.snapshot?.snapshot_id) return { ok: false, code: "snapshot_missing" };
    return {
      ok: true,
      status: j.status || j.snapshot.status || "pending",
      snapshot: j.snapshot,
      registryVersion: j.registry_version ?? null,
    };
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
  expectedRegistryVersion?: number | null;
  displaySnapshotId?: string | null;
  displayDigest?: string | null;
  displayLength?: number | null;
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
          expected_registry_version:
            args.expectedRegistryVersion === undefined || args.expectedRegistryVersion === null
              ? null
              : args.expectedRegistryVersion,
          display_snapshot_id: args.displaySnapshotId ?? args.snapshotId,
          display_digest: args.displayDigest ?? args.expectedDigest,
          display_length: args.displayLength ?? null,
        }),
      },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } | string };
      return { ok: false, code: _errorCodeFromResponse(j, res.status) };
    }
    const j = (await res.json()) as {
      accepted?: CanonicalReviewSnapshot;
      registry_version?: number | null;
    };
    if (!j.accepted?.snapshot_id) return { ok: false, code: "accepted_missing" };
    storeAcceptedReviewSnapshotRef({
      agreementId: id,
      snapshotId: j.accepted.snapshot_id,
      corpusSha256: j.accepted.corpus_sha256,
      corpusLength: j.accepted.corpus_length,
    });
    return { ok: true, accepted: j.accepted, registryVersion: j.registry_version ?? null };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

/**
 * Phase 1 — before review UI: persist pending, then GET authoritative bytes for display.
 * Does NOT accept. Fire-and-forget commercial accept is intentionally unsupported.
 */
export async function prepareCommercialReviewSnapshotAuthority(args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
}): Promise<
  | {
      ok: true;
      snapshot: CanonicalReviewSnapshot;
      status: string;
      registryVersion?: number | null;
      display: StoredDisplayReviewSnapshotAuthority;
    }
  | { ok: false; code: string }
> {
  const id = args.agreementId.trim();
  const corpus = (args.corpusPlain || "").trim();
  if (!id || corpus.length < 500) return { ok: false, code: "invalid_snapshot_args" };

  const persisted = await persistCanonicalReviewSnapshot({
    agreementId: id,
    corpusPlain: corpus,
    generationSessionId: args.generationSessionId,
    createdBySession: args.generationSessionId,
  });
  if (!persisted.ok) return { ok: false, code: persisted.code };

  // Prefer GET as the sole review hydration authority (not POST response alone).
  const fetched = await fetchCanonicalReviewSnapshot({ agreementId: id });
  if (!fetched.ok) return { ok: false, code: fetched.code };

  const snap = fetched.snapshot;
  // Fail closed if GET authority diverges from what we just persisted.
  if (
    snap.snapshot_id !== persisted.snapshot.snapshot_id ||
    snap.corpus_sha256.toLowerCase() !== persisted.snapshot.corpus_sha256.toLowerCase() ||
    snap.corpus_length !== persisted.snapshot.corpus_length ||
    (snap.corpus_plain || "").trim() !== (persisted.snapshot.corpus_plain || "").trim()
  ) {
    return { ok: false, code: "persist_get_authority_mismatch" };
  }

  const display: StoredDisplayReviewSnapshotAuthority = {
    agreementId: id,
    snapshotId: snap.snapshot_id,
    corpusSha256: snap.corpus_sha256.toLowerCase(),
    corpusLength: snap.corpus_length,
    status: String(fetched.status || snap.status || "pending"),
  };
  storeDisplayReviewSnapshotAuthority(display);
  // New pending review invalidates prior accept until explicit accept of display authority.
  if (display.status !== "accepted") {
    clearAcceptedReviewSnapshotRef();
  } else {
    storeAcceptedReviewSnapshotRef({
      agreementId: id,
      snapshotId: snap.snapshot_id,
      corpusSha256: snap.corpus_sha256.toLowerCase(),
      corpusLength: snap.corpus_length,
    });
  }
  return {
    ok: true,
    snapshot: snap,
    status: display.status,
    registryVersion: fetched.registryVersion ?? persisted.registryVersion ?? null,
    display,
  };
}

/**
 * Reload hydration: GET server snapshot and set display authority from those exact bytes.
 */
export async function hydrateCommercialReviewFromServerSnapshot(args: {
  agreementId: string;
}): Promise<
  | {
      ok: true;
      snapshot: CanonicalReviewSnapshot;
      status: string;
      display: StoredDisplayReviewSnapshotAuthority;
      accepted: boolean;
    }
  | { ok: false; code: string }
> {
  const fetched = await fetchCanonicalReviewSnapshot({ agreementId: args.agreementId });
  if (!fetched.ok) return { ok: false, code: fetched.code };
  const snap = fetched.snapshot;
  const id = args.agreementId.trim();
  const display: StoredDisplayReviewSnapshotAuthority = {
    agreementId: id,
    snapshotId: snap.snapshot_id,
    corpusSha256: snap.corpus_sha256.toLowerCase(),
    corpusLength: snap.corpus_length,
    status: String(fetched.status || snap.status || "pending"),
  };
  storeDisplayReviewSnapshotAuthority(display);
  const accepted = display.status === "accepted";
  if (accepted) {
    storeAcceptedReviewSnapshotRef({
      agreementId: id,
      snapshotId: snap.snapshot_id,
      corpusSha256: snap.corpus_sha256.toLowerCase(),
      corpusLength: snap.corpus_length,
    });
  }
  return { ok: true, snapshot: snap, status: display.status, display, accepted };
}

/**
 * Phase 2 — customer acceptance: re-GET, verify display match, accept by id+digest only.
 */
export async function acceptDisplayedCommercialReviewSnapshot(args: {
  agreementId: string;
  acceptingSession?: string | null;
  allowRevision?: boolean;
}): Promise<AcceptCanonicalReviewSnapshotResult> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false, code: "invalid_accept_args" };

  const display = readDisplayReviewSnapshotAuthority(id);
  if (!display) return { ok: false, code: "display_authority_missing" };

  const fetched = await fetchCanonicalReviewSnapshot({ agreementId: id });
  if (!fetched.ok) return { ok: false, code: fetched.code };
  if (!displayAuthorityMatchesSnapshot(display, fetched.snapshot)) {
    return { ok: false, code: "display_authority_mismatch" };
  }

  const prior = readAcceptedReviewSnapshotRef(id);
  return acceptCanonicalReviewSnapshot({
    agreementId: id,
    snapshotId: display.snapshotId,
    expectedDigest: display.corpusSha256,
    acceptingSession: args.acceptingSession,
    expectedAcceptedSnapshotId: prior?.snapshotId ?? "",
    allowRevision: Boolean(args.allowRevision),
    displaySnapshotId: display.snapshotId,
    displayDigest: display.corpusSha256,
    displayLength: display.corpusLength,
  });
}

/**
 * @deprecated Commercial path must use prepareCommercialReviewSnapshotAuthority +
 * acceptDisplayedCommercialReviewSnapshot (awaited). Kept only to fail closed if called.
 */
export async function establishServerAcceptedReviewSnapshot(_args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
  allowRevision?: boolean;
}): Promise<AcceptCanonicalReviewSnapshotResult> {
  return { ok: false, code: "fire_and_forget_commercial_accept_removed" };
}
