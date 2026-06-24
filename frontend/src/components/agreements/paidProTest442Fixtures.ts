/**
 * TEST442 — short document_text vs long server_full_document_text pre-validation adopt.
 */

import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  TEST435_INTAKE_WITH_SIGNERS,
  test435Draft,
} from "./paidProTest435Fixtures";
import { buildTest440ServerFullDraftMissingNoticesHeading } from "./paidProTest440Fixtures";

export const TEST442_SHORT_DOCUMENT_TARGET_LEN = 778;
export const TEST442_MIN_SERVER_LEN = 14000;

/** Starter-shaped client document_text (~778) returned alongside long server_full_document_text. */
export function buildTest442ShortDocumentText(): string {
  const preview = buildAgreementPreviewText(test435Draft(), {
    starterPreview: true,
    intakeText: TEST435_INTAKE_WITH_SIGNERS,
  }).trim();
  if (preview.length <= TEST442_SHORT_DOCUMENT_TARGET_LEN + 50) {
    return preview;
  }
  const slice = preview.slice(0, TEST442_SHORT_DOCUMENT_TARGET_LEN);
  const lastBreak = slice.lastIndexOf("\n");
  return (lastBreak > 400 ? slice.slice(0, lastBreak) : slice).trimEnd();
}

export function buildTest442LongServerFullDocumentText(): string {
  const server = buildTest440ServerFullDraftMissingNoticesHeading();
  return server.length >= TEST442_MIN_SERVER_LEN
    ? server
    : server.padEnd(TEST442_MIN_SERVER_LEN, "\nSupplemental operative clause.\n");
}
