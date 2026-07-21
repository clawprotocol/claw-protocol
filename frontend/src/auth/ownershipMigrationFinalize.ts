/**
 * Post-auth ownership migration — server-authoritative agreement ID rebind.
 * Client session markers aid continuity; migrated agreement IDs from finalize-auth / bind-user-org are SSOT.
 */

import {
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "../components/agreements/agreementIntakeStorage";

const RECEIPT_KEY = "claw_ownership_migration_receipt_v1";

export type OwnershipMigrationReceipt = {
  canonicalAgreementId: string;
  migratedAgreementIds: string[];
  supersededAgreementIds: string[];
  migrationEpoch: number;
};

export function resolveCanonicalMigratedAgreementId(args: {
  migratedAgreementIds: string[];
  continuationAgreementId?: string | null;
  priorClientAgreementId?: string | null;
}): string | null {
  const migrated = args.migratedAgreementIds.map((id) => id.trim()).filter(Boolean);
  const continuation = (args.continuationAgreementId || "").trim();
  const prior = (args.priorClientAgreementId || readCreateReviewAgreementResumeId() || "").trim();

  if (migrated.length === 0) {
    return continuation || prior || null;
  }
  if (continuation && migrated.includes(continuation)) return continuation;
  if (prior && migrated.includes(prior)) return prior;
  return migrated[0] ?? null;
}

export function commitPostAuthOwnershipMigration(args: {
  migratedAgreementIds: string[];
  continuationAgreementId?: string | null;
  priorClientAgreementId?: string | null;
}): OwnershipMigrationReceipt | null {
  const prior = (args.priorClientAgreementId || readCreateReviewAgreementResumeId() || "").trim();
  const canonical = resolveCanonicalMigratedAgreementId(args);
  if (!canonical) return null;

  const receipt: OwnershipMigrationReceipt = {
    canonicalAgreementId: canonical,
    migratedAgreementIds: args.migratedAgreementIds.map((id) => id.trim()).filter(Boolean),
    supersededAgreementIds: prior && prior !== canonical ? [prior] : [],
    migrationEpoch: Date.now(),
  };

  writeCreateReviewAgreementResumeId(receipt.canonicalAgreementId);
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt));
    } catch {
      /* ignore */
    }
  }
  return receipt;
}

export function readOwnershipMigrationReceipt(): OwnershipMigrationReceipt | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnershipMigrationReceipt;
    if (!parsed?.canonicalAgreementId?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOwnershipMigrationReceipt(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(RECEIPT_KEY);
  } catch {
    /* ignore */
  }
}

export function isSupersededAgreementId(id: string | null | undefined): boolean {
  const tid = (id || "").trim();
  if (!tid) return false;
  const receipt = readOwnershipMigrationReceipt();
  if (!receipt) return false;
  return receipt.supersededAgreementIds.includes(tid);
}

/** Block draft POST/ensure against stale anonymous IDs until rebind completes. */
export function shouldBlockDraftWriteForOwnershipTransition(agreementId: string | null | undefined): boolean {
  const tid = (agreementId || "").trim();
  if (!tid) return Boolean(readOwnershipMigrationReceipt());
  return isSupersededAgreementId(tid);
}

export type ApplyOwnershipMigrationClientArgs = {
  reviewAgreementIdRef: { current: string | null };
  setReviewAgreementId: (id: string | null) => void;
  invalidateWorkspaceSession: () => void;
  clearEnsurePromise: () => void;
};

/** Apply pending migration synchronously (useLayoutEffect). Returns true when applied. */
export function applyPendingOwnershipMigrationToClient(
  args: ApplyOwnershipMigrationClientArgs,
): OwnershipMigrationReceipt | null {
  const receipt = readOwnershipMigrationReceipt();
  if (!receipt) return null;

  const current = (args.reviewAgreementIdRef.current || readCreateReviewAgreementResumeId() || "").trim();
  const canonical = receipt.canonicalAgreementId.trim();

  if (current && current === canonical) {
    clearOwnershipMigrationReceipt();
    return receipt;
  }

  if (current && receipt.supersededAgreementIds.includes(current)) {
    args.invalidateWorkspaceSession();
    args.clearEnsurePromise();
  }

  writeCreateReviewAgreementResumeId(canonical);
  args.reviewAgreementIdRef.current = canonical;
  args.setReviewAgreementId(canonical);
  clearOwnershipMigrationReceipt();
  return receipt;
}
