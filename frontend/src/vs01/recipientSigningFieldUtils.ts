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
 */
export function resolveRecipientSigningAutoValue(
  field: Vs01RecipientPlacedField,
  cpById: Map<string, Vs01Counterparty>,
): string {
  const cp = counterpartyForField(field, cpById);
  const partyName = cp?.name.trim() || "";
  const signerName = (cp?.signerName ?? "").trim();
  const signerTitle = (cp?.signerTitle ?? "").trim();
  const email = (cp?.signerEmail ?? cp?.email ?? field.assignedSignerEmail ?? "").trim();

  switch (field.type) {
    case "printed_name":
      return signerName || partyName || field.assignedSignerRoleLabel?.trim() || "";
    case "text":
      if (field.textPurpose === "title") return signerTitle;
      return typeof field.value === "string" ? field.value.trim() : "";
    case "email":
      return isPlausibleEmail(email) ? email : "";
    case "date":
      return todayIsoDate();
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
 * Finish gate: only current signer's signature + initials (metadata auto-counts).
 */
export function recipientFinishGateComplete(myFields: Vs01RecipientPlacedField[]): boolean {
  const editable = myFields.filter((f) => isRecipientSigningEditableType(f.type));
  if (editable.length === 0) return false;
  return editable.every(recipientEditableFieldIsComplete);
}

export function recipientFinishGateEditableFields(
  myFields: Vs01RecipientPlacedField[],
): Vs01RecipientPlacedField[] {
  return myFields.filter((f) => isRecipientSigningEditableType(f.type));
}

/** Count distinct signing actions (signature + each initials field) for accurate header copy. */
export function countRecipientSigningActions(
  myFields: readonly Vs01RecipientPlacedField[],
): number {
  let count = 0;
  if (myFields.some((f) => f.type === "signature")) count += 1;
  count += myFields.filter((f) => f.type === "initials").length;
  return count;
}

export function recipientSigningActionsLabel(actionCount: number): string {
  if (actionCount <= 0) return "";
  if (actionCount === 1) {
    return "1 action required (signature or initials)";
  }
  return `${actionCount} actions required (signature and initials on document pages)`;
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
    return isRecipientSignerMarkedComplete(agreementId, signerKey) ? "signed" : "waiting";
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

/** Clear signature/initials values for the locked signer unless that signer already finished (fresh session). */
export function stripLockedSignerEditableValuesOnHydrate(
  fields: Vs01RecipientPlacedField[],
  agreementId: string | null | undefined,
  lockedSignerRoleId: string | null,
): Vs01RecipientPlacedField[] {
  const lock = (lockedSignerRoleId ?? "").trim();
  if (!lock) return fields;
  const signerComplete = isRecipientSignerMarkedComplete(agreementId, lock);
  return fields.map((f) => {
    const eff = (f.assignedSignerRoleId ?? "").trim();
    const belongsToLock = eff ? eff === lock : true;
    if (!belongsToLock || !isRecipientSigningEditableType(f.type)) return f;
    if (signerComplete) return f;
    const v = typeof f.value === "string" ? f.value.trim() : "";
    return v ? { ...f, value: "" } : f;
  });
}

/** Hydrate read-only metadata values; keep signature/initials empty for signer entry. */
export function hydrateRecipientSigningFields(
  fields: Vs01RecipientPlacedField[],
  cpById: Map<string, Vs01Counterparty>,
): Vs01RecipientPlacedField[] {
  return fields.map((f) => {
    if (isRecipientSigningEditableType(f.type)) {
      const v = typeof f.value === "string" ? f.value.trim() : "";
      return v ? f : { ...f, value: "" };
    }
    const auto = resolveRecipientSigningAutoValue(f, cpById);
    return { ...f, value: auto };
  });
}
