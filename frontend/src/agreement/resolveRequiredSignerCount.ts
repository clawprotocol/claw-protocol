import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";

export type ResolveRequiredSignerCountArgs = {
  /** Public verify `signature_status.signer_party_count`. */
  signerPartyCount?: number | null;
  /** Workspace index `signer_count`. */
  signerCount?: number | null;
  /** Workspace index `party_count`. */
  partyCount?: number | null;
  /** VS01 handoff signer rows (excludes owner role id when tracked separately). */
  handoffSignerCount?: number | null;
  /** Portable packet roles requiring signature. */
  portableRequiredRoleCount?: number | null;
  /** Local packet status keys (owner + counterparties). */
  packetStatusSignerKeyCount?: number | null;
};

/**
 * Authoritative required signer count for dashboard / status surfaces.
 * Never floors at 2 — two-party is the common default only when no signal exists.
 */
export function resolveRequiredSignerCount(args: ResolveRequiredSignerCountArgs): number {
  const candidates = [
    args.signerPartyCount,
    args.portableRequiredRoleCount,
    args.packetStatusSignerKeyCount,
    args.handoffSignerCount != null && args.handoffSignerCount > 0
      ? args.handoffSignerCount
      : null,
    args.signerCount,
    args.partyCount,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }
  return 2;
}

export function countRequiredSignersFromHandoff(handoff: PaidProVs01PostSignHandoffV1 | null | undefined): number {
  if (!handoff) return 0;
  const ownerRoleId = (handoff.ownerSignerRoleId || "").trim();
  const signerRows = handoff.signers?.length ?? 0;
  if (ownerRoleId) return signerRows + 1;
  return signerRows;
}

export function countRequiredSignersFromPortableRoles(
  roles: ReadonlyArray<{ requiresSignature?: boolean | null }> | null | undefined,
): number {
  if (!roles?.length) return 0;
  return roles.filter((r) => r.requiresSignature !== false).length;
}
