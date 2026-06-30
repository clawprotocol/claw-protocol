/**
 * Paid Pro coordinator checkbox — explicit UI flag is authoritative for signing exclusion.
 * Intake prose may mention coordinating, but only the checkbox sets coordinator-only mode.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { RecipientSetupEmailInput } from "../../launch/simpleProduct/agreementToVs01SigningBridge";

export type CreatorCoordinatorOnlySource = "recipient_setup" | "draft" | "default_unchecked";

/** Live checkbox / persisted draft flag. Never inferred from intake prose alone. */
export function resolveCreatorCoordinatorOnlyChecked(args: {
  draft?: Pick<ParsedDraftShape, "creator_coordinator_only"> | null;
  recipientSetup?: Pick<RecipientSetupEmailInput, "creatorCoordinatorOnly"> | null;
}): { checked: boolean; source: CreatorCoordinatorOnlySource } {
  if (typeof args.recipientSetup?.creatorCoordinatorOnly === "boolean") {
    return {
      checked: args.recipientSetup.creatorCoordinatorOnly,
      source: "recipient_setup",
    };
  }
  if (typeof args.draft?.creator_coordinator_only === "boolean") {
    return {
      checked: args.draft.creator_coordinator_only,
      source: "draft",
    };
  }
  return { checked: false, source: "default_unchecked" };
}

export function resolveCreatorIsPartyFromCheckbox(args: {
  draft?: Pick<ParsedDraftShape, "creator_coordinator_only"> | null;
  recipientSetup?: Pick<RecipientSetupEmailInput, "creatorCoordinatorOnly"> | null;
}): boolean {
  return !resolveCreatorCoordinatorOnlyChecked(args).checked;
}

export function resolveUserIsCoordinatorOnlyFromCheckbox(args: {
  draft?: Pick<ParsedDraftShape, "creator_coordinator_only"> | null;
  recipientSetup?: Pick<RecipientSetupEmailInput, "creatorCoordinatorOnly"> | null;
}): boolean {
  return resolveCreatorCoordinatorOnlyChecked(args).checked;
}

const coordinatorCheckboxAuthorityLogged = new Set<string>();
const coordinatorCheckboxVs01Logged = new Set<string>();

export type CoordinatorCheckboxAuthorityLog = {
  checked: boolean;
  creatorIsParty: boolean;
  source: CreatorCoordinatorOnlySource;
};

export type CoordinatorCheckboxVs01Log = {
  checked: boolean;
  creatorIsParty: boolean;
  legalPartyCount: number;
  signerInviteCount: number;
  coordinatorExcludedFromSignerRoles: boolean;
};

/** Once per agreement at Pro → VS01 bridge handoff. */
export function logCoordinatorCheckboxAuthorityOnce(
  agreementId: string,
  payload: CoordinatorCheckboxAuthorityLog,
): void {
  const key = String(agreementId ?? "").trim() || "unknown";
  if (coordinatorCheckboxAuthorityLogged.has(key)) return;
  coordinatorCheckboxAuthorityLogged.add(key);
  // eslint-disable-next-line no-console
  console.info("[coordinator-checkbox-authority]", payload);
}

/** Once per agreement at VS01 packet model creation. */
export function logCoordinatorCheckboxVs01Once(
  agreementId: string,
  payload: CoordinatorCheckboxVs01Log,
): void {
  const key = String(agreementId ?? "").trim() || "unknown";
  if (coordinatorCheckboxVs01Logged.has(key)) return;
  coordinatorCheckboxVs01Logged.add(key);
  // eslint-disable-next-line no-console
  console.info("[coordinator-checkbox-vs01]", payload);
}

export function resetCoordinatorCheckboxDiagnosticsForTests(): void {
  coordinatorCheckboxAuthorityLogged.clear();
  coordinatorCheckboxVs01Logged.clear();
}

export function coordinatorExcludedFromSignerRoles(args: {
  checked: boolean;
  creatorIsParty: boolean;
  roleKinds: readonly (string | null | undefined)[];
  roleEmails: readonly (string | null | undefined)[];
  coordinatorEmail?: string | null;
}): boolean {
  if (!args.checked || args.creatorIsParty) return false;
  if (args.roleKinds.some((kind) => String(kind ?? "").toLowerCase() === "owner")) return false;
  const coordinatorEmail = String(args.coordinatorEmail ?? "").trim().toLowerCase();
  if (
    coordinatorEmail &&
    args.roleEmails.some((email) => String(email ?? "").trim().toLowerCase() === coordinatorEmail)
  ) {
    return false;
  }
  return true;
}
