import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

const CACHE_PREFIX = "claw_backend_accepted_corpus_v1:";

export type AcceptedCorpusAuthority = {
  agreement_id: string;
  version_id: string;
  corpus_sha256: string;
  accepted_at: string;
  authority_state: "accepted";
  legal_parties?: Array<{
    agreement_party_id: string;
    legal_entity_name: string;
    agreement_role: string;
    canonical_order: number;
  }>;
};

export function shouldCreateBackendAcceptedCorpus(args: {
  reviewFirstHandoffPersist: boolean;
  premiumSendIntent?: "review" | "signature" | null;
}): boolean {
  return (
    args.reviewFirstHandoffPersist ||
    args.premiumSendIntent === "review" ||
    args.premiumSendIntent === "signature"
  );
}

export function normalizeAcceptedCorpusAuthority(
  raw: unknown,
  expectedAgreementId?: string,
): AcceptedCorpusAuthority | null {
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as Record<string, unknown>;
  const value =
    outer.accepted_version && typeof outer.accepted_version === "object"
      ? (outer.accepted_version as Record<string, unknown>)
      : outer;
  const agreementId = String(value.agreement_id ?? "").trim();
  const versionId = String(value.version_id ?? "").trim();
  const corpusSha256 = String(value.corpus_sha256 ?? "").trim().toLowerCase();
  const acceptedAt = String(value.accepted_at ?? "").trim();
  const state = String(value.authority_state ?? "").trim();
  const rawLegalParties = Array.isArray(value.legal_parties) ? value.legal_parties : null;
  const legalParties = rawLegalParties
    ? rawLegalParties
        .map((raw, index) => {
          if (!raw || typeof raw !== "object") return null;
          const party = raw as Record<string, unknown>;
          const agreementPartyId = String(party.agreement_party_id ?? "").trim();
          const legalEntityName = String(party.legal_entity_name ?? "").trim();
          const canonicalOrder = party.canonical_order;
          if (
            !agreementPartyId ||
            !legalEntityName ||
            canonicalOrder !== index
          ) {
            return null;
          }
          return {
            agreement_party_id: agreementPartyId,
            legal_entity_name: legalEntityName,
            agreement_role: String(party.agreement_role ?? "party").trim() || "party",
            canonical_order: canonicalOrder,
          };
        })
        .filter((party) => party !== null)
    : undefined;
  if (rawLegalParties && legalParties?.length !== rawLegalParties.length) return null;
  if (
    !agreementId ||
    !versionId.startsWith("av_") ||
    !/^[a-f0-9]{64}$/.test(corpusSha256) ||
    !acceptedAt ||
    state !== "accepted"
  ) {
    return null;
  }
  if (expectedAgreementId?.trim() && agreementId !== expectedAgreementId.trim()) {
    return null;
  }
  return {
    agreement_id: agreementId,
    version_id: versionId,
    corpus_sha256: corpusSha256,
    accepted_at: acceptedAt,
    authority_state: "accepted",
    ...(legalParties ? { legal_parties: legalParties } : {}),
  };
}

export function retainAcceptedCorpusAuthority(authority: AcceptedCorpusAuthority): void {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${authority.agreement_id}`, JSON.stringify(authority));
  } catch {
    // Browser continuity is best-effort; the backend row remains authoritative.
  }
}

export function clearRetainedAcceptedCorpusAuthority(agreementId: string): void {
  const aid = agreementId.trim();
  if (!aid) return;
  try {
    sessionStorage.removeItem(`${CACHE_PREFIX}${aid}`);
  } catch {
    // Browser continuity is best-effort; the backend row remains authoritative.
  }
}

export function readRetainedAcceptedCorpusAuthority(
  agreementId: string,
): AcceptedCorpusAuthority | null {
  const aid = agreementId.trim();
  if (!aid) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${aid}`);
    return raw ? normalizeAcceptedCorpusAuthority(JSON.parse(raw), aid) : null;
  } catch {
    return null;
  }
}

