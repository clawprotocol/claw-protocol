/**
 * Single resolver for user-facing paid Pro agreement text after signer metadata exists.
 * Review, copy, export, finalized, display, and VS01 must consume the same hydrated corpus.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { corpusHasPopulatedSignerNameLines } from "./guidedDealCompletion/signatureRegion";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
  type PaidProDocumentSurface,
} from "./paidProSourceOfTruth";

export const PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN = 500;

export type PaidProFinalHydratedCorpusSource =
  | "authoritative_signing_snapshot"
  | "pinned_signer_applied_corpus"
  | "signer_hydrated_from_authority"
  | "paidProSourceOfTruth";

export type PaidProFinalHydratedCorpusResolution = {
  text: string;
  hash: string;
  source: PaidProFinalHydratedCorpusSource;
  /** True when signer Name/Title (or snapshot) are applied — not raw SoT placeholders. */
  signerMetadataApplied: boolean;
};

let pinnedSignerAppliedCorpus = "";

export function setPaidProPinnedSignerAppliedCorpus(body: string): void {
  pinnedSignerAppliedCorpus = (body || "").trim();
}

export function readPaidProPinnedSignerAppliedCorpus(): string {
  return pinnedSignerAppliedCorpus;
}

export function clearPaidProPinnedSignerAppliedCorpus(): void {
  pinnedSignerAppliedCorpus = "";
}

function authorityHasSignerMetadata(): boolean {
  const auth = readConsumedPaidProSignerMetadataAuthority();
  if (!auth?.parties.length) return false;
  return auth.parties.some((p) => p.signerName.trim() && p.partyLegalName.trim());
}

function hydrateFromConsumedAuthority(rawCorpus: string, intakeRaw: string): string {
  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (!authority || !authorityHasSignerMetadata()) return "";
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus,
    authority,
    intakeRaw,
    surface: "paid_pro_final_hydrated_corpus",
  });
  return hydrated.rejected ? "" : hydrated.corpus.trim();
}

/**
 * Canonical paid Pro corpus for a consumer surface. Prefer signer-hydrated / snapshot text
 * over raw paidProSourceOfTruth whenever signer metadata exists or is finalized.
 */
export function resolvePaidProFinalHydratedCorpusForSurface(
  surface: PaidProDocumentSurface,
  opts?: { draft?: ParsedDraftShape | null; intakeText?: string | null },
): PaidProFinalHydratedCorpusResolution {
  void surface;
  const intakeRaw = (opts?.intakeText ?? "").trim();
  const snapshotCorpus = readAuthoritativeSigningCorpus();
  if (snapshotCorpus.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return {
      text: snapshotCorpus,
      hash: getAuthoritativeSigningSnapshot()?.hash ?? hashPaidProCorpus(snapshotCorpus),
      source: "authoritative_signing_snapshot",
      signerMetadataApplied: true,
    };
  }

  const pinned = readPaidProPinnedSignerAppliedCorpus();
  if (pinned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return {
      text: pinned,
      hash: hashPaidProCorpus(pinned),
      source: "pinned_signer_applied_corpus",
      signerMetadataApplied: true,
    };
  }

  const raw = getPaidProSourceOfTruthText();
  if (!raw || raw.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return {
      text: "",
      hash: "",
      source: "paidProSourceOfTruth",
      signerMetadataApplied: false,
    };
  }

  const hydrated = hydrateFromConsumedAuthority(raw, intakeRaw);
  if (hydrated.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return {
      text: hydrated,
      hash: hashPaidProCorpus(hydrated),
      source: "signer_hydrated_from_authority",
      signerMetadataApplied: true,
    };
  }

  const sot = getPaidProSourceOfTruth();
  return {
    text: raw,
    hash: sot?.hash ?? hashPaidProCorpus(raw),
    source: "paidProSourceOfTruth",
    signerMetadataApplied: false,
  };
}

/** Surfaces must not report raw SoT when a finalized snapshot or hydrated preview exists. */
export function paidProSurfaceUsesHydratedSignerCorpus(resolution: PaidProFinalHydratedCorpusResolution): boolean {
  return (
    resolution.signerMetadataApplied &&
    resolution.source !== "paidProSourceOfTruth"
  );
}

export function assertPaidProFinalCorpusParity(args: {
  reviewText: string;
  copyText: string;
  exportText?: string;
  vs01Text?: string;
}): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const review = (args.reviewText || "").trim();
  const copy = (args.copyText || "").trim();
  if (!review || !copy) {
    mismatches.push("missing_review_or_copy");
    return { ok: false, mismatches };
  }
  if (fingerprintAgreementBody(review) !== fingerprintAgreementBody(copy)) {
    mismatches.push("review_copy_hash");
  }
  if (args.exportText?.trim() && fingerprintAgreementBody(review) !== fingerprintAgreementBody(args.exportText)) {
    mismatches.push("review_export_hash");
  }
  if (args.vs01Text?.trim() && fingerprintAgreementBody(review) !== fingerprintAgreementBody(args.vs01Text)) {
    mismatches.push("review_vs01_hash");
  }
  if (/name\s*:\s*_{4,}/i.test(copy)) {
    mismatches.push("copy_blank_signer_name");
  }
  if (/title\s*:\s*_{4,}/i.test(copy)) {
    mismatches.push("copy_blank_signer_title");
  }
  if (!/Party Notice Details:/i.test(copy) && /Email:\s*\S+@/i.test(review)) {
    mismatches.push("copy_missing_party_notice_details");
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function paidProFinalCorpusHasPopulatedSignerBlocks(text: string): boolean {
  return corpusHasPopulatedSignerNameLines(text, 2);
}

export function paidProSignerHydratedCorpusActive(): boolean {
  if (hasAuthoritativeSigningSnapshot()) return true;
  if (readPaidProPinnedSignerAppliedCorpus().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return true;
  if (!hasPaidProSourceOfTruth()) return false;
  const hydrated = hydrateFromConsumedAuthority(getPaidProSourceOfTruthText(), "");
  return hydrated.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN && paidProFinalCorpusHasPopulatedSignerBlocks(hydrated);
}
