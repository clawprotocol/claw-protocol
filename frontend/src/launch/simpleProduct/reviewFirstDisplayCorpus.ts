import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  authoritativeDocumentForSurface,
  logIllegalPostAcceptanceMutationAttempt,
} from "../../components/agreements/authoritativeAgreementDocument";
import { shouldSuppressPaidProCorpusRenderForRejectedPipeline } from "../../components/agreements/paidProApiFailureAuthorityGuard";
import { PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN } from "../../components/agreements/paidProFinalHydratedCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "../../components/agreements/paidProSignerMetadataCommitPolicy";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "../../components/agreements/paidProExecutionBlockEntityHeading";
import { resolvePaidProPostFinalizeReviewPlain } from "../../components/agreements/paidProPostFinalizeReviewSurface";
import { readConsumedPaidProSignerMetadataAuthority } from "../../components/agreements/paidProSignerMetadataAuthority";
import { getPaidProDocumentForSurface, hashPaidProCorpus } from "../../components/agreements/paidProSourceOfTruth";
import { applyPaidProUserVisibleDisplayPrep } from "../../components/agreements/paidProDisplayPlainAuthority";
import { isAuthoritativePremiumPipelineRenderSource } from "../../components/agreements/premiumRenderSourceResolver";
import { peekReviewFirstPinnedCorpus } from "./reviewFirstSendSurface";
import {
  logReviewCorpusAuthority,
  resolveAcceptedReviewCorpusFromDraft,
} from "../../agreement/reviewCorpusAuthority";
import {
  applyReviewReadyMetadataBackfill,
  collectReviewReadyCorpusHints,
  corpusHasHydratedSignerMetadata,
  isReviewTrackHydrationSurface,
  logTest315ReviewCopyHydration,
  resolveReviewReadyRecipientMetadata,
  type ReviewReadyHydratedDisplayCorpusSurface,
} from "./reviewReadyHydratedDisplayCorpus";

export type ReviewFirstDisplayCorpusSource =
  | "review_first_final_corpus"
  | "review_first_pinned_corpus"
  | "authoritative_signing_snapshot"
  | "server_full_document_text"
  | "premium_server_full_document_text"
  | "premium_full_document_text"
  | "document_text"
  | "rendered_document_text"
  | "authoritative_agreement_document"
  | "none";

export type ReviewFirstDisplayCorpus = {
  text: string;
  source: ReviewFirstDisplayCorpusSource;
  hash: string;
};

