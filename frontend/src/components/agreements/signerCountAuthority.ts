/**
 * Single authoritative signer-count resolver for Paid Pro lifecycle surfaces.
 *
 * Count must derive from legal party / slot / manifest authority — never from
 * execution-block headings, corpus regex scans, or decorative preview cards.
 */

import { findSignatureLineAnchorsFromCorpusText } from "../../vs01/vs01SignatureBlockAnchors";
import { labeledPartyLegalEntities, quotedRolePartyLegalEntities } from "./labeledPartyBlockParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  collapsePartySlotCandidates,
  resolveAuthoritativePartySlotCount,
  selectAuthoritativeTwoPartySlots,
} from "./partySlotIdentityNormalize";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { dedupeEntityCandidatesToLegalParties } from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { countRealParties } from "./starterPartyLimits";

const LOG_PREFIX = "[signer-count-authority]";

export type SignerCountAuthorityResolution = {
  count: number;
  source:
    | "labeled_parties"
    | "party_slot_count"
    | "draft_parties"
    | "default_two";
  labeledCount: number;
  draftCount: number;
  corpusBlockCount: number;
  partySlotCount: number;
  /** Manifest row count when supplied by caller — diagnostics / mismatch only, never authority. */
  manifestConsumerCount: number;
};

export type SignerCountAuthorityArgs = {
  intakeText?: string | null;
  draftPartyNames?: readonly string[];
  draftParties?: readonly { name?: string | null }[];
  rawPartyCount?: number;
  corpusPlain?: string | null;
  userExpandedPartyCount?: number;
};

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

/** Diagnostics only — must not be used as consumer signer count. */
export function inferCorpusDerivedSignerCount(corpusPlain?: string | null): number {
  const corpus = String(corpusPlain ?? "").trim();
  if (corpus.length < 80) return 0;
  return findSignatureLineAnchorsFromCorpusText(corpus).length;
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
    manifestConsumerCount: resolution.manifestConsumerCount,
  });
}

export function logSignerCountConsumerMismatch(payload: {
  surface: string;
  authoritativeCount: number;
  consumerCount: number;
  corpusBlockCount: number;
  source: SignerCountAuthorityResolution["source"];
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.warn(`${LOG_PREFIX}-mismatch`, payload);
}

export function logSignerCountConsumer(payload: {
  surface: string;
  authoritativeCount: number;
  consumerCount: number;
  matched: boolean;
  source: SignerCountAuthorityResolution["source"];
}): void {
  if (isTestMode()) return;
  // eslint-disable-next-line no-console
  console.info(`${LOG_PREFIX}-consumer`, payload);
}

function resolveAuthoritativeSignerCountCore(args: SignerCountAuthorityArgs): SignerCountAuthorityResolution {
  const intake = String(args.intakeText ?? "").trim();
  const draftNames =
    args.draftPartyNames ??
    (args.draftParties ?? []).map((p) => String(p?.name ?? "").trim()).filter(Boolean);
  const labeledCount = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName).length;
  const quotedCount = quotedRolePartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName).length;
  const authoritativeIntakeCount = Math.max(labeledCount, quotedCount);
  const draftCount = countRealParties(args.draftParties ?? draftNames.map((name) => ({ name })));
  const collapsedDraft = collapsePartySlotCandidates(draftNames).filter(isAuthoritativeLegalEntityName).length;
  const partySlotCount = resolveAuthoritativePartySlotCount({
    intakeText: intake,
    draftPartyNames: draftNames,
    rawPartyCount: args.rawPartyCount ?? draftCount,
    userExpandedPartyCount: args.userExpandedPartyCount,
  });
  const corpusBlockCount = inferCorpusDerivedSignerCount(args.corpusPlain);

  let count = partySlotCount;
  let source: SignerCountAuthorityResolution["source"] = "party_slot_count";

  if (authoritativeIntakeCount >= 2) {
    count = authoritativeIntakeCount;
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

  if (corpusBlockCount > count && count >= 2 && !isTestMode() && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info(LOG_PREFIX, {
      context: "corpus_inflation_ignored",
      corpusBlockCount,
      authoritativeCount: count,
    });
  }

  const betweenDeduped = dedupeEntityCandidatesToLegalParties(
    extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName),
  );
  const explicitMultiParty =
    labeledCount >= 3 ||
    quotedCount >= 3 ||
    betweenDeduped.length >= 3 ||
    collapsePartySlotCandidates(draftNames).filter(isAuthoritativeLegalEntityName).length >= 3;
  if (betweenDeduped.length === 2 && !explicitMultiParty && count > 2) {
    count = 2;
    source = "party_slot_count";
  }

  return {
    count: Math.max(2, Math.min(count, 4)),
    source,
    labeledCount: authoritativeIntakeCount,
    draftCount: Math.max(draftCount, collapsedDraft),
    corpusBlockCount,
    partySlotCount,
    manifestConsumerCount: 0,
  };
}

