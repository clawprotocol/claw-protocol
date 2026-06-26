/**
 * TEST451 — SoT freeze placeholder rejection after validated ~31k server corpus adoption.
 */

import {
  TEST448_LIVE_INTAKE,
  TEST448_TRANSACTION_TITLE,
  buildTest448SuccessfulServerBody,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";

export const TEST451_TRANSACTION_TITLE = TEST448_TRANSACTION_TITLE;
/** Live Railway server_full_document_text length (~29499). */
export const TEST451_TARGET_SERVER_LEN = 29_499;
export const TEST451_LIVE_INTAKE = TEST448_LIVE_INTAKE;
export const TEST451_ALL_PARTIES = [
  "Evergreen Outdoor Brands LLC",
  "Atlas Consumer Products Inc.",
  "Horizon Wholesale Group LLC",
  "BrightPeak Retail Solutions LLC",
];

export function test451BrightPeakFirstDraft() {
  return test448BrightPeakFirstDraft();
}

export function buildTest451SubstantiveServerBody(
  intake = TEST451_LIVE_INTAKE,
  draft = test451BrightPeakFirstDraft(),
): string {
  let body = buildTest448SuccessfulServerBody(intake, draft);
  if (body.length > TEST451_TARGET_SERVER_LEN) {
    body = body.slice(0, TEST451_TARGET_SERVER_LEN);
  }
  while (body.length < TEST451_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST451_TARGET_SERVER_LEN);
}
