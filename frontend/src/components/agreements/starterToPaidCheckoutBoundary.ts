import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { LegalPartyAuthorityResult } from "./legalPartyAuthority";
import type { StarterToPaidPartyHandoffV1 } from "./starterToPaidPartyHandoff";

export type StarterToPaidCheckoutBoundaryDependencies = {
  hasCurrentSessionFreeStarterIntent: () => boolean;
  hasCurrentSessionProEntitlement: () => boolean;
  resolveLegalPartyAuthority: (intakeText: string) => LegalPartyAuthorityResult;
  writeStarterToPaidPartyHandoff: (
    intakeText: string,
    authority: LegalPartyAuthorityResult,
  ) => StarterToPaidPartyHandoffV1;
};

export type StarterToPaidCheckoutBoundaryResult =
  | "blocked_invalid_input"
  | "continued_without_handoff"
  | "continued_with_handoff";

function isValidCheckoutDraft(value: unknown): value is ParsedDraftShape {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ParsedDraftShape>;
  return (
    typeof draft.title === "string" &&
    typeof draft.jurisdiction === "string" &&
    Array.isArray(draft.parties) &&
    typeof draft.purpose === "string" &&
    typeof draft.payment_terms === "string" &&
    typeof draft.payment === "object" &&
    draft.payment !== null
  );
}

/**
 * Synchronous Free Starter → Pro checkout boundary.
 * Establishes no paid state; it only commits Phase 1 party authority before checkout continues.
 */
export function runStarterToPaidCheckoutBoundary(
  args: {
    rawIntake: string | null | undefined;
    pendingDraft: ParsedDraftShape | null | undefined;
  },
  dependencies: StarterToPaidCheckoutBoundaryDependencies,
  continueCheckout: () => void,
): StarterToPaidCheckoutBoundaryResult {
  const intake = String(args.rawIntake ?? "").trim();
  if (!intake || !isValidCheckoutDraft(args.pendingDraft)) {
    return "blocked_invalid_input";
  }

  const shouldWriteHandoff =
    dependencies.hasCurrentSessionFreeStarterIntent() &&
    !dependencies.hasCurrentSessionProEntitlement();

  if (shouldWriteHandoff) {
    const authority = dependencies.resolveLegalPartyAuthority(intake);
    dependencies.writeStarterToPaidPartyHandoff(intake, authority);
  }

  continueCheckout();
  return shouldWriteHandoff ? "continued_with_handoff" : "continued_without_handoff";
}
