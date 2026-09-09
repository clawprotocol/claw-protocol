/**
 * Agreement- and organization-bound frozen legal corpus authority.
 *
 * Session cache is never a grant. Reload restores only from server-authoritative
 * state after agreement, organization, and hash all match. Browser storage cannot
 * authorize a corpus. Logout and org-switch inactivate the session cache.
 */

import { isLegacySharedLocalOrg } from "../../auth/anonymousOwnerContext";
import { getOrgId, subscribeToOrgContextChanges } from "../../launch/orgContext";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";

export const FROZEN_LEGAL_SESSION_HANDOFF_AGREEMENT_ID = "session-handoff";

export type FrozenLegalCorpusAuthorityRecord = {
  agreementId: string;
  organizationId: string;
  hash: string;
  body: string;
};

export type FrozenLegalCorpusScope = {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
};

export type RestoreFrozenLegalCorpusResult =
  | { ok: true; body: string; hash: string }
  | { ok: false; reason: FrozenLegalCorpusAuthorityFailure };

export type FrozenLegalCorpusAuthorityFailure =
  | "missing_authority"
  | "unauthorized_scope"
  | "server_authority_missing"
  | "agreement_mismatch"
  | "organization_mismatch"
  | "hash_mismatch";

export type FrozenLegalCorpusServerAuthority = {
  read(args: { agreementId: string; organizationId: string }): FrozenLegalCorpusAuthorityRecord | null;
  write(record: FrozenLegalCorpusAuthorityRecord): void;
  clear(): void;
};

const sessionByKey = new Map<string, FrozenLegalCorpusAuthorityRecord>();
const serverByKey = new Map<string, FrozenLegalCorpusAuthorityRecord>();

let currentAgreementId = "";
let currentOrganizationId = "";
let serverAuthority: FrozenLegalCorpusServerAuthority = createInProcessServerAuthority();

function scopeKey(agreementId: string, organizationId: string): string {
  return `${organizationId}\0${agreementId}`;
}

function createInProcessServerAuthority(): FrozenLegalCorpusServerAuthority {
  return {
    read(args) {
      const agreementId = args.agreementId.trim();
      const organizationId = args.organizationId.trim();
      if (!agreementId || !organizationId) return null;
      const record = serverByKey.get(scopeKey(agreementId, organizationId));
      if (!record) return null;
      if (record.agreementId !== agreementId || record.organizationId !== organizationId) return null;
      return { ...record };
    },
    write(record) {
      serverByKey.set(scopeKey(record.agreementId, record.organizationId), { ...record });
    },
    clear() {
      serverByKey.clear();
    },
  };
}

function normalizeOrganizationId(organizationId?: string | null): string {
  return (organizationId || getOrgId() || "").trim();
}

function isServerPersistableScope(agreementId: string, organizationId: string): boolean {
  if (!agreementId || agreementId === FROZEN_LEGAL_SESSION_HANDOFF_AGREEMENT_ID) return false;
  if (!organizationId || isLegacySharedLocalOrg(organizationId)) return false;
  return organizationId.startsWith("user-");
}

export function rememberImmutableFrozenLegalCorpus(
  text: string,
  scope?: FrozenLegalCorpusScope,
): boolean {
  const body = (text || "").trim();
  if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  const organizationId = normalizeOrganizationId(scope?.organizationId);
  if (!organizationId) return false;
  const agreementId =
    (scope?.agreementId || currentAgreementId || FROZEN_LEGAL_SESSION_HANDOFF_AGREEMENT_ID).trim();
  if (!agreementId) return false;
  const hash = hashPaidProCorpus(body);
  const record: FrozenLegalCorpusAuthorityRecord = {
    agreementId,
    organizationId,
    hash,
    body,
  };
  sessionByKey.set(scopeKey(agreementId, organizationId), record);
  currentAgreementId = agreementId;
  currentOrganizationId = organizationId;
  if (isServerPersistableScope(agreementId, organizationId)) {
    serverAuthority.write(record);
  }
  return true;
}

export function readImmutableFrozenLegalCorpus(scope?: FrozenLegalCorpusScope): string | null {
  const organizationId = normalizeOrganizationId(scope?.organizationId);
  const agreementId = (scope?.agreementId || currentAgreementId || "").trim();
  if (!organizationId || !agreementId) return null;
  const record = sessionByKey.get(scopeKey(agreementId, organizationId));
  if (!record) return null;
  if (record.agreementId !== agreementId || record.organizationId !== organizationId) return null;
  const expectedHash = (scope?.expectedHash || "").trim();
  if (expectedHash && expectedHash !== record.hash) return null;
  return record.body;
}

export function inactivateImmutableFrozenLegalCorpusSession(): void {
  sessionByKey.clear();
  currentAgreementId = "";
  currentOrganizationId = "";
}

export function clearImmutableFrozenLegalCorpus(): void {
  inactivateImmutableFrozenLegalCorpusSession();
  serverAuthority.clear();
}

export function installFrozenLegalCorpusServerAuthorityForTests(
  next?: FrozenLegalCorpusServerAuthority | null,
): void {
  serverAuthority = next ?? createInProcessServerAuthority();
}

/**
 * Reload/reopen grant. Browser storage is ignored. Server record must match
 * agreement, organization, and hash.
 */
export function restoreImmutableFrozenLegalCorpusFromServerAuthority(args: {
  agreementId?: string | null;
  organizationId?: string | null;
  expectedHash?: string | null;
}): RestoreFrozenLegalCorpusResult {
  const agreementId = (args.agreementId || "").trim();
  const organizationId = (args.organizationId || "").trim();
  const expectedHash = (args.expectedHash || "").trim();
  if (!agreementId || !organizationId || !expectedHash) {
    return { ok: false, reason: "missing_authority" };
  }
  if (!isServerPersistableScope(agreementId, organizationId)) {
    return { ok: false, reason: "unauthorized_scope" };
  }
  const server = serverAuthority.read({ agreementId, organizationId });
  if (!server) return { ok: false, reason: "server_authority_missing" };
  if (server.agreementId !== agreementId) return { ok: false, reason: "agreement_mismatch" };
  if (server.organizationId !== organizationId) return { ok: false, reason: "organization_mismatch" };
  if (server.hash !== expectedHash) return { ok: false, reason: "hash_mismatch" };
  sessionByKey.set(scopeKey(agreementId, organizationId), server);
  currentAgreementId = agreementId;
  currentOrganizationId = organizationId;
  return { ok: true, body: server.body, hash: server.hash };
}

/**
 * After a validated accepted-corpus handoff, signer finalize emits those exact legal
 * bytes for the requested agreement and organization only.
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
  const organizationId = normalizeOrganizationId(args.organizationId);
  if (!organizationId) return null;
  const requestedAgreementId = (args.agreementId || "").trim();
  const agreementId = requestedAgreementId || currentAgreementId || FROZEN_LEGAL_SESSION_HANDOFF_AGREEMENT_ID;
  const record = sessionByKey.get(scopeKey(agreementId, organizationId));
  if (!record) return null;
  if (record.agreementId !== agreementId || record.organizationId !== organizationId) return null;
  if (requestedAgreementId && record.agreementId !== requestedAgreementId) return null;
  const expectedHash = (args.expectedHash || "").trim();
  if (expectedHash && expectedHash !== record.hash) return null;
  return record.body;
}

if (typeof window !== "undefined") {
  subscribeToOrgContextChanges((orgId) => {
    if (currentOrganizationId && currentOrganizationId !== orgId) {
      inactivateImmutableFrozenLegalCorpusSession();
    }
  });
}
