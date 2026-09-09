/**
 * Ephemeral frozen legal corpus cache. Not a grant.
 *
 * Every commercial read/write requires an explicit durable agreement ID and the
 * current organization. The cache is keyed by organization plus agreement.
 * Organization is defense-in-depth partitioning only. Backend GET ownership
 * remains authorization.
 *
 * Logout and org-switch clear this client cache only.
 */

import { getOrgId, subscribeToOrgContextChanges } from "../../launch/orgContext";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";

export type FrozenLegalCorpusAuthorityRecord = {
  organizationId: string;
  agreementId: string;
  hash: string;
  body: string;
};

export type FrozenLegalCorpusScope = {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
};

const sessionByOrgAndAgreement = new Map<string, FrozenLegalCorpusAuthorityRecord>();

function normalizeId(value?: string | null): string {
  return (value || "").trim();
}

export function resolveFrozenLegalCorpusScope(
  scope?: FrozenLegalCorpusScope | null,
): { agreementId: string; organizationId: string } | null {
  const agreementId = normalizeId(scope?.agreementId);
  const organizationId = normalizeId(scope?.organizationId) || normalizeId(getOrgId());
  if (!agreementId || !organizationId) return null;
  return { agreementId, organizationId };
}

function frozenCorpusCacheKey(organizationId: string, agreementId: string): string {
  return `${organizationId}\u0000${agreementId}`;
}

export function rememberImmutableFrozenLegalCorpus(
  text: string,
  scope?: FrozenLegalCorpusScope,
): boolean {
  const resolved = resolveFrozenLegalCorpusScope(scope);
  if (!resolved) return false;
  const body = (text || "").trim();
  if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const record: FrozenLegalCorpusAuthorityRecord = {
    organizationId: resolved.organizationId,
    agreementId: resolved.agreementId,
    hash: hashPaidProCorpus(body),
    body,
  };
  sessionByOrgAndAgreement.set(
    frozenCorpusCacheKey(resolved.organizationId, resolved.agreementId),
    record,
  );
  return true;
}

export function readImmutableFrozenLegalCorpusRecord(
  scope?: FrozenLegalCorpusScope,
): FrozenLegalCorpusAuthorityRecord | null {
  const resolved = resolveFrozenLegalCorpusScope(scope);
  if (!resolved) return null;
  const record = sessionByOrgAndAgreement.get(
    frozenCorpusCacheKey(resolved.organizationId, resolved.agreementId),
  );
  if (!record) return null;
  if (record.agreementId !== resolved.agreementId) return null;
  if (record.organizationId !== resolved.organizationId) return null;
  const expectedHash = normalizeId(scope?.expectedHash);
  if (expectedHash && expectedHash !== record.hash) return null;
  return record;
}

export function readImmutableFrozenLegalCorpus(scope?: FrozenLegalCorpusScope): string | null {
  return readImmutableFrozenLegalCorpusRecord(scope)?.body ?? null;
}

/** Client cache only. Does not delete or mutate server records. */
export function inactivateImmutableFrozenLegalCorpusSession(): void {
  sessionByOrgAndAgreement.clear();
}

/** Alias for logout / test isolation — client cache only. */
export function clearImmutableFrozenLegalCorpus(): void {
  inactivateImmutableFrozenLegalCorpusSession();
}

export function resolveExpectedFrozenHashForSignerFinalize(args: {
  agreementId?: string | null;
  organizationId?: string | null;
}): string | null {
  return readImmutableFrozenLegalCorpusRecord({
    agreementId: args.agreementId,
    organizationId: args.organizationId,
  })?.hash ?? null;
}

export function shouldBlockSignerFinalizeFrozenMismatch(args: {
  agreementId?: string | null;
  organizationId?: string | null;
  hydratedCorpus: string;
}): boolean {
  const record = readImmutableFrozenLegalCorpusRecord({
    agreementId: args.agreementId,
    organizationId: args.organizationId,
  });
  if (!record) return true;
  return record.body !== (args.hydratedCorpus || "").trim();
}

/**
 * After a validated accepted-corpus handoff, signer finalize emits those exact legal
 * bytes for the requested organization plus durable agreement only. Missing or
 * mismatched commercial authority returns null (fail closed).
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
  return readImmutableFrozenLegalCorpusRecord({
    agreementId: args.agreementId,
    organizationId: args.organizationId,
    expectedHash: args.expectedHash,
  })?.body ?? null;
}

if (typeof window !== "undefined") {
  subscribeToOrgContextChanges(() => {
    inactivateImmutableFrozenLegalCorpusSession();
  });
}
