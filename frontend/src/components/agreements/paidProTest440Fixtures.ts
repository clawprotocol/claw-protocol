/**
 * TEST440 — Red Mesa / Harbor Peak ~14.8k server draft missing NOTICES heading.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import {
  TEST435_HARBOR_PEAK,
  TEST435_INTAKE,
  TEST435_INTAKE_WITH_SIGNERS,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest435Fixtures";

export const TEST440_RED_MESA = TEST435_RED_MESA;
export const TEST440_HARBOR_PEAK = TEST435_HARBOR_PEAK;
export const TEST440_INTAKE = TEST435_INTAKE;
export const TEST440_INTAKE_WITH_SIGNERS = TEST435_INTAKE_WITH_SIGNERS;
export const TEST440_MIN_SERVER_LEN = 14000;
export const TEST440_TARGET_SERVER_LEN = 14794;

export function test440Draft(): ParsedDraftShape {
  return test435Draft();
}

function padToLen(body: string, minLen = TEST440_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 60;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

/**
 * Production-style ~14.8k server draft: operative If-to stanzas remain but the numbered
 * NOTICES parent heading is removed (section-structure repair may leave 10.1 only).
 */
export function buildTest440ServerFullDraftMissingNoticesHeading(): string {
  let body = buildNPartyPaidProServerCorpus({
    parties: [TEST440_RED_MESA, TEST440_HARBOR_PEAK],
    intakeText: TEST440_INTAKE_WITH_SIGNERS,
    draft: test440Draft(),
    title: "Consulting Services Agreement",
    minLen: TEST440_MIN_SERVER_LEN,
  });
  body = body.replace(/\n\d+\.\s+NOTICES\s*$/gim, "");
  body = body.replace(/\n\d+\.\s+NOTICES\s*\n/gi, "\n");
  return padToLen(body, TEST440_MIN_SERVER_LEN);
}
