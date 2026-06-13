/**
 * Apply server-fetched VS01 portable packet to recipient session (local cache + field hydration).
 */

import { VS01_PACKET_MANIFEST_SCOPE, storeRecipientManifest } from "./StepReceipt";
import type { Vs01RecipientPlacedField } from "./types";
import {
  storeVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketSeed,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import { fetchPublicVs01SigningPacket } from "./vs01SigningPacketServer";
import {
  counterpartiesFromRecipientManifestFields,
  ensureRecipientFieldDefaults,
  normalizeRecipientManifestCounterparties,
} from "./recipientManifestUrl";
import { filterPacketManifestFieldsForRole } from "./vs01SigningPacketManifest";
import { hydrateRecipientSigningFields } from "./recipientSigningFieldUtils";
import type { Vs01Counterparty } from "./types";

export type Vs01RecipientServerHydrationResult = {
  ok: boolean;
  fields: Vs01RecipientPlacedField[];
  counterparties: Vs01Counterparty[];
  source: "server_packet" | "miss";
  inviteSuperseded?: boolean;
  inviteSupersededMessage?: string;
};

function hydrateFieldsFromPortable(args: {
  portable: Vs01CanonicalPacketPortableV1;
  documentId: string;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  recipientName: string;
  recipientEmail: string;
}): Vs01RecipientServerHydrationResult {
  const { portable, documentId, lockedCounterpartyId, lockedSignerRoleId, recipientName, recipientEmail } =
    args;
  storeVs01CanonicalPacketPortable(documentId, portable);
  storeVs01CanonicalPacketSeed(portable.seed);
  const manifestFields = portable.initialsPolicy.enabled
    ? portable.fields
    : portable.fields.filter((f) => f.type !== "initials");
  storeRecipientManifest(documentId, VS01_PACKET_MANIFEST_SCOPE, manifestFields);

  const role =
    portable.roles.find((r) => r.roleId === lockedSignerRoleId) ??
    portable.roles.find((r) => r.vs01CounterpartyId === lockedCounterpartyId) ??
    null;
  const scoped = role
    ? filterPacketManifestFieldsForRole(manifestFields, {
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
      })
    : manifestFields.filter((f) => f.counterpartyId.trim() === lockedCounterpartyId);

  const normalized = normalizeRecipientManifestCounterparties(scoped, lockedCounterpartyId);
  const cps = counterpartiesFromRecipientManifestFields(
    normalized,
    lockedCounterpartyId,
    recipientName,
    recipientEmail,
  );
  const cpMap = new Map(cps.map((c) => [c.id, c]));
  const fields = hydrateRecipientSigningFields(
    ensureRecipientFieldDefaults(normalized, recipientName, recipientEmail, {
      signerName: cps.find((c) => c.id === lockedCounterpartyId)?.signerName,
    }),
    cpMap,
  );
  return { ok: fields.length > 0, fields, counterparties: cps, source: fields.length > 0 ? "server_packet" : "miss" };
}

export function applyVs01PortablePacketToRecipientSession(args: {
  portable: Vs01CanonicalPacketPortableV1;
  documentId: string;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  recipientName: string;
  recipientEmail: string;
}): Vs01RecipientServerHydrationResult {
  return hydrateFieldsFromPortable(args);
}

export async function hydrateVs01RecipientFromServerPacket(args: {
  agreementId: string;
  documentId: string;
  packetRevision?: string | null;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  recipientName: string;
  recipientEmail: string;
}): Promise<Vs01RecipientServerHydrationResult> {
  const portableResult = await fetchPublicVs01SigningPacket({
    agreementId: args.agreementId,
    documentId: args.documentId,
    packetRevision: args.packetRevision,
    recipientEmail: args.recipientEmail,
    participantId: args.lockedCounterpartyId,
  });
  if (!portableResult.ok) {
    if (portableResult.reason === "invite_superseded") {
      return {
        ok: false,
        fields: [],
        counterparties: [],
        source: "miss",
        inviteSuperseded: true,
        inviteSupersededMessage: portableResult.message,
      };
    }
    return { ok: false, fields: [], counterparties: [], source: "miss" };
  }
  return hydrateFieldsFromPortable({
    portable: portableResult.portable,
    documentId: args.documentId,
    lockedCounterpartyId: args.lockedCounterpartyId,
    lockedSignerRoleId: args.lockedSignerRoleId,
    recipientName: args.recipientName,
    recipientEmail: args.recipientEmail,
  });
}
