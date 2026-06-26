/**
 * TEST449 — brand licensing Pro post-validation adoption (accStructural vs vPaid split).
 */

import {
  TEST448_ALL_PARTIES,
  TEST448_LIVE_INTAKE,
  TEST448_TARGET_DEGRADED_LEN,
  TEST448_TRANSACTION_TITLE,
  buildTest448DegradedJsonParseDocumentText,
  buildTest448SuccessfulServerBody,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";

export const TEST449_TRANSACTION_TITLE = TEST448_TRANSACTION_TITLE;
export const TEST449_TARGET_DEGRADED_LEN = TEST448_TARGET_DEGRADED_LEN;
/** Live Railway retry server_full_document_text length (~28442). */
export const TEST449_TARGET_SERVER_LEN = 28_442;
export const TEST449_ALL_PARTIES = TEST448_ALL_PARTIES;
export const TEST449_LIVE_INTAKE = TEST448_LIVE_INTAKE;

export function test449BrightPeakFirstDraft() {
  return test448BrightPeakFirstDraft();
}

export function buildTest449DegradedJsonParseDocumentText() {
  return buildTest448DegradedJsonParseDocumentText();
}

export function buildTest449SuccessfulServerBody(
  intake = TEST449_LIVE_INTAKE,
  draft = test449BrightPeakFirstDraft(),
): string {
  let body = buildTest448SuccessfulServerBody(intake, draft);
  if (body.length > TEST449_TARGET_SERVER_LEN) {
    body = body.slice(0, TEST449_TARGET_SERVER_LEN);
  }
  while (body.length < TEST449_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST449_TARGET_SERVER_LEN);
}