function corpusHash(text: string): string {
  const body = text.trim();
  let h = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${body.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function stringField(draft: AgreementDraft, key: keyof AgreementDraft): string {
  const v = draft[key];
  return typeof v === "string" ? v.trim() : "";
}

function reviewRouteHashInvariant(args: {
  text: string;
  hash: string;
  authoritativeHash: string;
  userEdited?: boolean;
}): void {
  if (args.userEdited) return;
  if (args.hash === args.authoritativeHash) return;
  logIllegalPostAcceptanceMutationAttempt({
    surface: "review_route",
    mutation: "review_route_hash_mismatch",
    attemptedHash: args.hash,
    authoritativeHash: args.authoritativeHash,
    attemptedLen: args.text.length,
  });
  const isTest = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;
  const isBrowser = typeof window !== "undefined";
  if ((isTest || isDev) && !isBrowser) {
    throw new Error("[review-route-authoritative-hash-mismatch]");
  }
}

/** Display-only Pro section formatting — matches owner review render prep without mutating SoT. */
export function applyReviewTrackDisplayFormatting(text: string): string {
  return applyPaidProUserVisibleDisplayPrep(text);
}

function finalizeReviewFirstCorpusText(
  text: string,
  draft?: AgreementDraft | null,
  surface: ReviewReadyHydratedDisplayCorpusSurface = "owner_done",
  selectedSource?: string,
): string {
  const body = (text || "").trim();
  if (body.length < 80) return body;
  const corpusHints = collectReviewReadyCorpusHints(body, draft ?? null);
  const reviewTrack = isReviewTrackHydrationSurface(surface);

  let hydrated: string;
  if (reviewTrack) {
    hydrated = applyReviewReadyMetadataBackfill(body, draft ?? null, {
      corpusHints,
      surface,
      selectedSource,
    });
  } else {
    const meta = resolveReviewReadyRecipientMetadata(draft ?? null, { corpusHints });
    if (corpusHasHydratedSignerMetadata(body, meta, { reviewTrackSurface: false })) {
      hydrated = body;
    } else {
      hydrated = applyReviewReadyMetadataBackfill(body, draft ?? null, {
        corpusHints,
        surface,
        selectedSource,
      });
    }
  }

  if (detectExecutionHeadingMetadataLeak(hydrated).leak) {
    const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
    hydrated = repairExecutionBlockEntityHeadingLines(hydrated, parties).text.trim();
  }

  return applyReviewTrackDisplayFormatting(hydrated);
}

function wrapReviewFirstCorpus(
  corpus: ReviewFirstDisplayCorpus,
  draft: AgreementDraft,
  surface: ReviewReadyHydratedDisplayCorpusSurface = "owner_done",
): ReviewFirstDisplayCorpus {
  const text = finalizeReviewFirstCorpusText(corpus.text, draft, surface, corpus.source);
  const wrapped = {
    text,
    source: corpus.source,
    hash: hashPaidProCorpus(text),
  };
  logTest315ReviewCopyHydration({
    surface,
    source: wrapped.source,
    plain: wrapped.text,
    draft,
  });
  return wrapped;
}

function commitReviewFirstCorpus(
  corpus: ReviewFirstDisplayCorpus,
  draft: AgreementDraft,
  surface: ReviewReadyHydratedDisplayCorpusSurface = "owner_done",
): ReviewFirstDisplayCorpus {
  const wrapped = wrapReviewFirstCorpus(corpus, draft, surface);
  logReviewCorpusAuthority({
    agreementId: String(draft.id ?? "").trim(),
    source: wrapped.source,
    corpusHash: wrapped.hash,
    surface: surface === "reviewer" ? "reviewer_view" : "owner_done",
  });
  return wrapped;
}

export function resolveReviewFirstDisplayCorpus(
  draft: AgreementDraft | null,
  surface: ReviewReadyHydratedDisplayCorpusSurface = "owner_done",
): ReviewFirstDisplayCorpus | null {
  if (!draft) return null;

  const agreementId = String(draft.id ?? "").trim();

  const acceptedCorpus = resolveAcceptedReviewCorpusFromDraft(draft);
  if (acceptedCorpus) {
    return commitReviewFirstCorpus(
      {
        text: acceptedCorpus.text,
        source: acceptedCorpus.source,
        hash: acceptedCorpus.hash,
      },
      draft,
      surface,
    );
  }

  const sessionPinned = agreementId ? peekReviewFirstPinnedCorpus(agreementId) : null;
  if (sessionPinned && sessionPinned.trim().length >= 500) {
    return commitReviewFirstCorpus(
      {
        text: sessionPinned.trim(),
        source: "review_first_pinned_corpus",
        hash: corpusHash(sessionPinned.trim()),
      },
      draft,
      surface,
    );
  }

  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const snapshotPlain = resolvePaidProPostFinalizeReviewPlain(draft).trim();
    if (snapshotPlain.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
      return commitReviewFirstCorpus(
        {
          text: snapshotPlain,
          source: "authoritative_signing_snapshot",
          hash: hashPaidProCorpus(snapshotPlain),
        },
        draft,
        surface,
      );
    }
  }

  if (shouldSuppressPaidProCorpusRenderForRejectedPipeline({ draft })) {
    return null;
  }

  const preferPremiumPipelineFields = isAuthoritativePremiumPipelineRenderSource(
    String(draft.premium_render_source ?? "").trim(),
  );
  const primaryFullTextFields = preferPremiumPipelineFields
    ? ([
        "premium_server_full_document_text",
        "premium_full_document_text",
        "server_full_document_text",
      ] as const)
    : ([
        "server_full_document_text",
        "premium_server_full_document_text",
        "premium_full_document_text",
      ] as const);

  for (const source of primaryFullTextFields) {
    const text = stringField(draft, source);
    if (text.length >= 500) {
      return commitReviewFirstCorpus({ text, source, hash: corpusHash(text) }, draft, surface);
    }
  }

  if (!isPaidProPostFinalizeHydratedCorpusLocked()) {
    const paidPro = getPaidProDocumentForSurface("review");
    if (paidPro && paidPro.text.trim().length >= 500) {
      return commitReviewFirstCorpus(
        {
          text: paidPro.text,
          source: "authoritative_agreement_document",
          hash: paidPro.hash,
        },
        draft,
        surface,
      );
    }
    const authoritative = authoritativeDocumentForSurface("review_route");
    if (authoritative?.fullCorpusText) {
      reviewRouteHashInvariant({
        text: authoritative.fullCorpusText,
        hash: authoritative.authoritativeHash,
        authoritativeHash: authoritative.authoritativeHash,
        userEdited: authoritative.explicitUserEditState.edited,
      });
      return commitReviewFirstCorpus(
        {
          text: authoritative.fullCorpusText,
          source: "authoritative_agreement_document",
          hash: authoritative.authoritativeHash,
        },
        draft,
        surface,
      );
    }
  }

  const pr = draft.pro_redline_v1;
  const rf =
    pr && typeof pr === "object" && !Array.isArray(pr)
      ? (pr as Record<string, unknown>).review_first_final_corpus
      : null;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    const raw = String((rf as Record<string, unknown>).text ?? "").trim();
    if (raw) {
      return commitReviewFirstCorpus(
        { text: raw, source: "review_first_final_corpus", hash: corpusHash(raw) },
        draft,
        surface,
      );
    }
  }

  if (draft.premium_render_source !== "review_first_final_corpus") return null;

  for (const source of [
    "server_full_document_text",
    "premium_server_full_document_text",
    "premium_full_document_text",
    "document_text",
    "rendered_document_text",
  ] as const) {
    const text = stringField(draft, source).trim();
    if (text) {
      return commitReviewFirstCorpus({ text, source, hash: corpusHash(text) }, draft, surface);
    }
  }
  return null;
}

export function logReviewFirstDisplayCorpusSelected(args: {
  agreementId: string;
  corpus: ReviewFirstDisplayCorpus | null;
  surface: "owner_done" | "reviewer";
  fallbackPreview?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = args.agreementId.trim();
  const payload = {
    source: args.corpus?.source ?? "none",
    len: args.corpus?.text.length ?? 0,
    hash: args.corpus?.hash ?? null,
    agreementIdShort: id.length <= 12 ? id : id.slice(0, 8),
  };
  if (args.surface === "reviewer") {
    // eslint-disable-next-line no-console
    console.info("[review-first-reviewer-corpus-selected]", {
      ...payload,
      reviewerHydrationHash: payload.hash,
    });
  } else {
    // eslint-disable-next-line no-console
    console.info("[review-first-display-corpus-selected]", payload);
  }
  if (args.fallbackPreview) {
    // eslint-disable-next-line no-console
    console.warn("[review-first-display-corpus-selected-fallback-preview]", payload);
  }
}
