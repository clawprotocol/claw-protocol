/**
 * Authoritative VS01 recipient signer identity — token + server portable packet only.
 * URL query name/email/index are hints; never fall back to party 0 when binding disagrees.
 */

import type { Vs01CanonicalPacketPortableRole, Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import { scopeRecipientManifestToLockedSigner } from "./vs01RecipientFieldScope";
import type { Vs01RecipientPlacedField } from "./types";

export type Vs01RecipientIdentityAuthority = {
  lockedSignerRoleId: string;
  lockedCounterpartyId: string;
  recipientName: string;
  recipientEmail: string;
  partyIndex: number;
  source: "token_packet" | "packet_url" | "url_bootstrap";
};

export type Vs01RecipientIdentityMismatch = {
  blocked: true;
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export function findPortableRoleForPartyId(
  portable: Vs01CanonicalPacketPortableV1,
  partyId: string,
): Vs01CanonicalPacketPortableRole | null {
  const pid = partyId.trim();
  if (!pid) return null;
  return (
    portable.roles.find(
      (r) =>
        r.partyId.trim() === pid || (r.vs01CounterpartyId ?? "").trim() === pid,
    ) ?? null
  );
}

function roleCounterpartyId(role: Vs01CanonicalPacketPortableRole): string {
  return (role.vs01CounterpartyId ?? role.partyId).trim();
}

function roleDisplayName(role: Vs01CanonicalPacketPortableRole): string {
  return role.entityName?.trim() || role.partyName?.trim() || "Signer";
}

function roleEmail(role: Vs01CanonicalPacketPortableRole): string {
  return (role.signerEmail ?? role.reviewEmail ?? "").trim();
}

function mismatch(
  code: string,
  message: string,
  details: Record<string, unknown>,
): Vs01RecipientIdentityMismatch {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.warn("[vs01-recipient-identity-mismatch]", { code, ...details });
  }
  return { blocked: true, code, message, details };
}

/**
 * Resolve locked signer from portable roles + validated token party id.
 * Blocks when URL signer_role_id / counterparty_id disagree with token-bound role.
 */
export function resolveVs01RecipientIdentityFromAuthority(args: {
  portable: Vs01CanonicalPacketPortableV1 | null;
  tokenPartyId: string | null;
  urlSignerRoleId: string | null;
  urlCounterpartyId: string;
  urlRecipientIndex: number | null;
  urlRecipientName: string;
  urlRecipientEmail: string;
}): Vs01RecipientIdentityAuthority | Vs01RecipientIdentityMismatch {
  const portable = args.portable;
  const urlRoleId = (args.urlSignerRoleId ?? "").trim();
  const urlCp = args.urlCounterpartyId.trim();
  const tokenPid = (args.tokenPartyId ?? "").trim();

  if (!portable || portable.roles.length < 2) {
    if (urlRoleId && urlCp) {
      return {
        lockedSignerRoleId: urlRoleId,
        lockedCounterpartyId: urlCp,
        recipientName: args.urlRecipientName.trim() || "Recipient",
        recipientEmail: args.urlRecipientEmail.trim(),
        partyIndex: args.urlRecipientIndex ?? 0,
        source: "url_bootstrap",
      };
    }
    return mismatch(
      "missing_packet_roles",
      "This signing link could not be verified. Ask the sender for a new link.",
      { hasPortable: Boolean(portable), roleCount: portable?.roles.length ?? 0 },
    );
  }

  let authoritativeRole: Vs01CanonicalPacketPortableRole | null = null;
  let source: Vs01RecipientIdentityAuthority["source"] = "packet_url";

  if (tokenPid) {
    authoritativeRole = findPortableRoleForPartyId(portable, tokenPid);
    if (!authoritativeRole) {
      return mismatch(
        "token_party_not_in_packet",
        "This signing link could not be matched to this agreement. Request a new link from the sender.",
        { tokenPartyId: tokenPid.slice(0, 24) },
      );
    }
    source = "token_packet";

    const authCp = roleCounterpartyId(authoritativeRole);
    const authRoleId = authoritativeRole.roleId.trim();

    if (urlRoleId && urlRoleId !== authRoleId) {
      return mismatch(
        "url_signer_role_token_mismatch",
        "This signing link does not match your invite. Open the link from your email or ask the sender to resend.",
        {
          urlSignerRoleIdShort: urlRoleId.slice(0, 24),
          tokenRoleIdShort: authRoleId.slice(0, 24),
          tokenPartyId: tokenPid.slice(0, 24),
        },
      );
    }
    if (urlCp && urlCp !== authCp) {
      return mismatch(
        "url_counterparty_token_mismatch",
        "This signing link does not match your invite. Open the link from your email or ask the sender to resend.",
        {
          urlCounterpartyId: urlCp.slice(0, 24),
          tokenCounterpartyId: authCp.slice(0, 24),
        },
      );
    }
  } else if (urlRoleId) {
    authoritativeRole = portable.roles.find((r) => r.roleId === urlRoleId) ?? null;
    if (!authoritativeRole) {
      return mismatch(
        "url_signer_role_not_in_packet",
        "This signing link could not be verified. Ask the sender for a new link.",
        { urlSignerRoleIdShort: urlRoleId.slice(0, 24) },
      );
    }
    if (urlCp) {
      const authCp = roleCounterpartyId(authoritativeRole);
      if (authCp !== urlCp) {
        return mismatch(
          "url_counterparty_role_mismatch",
          "This signing link does not match your invite. Ask the sender for a new link.",
          { urlCounterpartyId: urlCp.slice(0, 24), roleCounterpartyId: authCp.slice(0, 24) },
        );
      }
    }
  } else if (urlCp) {
    authoritativeRole = findPortableRoleForPartyId(portable, urlCp);
    if (!authoritativeRole) {
      return mismatch(
        "url_counterparty_not_in_packet",
        "This signing link could not be verified. Ask the sender for a new link.",
        { urlCounterpartyId: urlCp.slice(0, 24) },
      );
    }
  } else if (
    args.urlRecipientIndex != null &&
    Number.isFinite(args.urlRecipientIndex) &&
    args.urlRecipientIndex >= 0
  ) {
    authoritativeRole =
      portable.roles.find((r) => r.partyIndex === args.urlRecipientIndex) ?? null;
    if (!authoritativeRole) {
      return mismatch(
        "url_recipient_index_not_in_packet",
        "This signing link could not be verified. Ask the sender for a new link.",
        { urlRecipientIndex: args.urlRecipientIndex },
      );
    }
  }

  if (!authoritativeRole) {
    return mismatch(
      "recipient_identity_unresolved",
      "This signing link could not be verified. Ask the sender for a new link.",
      { hasTokenParty: Boolean(tokenPid), hasUrlRole: Boolean(urlRoleId), hasUrlCp: Boolean(urlCp) },
    );
  }

  const lockedCounterpartyId = roleCounterpartyId(authoritativeRole);
  const lockedSignerRoleId = authoritativeRole.roleId.trim();
  const recipientName =
    roleDisplayName(authoritativeRole) || args.urlRecipientName.trim() || "Recipient";
  const recipientEmail = roleEmail(authoritativeRole) || args.urlRecipientEmail.trim();

  return {
    lockedSignerRoleId,
    lockedCounterpartyId,
    recipientName,
    recipientEmail,
    partyIndex: authoritativeRole.partyIndex,
    source,
  };
}

/** After identity is locked, ensure at least one scoped signature field exists. */
export function assertRecipientScopedFieldsMatchIdentity(args: {
  portable: Vs01CanonicalPacketPortableV1;
  identity: Vs01RecipientIdentityAuthority;
  initialsEnabled: boolean;
}): Vs01RecipientIdentityMismatch | null {
  const manifestFields = args.initialsEnabled
    ? args.portable.fields
    : args.portable.fields.filter((f) => f.type !== "initials");
  const scoped = scopeRecipientManifestToLockedSigner({
    fields: manifestFields,
    lockedCounterpartyId: args.identity.lockedCounterpartyId,
    lockedSignerRoleId: args.identity.lockedSignerRoleId,
    portableRoles: args.portable.roles,
  });
  const hasSignature = scoped.some((f) => f.type === "signature");
  if (!hasSignature) {
    return mismatch(
      "scoped_fields_missing_signature",
      "Your signing fields could not be loaded. Ask the sender to resend your signing link.",
      {
        signerRoleIdShort: args.identity.lockedSignerRoleId.slice(0, 24),
        scopedFieldCount: scoped.length,
      },
    );
  }
  return null;
}

export function portableRolePartyId(role: Vs01CanonicalPacketPortableRole): string {
  return (role.vs01CounterpartyId ?? role.partyId).trim();
}

export function findPortableRoleBySignerRoleId(
  portable: Vs01CanonicalPacketPortableV1,
  signerRoleId: string,
): Vs01CanonicalPacketPortableRole | null {
  const rid = signerRoleId.trim();
  if (!rid) return null;
  return portable.roles.find((r) => r.roleId.trim() === rid) ?? null;
}

/** Authoritative signer count for VS01 recipient/server packet surfaces. */
export function resolveVs01SignerCountFromPortablePacket(
  portable: Vs01CanonicalPacketPortableV1 | null | undefined,
): number {
  const count =
    portable?.roles.filter((r) => r.requiresSignature !== false).length ?? 0;
  if (count < 2) {
    throw new Error(
      `[vs01-signer-count-authority] portable packet missing authoritative roles (count=${count})`,
    );
  }
  return count;
}

/**
 * Hard guard before persisting completion — participant + role must match portable packet row.
 */
export function assertVs01CompletionIdentityAuthoritative(args: {
  portable: Vs01CanonicalPacketPortableV1 | null;
  signerRoleId: string;
  participantId: string | null | undefined;
}): { ok: true } | { ok: false; code: string; message: string } {
  const portable = args.portable;
  const signerRoleId = args.signerRoleId.trim();
  const participantId = (args.participantId ?? "").trim();
  if (!portable || !signerRoleId) {
    return { ok: true };
  }
  const role = findPortableRoleBySignerRoleId(portable, signerRoleId);
  if (!role) {
    return {
      ok: false,
      code: "completion_signer_role_not_in_packet",
      message: "Signing could not be recorded for this party. Ask the sender for a new link.",
    };
  }
  const authoritativePartyId = portableRolePartyId(role);
  if (participantId && authoritativePartyId && participantId !== authoritativePartyId) {
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
      // eslint-disable-next-line no-console
      console.warn("[vs01-recipient-identity-mismatch]", {
        code: "completion_participant_role_mismatch",
        signerRoleIdShort: signerRoleId.slice(0, 24),
        participantId: participantId.slice(0, 24),
        authoritativePartyId: authoritativePartyId.slice(0, 24),
      });
    }
    return {
      ok: false,
      code: "completion_participant_role_mismatch",
      message: "Signing could not be recorded for this party. Open the link from your email.",
    };
  }
  return { ok: true };
}

export function rehydrateRecipientFieldsForIdentity(args: {
  portable: Vs01CanonicalPacketPortableV1;
  identity: Vs01RecipientIdentityAuthority;
  initialsEnabled: boolean;
  existingFields: readonly Vs01RecipientPlacedField[];
}): Vs01RecipientPlacedField[] {
  const manifestFields = args.initialsEnabled
    ? args.portable.fields
    : args.portable.fields.filter((f) => f.type !== "initials");
  const scoped = scopeRecipientManifestToLockedSigner({
    fields: manifestFields,
    lockedCounterpartyId: args.identity.lockedCounterpartyId,
    lockedSignerRoleId: args.identity.lockedSignerRoleId,
    portableRoles: args.portable.roles,
  });
  if (scoped.length > 0) return scoped;
  return [...args.existingFields];
}
