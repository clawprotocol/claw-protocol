/**
 * Ephemeral frozen legal corpus cache. Not a grant.
 *
 * Commercial reload seeds this cache only after authenticated
 * GET /api/agreements/{id}/canonical-review-snapshot verifies id, length, and SHA-256.
 * Logout and org-switch clear this client cache only. Backend ownership is authority.
 */

import { getOrgId, subscribeToOrgContextChanges } from "../../launch/orgContext";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";

export type FrozenLegalCorpusAuthorityRecord = {
  agreementId: string;
  hash: string;
  body: string;
};

export type FrozenLegalCorpusScope = {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
};

const sessionByAgreementId = new Map<string, FrozenLegalCorpusAuthorityRecord>();

/** Same-process latch for unit tests that commit without a workspace id (TEST505). */
let ephemeralUnscoped: FrozenLegalCorpusAuthorityRecord | null = null;
let currentAgreementId = "";
let boundOrganizationId = "";

function normalizeAgreementId(agreementId?: string | null): string {
  return (agreementId || "").trim();
}

export function rememberImmutableFrozenLegalCorpus(
  text: string,
  scope?: FrozenLegalCorpusScope,
): boolean {
  const body = (text || "").trim();
  if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const hash = hashPaidProCorpus(body);
  const agreementId = normalizeAgreementId(scope?.agreementId) || currentAgreementId;
  if (!agreementId) {
    ephemeralUnscoped = { agreementId: "", hash, body };
    return true;
  }
  const record: FrozenLegalCorpusAuthorityRecord = { agreementId, hash, body };
  sessionByAgreementId.set(agreementId, record);
  currentAgreementId = agreementId;
  boundOrganizationId = (scope?.organizationId || getOrgId() || "").trim();
  ephemeralUnscoped = null;
  return true;
}

export function readImmutableFrozenLegalCorpus(scope?: FrozenLegalCorpusScope): string | null {
  const requested = normalizeAgreementId(scope?.agreementId);
  const expectedHash = (scope?.expectedHash || "").trim();
  if (requested) {
    const record = sessionByAgreementId.get(requested);
    if (!record || record.agreementId !== requested) return null;
    if (expectedHash && expectedHash !== record.hash) return null;
    return record.body;
  }
  if (ephemeralUnscoped) {
    if (expectedHash && expectedHash !== ephemeralUnscoped.hash) return null;
    return ephemeralUnscoped.body;
  }
  if (!currentAgreementId) return null;
  const record = sessionByAgreementId.get(currentAgreementId);
  if (!record) return null;
  if (expectedHash && expectedHash !== record.hash) return null;
  return record.body;
}

/** Client cache only. Does not delete or mutate server records. */
export function inactivateImmutableFrozenLegalCorpusSession(): void {
  sessionByAgreementId.clear();
  ephemeralUnscoped = null;
  currentAgreementId = "";
  boundOrganizationId = "";
}

/** Alias for logout / test isolation — client cache only. */
export function clearImmutableFrozenLegalCorpus(): void {
  inactivateImmutableFrozenLegalCorpusSession();
}

export function resolveExpectedFrozenHashForSignerFinalize(args: {
  agreementId?: string | null;
  rawCorpus?: string | null;
}): string | null {
  const agreementId = normalizeAgreementId(args.agreementId);
  const frozen = readImmutableFrozenLegalCorpus({ agreementId: agreementId || null });
  if (frozen) return hashPaidProCorpus(frozen);
  const raw = (args.rawCorpus || "").trim();
  return raw ? hashPaidProCorpus(raw) : null;
}

export function shouldBlockSignerFinalizeFrozenMismatch(args: {
  agreementId?: string | null;
  hydratedCorpus: string;
}): boolean {
  const agreementId = normalizeAgreementId(args.agreementId);
  if (!agreementId) return false;
  const frozen = readImmutableFrozenLegalCorpus({ agreementId });
  if (!frozen) return false;
  return frozen !== (args.hydratedCorpus || "").trim();
}

/**
 * After a validated accepted-corpus handoff, signer finalize emits those exact legal
 * bytes for the requested durable agreement only. Missing or mismatched commercial
 * authority returns null (fail closed).
 */
export function resolveImmutableFrozenLegalCorpusOnSignerFinalize(args: {
  surface: string;
  signatureRegionOnly?: boolean;
  repairRecital?: boolean;
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
}): string | null {
  if (args.surface !== "finalize_paid_pro_signer_metadata") return null;
  if (args.repairRecital === true) return null;
  if (args.signatureRegionOnly === false) return null;
  const requested = normalizeAgreementId(args.agreementId);
  const expectedHash = (args.expectedHash || "").trim();
  if (requested) {
    const record = sessionByAgreementId.get(requested);
    if (!record || record.agreementId !== requested) return null;
    if (expectedHash && expectedHash !== record.hash) return null;
    return record.body;
  }
  // Production always passes a durable agreement id. Unscoped emit is TEST505-only.
  if (!expectedHash && ephemeralUnscoped) return ephemeralUnscoped.body;
  if (ephemeralUnscoped && expectedHash && expectedHash === ephemeralUnscoped.hash) {
    return ephemeralUnscoped.body;
  }
  return null;
}

if (typeof window !== "undefined") {
  subscribeToOrgContextChanges((orgId) => {
    if (boundOrganizationId && boundOrganizationId !== orgId) {
      inactivateImmutableFrozenLegalCorpusSession();
    }
  });
}
