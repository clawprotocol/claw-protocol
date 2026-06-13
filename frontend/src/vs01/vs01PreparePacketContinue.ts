import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  buildFullPacketManifestFromCanonicalModel,
  buildSigningUrlForPrepareRole,
} from "./vs01SigningPacketManifest";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  loadVs01CanonicalPacketPortable,
  resolveCanonicalPacketUrlRefs,
  storeVs01CanonicalPacketSeed,
  type Vs01CanonicalPacketPortableV1,
} from "./vs01CanonicalPacketSeed";
import { VS01_PACKET_MANIFEST_SCOPE, storeRecipientManifest } from "./StepReceipt";
import {
  evaluatePrepareFinishClick,
  type PrepareFinishClickResult,
} from "./vs01PreparePacketCompletion";
import { logVs01LifecycleEvent } from "./vs01LifecycleAudit";
import {
  logVs01PrepareContinueAllowed,
  logVs01PrepareContinueBlocked,
} from "./vs01PreparePacketChecklist";
import {
  buildVs01PrepareSigningRoles,
  evaluatePreparePacketGateFromRoles,
  type SigningPacketPrepareGate,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { ensureSigningPacketStatusFromHandoff } from "./vs01SigningPacketStatusStore";
import { resolveVs01SenderMustSignFirst } from "./vs01SigningOrderPolicy";

export type PreparePacketContinueInput = {
  agreementId: string;
  agreementTitle: string;
  documentId: string;
  creatorName: string;
  creatorEmail: string;
  ownerSignerName?: string;
  ownerSignerTitle?: string;
  counterparties: Vs01Counterparty[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  /** Authoritative guided Pro corpus used on Prepare canonical pages. */
  prepareCorpusPlain?: string | null;
  /** Prepare UI “Initials on each page” toggle — drives canonical model + links. */
  initialsEnabled?: boolean;
  receiptId?: string | null;
  receiptHashSha256?: string | null;
};

export type PreparePacketContinueResult =
  | {
      ok: true;
      handoff: PaidProVs01PostSignHandoffV1;
      gate: SigningPacketPrepareGate;
      portablePacket: Vs01CanonicalPacketPortableV1 | null;
    }
  | { ok: false; finish: Extract<PrepareFinishClickResult, { allowed: false }> };

export function recomputePreparePacketGate(input: PreparePacketContinueInput): {
  gate: SigningPacketPrepareGate;
  roles: Vs01PrepareSigningRole[];
} {
  const roles = buildVs01PrepareSigningRoles({
    agreementId: input.agreementId,
    creatorName: input.creatorName,
    creatorEmail: input.creatorEmail,
    ownerSignerName: input.ownerSignerName,
    ownerSignerTitle: input.ownerSignerTitle,
    counterparties: input.counterparties,
  });
  const gate = evaluatePreparePacketGateFromRoles(
    roles,
    input.senderPlacedFields,
    input.recipientPlacedFields,
  );
  return { gate, roles };
}

export function handlePreparePacketContinue(
  input: PreparePacketContinueInput,
): PreparePacketContinueResult {
  const { gate, roles } = recomputePreparePacketGate(input);
  const finish = evaluatePrepareFinishClick(gate, roles);
  if (!finish.allowed) {
    logVs01PrepareContinueBlocked({
      incompleteSignerCount: finish.rows.length,
      focusRoleIdShort: finish.focusRoleId?.slice(0, 16) ?? null,
    });
    return { ok: false, finish };
  }

  const ownerRole = roles[0]!;
  const initialsEnabled = input.initialsEnabled !== false;
  const corpusPlain = (input.prepareCorpusPlain ?? "").trim();
  let canonicalManifestFields: Vs01RecipientPlacedField[] | null = null;
  let canonicalPacketPayload: string | null = null;
  let canonicalPacketStored = false;
  let packetRevision: string | null = null;
  let portablePacket: Vs01CanonicalPacketPortableV1 | null = null;
  if (corpusPlain.length >= 1500) {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpusPlain,
      roles,
      initialsEnabled,
    });
    if (model.allowed) {
      const seed = buildVs01CanonicalPacketSeed({
        documentId: input.documentId,
        agreementId: input.agreementId,
        corpusPlain,
      });
      if (seed) storeVs01CanonicalPacketSeed(seed);
      const manifestFields = buildFullPacketManifestFromCanonicalModel({ model, roles });
      canonicalManifestFields = manifestFields;
      if (manifestFields.length > 0) {
        storeRecipientManifest(input.documentId, VS01_PACKET_MANIFEST_SCOPE, manifestFields);
      }
      if (seed) {
        const witnessPageIndex = model.pages.findIndex((p) =>
          p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
        );
        const portable = buildVs01CanonicalPacketPortable({
          seed,
          fields: manifestFields,
          roles,
          pageCount: model.pages.length,
          witnessPageIndex,
          initialsEnabled,
        });
        const urlRefs = resolveCanonicalPacketUrlRefs({
          documentId: input.documentId,
          packet: portable,
          initialsEnabled,
        });
        canonicalPacketPayload = urlRefs.encodedInline;
        canonicalPacketStored = urlRefs.storedOnly;
        packetRevision = urlRefs.packetRevision;
        portablePacket = portable;
      }
    }
  }

  const rid = (input.receiptId ?? "").trim();
  const named = input.counterparties.filter((c) => c.name.trim().length > 0);

  const signers = named.flatMap((c) => {
    const role = roles.find((r) => r.vs01CounterpartyId === c.id);
    if (!role) return [];
    const signerRoleId = role.roleId;
    return [{
      counterpartyId: c.id,
      displayName: c.name.trim(),
      email: (role.signerEmail ?? c.email).trim(),
      signingUrl: buildSigningUrlForPrepareRole({
        role,
        ownerRole,
        roles,
        senderPlacedFields: input.senderPlacedFields,
        recipientPlacedFields: input.recipientPlacedFields,
        packetManifestFields: canonicalManifestFields,
        canonicalPacketPayload,
        canonicalPacketStored,
        packetRevision,
        documentId: input.documentId,
        agreementId: input.agreementId,
        receiptId: rid || null,
        recipientIndex: role.partyIndex,
      }),
      signerRoleId,
    }];
  });

  const ownerSigningUrl = buildSigningUrlForPrepareRole({
    role: ownerRole,
    ownerRole,
    roles,
    senderPlacedFields: input.senderPlacedFields,
    recipientPlacedFields: input.recipientPlacedFields,
    packetManifestFields: canonicalManifestFields,
    canonicalPacketPayload,
    canonicalPacketStored,
    packetRevision,
    documentId: input.documentId,
    agreementId: input.agreementId,
    receiptId: rid || null,
    recipientIndex: ownerRole.partyIndex,
  });

  const handoff: PaidProVs01PostSignHandoffV1 = {
    v: 1,
    agreementId: input.agreementId,
    agreementTitle: input.agreementTitle.trim() || "Agreement",
    vs01DocumentId: input.documentId,
    receiptId: rid,
    receiptHashSha256: input.receiptHashSha256?.trim() ?? null,
    packetPrepareOnly: !rid,
    savedAt: new Date().toISOString(),
    signers,
    ownerSignerRoleId: ownerRole.roleId,
    senderMustSignFirst: resolveVs01SenderMustSignFirst(false),
    ownerSigningUrl,
    packetRevision: packetRevision ?? undefined,
    initialsEnabled,
  };

  ensureSigningPacketStatusFromHandoff(handoff, ownerRole.roleId);

  logVs01PrepareContinueAllowed({
    agreementIdShort: input.agreementId.slice(0, 16),
    signerCount: signers.length + 1,
  });
  logVs01LifecycleEvent({
    event: "vs01_prepare_completed",
    agreementId: input.agreementId,
    documentId: input.documentId,
  });
  logVs01LifecycleEvent({
    event: "vs01_packet_sent_or_links_created",
    agreementId: input.agreementId,
    documentId: input.documentId,
  });

  return { ok: true, handoff, gate, portablePacket };
}

