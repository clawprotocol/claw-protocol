/**
 * TEST452 — SoT establishment after server_full_draft_retry adoption (live ~28854 hash flow).
 */

import {
  TEST448_LIVE_INTAKE,
  TEST448_TRANSACTION_TITLE,
  TEST448_TARGET_DEGRADED_LEN,
  buildTest448DegradedJsonParseDocumentText,
  buildTest448SuccessfulServerBody,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";

export const TEST452_LIVE_INTAKE = TEST448_LIVE_INTAKE;
export const TEST452_TRANSACTION_TITLE = TEST448_TRANSACTION_TITLE;
export const TEST452_TARGET_DEGRADED_LEN = TEST448_TARGET_DEGRADED_LEN;
/** Live Railway retry freeze/adoption length (~28854). */
export const TEST452_TARGET_SERVER_LEN = 28_854;

export function test452BrightPeakFirstDraft() {
  return test448BrightPeakFirstDraft();
}

export function buildTest452DegradedJsonParseDocumentText() {
  return buildTest448DegradedJsonParseDocumentText();
}

export function buildTest452SubstantiveServerBody(
  intake = TEST452_LIVE_INTAKE,
  draft = test452BrightPeakFirstDraft(),
): string {
  let body = buildTest448SuccessfulServerBody(intake, draft);
  if (body.length > TEST452_TARGET_SERVER_LEN) {
    body = body.slice(0, TEST452_TARGET_SERVER_LEN);
  }
  while (body.length < TEST452_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST452_TARGET_SERVER_LEN);
}
