/**
 * Async recipient authority bootstrap: validate token + server packet → locked identity.
 * URL, session, and local portable packets cannot authorize paper or completion.
 */

import { validateRecipientAccessToken } from "../agreement/recipientAccessApi";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import { computeVs01PacketRevision } from "./vs01CanonicalPacketSeed";
import { fetchPublicVs01SigningPacket } from "./vs01SigningPacketServer";
import { applyVs01PortablePacketToRecipientSession } from "./vs01RecipientServerHydration";
import {
  assertRecipientScopedFieldsMatchIdentity,
  resolveVs01RecipientIdentityFromAuthority,
  type Vs01RecipientIdentityAuthority,
  type Vs01RecipientIdentityMismatch,
} from "./vs01RecipientIdentityAuthority";
import { resolveRecipientInitialsEnabled } from "./vs01RecipientSignerMarksHydration";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";

export type Vs01RecipientAuthorityBootstrapResult =
  | {
      ok: true;
      identity: Vs01RecipientIdentityAuthority;
      portable: Vs01CanonicalPacketPortableV1;
      fields: Vs01RecipientPlacedField[];
      counterparties: Vs01Counterparty[];
      initialsEnabled: boolean;
      signerCount: number;
      signerAlreadyCompleted?: boolean;
    }
  | { ok: false; mismatch: Vs01RecipientIdentityMismatch }
  | { ok: false; inviteSuperseded: true; message?: string }
  | { ok: false; retryable: true; message: string }
  | { ok: false; reason: "fetch_miss" | "invalid_args" | "token_required" | "token_invalid" | "packet_mismatch" };

function trimLower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function portablePacketMatchesServer(args: {
  portable: Vs01CanonicalPacketPortableV1;
  agreementId: string;
  documentId: string;
  packetRevision?: string | null;
  cachedPortable?: Vs01CanonicalPacketPortableV1 | null;
}): boolean {
  const { portable } = args;
  if (portable.seed.agreementId.trim() !== args.agreementId.trim()) return false;
  if (portable.seed.documentId.trim() !== args.documentId.trim()) return false;
  const expectedRev = (args.packetRevision ?? "").trim();
  if (expectedRev) {
    const computed = computeVs01PacketRevision({
      corpusHash: portable.seed.corpusHash,
      initialsEnabled: portable.initialsPolicy.enabled,
      fieldCount: portable.fieldCount,
    });
    const stored = expectedRev;
    if (stored !== computed && stored !== (portable as { packetRevision?: string }).packetRevision) {
      /* revision query must match computed packet revision */
      if (stored !== computed) return false;
    }
  }
  const cached = args.cachedPortable;
  if (cached) {
    if (trimLower(cached.seed.corpusHash) !== trimLower(portable.seed.corpusHash)) return false;
    if (cached.seed.documentId.trim() !== portable.seed.documentId.trim()) return false;
    if (cached.seed.agreementId.trim() !== portable.seed.agreementId.trim()) return false;
    if (cached.roles.length !== portable.roles.length) return false;
    const serverRoleIds = new Set(portable.roles.map((r) => r.roleId.trim()));
    if (cached.roles.some((r) => !serverRoleIds.has(r.roleId.trim()))) return false;
  }
  return true;
}