/** Rebuild signing URLs from the latest stored canonical portable packet (avoids stale handoff links). */
export function rebuildPrepareSigningUrlsFromStored(input: {
  handoff: PaidProVs01PostSignHandoffV1;
  roles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
}): Pick<PaidProVs01PostSignHandoffV1, "ownerSigningUrl" | "signers" | "packetRevision"> | null {
  const portable = loadVs01CanonicalPacketPortable(input.handoff.vs01DocumentId);
  if (!portable) return null;
  const ownerRole = input.roles[0];
  if (!ownerRole || ownerRole.kind !== "owner") return null;
  const initialsEnabled = portable.initialsPolicy.enabled;
  const urlRefs = resolveCanonicalPacketUrlRefs({
    documentId: input.handoff.vs01DocumentId,
    packet: portable,
    initialsEnabled,
  });
  const manifestFields = [...portable.fields];
  const rid = (input.handoff.receiptId ?? "").trim();
  const ownerSigningUrl = buildSigningUrlForPrepareRole({
    role: ownerRole,
    ownerRole,
    roles: input.roles,
    senderPlacedFields: input.senderPlacedFields,
    recipientPlacedFields: input.recipientPlacedFields,
    packetManifestFields: manifestFields,
    canonicalPacketPayload: urlRefs.encodedInline,
    canonicalPacketStored: urlRefs.storedOnly,
    packetRevision: urlRefs.packetRevision,
    documentId: input.handoff.vs01DocumentId,
    agreementId: input.handoff.agreementId,
    receiptId: rid || null,
    recipientIndex: ownerRole.partyIndex,
  });
  const signers = input.handoff.signers.map((row) => {
    const role = input.roles.find(
      (r) => r.vs01CounterpartyId === row.counterpartyId || r.roleId === row.signerRoleId,
    );
    if (!role) return row;
    return {
      ...row,
      signingUrl: buildSigningUrlForPrepareRole({
        role,
        ownerRole,
        roles: input.roles,
        senderPlacedFields: input.senderPlacedFields,
        recipientPlacedFields: input.recipientPlacedFields,
        packetManifestFields: manifestFields,
        canonicalPacketPayload: urlRefs.encodedInline,
        canonicalPacketStored: urlRefs.storedOnly,
        packetRevision: urlRefs.packetRevision,
        documentId: input.handoff.vs01DocumentId,
        agreementId: input.handoff.agreementId,
        receiptId: rid || null,
        recipientIndex: role.partyIndex,
      }),
      email: (role.signerEmail ?? row.email).trim(),
      displayName: role.entityName?.trim() || row.displayName,
      signerRoleId: role.roleId,
    };
  });
  return { ownerSigningUrl, signers, packetRevision: urlRefs.packetRevision };
}
