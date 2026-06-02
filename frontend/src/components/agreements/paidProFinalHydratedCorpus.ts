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
import { tracePaidProCorpusMutation } from "./paidProMutationTrace";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";

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
  const oldText = pinnedSignerAppliedCorpus;
  const next = (body || "").trim();
  pinnedSignerAppliedCorpus = next;
  tracePaidProCorpusMutation({
    store: "pinned_signer_applied_corpus",
    caller: "setPaidProPinnedSignerAppliedCorpus",
    stage: "pin_write",
    oldText,
    newText: next,
    sourceAfter: next ? "pinned_signer_applied_corpus" : null,
  });
}

export function readPaidProPinnedSignerAppliedCorpus(): string {
  return pinnedSignerAppliedCorpus;
}

export function clearPaidProPinnedSignerAppliedCorpus(): void {
  const oldText = pinnedSignerAppliedCorpus;
  pinnedSignerAppliedCorpus = "";
  tracePaidProCorpusMutation({
    store: "pinned_signer_applied_corpus",
    caller: "clearPaidProPinnedSignerAppliedCorpus",
    stage: "clear",
    oldText,
    newText: "",
  });
}

/** Live signer hydration runs only after finalize snapshot or pinned execution corpus exists. */
export function paidProSignerExecutionCorpusIsFrozen(): boolean {
  if (hasAuthoritativeSigningSnapshot()) return true;
  return readPaidProPinnedSignerAppliedCorpus().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN;
}

function authorityHasSignerMetadata(): boolean {
  const auth = readConsumedPaidProSignerMetadataAuthority();
  if (!auth?.parties.length) return false;
  return auth.parties.some((p) => {
    const legal = p.partyLegalName.trim();
    if (!legal) return false;
    return Boolean(p.signerName.trim() || p.signerEmail.trim());
  });
}

function hydrateFromConsumedAuthority(rawCorpus: string, intakeRaw: string): string {
  const authority = readConsumedPaidProSignerMetadataAuthority();
  if (!authority || !authorityHasSignerMetadata()) return "";
  if (!paidProSignerExecutionCorpusIsFrozen()) {
    return "";
  }
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
  let resolution: PaidProFinalHydratedCorpusResolution;
  const snapshotCorpus = readAuthoritativeSigningCorpus();
  if (snapshotCorpus.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    resolution = {
      text: snapshotCorpus,
      hash: getAuthoritativeSigningSnapshot()?.hash ?? hashPaidProCorpus(snapshotCorpus),
      source: "authoritative_signing_snapshot",
      signerMetadataApplied: true,
    };
  } else {
    const pinned = readPaidProPinnedSignerAppliedCorpus();
    if (pinned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
      resolution = {
        text: pinned,
        hash: hashPaidProCorpus(pinned),
        source: "pinned_signer_applied_corpus",
        signerMetadataApplied: true,
      };
    } else {
      const raw = getPaidProSourceOfTruthText();
      if (!raw || raw.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
        resolution = {
          text: "",
          hash: "",
          source: "paidProSourceOfTruth",
          signerMetadataApplied: false,
        };
      } else {
        const hydrated = hydrateFromConsumedAuthority(raw, intakeRaw);
        if (hydrated.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
          resolution = {
            text: hydrated,
            hash: hashPaidProCorpus(hydrated),
            source: "signer_hydrated_from_authority",
            signerMetadataApplied: true,
          };
        } else {
          const sot = getPaidProSourceOfTruth();
          resolution = {
            text: raw,
            hash: sot?.hash ?? hashPaidProCorpus(raw),
            source: "paidProSourceOfTruth",
            signerMetadataApplied: false,
          };
        }
      }
    }
  }
  const reviewAlignedSurfaces: PaidProDocumentSurface[] = [
    "review",
    "copy",
    "display",
    "finalized",
  ];
  if (
    reviewAlignedSurfaces.includes(surface) &&
    resolution.signerMetadataApplied &&
    resolution.text.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN
  ) {
    const aligned = resolvePaidProReviewRenderPlain({
      draft: opts?.draft ?? null,
      intakeText: opts?.intakeText ?? null,
    });
    if (aligned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
      resolution = {
        ...resolution,
        text: aligned,
        hash: hashPaidProCorpus(aligned),
      };
    }
  }
  return resolution;
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
  if (/email\s+for\s+notices?\s*:\s*_{4,}/i.test(copy) && /email\s+for\s+notices?\s*:\s*\S+@/i.test(review)) {
    mismatches.push("copy_blank_signature_notice_email");
  }
  if (/address\s+for\s+notices?\s*:\s*_{4,}/i.test(copy) && /address\s+for\s+notices?\s*:\s*\S/i.test(review)) {
    mismatches.push("copy_blank_signature_notice_address");
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