export async function bootstrapVs01RecipientSigningAuthority(args: {
  agreementId: string;
  documentId: string;
  packetRevision?: string | null;
  recipientAccessToken?: string | null;
  urlSignerRoleId: string | null;
  urlCounterpartyId: string;
  urlRecipientIndex: number | null;
  urlRecipientName: string;
  urlRecipientEmail: string;
  cachedPortable?: Vs01CanonicalPacketPortableV1 | null;
}): Promise<Vs01RecipientAuthorityBootstrapResult> {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  if (!agreementId || !documentId) {
    return { ok: false, reason: "invalid_args" };
  }

  const token = (args.recipientAccessToken ?? "").trim();
  if (!token) {
    return { ok: false, reason: "token_required" };
  }

  const vr = await validateRecipientAccessToken(token, agreementId);
  if (!vr.ok) {
    if (vr.code === "network_retryable") {
      return { ok: false, retryable: true, message: vr.message };
    }
    return { ok: false, reason: "token_invalid" };
  }
  if (vr.data.mode !== "sign" || vr.data.agreement_id !== agreementId) {
    return { ok: false, reason: "token_invalid" };
  }
  const tokenPartyId = (vr.data.recipient_party_id ?? "").trim() || null;
  if (!tokenPartyId) {
    return { ok: false, reason: "token_invalid" };
  }
  if (!String(vr.data.locked_version_id || "").trim()) {
    return { ok: false, reason: "token_invalid" };
  }

  const fetchResult = await fetchPublicVs01SigningPacket({
    agreementId,
    documentId,
    packetRevision: args.packetRevision,
    recipientEmail: args.urlRecipientEmail,
    participantId: args.urlCounterpartyId || tokenPartyId,
    recipientAccessToken: token,
  });
  if (!fetchResult.ok) {
    if (fetchResult.reason === "invite_superseded") {
      return {
        ok: false,
        inviteSuperseded: true,
        message: fetchResult.message,
      };
    }
    if (fetchResult.reason === "network_retryable") {
      return { ok: false, retryable: true, message: fetchResult.message || "We couldn’t reach this signing packet. Try again in a moment." };
    }
    return { ok: false, reason: "fetch_miss" };
  }
  const portable = fetchResult.portable;
  if (
    !portablePacketMatchesServer({
      portable,
      agreementId,
      documentId,
      packetRevision: args.packetRevision,
      cachedPortable: args.cachedPortable,
    })
  ) {
    return { ok: false, reason: "packet_mismatch" };
  }

  const identityResult = resolveVs01RecipientIdentityFromAuthority({
    portable,
    tokenPartyId,
    urlSignerRoleId: args.urlSignerRoleId,
    urlCounterpartyId: args.urlCounterpartyId,
    urlRecipientIndex: args.urlRecipientIndex,
    urlRecipientName: args.urlRecipientName,
    urlRecipientEmail: args.urlRecipientEmail,
  });
  if ("blocked" in identityResult) {
    return { ok: false, mismatch: identityResult };
  }

  const hydration = applyVs01PortablePacketToRecipientSession({
    portable,
    documentId,
    lockedCounterpartyId: identityResult.lockedCounterpartyId,
    lockedSignerRoleId: identityResult.lockedSignerRoleId,
    recipientName: identityResult.recipientName,
    recipientEmail: identityResult.recipientEmail,
    packetRevision: args.packetRevision,
  });

  const hydratedPortable = portable;
  const initialsEnabled = resolveRecipientInitialsEnabled({
    portable: hydratedPortable,
    packetRevision: args.packetRevision,
  });

  const fieldMismatch = assertRecipientScopedFieldsMatchIdentity({
    portable: hydratedPortable,
    identity: identityResult,
    initialsEnabled,
  });
  if (fieldMismatch) {
    return { ok: false, mismatch: fieldMismatch };
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[vs01-recipient-identity-authority]", {
      source: identityResult.source,
      signerRoleIdShort: identityResult.lockedSignerRoleId.slice(0, 24),
      partyIndex: identityResult.partyIndex,
      partyName: identityResult.recipientName.slice(0, 48),
      signerCount: hydratedPortable.roles.length,
      initialsEnabled,
      tokenBound: true,
    });
  }

  return {
    ok: true,
    identity: identityResult,
    portable: hydratedPortable,
    fields: hydration.fields,
    counterparties: hydration.counterparties,
    initialsEnabled,
    signerCount: hydratedPortable.roles.length,
    signerAlreadyCompleted: fetchResult.signerAlreadyCompleted === true,
  };
}
