import { normalizeSignerMetadataForSave } from "../agreement/signerMetadataNormalize";
import type { PlacedSigningField, SigningPlacementValueContext } from "./signingFields";
import { logVs01FieldSignerValueApplied } from "./vs01FieldValueResolution";
import { defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export type PrepareSignerMetadataPatch = {
  signerName?: string;
  signerTitle?: string;
};

/** Store raw signer metadata (for controlled inputs — normalize on blur). */
export function patchCounterpartySignerMetadataRaw(
  counterparties: Vs01Counterparty[],
  counterpartyId: string,
  patch: PrepareSignerMetadataPatch,
): Vs01Counterparty[] {
  return counterparties.map((c) => {
    if (c.id !== counterpartyId) return c;
    const next: Vs01Counterparty = { ...c };
    if (patch.signerName !== undefined) {
      next.signerName = patch.signerName.length > 0 ? patch.signerName : undefined;
    }
    if (patch.signerTitle !== undefined) {
      next.signerTitle = patch.signerTitle.length > 0 ? patch.signerTitle : undefined;
    }
    return next;
  });
}

export function patchCounterpartySignerMetadata(
  counterparties: Vs01Counterparty[],
  counterpartyId: string,
  patch: PrepareSignerMetadataPatch,
): Vs01Counterparty[] {
  const normalized: PrepareSignerMetadataPatch = { ...patch };
  if (patch.signerName !== undefined) {
    normalized.signerName = normalizeSignerMetadataForSave(patch.signerName) ?? "";
  }
  if (patch.signerTitle !== undefined) {
    normalized.signerTitle = normalizeSignerMetadataForSave(patch.signerTitle) ?? "";
  }
  return patchCounterpartySignerMetadataRaw(counterparties, counterpartyId, normalized);
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
  /** Owner signature pad typed name (not entity party name). */
  signatureTypedName?: string;
  signatureInitials?: string;
}): SigningPlacementValueContext {
  return {
    typedName: (args.signatureTypedName ?? "").trim(),
    initials: (args.signatureInitials ?? "").trim(),
    signerEmail: args.creatorEmail?.trim() || undefined,
  };
}

const SEED_FIELD_TYPES = new Set(["printed_name", "text", "initials"]);

/** Pre-populate empty placed fields from role signerName/signerTitle after bridge hydrate. */
export function seedPrepareFieldsFromRoleSignerMetadata<T extends PlacedSigningField>(
  fields: T[],
  roles: Vs01PrepareSigningRole[],
  valueCtxForRole: (role: Vs01PrepareSigningRole) => SigningPlacementValueContext,
): T[] {
  const roleById = new Map(roles.map((r) => [r.roleId, r]));
  return fields.map((f) => {
    if ((f.value ?? "").trim()) return f;
    if (!SEED_FIELD_TYPES.has(f.type)) return f;
    const rid = (f.assignedSignerRoleId ?? "").trim();
    const role = (rid ? roleById.get(rid) : null) ?? roles[0];
    if (!role) return f;
    if (f.type === "text" && !(role.signerTitle ?? "").trim()) return f;
    if (f.type === "printed_name" && !(role.signerName ?? "").trim() && role.kind === "counterparty") {
      return f;
    }
    if (f.type === "initials" && !(role.signerName ?? "").trim() && role.kind === "counterparty") {
      return f;
    }
    const ctx = valueCtxForRole(role);
    const nextValue = defaultPrepareTemplateStoredValue(f.type, role, ctx);
    if (!(nextValue ?? "").trim()) return f;
    logVs01FieldSignerValueApplied({
      fieldType: f.type,
      roleIdShort: role.roleId.slice(0, 16),
      roleKind: role.kind,
      valueLen: nextValue.length,
    });
    return { ...f, value: nextValue };
  });
}

export function logVs01PrepareSignerMetadataUpdated(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-signer-metadata-updated]", payload);
}

