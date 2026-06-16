/**
 * Apply server-fetched VS01 portable packet to recipient session (local cache + field hydration).
 */

import { VS01_PACKET_MANIFEST_SCOPE, storeRecipientManifest } from "./StepReceipt";
import type { Vs01RecipientPlacedField } from "./types";
import {
  markVs01CanonicalPacketFromServer,
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
import {
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  stripLockedSignerEditableValuesOnHydrate,
} from "./recipientSigningFieldUtils";
import { patchSignerPacketStatus } from "./vs01SigningPacketStatusStore";
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
  markVs01CanonicalPacketFromServer(documentId);
  const manifestFields = portable.initialsPolicy.enabled
    ? portable.fields
    : portable.fields.filter((f) => f.type !== "initials");
  storeRecipientManifest(documentId, VS01_PACKET_MANIFEST_SCOPE, manifestFields);

  const role =
    (lockedSignerRoleId?.trim()
      ? portable.roles.find((r) => r.roleId === lockedSignerRoleId.trim())
      : null) ?? null;
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
    : lockedSignerRoleId?.trim()
      ? manifestFields.filter((f) => (f.assignedSignerRoleId ?? "").trim() === lockedSignerRoleId.trim())
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
    stripLockedSignerEditableValuesOnHydrate(
      ensureRecipientFieldDefaults(normalized, recipientName, recipientEmail, {
        signerName: cps.find((c) => c.id === lockedCounterpartyId)?.signerName,
      }),
      portable.seed.agreementId,
      lockedSignerRoleId,
      { hydrationSource: "server_packet" },
    ),
    cpMap,
    { preserveEditableValues: true },
  );

  const lock = (lockedSignerRoleId ?? "").trim();
  if (lock && portable.seed.agreementId.trim()) {
    const hasPersistedSignature = fields.some(
      (f) =>
        isRecipientSigningEditableType(f.type) &&
        (f.assignedSignerRoleId ?? "").trim() === lock &&
        typeof f.value === "string" &&
        f.value.trim().length > 0,
    );
    if (hasPersistedSignature) {
      const roleKeys = portable.roles.map((r) => r.roleId).filter(Boolean);
      patchSignerPacketStatus(portable.seed.agreementId, lock, "signed", roleKeys);
    }
  }
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
