/**
 * TEST435 — four-party North Star formatting malformations (~20k substantive wire).
 * Duplicated notice headers/entity lines and split subsection headings (1.2, 3.4, 3.5).
 */

import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  buildTest429MalformedFourPartyServerCorpus,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";

export const TEST435_NORTH_STAR_MIN_SOT_LEN = 18_000;

export const TEST435_NORTH_STAR_PARTIES = [
  NORTH_STAR,
  SUMMIT_RIDGE,
  DELTA_INTEGRATION,
  BLUE_CANYON,
] as const;

export function test435NorthStarDraft() {
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

function buildNoticeStanza(party: string): string {
  return [
    `If to ${party}:`,
    party,
    "Attn: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
  ].join("\n");
}

function injectFourPartyNotices(corpus: string): string {
  const block = TEST435_NORTH_STAR_PARTIES.map((party) => buildNoticeStanza(party)).join("\n\n");
  return corpus.replace(
    /9\. Notices[\s\S]*?(?=\n10\. Termination)/i,
    `9. Notices\nNotices must be in writing.\n\n${block}\n`,
  );
}

function injectTest435HeadingNumbers(corpus: string): string {
  return corpus
    .replace(/\b4\.4 Revenue\b/g, "3.4 Revenue")
    .replace(/\b4\.5 Internal\b/g, "3.5 Timing of Internal")
    .replace(/\bAllocation Responsibility\b/g, "Allocation Payments");
}

function injectDuplicatedNoticeStanzas(corpus: string): string {
  let out = corpus;
  for (const party of TEST435_NORTH_STAR_PARTIES) {
    const escaped = party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`(If to ${escaped}:\\n)${escaped}(\\n)`, "g"),
      `$1${party} ${party}$2`,
    );
    out = out.replace(
      new RegExp(`If to ${escaped}:`, "g"),
      `If to ${party} ${party} :`,
    );
    out = out.replace(
      new RegExp(`(If to ${escaped} ${escaped} :\\n)${escaped}(\\n)`, "g"),
      `$1${party} ${party}$2`,
    );
  }
  return out;
}

/** Malformed substantive server corpus mirroring live TEST435 wire defects. */
export function buildTest435NorthStarMalformedServerCorpus(): string {
  let corpus = buildTest429MalformedFourPartyServerCorpus();
  corpus = injectFourPartyNotices(corpus);
  corpus = injectTest435HeadingNumbers(corpus);
  corpus = injectDuplicatedNoticeStanzas(corpus);
  corpus = padOperativeCorpusBeforeWitness(corpus, TEST435_NORTH_STAR_MIN_SOT_LEN + 4000);
  return corpus;
}
