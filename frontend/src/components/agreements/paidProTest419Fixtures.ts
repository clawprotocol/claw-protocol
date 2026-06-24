import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import {
  TEST418_BLUE,
  TEST418_HARBOR,
  TEST418_IRON,
  TEST418_MUTUAL_CONSULTING_INTAKE,
  TEST418_PARTY_EMAILS,
  TEST418_RED,
  test418Draft,
} from "./paidProTest418Fixtures";

const TEST419_PARTIES = [TEST418_RED, TEST418_BLUE, TEST418_HARBOR, TEST418_IRON] as const;

/**
 * Production-style accepted server draft with NOTICES heading renamed — fails SoT clause-family /
 * freeze gates until deterministic N-party recovery repairs notices.
 */
export function buildTest419AcceptedServerDraftMissingNoticesHeading(
  intake = TEST418_MUTUAL_CONSULTING_INTAKE,
  draft = test418Draft(),
): string {
  const body = buildNPartyPaidProServerCorpus({
    parties: [...TEST419_PARTIES],
    intakeText: intake,
    draft,
    title: "Mutual Consulting Services Agreement",
    minLen: 5200,
  });
  if (!body || body.length < 4000) return "";
  return body
    .replace(/^\d+\.\s+NOTICES\s*$/gim, "10. COMMUNICATIONS")
    .replace(/^\d+\.\s+Notices\s*$/gim, "10. Communications");
}

export const TEST419_PRODUCTION_INTAKE = TEST418_MUTUAL_CONSULTING_INTAKE;
export const TEST419_PARTY_EMAILS = TEST418_PARTY_EMAILS;
export function test419Draft(): ParsedDraftShape {
  return test418Draft();
}
