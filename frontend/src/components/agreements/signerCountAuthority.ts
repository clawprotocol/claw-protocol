/**
 * Authoritative signer count from legal party authority — not decorative corpus blocks.
 */

import { findSignatureLineAnchorsFromCorpusText } from "../../vs01/vs01SignatureBlockAnchors";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  collapsePartySlotCandidates,
  resolveAuthoritativePartySlotCount,
} from "./partySlotIdentityNormalize";
import { countRealParties } from "./starterPartyLimits";

const LOG_PREFIX = "[signer-count-authority]";

export type SignerCountAuthorityResolution = {
  count: number;
  source:
    | "labeled_parties"
    | "party_slot_count"
    | "draft_parties"
    | "corpus_blocks_capped"
    | "default_two";
  labeledCount: number;
  draftCount: number;
  corpusBlockCount: number;
  partySlotCount: number;
};

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logSignerCountAuthority(
  resolution: SignerCountAuthorityResolution,
  context?: string,
): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info(LOG_PREFIX, {
    context: context ?? "resolve",
    count: resolution.count,
    source: resolution.source,
    labeledCount: resolution.labeledCount,
    draftCount: resolution.draftCount,
    corpusBlockCount: resolution.corpusBlockCount,
    partySlotCount: resolution.partySlotCount,
  });
}

export function resolveAuthoritativeSignerCount(args: {
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly { name?: string | null }[];
  rawPartyCount?: number;
  corpusPlain?: string | null;
  userExpandedPartyCount?: number;
}): SignerCountAuthorityResolution {
  const intake = String(args.intakeText ?? "").trim();
  const draftNames =
    args.draftPartyNames ??
    (args.draftParties ?? []).map((p) => String(p?.name ?? "").trim()).filter(Boolean);
  const labeledCount = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName).length;
  const draftCount = countRealParties(args.draftParties ?? draftNames.map((name) => ({ name })));
  const collapsedDraft = collapsePartySlotCandidates(draftNames).filter(isAuthoritativeLegalEntityName).length;
  const partySlotCount = resolveAuthoritativePartySlotCount({
    intakeText: intake,
    draftPartyNames: draftNames,
    rawPartyCount: args.rawPartyCount ?? draftCount,
    userExpandedPartyCount: args.userExpandedPartyCount,
  });

  const corpus = String(args.corpusPlain ?? "").trim();
  const corpusBlockCount =
    corpus.length >= 80 ? findSignatureLineAnchorsFromCorpusText(corpus).length : 0;

  let count = partySlotCount;
  let source: SignerCountAuthorityResolution["source"] = "party_slot_count";

  if (labeledCount >= 2) {
    count = labeledCount;
    source = "labeled_parties";
  } else if (partySlotCount >= 2) {
    count = partySlotCount;
    source = "party_slot_count";
  } else if (collapsedDraft >= 2) {
    count = collapsedDraft;
    source = "draft_parties";
  } else if (draftCount >= 2) {
    count = draftCount;
    source = "draft_parties";
  } else {
    count = 2;
    source = "default_two";
  }

  if (corpusBlockCount > count && count >= 2) {
    // Decorative / duplicate signature blocks must not inflate signer slots.
    if (import.meta.env?.DEV && !isTestMode()) {
      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, {
        context: "corpus_inflation_ignored",
        corpusBlockCount,
        authoritativeCount: count,
      });
    }
  } else if (corpusBlockCount >= 2 && labeledCount < 2 && partySlotCount < 2 && count < corpusBlockCount) {
    count = Math.min(corpusBlockCount, 4);
    source = "corpus_blocks_capped";
  }

  const resolution: SignerCountAuthorityResolution = {
    count: Math.max(2, Math.min(count, 4)),
    source,
    labeledCount,
    draftCount: Math.max(draftCount, collapsedDraft),
    corpusBlockCount,
    partySlotCount,
  };
  logSignerCountAuthority(resolution);
  return resolution;
}
