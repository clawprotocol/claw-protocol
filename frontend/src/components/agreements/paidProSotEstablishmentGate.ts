/**
 * Paid Pro SoT establishment gate — fatal-placeholder-only blocking after freeze/adoption.
 */

import type { CanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { collectFatalPaidProPlaceholderIssueCodes } from "./canonicalAgreementSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

export type PaidProSotEstablishmentDecision = {
  blocked: boolean;
  blockedBy: string | null;
  warnOnly: boolean;
  acceptedFreezeHash: string | null;
  adoptedHash: string | null;
  canonicalSnapshotSelectedHash: string | null;
  sotCandidateHash: string | null;
  placeholderIssueCodes: readonly string[];
  fatalPlaceholderIssueCodes: readonly string[];
  freezeGatesPassed: boolean;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function corpusHash(text: string): string {
  const t = (text || "").trim();
  return paidProPipelineAcceptedCorpusHash(t) ?? fingerprintAgreementBody(t);
}

export function resolvePaidProSotEstablishmentDecision(args: {
  snapshot: CanonicalAgreementSnapshot;
  corpusText: string;
  freezeGatesPassed: boolean;
  acceptedFreezeHash?: string | null;
  adoptedHash?: string | null;
  intakeRaw: string;
  partyNames: readonly string[];
  /** User-approved revision may intentionally shorten below the default 500-char floor. */
  allowUserApprovedShortCorpus?: boolean;
}): PaidProSotEstablishmentDecision {
  const corpus = trim(args.corpusText);
  const sotCandidateHash = corpusHash(corpus);
  const acceptedFreezeHash = trim(args.acceptedFreezeHash) || null;
  const adoptedHash = trim(args.adoptedHash) || null;
  const canonicalSnapshotSelectedHash = trim(args.snapshot.hash) || null;
  const placeholderIssueCodes = [...args.snapshot.placeholderIssues];
  const fatalPlaceholderIssueCodes = collectFatalPaidProPlaceholderIssueCodes(corpus, {
    intakeText: args.intakeRaw,
    partyNames: args.partyNames,
  });
  const hashAligned =
    (acceptedFreezeHash && sotCandidateHash === acceptedFreezeHash) ||
    (adoptedHash && sotCandidateHash === adoptedHash) ||
    (canonicalSnapshotSelectedHash && sotCandidateHash === canonicalSnapshotSelectedHash);

  const base: PaidProSotEstablishmentDecision = {
    blocked: false,
    blockedBy: null,
    warnOnly: false,
    acceptedFreezeHash,
    adoptedHash,
    canonicalSnapshotSelectedHash,
    sotCandidateHash,
    placeholderIssueCodes,
    fatalPlaceholderIssueCodes,
    freezeGatesPassed: args.freezeGatesPassed,
  };

  if (fatalPlaceholderIssueCodes.length > 0) {
    return { ...base, blocked: true, blockedBy: "fatal_placeholder" };
  }
  // User-approved revisions may intentionally drop well below the default 500-char floor
  // (clause edits / trim). Still require a non-empty operative body.
  const minLen = args.allowUserApprovedShortCorpus ? 40 : 500;
  if (!corpus || corpus.length < minLen) {
    return { ...base, blocked: true, blockedBy: "corpus_too_short" };
  }
  if (args.freezeGatesPassed && hashAligned) {
    const nonfatalSnapshotIssue =
      placeholderIssueCodes.length > 0 || !args.snapshot.integrityOk;
    return {
      ...base,
      blocked: false,
      blockedBy: null,
      warnOnly: nonfatalSnapshotIssue,
    };
  }
  if (!args.snapshot.integrityOk || placeholderIssueCodes.length > 0) {
    return { ...base, blocked: true, blockedBy: "snapshot_integrity" };
  }
  return base;
}

export function logPaidProSotEstablishmentDecision(
  decision: PaidProSotEstablishmentDecision,
  surface: string,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env.MODE === "test") return;
  const level = decision.blocked ? "warn" : decision.warnOnly ? "info" : "info";
  const payload = {
    surface,
    blocked: decision.blocked,
    blockedBy: decision.blockedBy,
    warnOnly: decision.warnOnly,
    acceptedFreezeHash: decision.acceptedFreezeHash,
    adoptedHash: decision.adoptedHash,
    canonicalSnapshotSelectedHash: decision.canonicalSnapshotSelectedHash,
    sotCandidateHash: decision.sotCandidateHash,
    placeholderIssueCodes: decision.placeholderIssueCodes,
    fatalPlaceholderIssueCodes: decision.fatalPlaceholderIssueCodes,
    freezeGatesPassed: decision.freezeGatesPassed,
  };
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn("[paid-pro-sot-establishment-decision]", payload);
  } else {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-sot-establishment-decision]", payload);
  }
}
