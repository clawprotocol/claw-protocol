import type { SigningFieldType, Vs01TextFieldPurpose } from "./signingFields";

function diagEnabled(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test";
}

export function logVs01ActiveRoleBeforePlace(payload: {
  roleIdShort: string;
  partyIndex: number;
  tool: SigningFieldType;
  textPurpose?: Vs01TextFieldPurpose;
}): void {
  if (!diagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-active-role-before-place]", {
    roleIdShort: payload.roleIdShort,
    partyIndex: payload.partyIndex,
    tool: payload.tool,
    textPurpose: payload.textPurpose ?? null,
  });
}

export function logVs01FieldCreated(payload: {
  roleIdShort: string;
  partyIndex: number;
  fieldType: SigningFieldType;
  textPurpose?: Vs01TextFieldPurpose;
  page: number;
}): void {
  if (!diagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-field-created]", {
    roleIdShort: payload.roleIdShort,
    partyIndex: payload.partyIndex,
    fieldType: payload.fieldType,
    textPurpose: payload.textPurpose ?? null,
    page: payload.page,
  });
}

export function logVs01ActiveRoleAfterPlace(payload: {
  roleIdShort: string;
  partyIndex: number;
  unchanged: boolean;
}): void {
  if (!diagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-active-role-after-place]", {
    roleIdShort: payload.roleIdShort,
    partyIndex: payload.partyIndex,
    activeRoleUnchanged: payload.unchanged,
  });
}

export function placementSuccessMessage(
  toolLabel: string,
  partyName: string,
  keepPlacing: boolean,
): string {
  const party = partyName.trim() || "signer";
  if (keepPlacing) {
    return `${toolLabel} added for ${party}. Placement mode stays on.`;
  }
  return `${toolLabel} added for ${party}. Placement mode is now off.`;
}
