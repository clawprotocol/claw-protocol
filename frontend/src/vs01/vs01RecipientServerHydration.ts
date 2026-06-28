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
import { scopeRecipientManifestToLockedSigner } from "./vs01RecipientFieldScope";
import { filterPacketManifestFieldsForRole } from "./vs01SigningPacketManifest";
import {
  hydrateRecipientSigningFields,
  isRecipientSigningEditableType,
  stripLockedSignerEditableValuesOnHydrate,
} from "./recipientSigningFieldUtils";
import {
  hydratePortableSignerMarksForRecipientView,
  normalizeVs01PortableInitialsPolicy,
  resolveRecipientInitialsEnabled,
} from "./vs01RecipientSignerMarksHydration";
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
  packetRevision?: string | null;
}): Vs01RecipientServerHydrationResult {
  const {
    portable,
    documentId,
    lockedCounterpartyId,
    lockedSignerRoleId,
    recipientName,
    recipientEmail,
    packetRevision,
  } = args;
  const agreementId = portable.seed.agreementId.trim();
  const hydratedPortable = normalizeVs01PortableInitialsPolicy(
    hydratePortableSignerMarksForRecipientView({
      portable,
      agreementId,
      documentId,
      viewingSignerRoleId: lockedSignerRoleId,
    }),
    { packetRevision },
  );
  storeVs01CanonicalPacketPortable(documentId, hydratedPortable);
  storeVs01CanonicalPacketSeed(hydratedPortable.seed);
  markVs01CanonicalPacketFromServer(documentId);
  const initialsEnabled = resolveRecipientInitialsEnabled({
    portable: hydratedPortable,
    packetRevision,
  });
  const manifestFields = initialsEnabled
    ? hydratedPortable.fields
    : hydratedPortable.fields.filter((f) => f.type !== "initials");
  storeRecipientManifest(documentId, VS01_PACKET_MANIFEST_SCOPE, manifestFields);

  const role =
    (lockedSignerRoleId?.trim()
      ? hydratedPortable.roles.find((r) => r.roleId === lockedSignerRoleId.trim())
      : null) ?? null;

  const counterpartiesFromPortable = (): Vs01Counterparty[] => {
    const cps: Vs01Counterparty[] = [];
    for (const roleRow of hydratedPortable.roles) {
      const cpId = (roleRow.vs01CounterpartyId ?? roleRow.partyId).trim();
      if (!cpId) continue;
      cps.push({
        id: cpId,
        name: roleRow.entityName?.trim() || roleRow.partyName?.trim() || "Signer",
        email: (roleRow.signerEmail ?? roleRow.reviewEmail ?? "").trim(),
        signerName: roleRow.signerName?.trim(),
        signerTitle: roleRow.signerTitle?.trim(),
      });
    }
    return cps;
  };

  const allCps = counterpartiesFromPortable();
  const cpMap = new Map(allCps.map((c) => [c.id, c]));
  const lock = (lockedSignerRoleId ?? "").trim();
  const scopedManifestFields = scopeRecipientManifestToLockedSigner({
    fields: manifestFields,
    lockedCounterpartyId,
    lockedSignerRoleId,
    portableRoles: hydratedPortable.roles,
  });
  const displayFields = hydrateRecipientSigningFields(
    stripLockedSignerEditableValuesOnHydrate(
      ensureRecipientFieldDefaults(
        scopedManifestFields,
        recipientName,
        recipientEmail,
        {
          signerName:
            allCps.find((c) => c.id === lockedCounterpartyId)?.signerName ??
            role?.signerName ??
            undefined,
        },
      ),
      portable.seed.agreementId,
      lockedSignerRoleId,
      { hydrationSource: "server_packet" },
    ),
    cpMap,
    { preserveEditableValues: true, agreementId },
  );
  if (lock && agreementId) {
    const roleKeys = hydratedPortable.roles.map((r) => r.roleId).filter(Boolean);
    for (const roleRow of hydratedPortable.roles) {
      const rid = (roleRow.roleId ?? "").trim();
      if (!rid || rid === lock) continue;
      const hasPersistedSignature = displayFields.some(
        (f) =>
          isRecipientSigningEditableType(f.type) &&
          f.type === "signature" &&
          (f.assignedSignerRoleId ?? "").trim() === rid &&
          typeof f.value === "string" &&
          f.value.trim().length > 0,
      );
      if (hasPersistedSignature) {
        patchSignerPacketStatus(agreementId, rid, "signed", roleKeys);
      }
    }
  }
  const cps =
    allCps.length > 0
      ? allCps
      : counterpartiesFromRecipientManifestFields(
          normalizeRecipientManifestCounterparties(
            filterPacketManifestFieldsForRole(manifestFields, {
              roleId: role?.roleId ?? lock,
              partyIndex: role?.partyIndex ?? 0,
              partyId: role?.partyId ?? lockedCounterpartyId,
              entityName: role?.entityName ?? "",
              partyName: role?.partyName ?? recipientName,
              roleLabel: role?.roleLabel ?? "",
              signerName: role?.signerName ?? "",
              signerTitle: role?.signerTitle ?? "",
              signerEmail: role?.signerEmail ?? "",
              reviewEmail: role?.reviewEmail ?? "",
              isEntityParty: role?.isEntityParty ?? false,
              requiresSignature: role?.requiresSignature !== false,
              vs01CounterpartyId: role?.vs01CounterpartyId ?? lockedCounterpartyId,
              kind: role?.kind ?? "counterparty",
            }),
            lockedCounterpartyId,
          ),
          lockedCounterpartyId,
          recipientName,
          recipientEmail,
        );
  return {
    ok: displayFields.length > 0,
    fields: displayFields,
    counterparties: cps,
    source: displayFields.length > 0 ? "server_packet" : "miss",
  };
}

export function applyVs01PortablePacketToRecipientSession(args: {
  portable: Vs01CanonicalPacketPortableV1;
  documentId: string;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  recipientName: string;
  recipientEmail: string;
  packetRevision?: string | null;
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
    packetRevision: args.packetRevision,
  });
}
