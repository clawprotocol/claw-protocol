/**
 * Session-scoped Pro generation adoption — one authoritative corpus per generation + intake fingerprint.
 * Prevents weaker starter/free/degraded paths from overriding a stronger accepted freeze candidate.
 */

import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";

export type ProGenerationAdoptionSource =
  | "server_full_draft"
  | "server_full_draft_retry"
  | "server_full_draft_degraded"
  | "structural_recovery"
  | "deterministic_recovery_freeze_candidate"
  | "premium_degraded_server_local_recovery"
  | "free_starter"
  | "rejected_paid_corpus";

const SOURCE_RANK: Record<string, number> = {
  server_full_draft: 100,
  server_full_draft_retry: 100,
  server_full_draft_degraded: 95,
  structural_recovery: 85,
  deterministic_recovery_freeze_candidate: 80,
  premium_degraded_server_local_recovery: 45,
  free_starter: 5,
  rejected_paid_corpus: 0,
};

export type ProGenerationAdoptionRecord = {
  generationId: string;
  intakeFingerprint: string;
  body: string;
  hash: string;
  source: string;
  rank: number;
  freezeCandidateHash: string | null;
  adoptedAt: number;
};

let adoptedRecord: ProGenerationAdoptionRecord | null = null;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function proGenerationAdoptionSourceRank(source: string | null | undefined): number {
  const key = trim(source);
  return SOURCE_RANK[key] ?? 50;
}

export function hashProGenerationAdoptionBody(text: string): string {
  return paidProPipelineAcceptedCorpusHash(text) ?? "empty";
}

export function readProGenerationAdoption(
  generationId?: string | null,
  intakeFingerprint?: string | null,
): ProGenerationAdoptionRecord | null {
  if (!adoptedRecord) return null;
  const gen = trim(generationId);
  const fp = trim(intakeFingerprint);
  if (gen && adoptedRecord.generationId !== gen) return null;
  if (fp && adoptedRecord.intakeFingerprint !== fp) return null;
  return adoptedRecord;
}

export function hasProGenerationAdoptionForSession(
  generationId?: string | null,
  intakeFingerprint?: string | null,
): boolean {
  const rec = readProGenerationAdoption(generationId, intakeFingerprint);
  return Boolean(rec && rec.body.length >= 500);
}

export function shouldBlockWeakerProCorpusOverride(args: {
  generationId?: string | null;
  intakeFingerprint?: string | null;
  source: string;
  bodyLen: number;
}): boolean {
  const rec = readProGenerationAdoption(args.generationId, args.intakeFingerprint);
  if (!rec) return false;
  const incomingRank = proGenerationAdoptionSourceRank(args.source);
  if (incomingRank < rec.rank) return true;
  if (incomingRank === rec.rank && args.bodyLen < Math.floor(rec.body.length * 0.9)) return true;
  return false;
}

export function tryCommitProGenerationAdoption(args: {
  generationId: string;
  intakeText?: string | null;
  intakeFingerprint?: string | null;
  body: string;
  source: string;
  freezeCandidateHash?: string | null;
}): { committed: boolean; reason: string; record: ProGenerationAdoptionRecord | null } {
  const generationId = trim(args.generationId);
  const body = trim(args.body);
  if (!generationId) return { committed: false, reason: "missing_generation_id", record: null };
  if (body.length < 500) return { committed: false, reason: "body_too_short", record: null };

  const intakeFingerprint =
    trim(args.intakeFingerprint) ||
    (trim(args.intakeText) ? shortIntakeFingerprint(trim(args.intakeText)) : "");
  const source = trim(args.source) || "server_full_draft";
  const rank = proGenerationAdoptionSourceRank(source);
  const hash = hashPaidProCorpus(body);

  if (
    adoptedRecord &&
    adoptedRecord.generationId === generationId &&
    adoptedRecord.intakeFingerprint === intakeFingerprint
  ) {
    if (rank < adoptedRecord.rank) {
      return { committed: false, reason: "weaker_than_adopted", record: adoptedRecord };
    }
    if (
      rank === adoptedRecord.rank &&
      body.length < Math.floor(adoptedRecord.body.length * 0.9) &&
      hash !== adoptedRecord.hash
    ) {
      return { committed: false, reason: "shorter_same_rank", record: adoptedRecord };
    }
  }

  const record: ProGenerationAdoptionRecord = {
    generationId,
    intakeFingerprint,
    body,
    hash,
    source,
    rank,
    freezeCandidateHash: trim(args.freezeCandidateHash) || null,
    adoptedAt: Date.now(),
  };
  adoptedRecord = record;
  return { committed: true, reason: "committed", record };
}

export function clearProGenerationAdoptionForTests(): void {
  adoptedRecord = null;
}

export function logProGenerationAdoptionCommitted(args: {
  generationId: string;
  source: string;
  bodyLen: number;
  hash: string;
  freezeCandidateHash?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-generation-adoption]", {
    generationId: args.generationId,
    source: args.source,
    bodyLen: args.bodyLen,
    hash: args.hash,
    freezeCandidateHash: args.freezeCandidateHash ?? null,
  });
}

/** Block degraded local recovery display when a stronger adoption already exists for this session. */
export function shouldSuppressDegradedRecoveryAfterProAdoption(args: {
  generationId?: string | null;
  intakeFingerprint?: string | null;
  recoveryBodyLen: number;
  recoverySource?: string | null;
}): boolean {
  const rec = readProGenerationAdoption(args.generationId, args.intakeFingerprint);
  if (!rec) return false;
  const recoverySource = trim(args.recoverySource) || PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE;
  const recoveryRank = proGenerationAdoptionSourceRank(recoverySource);
  if (recoveryRank >= rec.rank && args.recoveryBodyLen >= Math.floor(rec.body.length * 0.85)) {
    return false;
  }
  return rec.body.length >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN;
}

export function buildProGenerationAdoptionResultFromRecord(
  record: ProGenerationAdoptionRecord,
): { text: string; source: string } {
  return { text: record.body, source: record.source };
}
