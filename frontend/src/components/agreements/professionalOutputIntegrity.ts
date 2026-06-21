/**
 * Professional Output Integrity — delegates to User-Visible Render Token Authority.
 */

import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import {
  containsUnresolvedRenderTokens,
  enforceUserVisibleRenderTokenAuthority,
  type RenderTokenAuthorityContext,
} from "./userVisibleRenderTokenAuthority";

export {
  containsUnresolvedRenderTokens as containsUserVisiblePlaceholders,
  scanUnresolvedRenderTokens,
  enforceUserVisibleRenderTokenAuthority,
  resolveRenderTokenFromAuthority,
  buildRenderTokenAuthorityParties,
} from "./userVisibleRenderTokenAuthority";

export { resolveAuthoritativeEmailForContactSlot } from "./paidProIntakeContactSubstitution";

/** @deprecated Use enforceUserVisibleRenderTokenAuthority */
export function hydrateUserVisibleContactPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
  parties?: readonly PaidProSignerMetadataParty[],
  surface = "professional_output_integrity",
): { text: string; repairs: string[]; replacedCount: number } {
  const out = enforceUserVisibleRenderTokenAuthority(text, {
    intakeRaw,
    parties,
    surface,
    blockOnUnresolved: false,
  });
  return { text: out.text, repairs: out.repairs, replacedCount: out.replacedCount };
}

export function enforceProfessionalOutputIntegrity(
  text: string,
  opts?: {
    intakeRaw?: string | null;
    parties?: readonly PaidProSignerMetadataParty[];
    surface?: string;
    partyNames?: readonly string[] | null;
  },
): { text: string; repairs: string[]; placeholdersRemaining: boolean } {
  const ctx: RenderTokenAuthorityContext = {
    intakeRaw: opts?.intakeRaw ?? null,
    parties: opts?.parties,
    partyNames: opts?.partyNames ?? null,
    surface: opts?.surface ?? "enforce_professional_output",
    blockOnUnresolved: false,
  };
  const out = enforceUserVisibleRenderTokenAuthority(text, ctx);
  return {
    text: out.text,
    repairs: out.repairs,
    placeholdersRemaining: containsUnresolvedRenderTokens(out.text),
  };
}
