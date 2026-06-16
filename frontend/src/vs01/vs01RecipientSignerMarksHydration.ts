/**
 * Hydrate prior signer signature marks into portable corpus + packet status for recipient view.
 */

import {
  applySignerCompletionToPortablePacket,
  signatureTextForSignerRole,
} from "./vs01FullyExecutedSignedSnapshot";
import {
  storeVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import { todayIsoDateLocal } from "./vs01FieldValueResolution";
import { patchSignerPacketStatus } from "./vs01SigningPacketStatusStore";

/** True only when packet explicitly enabled initials (initialsOnEachPage / initialsPolicy). */
export function isVs01InitialsEnabledForPacket(
  portable: Pick<Vs01CanonicalPacketPortableV1, "initialsPolicy"> | null | undefined,
): boolean {
  return portable?.initialsPolicy?.enabled === true;
}

/**
 * Burn field-level signature values into corpus and bootstrap packet status for completed signers.
 */
export function hydratePortableSignerMarksForRecipientView(args: {
  portable: Vs01CanonicalPacketPortableV1;
  agreementId: string;
  documentId: string;
}): Vs01CanonicalPacketPortableV1 {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  if (!agreementId || !documentId) return args.portable;

  let portable = args.portable;
  const roleKeys = portable.roles.map((r) => r.roleId).filter(Boolean);
  let mutated = false;

  for (const role of portable.roles) {
    const rid = (role.roleId ?? "").trim();
    if (!rid) continue;
    const sig = signatureTextForSignerRole(portable.fields, rid);
    if (!sig) continue;

    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId,
      documentId,
      signerRoleId: rid,
      partyIndex: role.partyIndex ?? 0,
      signingDateIso: todayIsoDateLocal(),
      signatureText: sig,
      recipientFields: portable.fields,
    });
    if (applied.signatureStamped || applied.corpusStamped) {
      portable = applied.portable;
      mutated = true;
    }
    patchSignerPacketStatus(agreementId, rid, "signed", roleKeys);
  }

  if (mutated) {
    storeVs01CanonicalPacketPortable(documentId, portable);
  }
  return portable;
}
