import { postSigningLinksSent } from "../agreement/agreementWorkspaceApi";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { resolveVs01SenderMustSignFirst } from "./vs01SigningOrderPolicy";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";

export type SigningInviteDispatchResult = {
  attempted: boolean;
  ok: boolean;
  sentCount: number;
  skipReason: string | null;
};

export function buildSigningInviteTargetsFromHandoff(
  handoff: PaidProVs01PostSignHandoffV1,
  roles: readonly Vs01PrepareSigningRole[],
): Array<{
  email: string;
  display_name: string;
  signing_url: string;
  signer_role_id: string;
  is_owner: boolean;
}> {
  const ownerRole = roles.find((r) => r.kind === "owner") ?? roles[0];
  const targets: Array<{
    email: string;
    display_name: string;
    signing_url: string;
    signer_role_id: string;
    is_owner: boolean;
  }> = [];

  const ownerUrl = (handoff.ownerSigningUrl ?? "").trim();
  const ownerEmail = (ownerRole?.signerEmail ?? ownerRole?.reviewEmail ?? "").trim();
  if (ownerUrl && ownerEmail.includes("@")) {
    targets.push({
      email: ownerEmail,
      display_name:
        ownerRole?.signerName?.trim() ||
        ownerRole?.entityName?.trim() ||
        ownerRole?.partyName?.trim() ||
        "Signer",
      signing_url: ownerUrl,
      signer_role_id: handoff.ownerSignerRoleId ?? ownerRole?.roleId ?? "",
      is_owner: true,
    });
  }

  for (const row of handoff.signers) {
    const role = roles.find(
      (r) => r.roleId === row.signerRoleId || r.vs01CounterpartyId === row.counterpartyId,
    );
    const email = (row.email ?? role?.signerEmail ?? role?.reviewEmail ?? "").trim();
    const url = (row.signingUrl ?? "").trim();
    if (!email.includes("@") || !url) continue;
    targets.push({
      email,
      display_name: row.displayName?.trim() || role?.entityName?.trim() || email.split("@")[0] || "Signer",
      signing_url: url,
      signer_role_id: row.signerRoleId ?? role?.roleId ?? "",
      is_owner: false,
    });
  }

  return targets;
}

/** Fire-and-forget signing invite delivery after packet prepare (parallel flow only). */
export async function dispatchSigningInvitesFromHandoff(
  handoff: PaidProVs01PostSignHandoffV1,
  roles: readonly Vs01PrepareSigningRole[],
  opts?: {
    portablePacket?: Vs01CanonicalPacketPortableV1 | null;
    documentId?: string | null;
  },
): Promise<SigningInviteDispatchResult> {
  const senderMustSignFirst = resolveVs01SenderMustSignFirst(handoff.senderMustSignFirst);
  if (senderMustSignFirst) {
    return { attempted: false, ok: false, sentCount: 0, skipReason: "sender_first_explicit" };
  }

  const targets = buildSigningInviteTargetsFromHandoff(handoff, roles);
  if (!targets.length) {
    return { attempted: false, ok: false, sentCount: 0, skipReason: "no_targets" };
  }

  try {
    const res = await postSigningLinksSent(handoff.agreementId, {
      packet_revision: handoff.packetRevision ?? null,
      document_id: (opts?.documentId ?? handoff.vs01DocumentId ?? "").trim() || null,
      portable_packet: opts?.portablePacket ? (opts.portablePacket as unknown as Record<string, unknown>) : null,
      targets,
    });
    return {
      attempted: true,
      ok: res.ok,
      sentCount: res.sent_count ?? 0,
      skipReason: res.skip_reason ?? null,
    };
  } catch {
    return { attempted: true, ok: false, sentCount: 0, skipReason: "request_failed" };
  }
}
