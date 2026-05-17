import type { PlacedSigningField, SigningPlacementValueContext } from "./signingFields";
import { defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export type PrepareSignerMetadataPatch = {
  signerName?: string;
  signerTitle?: string;
};

export function patchCounterpartySignerMetadata(
  counterparties: Vs01Counterparty[],
  counterpartyId: string,
  patch: PrepareSignerMetadataPatch,
): Vs01Counterparty[] {
  return counterparties.map((c) => {
    if (c.id !== counterpartyId) return c;
    const next: Vs01Counterparty = { ...c };
    if (patch.signerName !== undefined) {
      next.signerName = patch.signerName.trim() || undefined;
    }
    if (patch.signerTitle !== undefined) {
      next.signerTitle = patch.signerTitle.trim() || undefined;
    }
    return next;
  });
}

const FIELD_TYPES_SYNC_ON_SIGNER_METADATA = new Set(["printed_name", "text", "initials"]);

function syncFieldValueForRoleMetadata(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole,
  valueCtx: SigningPlacementValueContext,
): PlacedSigningField {
  if ((field.assignedSignerRoleId ?? "").trim() !== role.roleId) return field;
  if (!FIELD_TYPES_SYNC_ON_SIGNER_METADATA.has(field.type)) return field;
  const nextValue = defaultPrepareTemplateStoredValue(field.type, role, valueCtx);
  return { ...field, value: nextValue };
}

/** Recompute stored values for printed_name/title/initials when role signer metadata changes. */
export function syncSenderFieldsForRoleSignerMetadata(
  fields: PlacedSigningField[],
  role: Vs01PrepareSigningRole,
  valueCtx: SigningPlacementValueContext,
): PlacedSigningField[] {
  return fields.map((f) => syncFieldValueForRoleMetadata(f, role, valueCtx));
}

export function syncRecipientFieldsForRoleSignerMetadata(
  fields: Vs01RecipientPlacedField[],
  role: Vs01PrepareSigningRole,
  valueCtx: SigningPlacementValueContext,
): Vs01RecipientPlacedField[] {
  return fields.map((f) => syncFieldValueForRoleMetadata(f as PlacedSigningField, role, valueCtx) as Vs01RecipientPlacedField);
}

export function buildOwnerPlacementValueContext(args: {
  creatorName: string;
  creatorEmail?: string;
}): SigningPlacementValueContext {
  return {
    typedName: args.creatorName.trim(),
    initials: "",
    signerEmail: args.creatorEmail?.trim() || undefined,
  };
}

export function logVs01PrepareSignerMetadataUpdated(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-signer-metadata-updated]", payload);
}

