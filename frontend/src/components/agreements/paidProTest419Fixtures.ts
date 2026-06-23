import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST418_MUTUAL_CONSULTING_INTAKE,
  TEST418_PARTY_EMAILS,
  test418Draft,
} from "./paidProTest418Fixtures";

/** Production-style accepted server draft with notices heading removed — fails SoT clause-family gate. */
export function buildTest419AcceptedServerDraftMissingNoticesHeading(
  intake = TEST418_MUTUAL_CONSULTING_INTAKE,
  draft = test418Draft(),
): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: intake,
    draft,
  });
  if (!fallback.ok) return "";
  let body = fallback.body;
  body = body.replace(/^\d+\.\s+NOTICES\s*$/gim, "10. COMMUNICATIONS");
  body = body.replace(/^\d+\.\s+Notices\s*$/gim, "10. Communications");
  return body;
}

export const TEST419_PRODUCTION_INTAKE = TEST418_MUTUAL_CONSULTING_INTAKE;
export const TEST419_PARTY_EMAILS = TEST418_PARTY_EMAILS;
export function test419Draft(): ParsedDraftShape {
  return test418Draft();
}
