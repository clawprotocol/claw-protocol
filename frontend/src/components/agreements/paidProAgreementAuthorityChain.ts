/**
 * Paid Pro agreement authority: one base corpus (SoT) + optional execution overlay (signer metadata).
 * Review, copy, export, and signing must share the same resolved surface text.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  readPaidProPinnedSignerAppliedCorpus,
  type PaidProFinalHydratedCorpusSource,
} from "./paidProFinalHydratedCorpus";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";

export const PAID_PRO_AGREEMENT_BODY_PREFIX_MIN_LEN = 400;

export type PaidProResolvedSurfaceLayer = "execution" | "base";

export type PaidProResolvedSurfaceCorpus = {
  text: string;
  hash: string;
  source: PaidProFinalHydratedCorpusSource;
  layer: PaidProResolvedSurfaceLayer;
};

const EXECUTION_SOURCES = new Set<PaidProFinalHydratedCorpusSource>([
  "authoritative_signing_snapshot",
  "pinned_signer_applied_corpus",
  "signer_hydrated_from_authority",
]);

/** Fingerprint operative agreement language (excludes party notice + signature execution blocks). */
export function fingerprintPaidProAgreementOperativeBody(text: string): string {
  const raw = (text || "").replace(/\r\n/g, "\n");
  let end = raw.length;
  for (const re of [/^\s*Party Notice Details:\s*$/im, /\bIN WITNESS WHEREOF\b/i, /^\s*SIGNATURES?\s*:?\s*$/im]) {
    const idx = raw.search(re);
    if (idx >= PAID_PRO_AGREEMENT_BODY_PREFIX_MIN_LEN) {
      end = Math.min(end, idx);
    }
  }
  const operative = raw.slice(0, end).trimEnd();
  return fingerprintAgreementBody(
    operative.length >= PAID_PRO_AGREEMENT_BODY_PREFIX_MIN_LEN ? operative : raw.trim(),
  );
}

/** @deprecated Prefer fingerprintPaidProAgreementOperativeBody for stability tests. */
export function fingerprintPaidProAgreementBodyPrefix(text: string): string {
  return fingerprintPaidProAgreementOperativeBody(text);
}

export function resolvePaidProExecutionCorpusForSurfaces(): PaidProResolvedSurfaceCorpus | null {
  const snapshotText = readAuthoritativeSigningCorpus();
  if (snapshotText.length >= 500) {
    const snap = getAuthoritativeSigningSnapshot();
    return {
      text: snapshotText,
      hash: snap?.hash ?? hashPaidProCorpus(snapshotText),
      source: "authoritative_signing_snapshot",
      layer: "execution",
    };
  }
  const pinned = readPaidProPinnedSignerAppliedCorpus();
  if (pinned.length >= 500) {
    return {
      text: pinned,
      hash: hashPaidProCorpus(pinned),
      source: "pinned_signer_applied_corpus",
      layer: "execution",
    };
  }
  return null;
}

/**
 * Canonical text for review/copy/export/signing. Execution layer wins once finalized;
 * otherwise the user-approved SoT base corpus is shown unchanged.
 */
export function resolvePaidProUnifiedSurfaceCorpus(): PaidProResolvedSurfaceCorpus | null {
  const execution = resolvePaidProExecutionCorpusForSurfaces();
  if (execution) return execution;
  const sot = getPaidProSourceOfTruth();
  const text = getPaidProSourceOfTruthText();
  if (!sot || text.length < 500) return null;
  return {
    text,
    hash: sot.hash,
    source: "paidProSourceOfTruth",
    layer: "base",
  };
}

export function isPaidProExecutionCorpusSource(source: string): boolean {
  return EXECUTION_SOURCES.has(source as PaidProFinalHydratedCorpusSource);
}

export function expectedPaidProSurfaceHash(args: {
  signerMetadataApplied?: boolean;
  actualSource?: string;
}): string | null {
  const sot = getPaidProSourceOfTruth();
  if (!sot) return null;
  if (args.signerMetadataApplied || isPaidProExecutionCorpusSource(args.actualSource ?? "")) {
    const execution = resolvePaidProExecutionCorpusForSurfaces();
    if (execution) return execution.hash;
  }
  return sot.hash;
}

export function paidProSurfaceCorpusMatchesAuthority(args: {
  text: string;
  signerMetadataApplied?: boolean;
  actualSource?: string;
  allowExecutionAppend?: boolean;
}): boolean {
  const source = getPaidProSourceOfTruth();
  if (!source) return true;
  const actualText = (args.text || "").trim();
  const actualHash = hashPaidProCorpus(actualText);
  const expected = expectedPaidProSurfaceHash(args);
  if (expected && actualHash === expected) return true;
  if (actualHash === source.hash) return true;
  if (args.allowExecutionAppend && differsOnlyByExecutionAppend(source.text, actualText)) return true;
  return false;
}

function differsOnlyByExecutionAppend(base: string, candidate: string): boolean {
  const a = (base || "").trim();
  const b = (candidate || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (!b.startsWith(a)) return false;
  const tail = b.slice(a.length).trim();
  return /\b(IN WITNESS WHEREOF|SIGNATURE|EXECUTION)\b/i.test(tail);
}