export function resolveAcceptedCorpusLockAuthority(
  agreementId: string,
  authority: AcceptedCorpusAuthority | null | undefined,
): { accepted_version_id: string; corpus_sha256: string } | null {
  const normalized = normalizeAcceptedCorpusAuthority(authority, agreementId);
  if (!normalized) return null;
  return {
    accepted_version_id: normalized.version_id,
    corpus_sha256: normalized.corpus_sha256,
  };
}

export async function acceptPersistedPaidProCorpus(
  agreementId: string,
  options?: { retain?: boolean },
): Promise<AcceptedCorpusAuthority> {
  const aid = agreementId.trim();
  if (!aid) throw new Error("accepted_corpus_missing_agreement_id");
  const base = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(
    `${base}/api/agreements/${encodeURIComponent(aid)}/accepted-corpus`,
    {
      method: "POST",
      headers: clawAgreementHeaders({
        "Content-Type": "application/json",
        "X-Claw-Review-First-Persist": "1",
      }),
      body: "{}",
    },
  );
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      raw && typeof raw === "object" && "detail" in raw
        ? String((raw as { detail?: unknown }).detail ?? "")
        : "";
    throw new Error(detail || `accepted_corpus_http_${res.status}`);
  }
  const authority = normalizeAcceptedCorpusAuthority(raw, aid);
  if (!authority) throw new Error("accepted_corpus_malformed_response");
  if (options?.retain !== false) retainAcceptedCorpusAuthority(authority);
  return authority;
}

export type AcceptedCorpusPersistenceBoundary = {
  activateSession(session: number): void;
  ensure(
    session: number,
    persist: () => Promise<AcceptedCorpusAuthority>,
    callbacks?: {
      onAccepted?: (authority: AcceptedCorpusAuthority) => void;
      onRejected?: (error: unknown) => void;
    },
  ): Promise<AcceptedCorpusAuthority>;
  currentPromise(session: number): Promise<AcceptedCorpusAuthority> | null;
  currentAuthority(session: number): AcceptedCorpusAuthority | null;
};

/**
 * Owns the one backend-acceptance operation for the active review workspace.
 * A completed authority is reused for identical later continuations; activating
 * a new session detaches stale work without allowing it to publish authority.
 */
export function createAcceptedCorpusPersistenceBoundary(
  initialSession = 0,
): AcceptedCorpusPersistenceBoundary {
  let activeSession = initialSession;
  let inFlight: Promise<AcceptedCorpusAuthority> | null = null;
  let authority: AcceptedCorpusAuthority | null = null;

  const activateSession = (session: number) => {
    if (session === activeSession) return;
    activeSession = session;
    inFlight = null;
    authority = null;
  };

  return {
    activateSession,
    ensure(session, persist, callbacks) {
      activateSession(session);
      if (authority) return Promise.resolve(authority);
      if (inFlight) return inFlight;

      let tracked!: Promise<AcceptedCorpusAuthority>;
      tracked = Promise.resolve()
        .then(persist)
        .then(
          (accepted) => {
            if (activeSession !== session || inFlight !== tracked) {
              throw new Error("accepted_corpus_stale_review_session");
            }
            authority = accepted;
            callbacks?.onAccepted?.(accepted);
            return accepted;
          },
          (error: unknown) => {
            if (activeSession === session && inFlight === tracked) {
              authority = null;
              callbacks?.onRejected?.(error);
            }
            throw error;
          },
        )
        .finally(() => {
          if (activeSession === session && inFlight === tracked) {
            inFlight = null;
          }
        });
      inFlight = tracked;
      // Canonical review may render while this tracked promise is pending.
      // Attach an observer now so a rejection is handled even before a send action awaits it.
      tracked.catch(() => undefined);
      return tracked;
    },
    currentPromise(session) {
      return session === activeSession ? inFlight : null;
    },
    currentAuthority(session) {
      return session === activeSession ? authority : null;
    },
  };
}
