import type { PlacedSigningField, Vs01TextFieldPurpose } from "./signingFields";
import type { Vs01RecipientPlacedField } from "./types";
import type { SigningPacketPrepareGate, Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { findNextIncompletePrepareRole } from "./vs01SignerFieldAssignment";
import { VS01_DEFAULT_REQUIRED_KEYS } from "./vs01RequiredSignerFields";

export type { Vs01TextFieldPurpose };

export const PREPARE_REQUIRED_FIELD_KEYS = VS01_DEFAULT_REQUIRED_KEYS;
export type PrepareRequiredFieldKey = (typeof PREPARE_REQUIRED_FIELD_KEYS)[number];

export const PREPARE_BLOCKED_PANEL_TITLE = "Add signatures before continuing";
export const PREPARE_BLOCKED_PANEL_BODY =
  "Each signer needs one signature field. Other fields are optional.";
export const PREPARE_OPTIONAL_FIELDS_HINT =
  "Optional: add name, title, or date fields if you want LawDog to prefill them.";
export const PREPARE_PACKET_READY_COPY = "Signature fields are ready — continue to signing links.";
export const PREPARE_PACKET_BRIDGE_HEADLINE = "Signature fields are ready.";
export const PREPARE_PACKET_BRIDGE_LEAD =
  "LawDog placed signature fields next to each signer’s signature line. Initials are optional.";
export const PREPARE_PACKET_BRIDGE_PRIMARY_CTA = "Continue to signing links";
export const PREPARE_PACKET_BRIDGE_SECONDARY_CTA = "Edit field placement";
export const PREPARE_PACKET_INITIALS_TOGGLE_LABEL = "Add initials to each page";
export const PREPARE_PACKET_INITIALS_SUPPRESSED_HINT =
  "Initials could not be placed safely on every eligible page — only signature fields are required.";

export const PREPARE_PACKET_INITIALS_TOGGLE_HINT =
  "Optional. Signers can still complete the agreement without changing placement.";

const MISSING_LABEL: Record<string, string> = {
  signature: "Signature",
  printed_name: "Printed name",
  date: "Date",
  title: "Title",
};

export function fieldCountsAsTitle(f: { type: string; textPurpose?: Vs01TextFieldPurpose }): boolean {
  if (f.type !== "text") return false;
  if (f.textPurpose === "custom") return false;
  if (f.textPurpose === "title") return true;
  return true;
}

export function fieldCountsAsCustomText(f: { type: string; textPurpose?: Vs01TextFieldPurpose }): boolean {
  return f.type === "text" && f.textPurpose === "custom";
}

export function formatPrepareMissingFieldLabel(key: string): string {
  if (key in MISSING_LABEL) return MISSING_LABEL[key as PrepareRequiredFieldKey];
  return key.replace(/_/g, " ");
}

export type PrepareMissingBySignerRow = {
  roleId: string;
  entityName: string;
  missingLabels: string[];
};

export function buildPrepareMissingBySignerSummary(
  gate: SigningPacketPrepareGate,
  roles: Vs01PrepareSigningRole[],
): PrepareMissingBySignerRow[] {
  if (gate.missingSignatureRoles.length) {
    return gate.missingSignatureRoles.map((r) => ({
      roleId: r.roleId,
      entityName: r.displayName,
      missingLabels: ["Signature"],
    }));
  }
  const out: PrepareMissingBySignerRow[] = [];
  for (const role of roles) {
    if (!role.requiresSignature) continue;
    const miss = gate.missingByParty[role.roleId];
    if (!miss?.includes("signature")) continue;
    out.push({
      roleId: role.roleId,
      entityName: role.entityName?.trim() || role.partyName?.trim() || "Signer",
      missingLabels: ["Signature"],
    });
  }
  return out;
}

export function formatPrepareMissingSignerLine(entityName: string): string {
  return `${entityName} still needs a signature.`;
}

export function formatPrepareFinishBlockedMessage(rows: PrepareMissingBySignerRow[]): string {
  if (!rows.length) return "Add a signature for each signer before continuing.";
  return rows.map((r) => formatPrepareMissingSignerLine(r.entityName)).join(" ");
}

export function logVs01PrepareRequiredFields(
  gate: SigningPacketPrepareGate,
  roles: Vs01PrepareSigningRole[],
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-required-fields]", {
    requiredKeys: [...gate.requiredKeys],
    roleCount: roles.filter((r) => r.requiresSignature).length,
    fieldsByRole: gate.fieldsByRole,
  });
}

export function logVs01PrepareRoleCompletion(
  gate: SigningPacketPrepareGate,
  roles: Vs01PrepareSigningRole[],
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-role-completion]", {
    canFinish: gate.canFinish,
    roles: roles
      .filter((r) => r.requiresSignature)
      .map((r) => ({
        roleIdShort: r.roleId.slice(0, 16),
        entityNameLen: (r.entityName ?? "").length,
        tally: gate.fieldsByRole[r.roleId],
        missing: (gate.missingByParty[r.roleId] ?? []).map(formatPrepareMissingFieldLabel),
        complete: !(gate.missingByParty[r.roleId]?.length),
      })),
  });
}

export function logVs01PrepareFinishBlocked(rows: PrepareMissingBySignerRow[]): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-finish-blocked]", {
    incompleteSignerCount: rows.length,
    signers: rows.map((r) => ({
      entityNameLen: r.entityName.length,
      missingCount: r.missingLabels.length,
      missing: r.missingLabels,
    })),
  });
}

export function logVs01PrepareFinishAllowed(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-finish-allowed]", { ok: true });
}

export function logVs01PrepareFinishClick(payload: {
  canFinish: boolean;
  incompleteSignerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-prepare-finish-click]", payload);
}

export type PrepareFinishClickResult =
  | { allowed: true }
  | { allowed: false; message: string; rows: PrepareMissingBySignerRow[]; focusRoleId: string | null };

export function evaluatePrepareFinishClick(
  gate: SigningPacketPrepareGate | null,
  roles: Vs01PrepareSigningRole[],
): PrepareFinishClickResult {
  if (!gate) {
    return {
      allowed: false,
      message: "Signer roles are not ready yet. Try again in a moment.",
      rows: [],
      focusRoleId: roles[0]?.roleId ?? null,
    };
  }
  logVs01PrepareRequiredFields(gate, roles);
  logVs01PrepareRoleCompletion(gate, roles);
  if (gate.canFinish) {
    logVs01PrepareFinishAllowed();
    return { allowed: true };
  }
  const rows = buildPrepareMissingBySignerSummary(gate, roles);
  logVs01PrepareFinishBlocked(rows);
  const next = findNextIncompletePrepareRole(roles, gate);
  return {
    allowed: false,
    message: formatPrepareFinishBlockedMessage(rows),
    rows,
    focusRoleId: next?.roleId ?? rows[0]?.roleId ?? null,
  };
}

export function fieldForPrepareGate(f: PlacedSigningField | Vs01RecipientPlacedField): {
  type: string;
  textPurpose?: Vs01TextFieldPurpose;
  autoInitials?: boolean;
} {
  if (f.autoInitials) {
    return { type: f.type, autoInitials: true };
  }
  const raw = (f as PlacedSigningField).textPurpose;
  const textPurpose = raw === "title" || raw === "custom" ? raw : undefined;
  return { type: f.type, ...(textPurpose ? { textPurpose } : {}) };
}
