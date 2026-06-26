/**
 * Paid Pro authority hash continuity — one anchor hash per validated substantive adoption.
 * Records vPaid/freeze hashes at pipeline commit and verifies downstream SoT surfaces stay aligned.
 */

import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { hasProGenerationAdoptionForSession } from "./paidProGenerationAdoption";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

export type PaidProAuthorityHashContinuityLatch = {
  generationId: string;
  intakeFingerprint: string;
  vPaidValidationHash: string;
  acceptedFreezeHash: string;
  bodyLen: number;
  adoptedAt: number;
  canonicalSnapshotHash?: string | null;
  authoritativeSnapshotHash?: string | null;
  reviewDisplayHash?: string | null;
};

let continuityLatch: PaidProAuthorityHashContinuityLatch | null = null;
const forbiddenPostValidatedStages: string[] = [];

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function corpusHash(text: string): string {
  return paidProPipelineAcceptedCorpusHash(text) ?? hashPaidProCorpus(text);
}

export function commitPaidProAuthorityHashContinuity(args: {
  generationId: string;
  intakeFingerprint: string;
  body: string;
  vPaidValidationHash?: string | null;
  acceptedFreezeHash?: string | null;
}): PaidProAuthorityHashContinuityLatch | null {
  const generationId = trim(args.generationId);
  const intakeFingerprint = trim(args.intakeFingerprint);
  const body = trim(args.body);
  if (!generationId || body.length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) return null;

  const vPaidValidationHash = trim(args.vPaidValidationHash) || corpusHash(body);
  const acceptedFreezeHash = trim(args.acceptedFreezeHash) || vPaidValidationHash;
  continuityLatch = {
    generationId,
    intakeFingerprint,
    vPaidValidationHash,
    acceptedFreezeHash,
    bodyLen: body.length,
    adoptedAt: Date.now(),
  };
  return continuityLatch;
}

export function extendPaidProAuthorityHashContinuitySurface(args: {
  canonicalSnapshotHash?: string | null;
  authoritativeSnapshotHash?: string | null;
  reviewDisplayHash?: string | null;
}): void {
  if (!continuityLatch) return;
  if (trim(args.canonicalSnapshotHash)) {
    continuityLatch.canonicalSnapshotHash = trim(args.canonicalSnapshotHash);
  }
  if (trim(args.authoritativeSnapshotHash)) {
    continuityLatch.authoritativeSnapshotHash = trim(args.authoritativeSnapshotHash);
  }
  if (trim(args.reviewDisplayHash)) {
    continuityLatch.reviewDisplayHash = trim(args.reviewDisplayHash);
  }
}

export function readPaidProAuthorityHashContinuity(
  generationId?: string | null,
  intakeFingerprint?: string | null,
): PaidProAuthorityHashContinuityLatch | null {
  if (!continuityLatch) return null;
  const gen = trim(generationId);
  const fp = trim(intakeFingerprint);
  if (gen && continuityLatch.generationId !== gen) return null;
  if (fp && continuityLatch.intakeFingerprint !== fp) return null;
  return continuityLatch;
}

export function hasPaidProValidatedAuthorityHashLatch(
  generationId?: string | null,
  intakeFingerprint?: string | null,
): boolean {
  const latch = readPaidProAuthorityHashContinuity(generationId, intakeFingerprint);
  return Boolean(latch && latch.bodyLen >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
}

export function shouldBlockPostValidatedRecoveryPaths(
  generationId?: string | null,
  intakeFingerprint?: string | null,
): boolean {
  return (
    hasPaidProValidatedAuthorityHashLatch(generationId, intakeFingerprint) ||
    hasProGenerationAdoptionForSession(generationId, intakeFingerprint)
  );
}

export function recordForbiddenPostValidatedRecoveryStage(stage: string): void {
  const key = trim(stage);
  if (!key) return;
  if (!shouldBlockPostValidatedRecoveryPaths()) return;
  forbiddenPostValidatedStages.push(key);
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.error("[paid-pro-authority-hash-continuity-violation]", { stage: key });
  }
}

export function readForbiddenPostValidatedRecoveryStages(): readonly string[] {
  return forbiddenPostValidatedStages;
}

export type PaidProAuthorityHashContinuityReport = {
  ok: boolean;
  anchorHash: string | null;
  mismatches: string[];
  latch: PaidProAuthorityHashContinuityLatch | null;
};

export function verifyPaidProAuthorityHashContinuity(args: {
  generationId?: string | null;
  intakeFingerprint?: string | null;
  vPaidValidationHash?: string | null;
  acceptedFreezeHash?: string | null;
  canonicalSnapshotHash?: string | null;
  authoritativeSnapshotHash?: string | null;
  reviewDisplayHash?: string | null;
  sotHash?: string | null;
}): PaidProAuthorityHashContinuityReport {
  const latch = readPaidProAuthorityHashContinuity(args.generationId, args.intakeFingerprint);
  const anchorHash =
    latch?.acceptedFreezeHash ??
    latch?.vPaidValidationHash ??
    (trim(args.acceptedFreezeHash) || trim(args.vPaidValidationHash) || null);
  const mismatches: string[] = [];
  const pairs: Array<[string, string | null | undefined]> = [
    ["vPaidValidationHash", args.vPaidValidationHash ?? latch?.vPaidValidationHash],
    ["acceptedFreezeHash", args.acceptedFreezeHash ?? latch?.acceptedFreezeHash],
    ["canonicalSnapshotHash", args.canonicalSnapshotHash ?? latch?.canonicalSnapshotHash],
    ["authoritativeSnapshotHash", args.authoritativeSnapshotHash ?? latch?.authoritativeSnapshotHash],
    ["reviewDisplayHash", args.reviewDisplayHash ?? latch?.reviewDisplayHash],
    ["sotHash", args.sotHash],
  ];
  if (anchorHash) {
    for (const [label, hash] of pairs) {
      const h = trim(hash);
      if (h && h !== anchorHash) {
        mismatches.push(`${label}:${h}`);
      }
    }
  }
  return { ok: mismatches.length === 0 && Boolean(anchorHash), anchorHash, mismatches, latch };
}

export function clearPaidProAuthorityHashContinuityForTests(): void {
  continuityLatch = null;
  forbiddenPostValidatedStages.length = 0;
}
