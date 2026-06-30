/**
 * Authoritative completed-signer By: overlay resolution — audit + role keyed only.
 * Never borrow signature field values from another party's slot.
 */

import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import type { Vs01RecipientPlacedField } from "./types";
import type { Vs01SignatureCompletedEvent } from "./vs01FullyExecutedSignedSnapshot";

export type CompletedSignerOverlayFallback =
  | "assigned_signer_role_id_field"
  | "party_index_and_email_field"
  | "audit_display_name"
  | "role_signer_name"
  | "none";

export type CompletedSignerOverlayResolution = {
  byText: string;
  fallbackUsed: CompletedSignerOverlayFallback;
  fieldAssignedSignerRoleId: string | null;
  fieldId: string | null;
};

const overlayLogOnce = new Set<string>();

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function fieldEmail(field: Vs01RecipientPlacedField): string {
  return normalizeEmail(field.assignedSignerEmail);
}

function isSignatureOverlayField(field: Vs01RecipientPlacedField): boolean {
  return field.type === "signature" && !field.autoInitials;
}

export function resolvePartyIndexForSignerRole(
  portable: Vs01CanonicalPacketPortableV1,
  signerRoleId: string,
): number {
  const rid = signerRoleId.trim();
  const role = portable.roles.find((r) => (r.roleId ?? "").trim() === rid);
  if (!role || role.partyIndex == null || role.partyIndex < 0) {
    throw new Error(
      `[completed-signer-overlay] missing partyIndex for signerRoleId=${rid.slice(0, 24)}`,
    );
  }
  return role.partyIndex;
}

export function resolveCompletedSignerByText(args: {
  agreementId: string;
  source: string;
  signerRoleId: string;
  partyIndex: number;
  signerEmail?: string | null;
  roleSignerName?: string | null;
  auditDisplayName?: string | null;
  fields: readonly Vs01RecipientPlacedField[];
}): CompletedSignerOverlayResolution {
  const rid = args.signerRoleId.trim();
  const partyIndex = args.partyIndex;
  const targetEmail = normalizeEmail(args.signerEmail);

  const assignedField = args.fields.find(
    (f) => isSignatureOverlayField(f) && (f.assignedSignerRoleId ?? "").trim() === rid,
  );
  const assignedValue =
    typeof assignedField?.value === "string" ? assignedField.value.trim() : "";
  if (assignedValue) {
    return {
      byText: assignedValue,
      fallbackUsed: "assigned_signer_role_id_field",
      fieldAssignedSignerRoleId: rid,
      fieldId: assignedField?.id ?? null,
    };
  }

  if (targetEmail) {
    const partyEmailField = args.fields.find((f) => {
      if (!isSignatureOverlayField(f)) return false;
      if ((f.assignedSignerRoleId ?? "").trim()) return false;
      if ((f.assignedPartyIndex ?? -1) !== partyIndex) return false;
      const fieldMail = fieldEmail(f);
      return Boolean(fieldMail) && fieldMail === targetEmail;
    });
    const partyEmailValue =
      typeof partyEmailField?.value === "string" ? partyEmailField.value.trim() : "";
    if (partyEmailValue) {
      return {
        byText: partyEmailValue,
        fallbackUsed: "party_index_and_email_field",
        fieldAssignedSignerRoleId: null,
        fieldId: partyEmailField?.id ?? null,
      };
    }
  }

  const auditName = (args.auditDisplayName ?? "").trim();
  if (auditName) {
    return {
      byText: auditName,
      fallbackUsed: "audit_display_name",
      fieldAssignedSignerRoleId: assignedField ? rid : null,
      fieldId: assignedField?.id ?? null,
    };
  }

  const roleName = (args.roleSignerName ?? "").trim();
  if (roleName) {
    return {
      byText: roleName,
      fallbackUsed: "role_signer_name",
      fieldAssignedSignerRoleId: null,
      fieldId: null,
    };
  }

  return {
    byText: "",
    fallbackUsed: "none",
    fieldAssignedSignerRoleId: null,
    fieldId: null,
  };
}

export function logCompletedSignerOverlaySource(args: {
  agreementId: string;
  source: string;
  partyIndex: number;
  partyName: string;
  signerRoleId: string;
  auditDisplayName: string;
  fieldAssignedSignerRoleId: string | null;
  resolvedBy: string;
  resolvedName: string;
  fallbackUsed: CompletedSignerOverlayFallback;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const aid = args.agreementId.trim();
  const key = `${aid}:${args.source}:${args.partyIndex}:${args.signerRoleId}`;
  if (overlayLogOnce.has(key)) return;
  overlayLogOnce.add(key);
  // eslint-disable-next-line no-console
  console.info("[completed-signer-overlay-source]", {
    agreementId: aid,
    source: args.source,
    partyIndex: args.partyIndex,
    partyName: args.partyName,
    signerRoleId: args.signerRoleId,
    auditDisplayName: args.auditDisplayName,
    fieldAssignedSignerRoleId: args.fieldAssignedSignerRoleId,
    resolvedBy: args.resolvedBy,
    resolvedName: args.resolvedName,
    fallbackUsed: args.fallbackUsed,
  });
}

export function resolveCompletedSignerByFromEvent(args: {
  agreementId: string;
  source: string;
  portable: Vs01CanonicalPacketPortableV1;
  event: Vs01SignatureCompletedEvent;
}): CompletedSignerOverlayResolution & { partyIndex: number; partyName: string; signerEmail: string } {
  const partyIndex = resolvePartyIndexForSignerRole(args.portable, args.event.signerRoleId);
  const role = args.portable.roles.find((r) => (r.roleId ?? "").trim() === args.event.signerRoleId.trim());
  const partyName = (role?.entityName || role?.partyName || "").trim();
  const signerEmail = (role?.signerEmail ?? role?.reviewEmail ?? "").trim();
  const resolved = resolveCompletedSignerByText({
    agreementId: args.agreementId,
    source: args.source,
    signerRoleId: args.event.signerRoleId,
    partyIndex,
    signerEmail,
    roleSignerName: role?.signerName,
    auditDisplayName: args.event.displayName,
    fields: args.portable.fields,
  });
  logCompletedSignerOverlaySource({
    agreementId: args.agreementId,
    source: args.source,
    partyIndex,
    partyName,
    signerRoleId: args.event.signerRoleId,
    auditDisplayName: args.event.displayName,
    fieldAssignedSignerRoleId: resolved.fieldAssignedSignerRoleId,
    resolvedBy: resolved.byText,
    resolvedName: (role?.signerName ?? args.event.displayName).trim(),
    fallbackUsed: resolved.fallbackUsed,
  });
  return { ...resolved, partyIndex, partyName, signerEmail };
}

/** Test-only reset for log-once guard. */
export function resetCompletedSignerOverlayLogForTests(): void {
  overlayLogOnce.clear();
}
