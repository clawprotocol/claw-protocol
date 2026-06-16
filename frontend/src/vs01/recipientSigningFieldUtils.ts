import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { isPlausibleEmail } from "./detailsStepValidation";
import { readSigningPacketStatus } from "./vs01SigningPacketStatusStore";

/** Only signature and initials are filled by the signer on the execution page. */
export function isRecipientSigningEditableType(type: Vs01RecipientPlacedField["type"]): boolean {
  return type === "signature" || type === "initials";
}

export function isRecipientSigningMetadataType(type: Vs01RecipientPlacedField["type"]): boolean {
  return (
    type === "printed_name" ||
    type === "text" ||
    type === "email" ||
    type === "date"
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function counterpartyForField(
  field: Vs01RecipientPlacedField,
  cpById: Map<string, Vs01Counterparty>,
): Vs01Counterparty | undefined {
  return cpById.get(field.counterpartyId.trim());
}

/** Stable key for matching signature fields across manifest merges. */
export function recipientSignatureFieldKey(f: Vs01RecipientPlacedField): string {
  const rid = (f.assignedSignerRoleId ?? "").trim();
  if (rid) return `role:${rid}`;
  const cp = f.counterpartyId.trim();
  const pi = f.assignedPartyIndex ?? -1;
  return `party:${pi}:${cp}`;
}

/** Stable key matching {@link patchSignerPacketStatus} / handoff rows. */
export function signerKeyForRecipientField(field: Vs01RecipientPlacedField): string {
  const role = (field.assignedSignerRoleId ?? "").trim();
  if (role) return role;
  const cp = field.counterpartyId.trim();
  return cp || "signer";
}

/** True only after the owning signer chose Finish signing (local packet status store). */
export function isRecipientSignerMarkedComplete(
  agreementId: string | null | undefined,
  signerKey: string,
): boolean {
  const aid = (agreementId ?? "").trim();
  const key = signerKey.trim();
  if (!aid || !key) return false;
  const snap = readSigningPacketStatus(aid);
  return snap?.bySignerKey[key] === "signed";
}

/**
 * Resolved display value for read-only metadata fields (printed name, title, email, date).
 * Signature/initials never auto-fill from metadata or prepare-stored values.
 */
export function resolveRecipientSigningAutoValue(
  field: Vs01RecipientPlacedField,
  cpById: Map<string, Vs01Counterparty>,
  agreementId?: string | null,
): string {
  const cp = counterpartyForField(field, cpById);
  const partyName = cp?.name.trim() || "";
  const signerName = (cp?.signerName ?? "").trim();
  const signerTitle = (cp?.signerTitle ?? "").trim();
  const email = (cp?.signerEmail ?? cp?.email ?? field.assignedSignerEmail ?? "").trim();
  const signerKey = signerKeyForRecipientField(field);
  const signerDone = isRecipientSignerMarkedComplete(agreementId, signerKey);

  switch (field.type) {
    case "printed_name":
      return signerName || partyName || field.assignedSignerRoleLabel?.trim() || "";
    case "text":
      if (field.textPurpose === "title") return signerTitle;
      return typeof field.value === "string" ? field.value.trim() : "";
    case "email":
      return isPlausibleEmail(email) ? email : "";
    case "date": {
      if (!signerDone) return "";
      const stored = typeof field.value === "string" ? field.value.trim() : "";
      return stored || todayIsoDate();
    }
    case "signature":
    case "initials":
      return "";
    default:
      return typeof field.value === "string" ? field.value.trim() : "";
  }
}

/** Editable field has a non-empty signer-entered value. */
export function recipientEditableFieldIsComplete(field: Vs01RecipientPlacedField): boolean {
  if (!isRecipientSigningEditableType(field.type)) return true;
  const v = typeof field.value === "string" ? field.value.trim() : "";
  return v.length > 0;
}

/**
 * Finish gate: only current signer's signature + initials (when enabled).
 */
export function recipientFinishGateComplete(
  myFields: Vs01RecipientPlacedField[],
  opts?: { initialsEnabled?: boolean },
): boolean {
  const editable = recipientFinishGateEditableFields(myFields, opts);
  if (editable.length === 0) return false;
  return editable.every(recipientEditableFieldIsComplete);
}

export function recipientFinishGateEditableFields(
  myFields: Vs01RecipientPlacedField[],
  opts?: { initialsEnabled?: boolean },
): Vs01RecipientPlacedField[] {
  const initialsOn = opts?.initialsEnabled === true;
  return myFields.filter((f) => {
    if (!isRecipientSigningEditableType(f.type)) return false;
    if (f.type === "initials" && !initialsOn) return false;
    return true;
  });
}

/** Display value for locked/completed signer signature or initials overlays. */
export function resolvePersistedSignerFieldDisplayValue(
  field: Vs01RecipientPlacedField,
  agreementId: string | null | undefined,
  cpById: Map<string, Vs01Counterparty>,
): string {
  if (isRecipientSigningEditableType(field.type)) {
    const signerKey = signerKeyForRecipientField(field);
    if (!isRecipientSignerMarkedComplete(agreementId, signerKey)) return "";
    const v = typeof field.value === "string" ? field.value.trim() : "";
    return v;
  }
  return resolveRecipientSigningAutoValue(field, cpById, agreementId);
}

/** Count distinct signing actions for the current signer (signature + optional initials). */
export function countRecipientSigningActions(
  myFields: readonly Vs01RecipientPlacedField[],
  opts?: { initialsEnabled?: boolean },
): number {
  const initialsOn = opts?.initialsEnabled === true;
  let count = 0;
  if (myFields.some((f) => f.type === "signature")) count += 1;
  if (initialsOn) count += myFields.filter((f) => f.type === "initials").length;
  return count;
}

export function recipientSigningActionsLabel(
  actionCount: number,
  opts?: { initialsEnabled?: boolean },
): string {
  if (actionCount <= 0) return "";
  const initialsOn = opts?.initialsEnabled === true;
  if (actionCount === 1) {
    return initialsOn
      ? "1 action required (signature or initials)"
      : "1 action required (signature)";
  }
  return initialsOn
    ? `${actionCount} actions required (signature and initials on document pages)`
    : `${actionCount} actions required (signature)`;
}

export function logRecipientSigningActionCounts(args: {
  signerRoleId: string | null;
  agreementId: string | null;
  totalScopedFields: number;
  actionableFields: number;
  initialsEnabled: boolean;
  requiredCount: number;
  completedCount: number;
  missingFieldIds: string[];
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-recipient-signing-action-count]", {
    signerRoleIdShort: args.signerRoleId ? args.signerRoleId.slice(0, 20) : null,
    agreementIdShort: args.agreementId ? args.agreementId.slice(0, 16) : null,
    totalScopedFields: args.totalScopedFields,
    actionableFields: args.actionableFields,
    initialsEnabled: args.initialsEnabled,
    requiredCount: args.requiredCount,
    completedCount: args.completedCount,
    missingFieldIds: args.missingFieldIds,
  });
}