export function resolveAuthoritativeSignerCount(args: SignerCountAuthorityArgs): SignerCountAuthorityResolution {
  const resolution = resolveAuthoritativeSignerCountCore(args);
  logSignerCountAuthority(resolution);
  return resolution;
}

/**
 * Every downstream surface must call this (directly or via helpers) instead of
 * independently counting execution blocks, headings, or identity array length.
 */
export function consumeAuthoritativeSignerCount(
  surface: string,
  args: SignerCountAuthorityArgs,
  consumerCount?: number | null,
): number {
  const resolution = resolveAuthoritativeSignerCountCore(args);
  const authoritativeCount = resolution.count;
  const consumer = consumerCount ?? authoritativeCount;
  const matched = consumer === authoritativeCount;
  if (!matched) {
    logSignerCountConsumerMismatch({
      surface,
      authoritativeCount,
      consumerCount: consumer,
      corpusBlockCount: resolution.corpusBlockCount,
      source: resolution.source,
    });
  } else {
    logSignerCountConsumer({
      surface,
      authoritativeCount,
      consumerCount: consumer,
      matched: true,
      source: resolution.source,
    });
  }
  return authoritativeCount;
}

export function resolveSignerCountFromManifest(
  manifest: { parties: ReadonlyArray<{ partyName?: string | null }> },
  args: SignerCountAuthorityArgs,
  surface = "canonical_manifest",
): number {
  const manifestRowCount = manifest.parties.filter((p) => String(p.partyName ?? "").trim().length >= 2).length;
  return consumeAuthoritativeSignerCount(surface, args, manifestRowCount);
}

export function resolveSignerCountFromIdentities(
  identities: ReadonlyArray<{ partyDisplayName?: string | null }>,
  args: SignerCountAuthorityArgs,
  surface = "canonical_identities",
): number {
  const identityCount = identities.filter((id) => String(id.partyDisplayName ?? "").trim().length >= 2).length;
  return consumeAuthoritativeSignerCount(surface, args, identityCount);
}

/** Guardrail: corpus-derived counts are diagnostics only. */
export function assertSignerCountNotFromCorpus(surface: string, proposedCount: number, args: SignerCountAuthorityArgs): number {
  const corpusCount = inferCorpusDerivedSignerCount(args.corpusPlain);
  const authoritative = resolveAuthoritativeSignerCountCore(args).count;
  if (corpusCount > 0 && proposedCount === corpusCount && proposedCount !== authoritative) {
    logSignerCountConsumerMismatch({
      surface: `${surface}:corpus_inference_blocked`,
      authoritativeCount: authoritative,
      consumerCount: proposedCount,
      corpusBlockCount: corpusCount,
      source: resolveAuthoritativeSignerCountCore(args).source,
    });
    return authoritative;
  }
  return consumeAuthoritativeSignerCount(surface, args, proposedCount);
}

/**
 * Paid Pro readonly HTML / signature preview — manifest + intake authority only.
 * Never inflate signer count from rendered partyNames.length or corpus regex scans.
 */
export function resolveReadonlyHtmlSignerCount(
  surface: string,
  args: SignerCountAuthorityArgs & {
    partyNames?: readonly string[];
    manifestPartyCount?: number | null;
  },
): number {
  const slotNames = selectAuthoritativeTwoPartySlots(args.draftPartyNames ?? args.partyNames ?? []);
  const authority = readConsumedPaidProSignerMetadataAuthority();
  const manifestCount =
    args.manifestPartyCount ??
    authority?.parties?.filter((p) => String(p.partyLegalName ?? "").trim().length >= 2).length ??
    0;

  const resolution = resolveAuthoritativeSignerCountCore({
    ...args,
    draftPartyNames: slotNames,
  });
  let count = resolution.count;
  if (manifestCount >= 2) {
    count = Math.min(count, manifestCount);
  }

  const derivedFromPartyNames = (args.partyNames ?? []).filter((n) => String(n || "").trim().length >= 2)
    .length;
  const derivedFromCorpus = inferCorpusDerivedSignerCount(args.corpusPlain);
  if (derivedFromPartyNames > count) {
    logSignerCountConsumerMismatch({
      surface: `${surface}:derived_party_names`,
      authoritativeCount: count,
      consumerCount: derivedFromPartyNames,
      corpusBlockCount: resolution.corpusBlockCount,
      source: resolution.source,
    });
  }
  if (derivedFromCorpus > count && derivedFromCorpus !== resolution.corpusBlockCount) {
    logSignerCountConsumerMismatch({
      surface: `${surface}:derived_corpus_anchors`,
      authoritativeCount: count,
      consumerCount: derivedFromCorpus,
      corpusBlockCount: resolution.corpusBlockCount,
      source: resolution.source,
    });
  }

  logSignerCountConsumer({
    surface,
    authoritativeCount: count,
    consumerCount: count,
    matched: true,
    source: resolution.source,
  });
  return count;
}
