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
