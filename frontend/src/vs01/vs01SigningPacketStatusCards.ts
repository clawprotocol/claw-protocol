import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { signerKeyForHandoffRow, type Vs01SignerPacketStatus } from "./vs01SigningPacketStatusStore";

export function shouldShowPacketSignerMetaLine(args: {
  partyName: string;
  signerName: string | null | undefined;
  isEntityParty: boolean;
}): boolean {
  const party = (args.partyName || "").trim();
  const signer = (args.signerName || "").trim();
  if (!signer) return false;
  if (!args.isEntityParty) return false;
  return signer.toLowerCase() !== party.toLowerCase();
}

export type PacketStatusCardRow = {
  key: string;
  roleId: string;
  partyIndex: number;
  isOwner: boolean;
  roleLabel: string | null;
  partyName: string;
  signerName: string | null;
  signerTitle: string | null;
  signerEmail: string | null;
  showSignerMetaLine: boolean;
  signingUrl: string;
  status: Vs01SignerPacketStatus;
  statusPill: string;
  primaryLabel: string;
  secondaryLabel: string;
  hint: string | null;
};

export function statusPillLabel(status: Vs01SignerPacketStatus): string {
  if (status === "signed") return "Signed";
  if (status === "opened") return "In progress";
  return "Waiting";
}

export function buildPacketStatusCards(args: {
  handoff: PaidProVs01PostSignHandoffV1;
  roles: Vs01PrepareSigningRole[];
  statusByKey: Record<string, Vs01SignerPacketStatus>;
  ownerSigningUrl: string;
}): PacketStatusCardRow[] {
  const ownerRole = args.roles[0];
  if (!ownerRole || ownerRole.kind !== "owner") return [];

  const ownerKey = args.handoff.ownerSignerRoleId ?? ownerRole.roleId;
  const ownerUrl = (args.handoff.ownerSigningUrl ?? args.ownerSigningUrl).trim();
  const ownerStatus = args.statusByKey[ownerKey] ?? "waiting";

  const out: PacketStatusCardRow[] = [
    {
      key: ownerKey,
      roleId: ownerRole.roleId,
      partyIndex: ownerRole.partyIndex,
      isOwner: true,
      roleLabel: "Client",
      partyName: ownerRole.entityName?.trim() || "Sender",
      signerName: ownerRole.signerName?.trim() || null,
      signerTitle: ownerRole.signerTitle?.trim() || null,
      signerEmail: ownerRole.signerEmail?.trim() || null,
      showSignerMetaLine: shouldShowPacketSignerMetaLine({
        partyName: ownerRole.entityName?.trim() || "Sender",
        signerName: ownerRole.signerName,
        isEntityParty: ownerRole.isEntityParty,
      }),
      signingUrl: ownerUrl,
      status: ownerStatus,
      statusPill: statusPillLabel(ownerStatus),
      primaryLabel: "Open my signing view",
      secondaryLabel: "Copy my signing link",
      hint: null,
    },
  ];

  for (const row of args.handoff.signers) {
    const role = args.roles.find(
      (r) => r.roleId === row.signerRoleId || r.vs01CounterpartyId === row.counterpartyId,
    );
    const key = signerKeyForHandoffRow(row, row.signerRoleId);
    const st = args.statusByKey[key] ?? "waiting";
    const partyName = role?.entityName?.trim() || row.displayName?.trim() || "Signer";
    const signerName = role?.signerName?.trim() || null;
    out.push({
      key,
      roleId: role?.roleId ?? row.signerRoleId ?? key,
      partyIndex: role?.partyIndex ?? 0,
      isOwner: false,
      roleLabel: role?.kind === "counterparty" ? "Counterparty" : null,
      partyName,
      signerName,
      signerTitle: role?.signerTitle?.trim() || null,
      signerEmail: row.email?.trim() || role?.signerEmail?.trim() || null,
      showSignerMetaLine: shouldShowPacketSignerMetaLine({
        partyName,
        signerName,
        isEntityParty: role?.isEntityParty ?? true,
      }),
      signingUrl: row.signingUrl?.trim() ?? "",
      status: st,
      statusPill: statusPillLabel(st),
      primaryLabel: "Open signer view",
      secondaryLabel: "Copy signer link",
      hint: null,
    });
  }
  return out;
}

export function countSignedSigners(statusByKey: Record<string, Vs01SignerPacketStatus>, keys: string[]): {
  signed: number;
  total: number;
} {
  const total = keys.length;
  let signed = 0;
  for (const k of keys) {
    if (statusByKey[k] === "signed") signed += 1;
  }
  return { signed, total };
}

/** Guard against accidental string concatenation in tests (e.g. PartyWaiting). */
export function cardHeadlineText(card: PacketStatusCardRow): string {
  return `${card.partyName} ${card.statusPill}`;
}
