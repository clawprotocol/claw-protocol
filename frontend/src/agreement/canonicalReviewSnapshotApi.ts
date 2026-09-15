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
import { getOrgId } from "../launch/orgContext";
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
  customer_confirmed_answers?: string | null;
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
/** GET corpus bytes paired with display authority — only set after successful server GET. */
const DISPLAY_CORPUS_SESSION_KEY = "claw_display_review_corpus_v1";

export type StoredAcceptedReviewSnapshotRef = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
  orgId?: string;
};

export type StoredDisplayReviewSnapshotAuthority = {
  agreementId: string;
  snapshotId: string;
  corpusSha256: string;
  corpusLength: number;
  status: string;
  orgId?: string;
};

export type StoredVerifiedDisplayReviewCorpus = StoredDisplayReviewSnapshotAuthority & {
  corpusPlain: string;
};

function stampOrgId(explicit?: string | null): string {
  return (explicit || "").trim() || getOrgId().trim();
}

function storedOrgMatches(storedOrg: string | null | undefined, expectedOrg?: string | null): boolean {
  const stored = (storedOrg || "").trim();
  if (!stored) return true;
  const expected = (expectedOrg || getOrgId()).trim();
  return !expected || stored === expected;
}

/**
 * Accept production `{ snapshot: {...} }` and a flat snapshot body (snapshot_id at root).
 * Envelope shape must not drop an otherwise valid persist/GET authority.
 */
export function coerceCanonicalReviewSnapshot(payload: unknown): CanonicalReviewSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const nested =
    root.snapshot && typeof root.snapshot === "object"
      ? (root.snapshot as Record<string, unknown>)
      : null;
  const src =
    nested && String(nested.snapshot_id || "").trim()
      ? nested
      : String(root.snapshot_id || "").trim()
        ? root
        : null;
  if (!src) return null;
  const snapshot_id = String(src.snapshot_id || "").trim();
  if (!snapshot_id) return null;
  const confirmed = String(src.customer_confirmed_answers ?? "").trim();
  return {
    snapshot_id,
    agreement_id: String(src.agreement_id || "").trim(),
    corpus_plain: String(src.corpus_plain ?? ""),
    corpus_sha256: String(src.corpus_sha256 || "").trim().toLowerCase(),
    corpus_length: Number(src.corpus_length || 0),
    generation_session_id: (src.generation_session_id as string | null | undefined) ?? null,
    created_at: (src.created_at as string | null | undefined) ?? null,
    accepted_at: (src.accepted_at as string | null | undefined) ?? null,
    schema_version: (src.schema_version as string | null | undefined) ?? null,
    status: String(src.status || root.status || "pending"),
    customer_confirmed_answers: confirmed || null,
  };
}

