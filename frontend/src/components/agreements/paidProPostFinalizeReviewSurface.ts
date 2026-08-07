/**
 * Post-signer-finalize paid Pro review surfaces — locked hydrated signing snapshot only.
 */

import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
  stripDuplicateConsecutiveExecutionEntityLines,
} from "./paidProExecutionBlockEntityHeading";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
  signerMetadataAuthorityHasHydratableFields,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  readConsumedPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
} from "./paidProSignerMetadataAuthority";
import {
  applySignatureNoticeContactFieldsToCorpus,
  ensureOperativeIfToNoticeDelivery,
} from "./paidProPartyNoticeDetails";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  applyReviewReadyMetadataBackfill,
  collectReviewReadyCorpusHints,
} from "../../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

/**
 * TEST560 — notice stanzas still carrying the pre-signer-setup placeholder
 * ("Email: provided during signer setup" / "Address: provided during signer setup")
 * must be hydrated on the post-finalize display surface even when execution blocks are filled.
 */
export const NOTICE_SIGNER_SETUP_PLACEHOLDER_RE = /provided during signer setup/i;

/** True when a corpus is signing-ready: no setup placeholders and no blank required Name/Title lines. */
export function isPaidProSigningReadyHydratedCorpus(plain: string): boolean {
  const body = (plain || "").trim();
  if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(body)) return false;
  // Only count blank Title/Name when authority supplied those values (optional title stays blank).
  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  if (countBlankSignerMetadataLinesInExecutionBlock(body, parties) > 0) return false;
  return true;
}

/**
 * Pick the first signing-ready corpus after finalize hydrate + snapshot write.
 * Never prefer a non-empty but non-ready post-finalize plain over a ready hydrated body
 * (that flash caused "Signer details could not be applied" after successful hydrate).
 */
export function resolvePaidProSignerFinalizeSigningReadyPlain(args: {
  hydratedCorpus: string;
  postFinalizePlain?: string | null;
  snapshotCorpus?: string | null;
}): string {
  const candidates = [
    args.hydratedCorpus,
    args.postFinalizePlain,
    args.snapshotCorpus,
  ]
    .map((t) => (t || "").trim())
    .filter((t) => t.length > 0);
  const ready = candidates.find((t) => isPaidProSigningReadyHydratedCorpus(t));
  return ready || candidates[0] || "";
}

