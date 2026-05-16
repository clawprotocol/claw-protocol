import type { PlacedSigningField, SigningFieldType, SigningPlacementValueContext } from "./signingFields";
import {
  ownerPadFromPlacementContext,
  resolveRolePlausibleEmail,
  resolveVs01FieldValueForRole,
  type Vs01SignerRuntimeContext,
} from "./vs01FieldValueResolution";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { vs01DiagnosticsEnabled, type PreparePlacementValueContext } from "./vs01SignerFieldAssignment";

/** Stored field value at prepare placement time. */
export function defaultPrepareTemplateStoredValue(
  type: SigningFieldType,
  role: Vs01PrepareSigningRole,
  ownerCtx: SigningPlacementValueContext,
): string {
  return resolveVs01FieldValueForRole({
    fieldType: type,
    role,
    mode: "prepare_stored",
    ownerPad: ownerPadFromPlacementContext(ownerCtx),
  });
}

/** @deprecated Use ownerPadFromPlacementContext + resolveVs01FieldValueForRole. */
export function buildPrepareTemplateValueContext(
  role: Vs01PrepareSigningRole,
  ownerFallback: PreparePlacementValueContext,
): SigningPlacementValueContext {
  if (role.kind === "owner") {
    return {
      typedName: ownerFallback.typedName,
      initials: ownerFallback.initials,
      signerEmail: ownerFallback.signerEmail,
    };
  }
  return { typedName: "", initials: "", signerEmail: undefined };
}

export function resolvePrepareFieldDisplayValue(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole | null,
  ownerPad?: Vs01SignerRuntimeContext,
): string {
  if (!role) return typeof field.value === "string" ? field.value : "";
  return resolveVs01FieldValueForRole({
    fieldType: field.type,
    role,
    mode: "prepare_display",
    storedValue: typeof field.value === "string" ? field.value : "",
    ownerPad,
  });
}

export type PrepareTemplateDisplay = {
  body: string;
  assigneeLine: string;
  isPlaceholder: boolean;
};

export function prepareTemplateDisplayForField(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole | null,
  ownerPad?: Vs01SignerRuntimeContext,
): PrepareTemplateDisplay {
  const entity = (role?.entityName ?? field.assignedSignerRoleLabel ?? "").trim() || "Signer";
  const kind = role?.kind ?? field.assignedSignerRoleKind ?? "owner";
  const resolved = resolvePrepareFieldDisplayValue(field, role, ownerPad);

  switch (field.type) {
    case "signature": {
      if (kind === "counterparty") {
        return {
          body: resolved.trim() || "Signer signs here",
          assigneeLine: entity,
          isPlaceholder: !resolved.trim(),
        };
      }
      return {
        body: resolved.trim() || "Your signature",
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
    }
    case "initials":
      return {
        body: resolved.trim().slice(0, 8) || (kind === "owner" ? "Your initials" : "Initials"),
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
    case "printed_name":
      return {
        body: resolved.trim() || "Printed name",
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
    case "text":
      return {
        body: resolved.trim() || (kind === "counterparty" ? "Title" : "Add text"),
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
    case "email": {
      const emailHint = role ? resolveRolePlausibleEmail(role) : "";
      return {
        body: resolved.trim() || emailHint || "Email",
        assigneeLine: entity,
        isPlaceholder: !resolved.trim() && !emailHint,
      };
    }
    case "date":
      return {
        body: resolved.trim() || "Date",
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
    default:
      return {
        body: resolved.trim() || "Field",
        assigneeLine: entity,
        isPlaceholder: !resolved.trim(),
      };
  }
}

export function prepareTemplateCornerLabel(
  type: SigningFieldType,
  role: Vs01PrepareSigningRole | null,
): string {
  const entity = (role?.entityName ?? "").trim();
  switch (type) {
    case "signature":
      return entity ? `Signature — ${entity}` : "Signature";
    case "initials":
      return entity ? `Initials — ${entity}` : "Initials";
    case "printed_name":
      return "Printed name";
    case "text":
      return "Title";
    case "email":
      return "Email";
    case "date":
      return "Date";
    default:
      return type;
  }
}

export function logVs01PlacementClickRole(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-placement-click-role]", payload);
}

export function logVs01PlacementFieldAdded(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-placement-field-added]", payload);
}

export function logVs01PlacementFieldRejected(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-placement-field-rejected]", payload);
}

export function logVs01TemplateRenderValue(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-template-render-value]", payload);
}

export function logVs01FieldInputFocus(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-field-input-focus]", payload);
}