export function storeAcceptedReviewSnapshotRef(ref: StoredAcceptedReviewSnapshotRef): void {
  try {
    sessionStorage.setItem(
      ACCEPTED_SESSION_KEY,
      JSON.stringify({ ...ref, orgId: stampOrgId(ref.orgId) }),
    );
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
    if (!storedOrgMatches(parsed.orgId)) return null;
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
    sessionStorage.setItem(
      DISPLAY_SESSION_KEY,
      JSON.stringify({ ...ref, orgId: stampOrgId(ref.orgId) }),
    );
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
    if (!storedOrgMatches(parsed.orgId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDisplayReviewSnapshotAuthority(): void {
  try {
    sessionStorage.removeItem(DISPLAY_SESSION_KEY);
    sessionStorage.removeItem(DISPLAY_CORPUS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Persist server GET corpus as the only paint-eligible commercial review text.
 * Call only after a successful GET with matching id / sha256 / length.
 */
export function storeVerifiedCommercialDisplayCorpus(
  ref: StoredVerifiedDisplayReviewCorpus,
): void {
  const corpus = (ref.corpusPlain || "").trim();
  if (
    !ref.agreementId?.trim() ||
    !ref.snapshotId?.trim() ||
    !ref.corpusSha256?.trim() ||
    !Number.isFinite(ref.corpusLength) ||
    corpus.length !== Number(ref.corpusLength)
  ) {
    return;
  }
  const orgId = stampOrgId(ref.orgId);
  storeDisplayReviewSnapshotAuthority({
    agreementId: ref.agreementId.trim(),
    snapshotId: ref.snapshotId.trim(),
    corpusSha256: ref.corpusSha256.toLowerCase(),
    corpusLength: Number(ref.corpusLength),
    status: ref.status,
    orgId,
  });
  try {
    sessionStorage.setItem(
      DISPLAY_CORPUS_SESSION_KEY,
      JSON.stringify({
        agreementId: ref.agreementId.trim(),
        snapshotId: ref.snapshotId.trim(),
        corpusSha256: ref.corpusSha256.toLowerCase(),
        corpusLength: Number(ref.corpusLength),
        status: ref.status,
        orgId,
        corpusPlain: corpus,
      } satisfies StoredVerifiedDisplayReviewCorpus),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Read paint-eligible commercial review corpus. Returns null unless metadata + length
 * match the display authority (never paints from local SoT / completion snap alone).
 */
export function readVerifiedCommercialDisplayCorpus(
  agreementId?: string | null,
): StoredVerifiedDisplayReviewCorpus | null {
  try {
    const display = readDisplayReviewSnapshotAuthority(agreementId);
    if (!display?.snapshotId) return null;
    const raw = sessionStorage.getItem(DISPLAY_CORPUS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVerifiedDisplayReviewCorpus;
    const corpus = (parsed?.corpusPlain || "").trim();
    if (!corpus || !parsed?.snapshotId) return null;
    if (agreementId && parsed.agreementId && parsed.agreementId !== agreementId.trim()) {
      return null;
    }
    if (!storedOrgMatches(parsed.orgId) || !storedOrgMatches(display.orgId)) {
      return null;
    }
    if (
      parsed.snapshotId !== display.snapshotId ||
      parsed.corpusSha256.toLowerCase() !== display.corpusSha256.toLowerCase() ||
      Number(parsed.corpusLength) !== Number(display.corpusLength) ||
      corpus.length !== Number(display.corpusLength)
    ) {
      return null;
    }
    return {
      ...parsed,
      corpusSha256: parsed.corpusSha256.toLowerCase(),
      corpusPlain: corpus,
    };
  } catch {
    return null;
  }
}

/** True when commercial review may paint legal corpus for this agreement. */
export function hasVerifiedCommercialDisplayCorpus(agreementId?: string | null): boolean {
  const aid = (agreementId || "").trim();
  if (!aid) return false;
  const verified = readVerifiedCommercialDisplayCorpus(aid);
  return Boolean(verified && verified.corpusPlain.length >= 500);
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

/** Prepare/dispatch gate: verified GET corpus + accept must match display authority. */
export function canEnableCommercialPrepareFromServerSnapshot(agreementId?: string | null): boolean {
  const aid = (agreementId || "").trim();
  if (!aid) return false;
  if (!hasVerifiedCommercialDisplayCorpus(aid)) return false;
  const display = readDisplayReviewSnapshotAuthority(aid);
  const accepted = readAcceptedReviewSnapshotRef(aid);
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
  customerConfirmedAnswers?: string | null;
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
        customer_confirmed_answers: (args.customerConfirmedAnswers || "").trim() || null,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string } | string };
      return { ok: false, code: _errorCodeFromResponse(j, res.status) };
    }
    const j = await res.json();
    const snapshot = coerceCanonicalReviewSnapshot(j);
    if (!snapshot?.snapshot_id) return { ok: false, code: "snapshot_missing" };
    const registryVersion =
      j && typeof j === "object" && "registry_version" in j
        ? ((j as { registry_version?: number | null }).registry_version ?? null)
        : null;
    return { ok: true, snapshot, registryVersion };
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
    const j = await res.json();
    const snapshot = coerceCanonicalReviewSnapshot(j);
    if (!snapshot?.snapshot_id) return { ok: false, code: "snapshot_missing" };
    const root = j && typeof j === "object" ? (j as { status?: string; registry_version?: number | null }) : {};
    return {
      ok: true,
      status: root.status || snapshot.status || "pending",
      snapshot,
      registryVersion: root.registry_version ?? null,
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
let pendingPrepareHold: Promise<void> | null = null;
let releasePendingPrepareHold: (() => void) | null = null;

export function holdNextCommercialReviewSnapshotPrepare(): { release: () => void } {
  releaseCommercialReviewSnapshotPrepareHoldForTests();
  pendingPrepareHold = new Promise<void>((resolve) => {
    releasePendingPrepareHold = resolve;
  });
  return {
    release: () => {
      releasePendingPrepareHold?.();
      releasePendingPrepareHold = null;
    },
  };
}

export function releaseCommercialReviewSnapshotPrepareHoldForTests(): void {
  releasePendingPrepareHold?.();
  releasePendingPrepareHold = null;
  pendingPrepareHold = null;
}

export async function prepareCommercialReviewSnapshotAuthority(args: {
  agreementId: string;
  corpusPlain: string;
  generationSessionId?: string | null;
  requestId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  revisionId?: string | null;
  customerConfirmedAnswers?: string | null;
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

  const hold = pendingPrepareHold;
  pendingPrepareHold = null;
  if (hold) await hold;
  if (args.requestId) {
    const { paidProRevisionOperationAllowsPersist } = await import(
      "../components/agreements/paidProRevisionOperation"
    );
    if (
      !paidProRevisionOperationAllowsPersist({
        userId: args.userId || "",
        organizationId: args.organizationId || "",
        agreementId: id,
        revisionId: args.revisionId || "",
        requestId: args.requestId,
      })
    ) {
      return { ok: false, code: "stale_revision_operation" };
    }
  }

  const persisted = await persistCanonicalReviewSnapshot({
    agreementId: id,
    corpusPlain: corpus,
    generationSessionId: args.generationSessionId,
    createdBySession: args.generationSessionId,
    customerConfirmedAnswers: args.customerConfirmedAnswers,
  });
  if (!persisted.ok) return { ok: false, code: persisted.code };

  // Prefer GET as the sole review hydration authority (not POST response alone).
  const fetched = await fetchCanonicalReviewSnapshot({ agreementId: id });
  if (!fetched.ok) return { ok: false, code: fetched.code };

  const snap = fetched.snapshot;
  const getCorpus = (snap.corpus_plain || "").trim();
  // Fail closed if GET authority diverges from what we just persisted.
  if (
    snap.snapshot_id !== persisted.snapshot.snapshot_id ||
    snap.corpus_sha256.toLowerCase() !== persisted.snapshot.corpus_sha256.toLowerCase() ||
    snap.corpus_length !== persisted.snapshot.corpus_length ||
    getCorpus !== (persisted.snapshot.corpus_plain || "").trim()
  ) {
    return { ok: false, code: "persist_get_authority_mismatch" };
  }
  // Exact GET contract: digest + length must match the returned corpus bytes.
  const getDigest = await sha256CorpusDigest(getCorpus);
  if (
    getDigest !== snap.corpus_sha256.toLowerCase() ||
    Number(snap.corpus_length) !== getCorpus.length
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
  if (args.requestId) {
    const { paidProRevisionOperationAllowsDisplay } = await import(
      "../components/agreements/paidProRevisionOperation"
    );
    if (
      !paidProRevisionOperationAllowsDisplay({
        userId: args.userId || "",
        organizationId: args.organizationId || "",
        agreementId: id,
        revisionId: args.revisionId || "",
        requestId: args.requestId,
      })
    ) {
      return {
        ok: true,
        snapshot: snap,
        status: display.status,
        registryVersion: fetched.registryVersion ?? persisted.registryVersion ?? null,
        display,
      };
    }
  }
  storeVerifiedCommercialDisplayCorpus({
    ...display,
    corpusPlain: getCorpus,
  });
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
  const returnedId = String(snap.agreement_id || "").trim();
  if (!id || !returnedId || returnedId !== id) {
    return { ok: false, code: "agreement_id_mismatch" };
  }
  const getCorpus = (snap.corpus_plain || "").trim();
  const getDigest = await sha256CorpusDigest(getCorpus);
  if (
    !getCorpus ||
    getDigest !== String(snap.corpus_sha256 || "").toLowerCase() ||
    Number(snap.corpus_length) !== getCorpus.length
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
  storeVerifiedCommercialDisplayCorpus({
    ...display,
    corpusPlain: getCorpus,
  });
  if ((snap.customer_confirmed_answers || "").trim()) {
    const { restoreConfirmedContentAnswersFromVerifiedSnapshot } = await import(
      "../components/agreements/paidProConfirmedContentAnswers"
    );
    const { resolveCurrentUser } = await import("../account/currentUser");
    restoreConfirmedContentAnswersFromVerifiedSnapshot({
      userId: resolveCurrentUser().id,
      organizationId: getOrgId(),
      agreementId: id,
      revisionId: snap.corpus_sha256,
      answers: snap.customer_confirmed_answers,
      snapshotId: snap.snapshot_id,
      digest: snap.corpus_sha256,
    });
  }
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
