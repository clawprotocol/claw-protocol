/**
 * Phase 3C — post-freeze signing handoff from injected durable snapshot only.
 */

import type { FrozenSigningAuthoritySnapshotV1 } from "./frozenSigningAuthoritySnapshot";
import type { SigningAuthorityLifecycleMode } from "./signingAuthorityLifecycle";
import { isPostFreezeLifecycle } from "./signingAuthorityLifecycle";
import { isIndividualPartyName } from "./guidedDealCompletion/signerPartyIdentity";
import type { PaidProSigningHandoffRecipient } from "./paidProSigningHandoffAuthority";

export function resolveSigningHandoffRecipientsFromSnapshot(
  snapshot: FrozenSigningAuthoritySnapshotV1,
): PaidProSigningHandoffRecipient[] {
  const signersByParty = new Map<string, typeof snapshot.signers>();
  for (const signer of snapshot.signers) {
    const list = signersByParty.get(signer.agreementPartyId) ?? [];
    list.push(signer);
    signersByParty.set(signer.agreementPartyId, list);
  }

  return [...snapshot.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((party) => {
      const signer =
        signersByParty.get(party.agreementPartyId)?.find((s) => s.requiresSignature) ??
        signersByParty.get(party.agreementPartyId)?.[0];
      const legalEntityName = party.legalEntityName.trim();
      return {
        partyLegalName: legalEntityName,
        signerName: signer?.signerName?.trim() ?? "",
        signerTitle: signer?.signerTitle?.trim() ?? "",
        email: signer?.signerEmail?.trim() ?? "",
        address: "",
        isIndividual: legalEntityName ? isIndividualPartyName(legalEntityName) : false,
      };
    })
    .filter((r) => r.partyLegalName.length >= 2);
}

export function resolveFrozenSignerForPartyIndexFromSnapshot(
  partyIndex: number,
  snapshot: FrozenSigningAuthoritySnapshotV1,
) {
  const party = snapshot.parties.find((p) => p.canonicalOrder === partyIndex);
  if (!party) return null;
  return snapshot.signers.find((s) => s.agreementPartyId === party.agreementPartyId) ?? null;
}

export function evaluatePostFreezeHandoffReadiness(args: {
  lifecycleMode: SigningAuthorityLifecycleMode;
  frozenSnapshot?: FrozenSigningAuthoritySnapshotV1 | null;
}): { ok: true; recipients: PaidProSigningHandoffRecipient[] } | { ok: false; reason: string } {
  if (!isPostFreezeLifecycle(args.lifecycleMode)) {
    return { ok: false, reason: "not_post_freeze" };
  }
  if (!args.frozenSnapshot?.parties.length) {
    return { ok: false, reason: "missing_durable_snapshot" };
  }
  const recipients = resolveSigningHandoffRecipientsFromSnapshot(args.frozenSnapshot);
  if (recipients.some((r) => !r.email.includes("@"))) {
    return { ok: false, reason: "incomplete_recipient_email" };
  }
  return { ok: true, recipients };
}
