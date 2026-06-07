/**
 * Post-signer-finalize paid Pro review surfaces — locked hydrated signing snapshot only.
 */

import {
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
  signerMetadataAuthorityHasHydratableFields,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "./paidProExecutionBlockEntityHeading";
import {
  authorityPartiesToRecipientMetadata,
  readConsumedPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
} from "./paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { ensureExecutionBlockNoticeContactFieldLines } from "./paidProPartyNoticeDetails";

function resolvePostFinalizeRecipientMetadata(): AuthoritativeSigningSnapshotRecipientMetadata | null {
  const snapshot = getAuthoritativeSigningSnapshot();
  if (snapshot?.signerMetadata) return snapshot.signerMetadata;
  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (!parties?.length) return null;
  return authorityPartiesToRecipientMetadata(parties);
}

/** Render-time enrichment — does not mutate the frozen signing snapshot store. */
export function enrichPaidProPostFinalizeDisplayCorpus(plain: string): string {
  const body = (plain || "").trim();
  if (body.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return body;

  const parties =
    readConsumedPaidProSignerMetadataAuthority()?.parties ??
    (() => {
      const meta = resolvePostFinalizeRecipientMetadata();
      return meta ? recipientMetadataToAuthorityParties(meta) : [];
    })();

  let out = body;
  if (parties.length >= 2) {
    out = repairMalformedPaidProAgreementRecital(out, parties).text;
  }

  const recipientMeta = resolvePostFinalizeRecipientMetadata();
  if (recipientMeta && signerMetadataAuthorityHasHydratableFields(recipientMeta) && parties.length >= 2) {
    out = ensureExecutionBlockNoticeContactFieldLines(out).text;
    out = finalizePaidProSigningCorpusText(out, parties, { acceptedCorpus: body }).text;
    const hydration = hydratePaidProExecutionBlockWithSignerMetadata(out, recipientMeta, {
      acceptedCorpus: body,
    });
    if (hydration.applied) {
      out = hydration.corpus;
    }
  }

  if (!detectExecutionHeadingMetadataLeak(out).leak) return out.trim();
  return repairExecutionBlockEntityHeadingLines(out, parties).text.trim();
}

function finalizePostFinalizeReviewPlain(plain: string): string {
  const body = enrichPaidProPostFinalizeDisplayCorpus(plain);
  if (body.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return body;
  return body;
}

export function resolvePaidProPostFinalizeReviewPlain(): string {
  const snapshot = readAuthoritativeSigningCorpus().trim();
  if (snapshot.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return finalizePostFinalizeReviewPlain(snapshot);
  }
  const pinned = readPaidProPinnedSignerAppliedCorpus().trim();
  if (pinned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return finalizePostFinalizeReviewPlain(pinned);
  }
  return "";
}

export function resolvePaidProPostFinalizeReviewHash(): string {
  const plain = resolvePaidProPostFinalizeReviewPlain();
  return plain.length >= 80 ? hashPaidProCorpus(plain) : "";
}

export function auditPaidProPostFinalizeHydrationInvariant(args: {
  reviewPlain: string;
  signerMetadata?: AuthoritativeSigningSnapshotRecipientMetadata | null;
}): {
  blocked: boolean;
  blankSignerLinesRemaining: number;
  metadataComplete: boolean;
} {
  const reviewPlain = (args.reviewPlain || "").trim();
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(reviewPlain);
  const metadataComplete = args.signerMetadata
    ? signerMetadataAuthorityHasHydratableFields(args.signerMetadata)
    : false;
  const blocked =
    isPaidProPostFinalizeHydratedCorpusLocked() &&
    metadataComplete &&
    blankSignerLinesRemaining > 0;
  return { blocked, blankSignerLinesRemaining, metadataComplete };
}

export function canProceedPaidProReviewFirstHandoffAfterFinalize(args: {
  signersComplete: boolean;
  reviewPlain?: string;
  minLen?: number;
}): boolean {
  if (!isPaidProPostFinalizeHydratedCorpusLocked()) return false;
  if (!args.signersComplete) return false;
  const plain = (args.reviewPlain ?? resolvePaidProPostFinalizeReviewPlain()).trim();
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  if (plain.length < minLen) return false;
  if (countBlankSignerMetadataLinesInExecutionBlock(plain) > 0) return false;
  return true;
}

const VISIBLE_BLANK_SIG_LINE_RE =
  /^(?:name|title|email\s+for\s+notices?|address\s+for\s+notices?)\s*:\s*(?:_{4,}\s*)?$/im;

export function countVisibleBlankSignerPlaceholderLines(visibleText: string): number {
  const lines = (visibleText || "").split("\n");
  let count = 0;
  for (const line of lines) {
    if (VISIBLE_BLANK_SIG_LINE_RE.test(line.trim())) count += 1;
  }
  return count;
}

export function auditPaidProPostFinalizeVisibleSurface(args: {
  visibleText: string;
  expectedPlain: string;
  signerNames?: readonly string[];
}): {
  mismatch: boolean;
  visibleHash: string;
  expectedHash: string;
  hasSarah: boolean;
  hasMichael: boolean;
  blankVisibleLines: number;
} {
  const visibleText = (args.visibleText || "").trim();
  const expectedPlain = (args.expectedPlain || "").trim();
  const visibleHash = visibleText.length >= 80 ? hashPaidProCorpus(visibleText) : "";
  const expectedHash = expectedPlain.length >= 80 ? hashPaidProCorpus(expectedPlain) : "";
  const names = (args.signerNames ?? []).map((n) => n.trim()).filter(Boolean);
  const visibleLower = visibleText.toLowerCase();
  const hasSarah = visibleLower.includes("sarah mitchell");
  const hasMichael = visibleLower.includes("michael torres");
  const blankVisibleLines = countVisibleBlankSignerPlaceholderLines(visibleText);
  const requiredNames = names.length >= 2 ? names : ["Sarah Mitchell", "Michael Torres"];
  const missingRequiredName = requiredNames.some(
    (name) => name.trim() && !visibleLower.includes(name.trim().toLowerCase()),
  );
  const mismatch =
    isPaidProPostFinalizeHydratedCorpusLocked() &&
    countBlankSignerMetadataLinesInExecutionBlock(expectedPlain) === 0 &&
    (blankVisibleLines > 0 || missingRequiredName);
  return {
    mismatch,
    visibleHash,
    expectedHash,
    hasSarah,
    hasMichael,
    blankVisibleLines,
  };
}

let lastVisibleSurfaceMismatchLog = "";

export function logPaidProPostFinalizeVisibleSurfaceMismatch(payload: {
  visibleHash: string;
  expectedHash: string;
  hasSarah: boolean;
  hasMichael: boolean;
  blankVisibleLines: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const key = `${payload.visibleHash}:${payload.expectedHash}:${payload.blankVisibleLines}`;
  if (key === lastVisibleSurfaceMismatchLog) return;
  lastVisibleSurfaceMismatchLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-finalize-visible-surface-mismatch]", payload);
}

export function logPaidProPostFinalizeActionClick(payload: {
  action: string;
  corpusHash: string;
  hydrated: boolean;
  canProceed: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-post-finalize-action-click]", payload);
}

let lastHydrationBlockedLog = "";

export function logPaidProPostFinalizeHydrationBlocked(payload: {
  blankSignerLinesRemaining: number;
  reviewLen: number;
  reviewHash: string | null;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const key = `${payload.surface}:${payload.reviewHash}:${payload.blankSignerLinesRemaining}`;
  if (key === lastHydrationBlockedLog) return;
  lastHydrationBlockedLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-finalize-hydration-blocked]", payload);
}
