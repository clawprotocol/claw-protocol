/**
 * TEST433 — live four-party North Star freeze rejection (~22.4k server_full_draft).
 * Reconstructs server response shape: preamble fragment stack, split headings, glued notices.
 */

import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";

export const TEST433_TARGET_SERVER_LEN = 22_400;
export const TEST433_MIN_ACCEPTED_LEN = 20_000;

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

function injectLiveMalformedPreamble(corpus: string): string {
  const preamble = [
    "9. Revenue Allocation Among",
    "",
    "Service Providers",
    "",
    "Lead Consultant Responsibilities",
    "",
    "Revenue",
    "",
    "Allocation",
    "",
    "Termination by",
    "",
    "Client Without Cause",
    "",
  ].join("\n");
  return corpus.replace("\n1. SERVICES AND SCOPE", `\n${preamble}\n1. SERVICES AND SCOPE`);
}

function injectGluedNoticesHeading(corpus: string): string {
  return corpus.replace(/\n10\. NOTICES/i, "\nDisputes in venue.12.2 Notices");
}

/** ~22.4k malformed server_full_document_text mirroring live Pro generation defects. */
export function buildTest433LiveFourPartyServerCorpus(): string {
  const base = buildNPartyPaidProServerCorpus({
    parties: ALL_PARTIES,
    intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    draft: test429Draft(),
    title: "Consulting and Implementation Agreement",
    minLen: 18_000,
  });
  let corpus = injectLiveMalformedPreamble(base);
  corpus = injectGluedNoticesHeading(corpus);
  return padOperativeCorpusBeforeWitness(corpus, TEST433_TARGET_SERVER_LEN);
}

export function test433FourPartyDraft() {
  return {
    ...test429Draft(),
    purpose: "Manufacturing workflow modernization and ERP analytics.",
    parties: [
      { name: NORTH_STAR, role: "Client" },
      { name: SUMMIT_RIDGE, role: "Lead Consultant" },
      { name: DELTA_INTEGRATION, role: "Technology Integrator" },
      { name: BLUE_CANYON, role: "Data Analytics Provider" },
    ],
  };
}
