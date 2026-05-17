import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { buildSigningUrlForPrepareRole } from "./vs01SigningPacketManifest";
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
  receiptId?: string | null;
  receiptHashSha256?: string | null;
};

export type PreparePacketContinueResult =
  | { ok: true; handoff: PaidProVs01PostSignHandoffV1; gate: SigningPacketPrepareGate }
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
  const rid = (input.receiptId ?? "").trim();
  const named = input.counterparties
    .map((c, recipientIndex) => ({ c, recipientIndex }))
    .filter(({ c }) => c.name.trim().length > 0);

  const signers = named.flatMap(({ c, recipientIndex }) => {
    const role = roles.find((r) => r.vs01CounterpartyId === c.id);
    if (!role) return [];
    const signerRoleId = role.roleId;
    return [{
      counterpartyId: c.id,
      displayName: c.name.trim(),
      email: c.email.trim(),
      signingUrl: buildSigningUrlForPrepareRole({
        role,
        ownerRole,
        roles,
        senderPlacedFields: input.senderPlacedFields,
        recipientPlacedFields: input.recipientPlacedFields,
        documentId: input.documentId,
        agreementId: input.agreementId,
        receiptId: rid || null,
        recipientIndex,
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
    documentId: input.documentId,
    agreementId: input.agreementId,
    receiptId: rid || null,
    recipientIndex: 0,
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
    senderMustSignFirst: !rid,
    ownerSigningUrl,
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

  return { ok: true, handoff, gate };
}
