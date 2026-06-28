/**
 * Async recipient authority bootstrap: validate token + server packet → locked identity.
 */

import { validateRecipientAccessToken } from "../agreement/recipientAccessApi";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
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
    }
  | { ok: false; mismatch: Vs01RecipientIdentityMismatch }
  | { ok: false; inviteSuperseded: true; message?: string }
  | { ok: false; reason: "fetch_miss" | "invalid_args" };

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

  let tokenPartyId: string | null = null;
  const token = (args.recipientAccessToken ?? "").trim();
  if (token) {
    const vr = await validateRecipientAccessToken(token, agreementId);
    if (
      vr.ok &&
      vr.data.mode === "sign" &&
      vr.data.agreement_id === agreementId
    ) {
      tokenPartyId = (vr.data.recipient_party_id ?? "").trim() || null;
    }
  }

  let portable = args.cachedPortable ?? null;
  if (!portable) {
    const fetchResult = await fetchPublicVs01SigningPacket({
      agreementId,
      documentId,
      packetRevision: args.packetRevision,
      recipientEmail: args.urlRecipientEmail,
      participantId: args.urlCounterpartyId,
    });
    if (!fetchResult.ok) {
      if (fetchResult.reason === "invite_superseded") {
        return {
          ok: false,
          inviteSuperseded: true,
          message: fetchResult.message,
        };
      }
      return { ok: false, reason: "fetch_miss" };
    }
    portable = fetchResult.portable;
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
      tokenBound: Boolean(tokenPartyId),
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
  };
}
