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
  evaluatePreparePacketGateFromRoles,
  type SigningPacketPrepareGate,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import { ensureSigningPacketStatusFromHandoff } from "./vs01SigningPacketStatusStore";
import { resolveVs01SenderMustSignFirst } from "./vs01SigningOrderPolicy";
import { buildVs01PrepareSigningRolesForBridge } from "../components/agreements/paidProNPartySignerSetup";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  isPaidSessionSignatureTrackBridge,
  PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN,
} from "../components/agreements/paidProPaidSessionLanding";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export type PreparePacketBridgeContext = Pick<
  AgreementVs01BridgeSession,
  "creatorIsParty" | "legalParties"
> &
  Partial<
    Pick<
      AgreementVs01BridgeSession,
      "senderFirstLawdogHandoff" | "source" | "agreementBridgeMode" | "creatorEmail" | "agreementId"
    >
  >;

function preparePacketCanonicalMinCorpusLen(
  bridge: PreparePacketBridgeContext | null | undefined,
): number {
  return isPaidSessionSignatureTrackBridge(bridge)
    ? PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN
    : VS01_SIGNING_CORPUS_MIN_LEN;
}

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
  /** Paid Pro bridge: N-party legal parties + coordinator-only flag (same as placement UI). */
  bridge?: PreparePacketBridgeContext | null;
};

export type PreparePacketContinueResult =
  | {
      ok: true;
      handoff: PaidProVs01PostSignHandoffV1;
      gate: SigningPacketPrepareGate;
      portablePacket: Vs01CanonicalPacketPortableV1 | null;
      roles: Vs01PrepareSigningRole[];
    }
  | { ok: false; finish: Extract<PrepareFinishClickResult, { allowed: false }> };

/** Single bridge-aware role list for placement, gate, packet, and invite dispatch. */
export function resolvePreparePacketSigningRoles(
  input: PreparePacketContinueInput,
): Vs01PrepareSigningRole[] {
  return buildVs01PrepareSigningRolesForBridge({
    agreementId: input.agreementId,
    creatorName: input.creatorName,
    creatorEmail: input.creatorEmail,
    ownerSignerName: input.ownerSignerName,
    ownerSignerTitle: input.ownerSignerTitle,
    counterparties: input.counterparties,
    bridge: input.bridge,
  });
}

function resolvePrimaryPrepareRole(roles: readonly Vs01PrepareSigningRole[]): Vs01PrepareSigningRole {
  return roles.find((r) => r.kind === "owner") ?? roles[0]!;
}

export function recomputePreparePacketGate(input: PreparePacketContinueInput): {
  gate: SigningPacketPrepareGate;
  roles: Vs01PrepareSigningRole[];
} {
  const roles = resolvePreparePacketSigningRoles(input);
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
  const corpusPlain = (input.prepareCorpusPlain ?? "").trim();
  const canonicalMinLen = preparePacketCanonicalMinCorpusLen(input.bridge);
  const paidSessionBridge = isPaidSessionSignatureTrackBridge(input.bridge);
  let finish = evaluatePrepareFinishClick(gate, roles);
  if (!finish.allowed && input.bridge && corpusPlain.length >= canonicalMinLen) {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpusPlain,
      roles,
      initialsEnabled: input.initialsEnabled !== false,
      bridge: input.bridge as AgreementVs01BridgeSession | null | undefined,
      corpusGateArgs: paidSessionBridge ? { relaxPaidSessionCorpusAssert: true } : undefined,
    });
    const signatureFieldCount = model.fields.filter(
      (f) => f.type === "signature" && !f.autoInitials,
    ).length;
    if (model.allowed && signatureFieldCount >= roles.length) {
      finish = { allowed: true };
    }
  }
  if (!finish.allowed) {
    logVs01PrepareContinueBlocked({
      incompleteSignerCount: finish.rows.length,
      focusRoleIdShort: finish.focusRoleId?.slice(0, 16) ?? null,
    });
    return { ok: false, finish };
  }

  const primaryRole = resolvePrimaryPrepareRole(roles);
  const otherRoles = roles.filter((r) => r.roleId !== primaryRole.roleId);
  const initialsEnabled = input.initialsEnabled !== false;
  let canonicalManifestFields: Vs01RecipientPlacedField[] | null = null;
  let canonicalPacketPayload: string | null = null;
  let canonicalPacketStored = false;
  let packetRevision: string | null = null;
  let portablePacket: Vs01CanonicalPacketPortableV1 | null = null;
  if (corpusPlain.length >= canonicalMinLen) {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpusPlain,
      roles,
      initialsEnabled,
      bridge: input.bridge as AgreementVs01BridgeSession | null | undefined,
      corpusGateArgs: paidSessionBridge ? { relaxPaidSessionCorpusAssert: true } : undefined,
    });
    if (model.allowed) {
      const seed = buildVs01CanonicalPacketSeed({
        documentId: input.documentId,
        agreementId: input.agreementId,
        corpusPlain,
        minCorpusLen: canonicalMinLen,
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
  const urlArgs = {
    ownerRole: primaryRole,
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
  };

  const signers = otherRoles.map((role) => ({
    counterpartyId: role.vs01CounterpartyId ?? role.partyId,
    displayName: role.entityName.trim() || role.partyName.trim(),
    email: (role.signerEmail ?? "").trim(),
    signingUrl: buildSigningUrlForPrepareRole({
      role,
      ...urlArgs,
      recipientIndex: role.partyIndex,
    }),
    signerRoleId: role.roleId,
  }));

  const ownerSigningUrl = buildSigningUrlForPrepareRole({
    role: primaryRole,
    ...urlArgs,
    recipientIndex: primaryRole.partyIndex,
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
    ownerSignerRoleId: primaryRole.roleId,
    senderMustSignFirst: resolveVs01SenderMustSignFirst(false),
    ownerSigningUrl,
    packetRevision: packetRevision ?? undefined,
    initialsEnabled,
  };

  ensureSigningPacketStatusFromHandoff(handoff, primaryRole.roleId);

  logVs01PrepareContinueAllowed({
    agreementIdShort: input.agreementId.slice(0, 16),
    signerCount: roles.length,
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
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[vs01-packet-sent-or-links-created]", {
      agreement_id: input.agreementId.slice(0, 16),
      document_id: input.documentId.slice(0, 16),
      signer_targets: [
        {
          signer_role_id: primaryRole.roleId,
          party_index: primaryRole.partyIndex,
          recipient_index: primaryRole.partyIndex,
        },
        ...signers.map((s) => ({
          signer_role_id: s.signerRoleId,
          party_index: roles.find((r) => r.roleId === s.signerRoleId)?.partyIndex ?? null,
          recipient_index: roles.find((r) => r.roleId === s.signerRoleId)?.partyIndex ?? null,
          email: s.email ? "***" : "",
        })),
      ],
    });
  }

  return { ok: true, handoff, gate, portablePacket, roles };
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
  const ownerRole = resolvePrimaryPrepareRole(input.roles);
  if (!ownerRole) return null;
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
