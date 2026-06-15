import type { Vs01CanonicalPacketPortableRole } from "./vs01CanonicalPacketSeed";
import { filterPacketManifestFieldsForRole } from "./vs01SigningPacketManifest";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import type { Vs01RecipientPlacedField } from "./types";

/** Parse `vs01r:…:i{N}:…` party index when portable roles are unavailable. */
export function partyIndexFromSignerRoleId(signerRoleId: string | null | undefined): number | null {
  const raw = (signerRoleId ?? "").trim();
  const m = raw.match(/:i(\d+):/);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function portableRoleToPrepareRole(role: Vs01CanonicalPacketPortableRole): Vs01PrepareSigningRole {
  return {
    roleId: role.roleId,
    partyIndex: role.partyIndex,
    partyId: role.partyId,
    entityName: role.entityName,
    partyName: role.partyName,
    roleLabel: role.roleLabel,
    signerName: role.signerName,
    signerTitle: role.signerTitle,
    signerEmail: role.signerEmail,
    reviewEmail: role.reviewEmail,
    isEntityParty: role.isEntityParty,
    requiresSignature: role.requiresSignature,
    vs01CounterpartyId: role.vs01CounterpartyId,
    kind: role.kind,
  };
}

/**
 * Scope a manifest to exactly one signer — never hydrate the full packet for a deep link.
 * When {@link lockedSignerRoleId} is set, counterparty-only fallback is not used.
 */
export function scopeRecipientManifestToLockedSigner(args: {
  fields: readonly Vs01RecipientPlacedField[];
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  portableRoles?: readonly Vs01CanonicalPacketPortableRole[];
}): Vs01RecipientPlacedField[] {
  const lock = (args.lockedSignerRoleId ?? "").trim();
  const lockedCp = args.lockedCounterpartyId.trim();
  if (!args.fields.length) return [];

  if (lock) {
    const portableRole = args.portableRoles?.find((r) => r.roleId === lock);
    if (portableRole) {
      return filterPacketManifestFieldsForRole(args.fields, portableRoleToPrepareRole(portableRole));
    }
    return args.fields.filter((f) => {
      const eff = (f.assignedSignerRoleId ?? "").trim();
      if (eff) return eff === lock;
      const partyIdx = partyIndexFromSignerRoleId(lock);
      if (partyIdx != null && f.assignedPartyIndex != null) {
        return f.assignedPartyIndex === partyIdx;
      }
      return !eff && f.counterpartyId.trim() === lockedCp;
    });
  }

  return args.fields.filter((f) => f.counterpartyId.trim() === lockedCp);
}
