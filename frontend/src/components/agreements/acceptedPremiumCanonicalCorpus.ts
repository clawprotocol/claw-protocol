/**
 * Immutable accepted paid Pro corpus after client gates pass on `server_full_draft`.
 * Display, copy, final review, and VS01 must read this field — not re-canonicalize.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDisplayText,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  getPaidProVs01Text,
  hasPaidProSourceOfTruth,
  hydratePaidProSourceOfTruth,
  logPaidProCorpusInvariant,
  type PaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export type AcceptedPremiumCanonicalRecord = {
  text: string;
  hash: string;
  acceptedLen: number;
  pipelineSource: string;
  establishedAt: number;
  rawAcceptedLen: number;
} & PaidProSourceOfTruth;

export type EstablishAcceptedPremiumCanonicalCorpusArgs = {
  rawAcceptedBody: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  pipelineSource: string;
};

export type AcceptedPremiumCorpusInstrumentation = {
  accepted_len: number;
  displayed_len: number;
  copied_len: number;
  final_review_len: number;
  vs01_len: number;
  accepted_hash: string;
  displayed_hash: string;
  copied_hash: string;
  final_review_hash: string;
  vs01_hash: string;
  display_matches_accepted: boolean;
  copy_matches_accepted: boolean;
  final_review_matches_accepted: boolean;
  vs01_matches_accepted_or_execution_only: boolean;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function toAcceptedRecord(record: PaidProSourceOfTruth): AcceptedPremiumCanonicalRecord {
  return {
    ...record,
    acceptedLen: record.text.length,
    pipelineSource: record.source,
    establishedAt: record.accepted_at,
    rawAcceptedLen: record.text.length,
  };
}

export function clearAcceptedPremiumCanonicalCorpus(): void {
  clearPaidProSourceOfTruth();
}

export function getAcceptedPremiumCanonicalCorpus(): AcceptedPremiumCanonicalRecord | null {
  const record = getPaidProSourceOfTruth();
  return record ? toAcceptedRecord(record) : null;
}

export function getAcceptedPremiumCanonicalText(): string {
  return getPaidProSourceOfTruthText();
}

export function isAcceptedPremiumCanonicalEstablished(): boolean {
  return hasPaidProSourceOfTruth();
}

export function establishAcceptedPremiumCanonicalCorpus(
  args: EstablishAcceptedPremiumCanonicalCorpusArgs,
): AcceptedPremiumCanonicalRecord {
  const raw = trim(args.rawAcceptedBody);
  const source = isAuthoritativePremiumPipelineRenderSource(args.pipelineSource)
    ? "server_full_draft"
    : "server_full_draft";
  const record = establishPaidProSourceOfTruth({
    text: raw,
    source,
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  return { ...toAcceptedRecord(record), rawAcceptedLen: raw.length };
}

export function hydrateAcceptedPremiumCanonicalCorpusFromSnapshot(
  snap: PremiumCompletionSnapshot | null | undefined,
): AcceptedPremiumCanonicalRecord | null {
  if (!snap?.premiumAccepted) return null;
  const canonical = trim(snap.paidProSourceOfTruthText || snap.acceptedPremiumCanonicalText);
  const pipelineSource = trim(
    snap.paidProSourceOfTruthSource ||
      snap.acceptedPremiumCanonicalPipelineSource ||
      snap.premiumPipelineRenderSource,
  );
  if (
    canonical.length < 500 ||
    !isAuthoritativePremiumPipelineRenderSource(pipelineSource)
  ) {
    return null;
  }
  const record = hydratePaidProSourceOfTruth({
    text: canonical,
    hash: trim(snap.paidProSourceOfTruthHash || snap.acceptedPremiumCanonicalHash),
    accepted_at: snap.paidProSourceOfTruthAcceptedAt ?? snap.savedAt,
    source: "server_full_draft",
  });
  return record ? toAcceptedRecord(record) : null;
}

/** Display / copy / final review — identical to established accepted corpus. */
export function getAcceptedPremiumDisplayText(): string {
  return getPaidProDisplayText();
}

export function getAcceptedPremiumCorpusForVs01Signing(opts?: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): string {
  const base = getAcceptedPremiumCanonicalText();
  if (!base) return "";
  return getPaidProVs01Text({
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
  });
}

export function logAcceptedPremiumCorpusInstrumentation(payload: {
  displayed?: string | null;
  copied?: string | null;
  finalReview?: string | null;
  vs01?: string | null;
}): AcceptedPremiumCorpusInstrumentation | null {
  const accepted = getPaidProSourceOfTruth();
  if (!accepted) return null;
  const invariant = logPaidProCorpusInvariant({
    displayed: payload.displayed ?? accepted.text,
    copied: payload.copied ?? payload.displayed ?? accepted.text,
    review: payload.finalReview ?? payload.displayed ?? accepted.text,
    finalized: payload.finalReview ?? payload.displayed ?? accepted.text,
    vs01: payload.vs01 ?? getAcceptedPremiumCorpusForVs01Signing(),
  });
  if (!invariant) return null;
  return {
    accepted_len: invariant.accepted_len,
    displayed_len: invariant.displayed_len,
    copied_len: invariant.copied_len,
    final_review_len: invariant.review_len,
    vs01_len: invariant.vs01_len,
    accepted_hash: invariant.accepted_hash,
    displayed_hash: invariant.displayed_hash,
    copied_hash: invariant.copied_hash,
    final_review_hash: invariant.review_hash,
    vs01_hash: invariant.vs01_hash,
    display_matches_accepted: invariant.displayed_matches,
    copy_matches_accepted: invariant.copied_matches,
    final_review_matches_accepted: invariant.review_matches,
    vs01_matches_accepted_or_execution_only: invariant.vs01_matches_or_execution_only,
  };
}

export function snapshotFieldsFromAcceptedPremiumCanonical(
  record: AcceptedPremiumCanonicalRecord,
): Pick<
  PremiumCompletionSnapshot,
  | "acceptedPremiumCanonicalText"
  | "acceptedPremiumCanonicalHash"
  | "acceptedPremiumCanonicalPipelineSource"
  | "paidProSourceOfTruthText"
  | "paidProSourceOfTruthHash"
  | "paidProSourceOfTruthAcceptedAt"
  | "paidProSourceOfTruthSource"
> {
  return {
    acceptedPremiumCanonicalText: record.text,
    acceptedPremiumCanonicalHash: record.hash,
    acceptedPremiumCanonicalPipelineSource: record.pipelineSource,
    paidProSourceOfTruthText: record.text,
    paidProSourceOfTruthHash: record.hash,
    paidProSourceOfTruthAcceptedAt: record.establishedAt,
    paidProSourceOfTruthSource: "server_full_draft",
  };
}