/** Render-time enrichment — does not mutate the frozen signing snapshot store. */
export function enrichPaidProPostFinalizeDisplayCorpus(
  plain: string,
  draft?: AgreementDraft | ParsedDraftShape | null,
): string {
  let body = (plain || "").trim();
  if (body.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return body;

  const dedupeStart = stripDuplicateConsecutiveExecutionEntityLines(body);
  if (dedupeStart.repairs.length > 0) {
    body = dedupeStart.text.trim();
  }

  const snap = getAuthoritativeSigningSnapshot();
  const meta = snap?.signerMetadata ?? null;
  const authorityParties =
    (meta ? recipientMetadataToAuthorityParties(meta) : null) ??
    readConsumedPaidProSignerMetadataAuthority()?.parties ??
    [];

  const blankSignerLines = countBlankSignerMetadataLinesInExecutionBlock(body);
  const headingLeak = detectExecutionHeadingMetadataLeak(body).leak;
  const noticePlaceholdersPresent = NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(body);
  if (blankSignerLines === 0 && !headingLeak && !noticePlaceholdersPresent && authorityParties.length >= 2) {
    return body;
  }

  if (headingLeak && authorityParties.length >= 2) {
    const dedupe = stripDuplicateConsecutiveExecutionEntityLines(body);
    if (dedupe.repairs.length > 0) {
      body = dedupe.text.trim();
    }
    const repaired = repairExecutionBlockEntityHeadingLines(body, authorityParties);
    if (repaired.repairs.length > 0) {
      body = repaired.text.trim();
    }
    if (
      countBlankSignerMetadataLinesInExecutionBlock(body) === 0 &&
      !detectExecutionHeadingMetadataLeak(body).leak &&
      !NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(body)
    ) {
      return body;
    }
  }

  if (meta && signerMetadataAuthorityHasHydratableFields(meta)) {
    const parties = recipientMetadataToAuthorityParties(meta);
    const roleContext = { acceptedCorpus: body };
    const hydration = hydratePaidProExecutionBlockWithSignerMetadata(body, meta, roleContext, {
      overwriteExistingMetadata: true,
    });
    if (hydration.applied) body = hydration.corpus.trim();
    // TEST560 — rebuild "If to" notice stanzas that still carry the pre-signer-setup placeholder
    // so the finalized display surface shows real signer emails/addresses, not
    // "provided during signer setup". Signer-field-only; operative clauses are untouched.
    if (parties.length >= 2 && NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(body)) {
      const delivery = ensureOperativeIfToNoticeDelivery(body, parties, roleContext);
      if (delivery.repairs.length > 0) {
        body = delivery.text.trim();
        // Rebuilding the notices section can fuse the preceding heading boundary
        // ("...termination.12. Disputes..."). Restore top-level heading breaks — same repair the
        // frozen-SoT minimal hydration applies. Display-only; does not mutate the signing snapshot.
        const joined = repairJoinedTopLevelSectionHeadings(body);
        if (joined.repairs.length > 0) body = joined.text.trim();
      }
    }
    const notice = applySignatureNoticeContactFieldsToCorpus(body, parties, roleContext);
    if (notice.applied) body = notice.text.trim();
    const retry = hydratePaidProExecutionBlockWithSignerMetadata(body, meta, roleContext, {
      overwriteExistingMetadata: true,
    });
    if (retry.applied) body = retry.corpus.trim();
  }

  const corpusHints = collectReviewReadyCorpusHints(body, (draft as AgreementDraft | null) ?? null);
  body = applyReviewReadyMetadataBackfill(body, (draft as AgreementDraft | null) ?? null, {
    corpusHints,
    surface: "owner_done",
    selectedSource: "authoritative_signing_snapshot",
  });

  if (body.length >= 80 && authorityParties.length >= 2 && detectExecutionHeadingMetadataLeak(body).leak) {
    body = repairExecutionBlockEntityHeadingLines(body, authorityParties).text.trim();
  }
  return body;
}

function finalizePostFinalizeReviewPlain(
  plain: string,
  draft?: AgreementDraft | ParsedDraftShape | null,
): string {
  const body = (plain || "").trim();
  if (body.length < PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return body;
  // TEST560 — always run display enrichment. The stored signing snapshot is the immutable frozen
  // canonical corpus (byte-identical to SoT), which can still carry pre-signer-setup notice
  // placeholders and blank execution Name/Title lines; enrichment hydrates those signer-only fields
  // for display. Enrichment is idempotent, so an already-hydrated snapshot passes through unchanged.
  return enrichPaidProPostFinalizeDisplayCorpus(body, draft);
}

export function resolvePaidProPostFinalizeReviewPlain(
  draft?: AgreementDraft | ParsedDraftShape | null,
): string {
  const snapshot = readAuthoritativeSigningCorpus().trim();
  if (snapshot.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return finalizePostFinalizeReviewPlain(snapshot, draft);
  }
  const pinned = readPaidProPinnedSignerAppliedCorpus().trim();
  if (pinned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return finalizePostFinalizeReviewPlain(pinned, draft);
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
  noticePlaceholdersRemaining: boolean;
} {
  const reviewPlain = (args.reviewPlain || "").trim();
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(reviewPlain);
  const noticePlaceholdersRemaining = NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(reviewPlain);
  const metadataComplete = args.signerMetadata
    ? signerMetadataAuthorityHasHydratableFields(args.signerMetadata)
    : false;
  const blocked =
    isPaidProPostFinalizeHydratedCorpusLocked() &&
    metadataComplete &&
    (blankSignerLinesRemaining > 0 || noticePlaceholdersRemaining);
  return {
    blocked,
    blankSignerLinesRemaining,
    metadataComplete,
    noticePlaceholdersRemaining,
  };
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
  if (!isPaidProSigningReadyHydratedCorpus(plain)) return false;
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
