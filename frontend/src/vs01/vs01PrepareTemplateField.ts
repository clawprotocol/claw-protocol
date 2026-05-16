import type { PlacedSigningField, SigningFieldType, SigningPlacementValueContext } from "./signingFields";
import { defaultValueForType } from "./signingFields";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { vs01DiagnosticsEnabled, type PreparePlacementValueContext } from "./vs01SignerFieldAssignment";

/** Stored field values at prepare placement — templates only; never owner signature on counterparty fields. */
export function defaultPrepareTemplateStoredValue(
  type: SigningFieldType,
  role: Vs01PrepareSigningRole,
  ownerCtx: SigningPlacementValueContext,
): string {
  if (role.kind === "counterparty") {
    return "";
  }
  return defaultValueForType(type, ownerCtx);
}

/** Value context for stamping new prepare fields — owner may use pad defaults; counterparties stay empty. */
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

export type PrepareTemplateDisplay = {
  /** Primary line inside the field box (placeholder when empty). */
  body: string;
  /** Secondary assignee line for signature slots. */
  assigneeLine: string;
  isPlaceholder: boolean;
};

export function prepareTemplateDisplayForField(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole | null,
): PrepareTemplateDisplay {
  const textVal = typeof field.value === "string" ? field.value : "";
  const entity = (role?.entityName ?? field.assignedSignerRoleLabel ?? "").trim() || "Signer";
  const kind = role?.kind ?? field.assignedSignerRoleKind ?? "owner";

  switch (field.type) {
    case "signature": {
      if (textVal.trim()) {
        return { body: textVal.trim(), assigneeLine: entity, isPlaceholder: false };
      }
      if (kind === "counterparty") {
        return {
          body: "Signer signs here",
          assigneeLine: entity,
          isPlaceholder: true,
        };
      }
      return {
        body: "Your signature",
        assigneeLine: entity,
        isPlaceholder: true,
      };
    }
    case "initials": {
      if (textVal.trim()) {
        return { body: textVal.trim().slice(0, 8), assigneeLine: entity, isPlaceholder: false };
      }
      return {
        body: kind === "owner" ? "Your initials" : "Initials",
        assigneeLine: entity,
        isPlaceholder: true,
      };
    }
    case "printed_name":
      return {
        body: textVal.trim() || "Printed name",
        assigneeLine: entity,
        isPlaceholder: !textVal.trim(),
      };
    case "text":
      return {
        body: textVal.trim() || (kind === "counterparty" ? "Title" : "Add text"),
        assigneeLine: entity,
        isPlaceholder: !textVal.trim(),
      };
    case "email":
      return {
        body: textVal.trim() || "Email",
        assigneeLine: entity,
        isPlaceholder: !textVal.trim(),
      };
    case "date":
      return {
        body: textVal.trim() || "Date",
        assigneeLine: entity,
        isPlaceholder: !textVal.trim(),
      };
    default:
      return { body: textVal.trim() || "Field", assigneeLine: entity, isPlaceholder: !textVal.trim() };
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
