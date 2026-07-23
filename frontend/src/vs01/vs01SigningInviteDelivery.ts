import { postSigningLinksSent } from "../agreement/agreementWorkspaceApi";
import { readAcceptedReviewSnapshotRef } from "../agreement/canonicalReviewSnapshotApi";
import { readFrozenSigningAuthoritySnapshot, loadFrozenSigningAuthority } from "../components/agreements/frozenSigningAuthoritySnapshot";
import {
  fetchRecipientAccessPolicy,
  mintRecipientAccessTokenResult,
} from "../agreement/recipientAccessApi";
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

function appendSignTokenToSigningUrl(url: string, token: string): string {
  const tok = token.trim();
  if (!tok) return url;
  try {
    const u = new URL(url, "https://lawdog.local");
    u.searchParams.set("t", tok);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

function partyIdForSigningTarget(
  target: { signer_role_id: string; is_owner: boolean },
  roles: readonly Vs01PrepareSigningRole[],
): string {
  const role = roles.find((r) => r.roleId === target.signer_role_id);
  return (
    role?.vs01CounterpartyId ??
    role?.partyId ??
    ""
  ).trim();
}

type EnrichResult =
  | { ok: true; targets: ReturnType<typeof buildSigningInviteTargetsFromHandoff> }
  | { ok: false; skipReason: string };

async function enrichSigningTargetsWithRecipientTokens(
  agreementId: string,
  targets: ReturnType<typeof buildSigningInviteTargetsFromHandoff>,
  roles: readonly Vs01PrepareSigningRole[],
): Promise<EnrichResult> {
  const policy = await fetchRecipientAccessPolicy();
  const shouldMint =
    Boolean(policy?.recipient_link_token_required) || Boolean(policy?.signing_token_configured);
  if (!shouldMint) return { ok: true, targets };

  const out: ReturnType<typeof buildSigningInviteTargetsFromHandoff> = [];
  for (const target of targets) {
    const partyIdForToken = partyIdForSigningTarget(target, roles);
    if (!partyIdForToken) {
      return { ok: false, skipReason: "recipient_party_id_required" };
    }
    const mint = await mintRecipientAccessTokenResult(agreementId, {
      mode: "sign",
      role: "signer",
      recipient_party_id: partyIdForToken,
    });
    if (!mint.ok || !mint.data?.token) {
      // Fail closed: never preserve/dispatch a tokenless signing target after mint failure.
      return { ok: false, skipReason: "recipient_token_mint_failed" };
    }
    out.push({
      ...target,
      signing_url: appendSignTokenToSigningUrl(target.signing_url, mint.data.token),
    });
  }
  return { ok: true, targets: out };
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

  const enriched = await enrichSigningTargetsWithRecipientTokens(
    handoff.agreementId,
    buildSigningInviteTargetsFromHandoff(handoff, roles),
    roles,
  );
  if (!enriched.ok) {
    return {
      attempted: true,
      ok: false,
      sentCount: 0,
      skipReason: enriched.skipReason,
    };
  }
  const targets = enriched.targets;
  if (!targets.length) {
    return { attempted: false, ok: false, sentCount: 0, skipReason: "no_targets" };
  }

  try {
    const frozenLocal = readFrozenSigningAuthoritySnapshot();
    const frozen =
      frozenLocal ??
      (await loadFrozenSigningAuthority({
        agreementId: handoff.agreementId,
        expectedVersion: 1,
      }));
    const acceptedRef = readAcceptedReviewSnapshotRef(handoff.agreementId);
    const res = await postSigningLinksSent(handoff.agreementId, {
      packet_revision: handoff.packetRevision ?? null,
      document_id: (opts?.documentId ?? handoff.vs01DocumentId ?? "").trim() || null,
      portable_packet: opts?.portablePacket ? (opts.portablePacket as unknown as Record<string, unknown>) : null,
      frozen_signing_authority: frozen ? (frozen as unknown as Record<string, unknown>) : null,
      targets,
      accepted_review_snapshot_id: acceptedRef?.snapshotId ?? null,
      accepted_review_snapshot_digest: acceptedRef?.corpusSha256 ?? null,
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
