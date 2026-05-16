import { isPlausibleEmail } from "./detailsStepValidation";
import type { SigningFieldType, SigningPlacementValueContext } from "./signingFields";
import type { Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export type Vs01FieldValueMode = "prepare_stored" | "prepare_display" | "recipient_runtime";

export type Vs01SignerRuntimeContext = {
  typedName?: string;
  initials?: string;
  signerEmail?: string;
  /** ISO YYYY-MM-DD */
  signingDateIso?: string;
};

export function todayIsoDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Plausible email for a prepare role (signer slot, review slot, or party row email). */
export function resolveRolePlausibleEmail(role: Vs01PrepareSigningRole): string {
  for (const raw of [role.signerEmail, role.reviewEmail]) {
    const s = (raw ?? "").trim();
    if (isPlausibleEmail(s)) return s;
  }
  return "";
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function logVs01RoleValueResolved(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-role-value-resolved]", payload);
}

export function logVs01FieldDefaultApplied(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-field-default-applied]", payload);
}

export function logVs01RecipientRuntimeValueResolved(payload: Record<string, unknown>): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-recipient-runtime-value-resolved]", payload);
}

/**
 * Canonical role-scoped field value resolution for prepare placement, prepare display,
 * manifest persistence, and recipient signing runtime.
 */
export function resolveVs01FieldValueForRole(args: {
  fieldType: SigningFieldType | Vs01RecipientFieldType;
  role: Vs01PrepareSigningRole;
  mode: Vs01FieldValueMode;
  storedValue?: string;
  ownerPad?: Vs01SignerRuntimeContext;
  signerRuntime?: Vs01SignerRuntimeContext;
}): string {
  const stored = (args.storedValue ?? "").trim();
  const ownerPad = args.ownerPad ?? {};
  const runtime = args.signerRuntime ?? {};
  const isOwner = args.role.kind === "owner";
  const roleEmail = resolveRolePlausibleEmail(args.role);
  const signingDate =
    (runtime.signingDateIso ?? "").trim() ||
    (ownerPad.signingDateIso ?? "").trim() ||
    todayIsoDateLocal();

  const resolveStored = (): string => {
    switch (args.fieldType) {
      case "signature":
        if (isOwner) return (ownerPad.typedName ?? "").trim();
        return "";
      case "initials": {
        if (isOwner) {
          const fromPad = (ownerPad.initials ?? "").trim();
          if (fromPad) return fromPad;
          const fromName = (ownerPad.typedName ?? "").trim();
          return fromName ? initialsFromName(fromName) : "";
        }
        return "";
      }
      case "printed_name": {
        if (stored) return stored;
        if (isOwner) return (ownerPad.typedName ?? "").trim();
        return (args.role.signerName ?? "").trim();
      }
      case "text":
        return stored;
      case "email": {
        if (stored) return stored;
        if (isOwner) {
          const fromPad = (ownerPad.signerEmail ?? "").trim();
          if (isPlausibleEmail(fromPad)) return fromPad;
        }
        return roleEmail;
      }
      case "date": {
        if (stored) return stored;
        return signingDate;
      }
      default:
        return stored;
    }
  };

  let out: string;
  if (args.mode === "prepare_stored") {
    out = resolveStored();
  } else if (args.mode === "prepare_display") {
    out = stored || resolveStored();
  } else {
    switch (args.fieldType) {
      case "signature":
      case "initials":
        out = stored || (runtime.typedName ?? "").trim() || (runtime.initials ?? "").trim();
        break;
      case "printed_name":
        out =
          stored ||
          (runtime.typedName ?? "").trim() ||
          (args.role.signerName ?? "").trim();
        break;
      case "text":
        out = stored;
        break;
      case "email":
        out = stored || (runtime.signerEmail ?? "").trim() || roleEmail;
        break;
      case "date":
        out = stored || signingDate;
        break;
      default:
        out = stored;
    }
    logVs01RecipientRuntimeValueResolved({
      fieldType: args.fieldType,
      roleIdShort: args.role.roleId.slice(0, 16),
      hadStored: Boolean(stored),
      resolvedLen: out.length,
    });
  }

  logVs01RoleValueResolved({
    mode: args.mode,
    fieldType: args.fieldType,
    roleKind: args.role.kind,
    partyId: args.role.partyId,
    roleIdShort: args.role.roleId.slice(0, 16),
    valueLen: out.length,
  });

  if (!stored && out && args.mode === "prepare_stored") {
    logVs01FieldDefaultApplied({
      fieldType: args.fieldType,
      roleKind: args.role.kind,
      partyId: args.role.partyId,
    });
  }

  return out;
}

/** Build owner pad context from Step 2 signature UI state. */
export function ownerPadFromPlacementContext(ctx: SigningPlacementValueContext): Vs01SignerRuntimeContext {
  return {
    typedName: ctx.typedName,
    initials: ctx.initials,
    signerEmail: ctx.signerEmail,
    signingDateIso: todayIsoDateLocal(),
  };
}

/** Apply role-scoped defaults to recipient manifest fields at signing bootstrap. */
export function hydrateRecipientFieldsForSigning(
  fields: Vs01RecipientPlacedField[],
  role: Vs01PrepareSigningRole,
  runtime: Vs01SignerRuntimeContext,
): Vs01RecipientPlacedField[] {
  return fields.map((f) => {
    const stored = typeof f.value === "string" ? f.value : "";
    const resolved = resolveVs01FieldValueForRole({
      fieldType: f.type,
      role,
      mode: "recipient_runtime",
      storedValue: stored,
      signerRuntime: runtime,
    });
    if (resolved === stored) return f;
    return { ...f, value: resolved };
  });
}