/** @deprecated Use {@link recipientEditableFieldIsComplete} for finish gate. */
export function recipientSigningFieldIsComplete(
  field: Vs01RecipientPlacedField,
  cpById: Map<string, Vs01Counterparty>,
): boolean {
  if (isRecipientSigningEditableType(field.type)) {
    return recipientEditableFieldIsComplete(field);
  }
  return resolveRecipientSigningAutoValue(field, cpById).length > 0;
}

export type RecipientFieldStatusPill =
  | null
  | "waiting"
  | "signed"
  | "click-to-sign"
  | "needs-initials"
  | "ready";

export function recipientFieldStatusPill(args: {
  field: Vs01RecipientPlacedField;
  isCurrentSignerField: boolean;
  agreementId: string | null | undefined;
}): RecipientFieldStatusPill {
  const { field, isCurrentSignerField, agreementId } = args;
  const signerKey = signerKeyForRecipientField(field);

  if (!isCurrentSignerField) {
    if (isRecipientSignerMarkedComplete(agreementId, signerKey)) {
      return "signed";
    }
    return "waiting";
  }

  if (!isRecipientSigningEditableType(field.type)) {
    return null;
  }

  const v = typeof field.value === "string" ? field.value.trim() : "";
  if (field.type === "signature") {
    return v ? "ready" : "click-to-sign";
  }
  if (field.type === "initials") {
    return v ? "ready" : "needs-initials";
  }
  return null;
}

export function recipientFieldStatusPillLabel(pill: RecipientFieldStatusPill): string | null {
  switch (pill) {
    case "waiting":
      return "Waiting";
    case "signed":
      return "Signed";
    case "click-to-sign":
      return "Click to sign here";
    case "needs-initials":
      return "Needs initials";
    case "ready":
      return "Ready";
    default:
      return null;
  }
}

export type RecipientSigningHydrationSource = "server_packet" | "local";

/**
 * Clear prepare-stored signature/initials for any signer not marked complete.
 * Never treat owner typedName or metadata as a completed signature before Finish signing.
 */
export function stripLockedSignerEditableValuesOnHydrate(
  fields: Vs01RecipientPlacedField[],
  agreementId: string | null | undefined,
  _lockedSignerRoleId: string | null,
  _opts?: { hydrationSource?: RecipientSigningHydrationSource },
): Vs01RecipientPlacedField[] {
  return fields.map((f) => {
    if (!isRecipientSigningEditableType(f.type)) return f;
    const signerKey = signerKeyForRecipientField(f);
    if (isRecipientSignerMarkedComplete(agreementId, signerKey)) return f;
    const v = typeof f.value === "string" ? f.value.trim() : "";
    if (!v) return f;
    return { ...f, value: "" };
  });
}

/** Hydrate read-only metadata values; keep signature/initials empty until that signer finishes. */
export function hydrateRecipientSigningFields(
  fields: Vs01RecipientPlacedField[],
  cpById: Map<string, Vs01Counterparty>,
  opts?: { preserveEditableValues?: boolean; agreementId?: string | null },
): Vs01RecipientPlacedField[] {
  const agreementId = opts?.agreementId;
  return fields.map((f) => {
    if (isRecipientSigningEditableType(f.type)) {
      const signerKey = signerKeyForRecipientField(f);
      const v = typeof f.value === "string" ? f.value.trim() : "";
      if (isRecipientSignerMarkedComplete(agreementId, signerKey) && v) return f;
      if (opts?.preserveEditableValues && v) return f;
      return { ...f, value: "" };
    }
    const auto = resolveRecipientSigningAutoValue(f, cpById, agreementId);
    return { ...f, value: auto };
  });
}
