/**
 * Resolve full recipient signing document fields (all parties for display + current signer actions).
 */

import { loadVs01CanonicalPacketPortable } from "./vs01CanonicalPacketSeed";
import {
  buildRecipientSigningDocumentFields,
  recipientFieldBelongsToLockedSigner,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import { stripLockedSignerEditableValuesOnHydrate } from "./recipientSigningFieldUtils";
import { buildFullPacketManifestFromCanonicalModel } from "./vs01SigningPacketManifest";
import type { Vs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { resolveRecipientInitialsEnabled } from "./vs01RecipientSignerMarksHydration";
import type { Vs01RecipientPlacedField } from "./types";
import type { PlacedSigningField } from "./signingFields";

function signatureFieldKey(f: Vs01RecipientPlacedField): string {
  const rid = (f.assignedSignerRoleId ?? "").trim();
  if (rid) return `role:${rid}`;
  const cp = f.counterpartyId.trim();
  const pi = f.assignedPartyIndex ?? -1;
  return `party:${pi}:${cp}`;
}

/** Align signature field page/geometry to canonical model witness anchors after corpus updates. */
export function alignRecipientSignatureFieldsToCanonicalModel(args: {
  fields: readonly Vs01RecipientPlacedField[];
  model: Pick<Vs01SigningPacketModel, "fields">;
  roles: readonly Vs01PrepareSigningRole[];
}): Vs01RecipientPlacedField[] {
  const canonicalSigs = buildFullPacketManifestFromCanonicalModel({
    model: args.model,
    roles: args.roles,
  }).filter((f) => f.type === "signature");
  if (!canonicalSigs.length) return [...args.fields];

  const byKey = new Map(canonicalSigs.map((f) => [signatureFieldKey(f), f]));
  const seenKeys = new Set<string>();
  const out = args.fields.map((f) => {
    if (f.type !== "signature") return f;
    const canon = byKey.get(signatureFieldKey(f));
    if (!canon) return f;
    seenKeys.add(signatureFieldKey(f));
    return {
      ...f,
      page: canon.page,
      x: canon.x,
      y: canon.y,
      width: canon.width,
      height: canon.height,
      assignedSignerRoleId: canon.assignedSignerRoleId ?? f.assignedSignerRoleId,
      assignedPartyIndex: canon.assignedPartyIndex ?? f.assignedPartyIndex,
    };
  });

  for (const canon of canonicalSigs) {
    const key = signatureFieldKey(canon);
    if (seenKeys.has(key)) continue;
    const partyIndex = canon.assignedPartyIndex ?? -1;
    const partyDup = out.some(
      (f) => f.type === "signature" && (f.assignedPartyIndex ?? -1) === partyIndex,
    );
    if (partyDup) continue;
    out.push({ ...canon, value: "" });
  }
  return out;
}

export function recipientScopedFieldsLackSignatureField(args: {
  fields: readonly Vs01RecipientPlacedField[];
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
}): boolean {
  return !args.fields.some(
    (f) =>
      f.type === "signature" &&
      recipientFieldBelongsToLockedSigner(f, args.lockedCounterpartyId, args.lockedSignerRoleId),
  );
}

export function logVs01RecipientSignatureFieldMissing(payload: {
  agreementId: string | null;
  documentId: string | null;
  signerRoleId: string | null;
  partyIndex: number | null;
  totalFieldCount: number;
  scopedFieldCount: number;
  signatureCandidates: Array<{
    id: string;
    assignedSignerRoleId: string | null;
    counterpartyId: string;
    page: number;
    filteredReason: string;
  }>;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-recipient-signature-field-missing]", payload);
}

export function resolveRecipientSigningDocumentFields(args: {
  documentId: string | null | undefined;
  recipientFields: Vs01RecipientPlacedField[];
  senderPlacedFields: PlacedSigningField[];
  prepareRoles: Vs01PrepareSigningRole[] | null | undefined;
  lockedCounterpartyId: string;
  lockedSignerRoleId: string | null;
  canonicalModel?: Pick<Vs01SigningPacketModel, "fields"> | null;
  packetRevision?: string | null;
}): Vs01RecipientPlacedField[] {
  const roles = args.prepareRoles ?? [];
  const ownerRole = roles[0];
  const did = (args.documentId ?? "").trim();
  const portable = did ? loadVs01CanonicalPacketPortable(did) : null;
  const initialsEnabled = resolveRecipientInitialsEnabled({
    portable,
    packetRevision: args.packetRevision,
  });
  const agreementId = portable?.seed.agreementId ?? null;

  let baseFields: Vs01RecipientPlacedField[];
  if (args.recipientFields.length > 0) {
    baseFields = [...args.recipientFields];
  } else if (portable?.fields.length) {
    baseFields = stripLockedSignerEditableValuesOnHydrate(
      initialsEnabled
        ? [...portable.fields]
        : portable.fields.filter((f) => f.type !== "initials"),
      agreementId,
      args.lockedSignerRoleId,
    );
  } else {
    baseFields = [];
  }

  if (!ownerRole || roles.length < 2) {
    return initialsEnabled ? baseFields : baseFields.filter((f) => f.type !== "initials");
  }

  let merged = buildRecipientSigningDocumentFields({
    ownerRole,
    roles,
    recipientPlacedFields: baseFields,
    senderPlacedFields: args.senderPlacedFields,
    initialsEnabled,
  });

  if (args.canonicalModel) {
    merged = alignRecipientSignatureFieldsToCanonicalModel({
      fields: merged,
      model: args.canonicalModel,
      roles,
    });
  }

  return initialsEnabled ? merged : merged.filter((f) => f.type !== "initials");
}
