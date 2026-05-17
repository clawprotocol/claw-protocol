import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { isPlausibleEmail } from "./detailsStepValidation";

/** Only signature and initials are filled by the signer on the execution page. */
export function isRecipientSigningEditableType(type: Vs01RecipientPlacedField["type"]): boolean {
  return type === "signature" || type === "initials";
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

/**
 * Resolved display/finish value for read-only metadata fields (printed name, title, email, date).
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

export function recipientSigningFieldIsComplete(
  field: Vs01RecipientPlacedField,
  cpById: Map<string, Vs01Counterparty>,
): boolean {
  if (isRecipientSigningEditableType(field.type)) {
    const v = typeof field.value === "string" ? field.value.trim() : "";
    return v.length > 0;
  }
  return resolveRecipientSigningAutoValue(field, cpById).length > 0;
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
