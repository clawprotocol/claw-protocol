/**
 * Final visible Pro paper render boundary — diagnoses and enforces which corpus
 * may appear in paid Pro review HTML. Helpers/validators upstream are not enough;
 * this module runs at the last plain/html handoff before DOM paint.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getAuthoritativeAgreementDocument, getAuthoritativeAgreementText } from "./authoritativeAgreementDocument";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { assessConciseCommercialServicesProQuality } from "./paidProConciseServicesQuality";
import { resolvePaidProUnifiedSurfaceCorpus } from "./paidProAgreementAuthorityChain";
import {
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";

export const PAID_PRO_VISIBLE_PAPER_FINALIZING_MESSAGE = "Finalizing secure agreement version…";

export const ALLOWED_PAID_PRO_VISIBLE_PAPER_SOURCES = new Set([
  "paidProSourceOfTruth",
  "paid_pro_review_surface",
  "paid_pro_display_surface",
  "authoritativeAgreementDocument",
  "authoritative_hydrated",
  "server_full_document_text",
  "server_full_draft",
  "canonical_authoritative",
]);

export type ProVisiblePaperCandidateId =
  | "server_full_document_text"
  | "authoritativeAgreementDocument"
  | "paidProSourceOfTruth"
  | "accepted_review"
  | "reviewDraft"
  | "renderedAgreementPreview"
  | "free_starter"
  | "simpleProFinalReviewCorpus"
  | "premiumReadonlyRenderCorpus";

export type ProVisiblePaperCandidate = {
  id: ProVisiblePaperCandidateId;
  source: string;
  plain: string;
};

export type VisibleProPaperCollision =
  | "free_starter"
  | "accepted_review"
  | "renderedAgreementPreview"
  | "rendered_preview"
  | "sanitized_truncated_authoritative"
  | "empty_authoritative_replacement"
  | "forbidden_declared_source"
  | "hash_mismatch_authoritative"
  | "missing_authoritative"
  | "display_layer_clipped"
  | null;

export type VisibleProPaperBoundaryResolution = {
  plain: string;
  source: string;
  blocked: boolean;
  showFinalizing: boolean;
  collision: VisibleProPaperCollision;
  isAuthoritative: boolean;
  isFreeBodyMatch: boolean;
  hasRequiredProSections: boolean;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function bodyHash(text: string): string {
  return text ? fingerprintAgreementBody(text) : "";
}

export function stripHtmlToPlainForProPaperCompare(html: string): string {
  return trim(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );
}

export function isForbiddenPaidProVisiblePaperSource(source: string | null | undefined): boolean {
  const s = trim(source);
  if (!s) return true;
  if (isForbiddenPaidProDisplayRenderSource(s)) return true;
  return (
    s === "accepted_review" ||
    s === "reviewDraft" ||
    s === "review_draft" ||
    s === "renderedAgreementPreview" ||
    s === "rendered_preview" ||
    s === "free_starter_paid_pro_baseline" ||
    s === "picker_authoritative" ||
    s === "agreement_document" ||
    s === "last_known_good" ||
    s === "live_generated_preview" ||
    s === "simple_pro_final_review" ||
    s === "premium_readonly_display"
  );
}

export function isAllowedPaidProVisiblePaperSource(source: string | null | undefined): boolean {
  return ALLOWED_PAID_PRO_VISIBLE_PAPER_SOURCES.has(trim(source));
}

export function visibleProPaperHasRequiredSections(
  plain: string,
  intakeText: string,
  draft?: ParsedDraftShape | null,
): boolean {
  const text = trim(plain);
  if (text.length < 400) return false;
  const assessment = assessConciseCommercialServicesProQuality({
    text,
    rawIntake: intakeText,
    draft: draft ?? null,
  });
  if (assessment.applies) {
    return assessment.ok && !assessment.malformedOpening;
  }
  return (
    text.length >= 1_500 &&
    /\b(?:ownership|work\s+product|confidential|terminat|electronic\s+signatures?|e-?sign)\b/i.test(text)
  );
}

function candidateEntry(
  id: ProVisiblePaperCandidateId,
  source: string,
  plain: string,
): ProVisiblePaperCandidate {
  return { id, source, plain: trim(plain) };
}

export function buildDefaultProVisiblePaperCandidates(args: {
  serverFullDocumentText?: string | null;
  authoritativeAgreementDocumentText?: string | null;
  paidProSourceOfTruthText?: string | null;
  acceptedReviewText?: string | null;
  reviewDraftText?: string | null;
  renderedAgreementPreviewText?: string | null;
  freeStarterText?: string | null;
  simpleProFinalReviewCorpusText?: string | null;
  premiumReadonlyRenderCorpusText?: string | null;
  premiumReadonlyRenderCorpusSource?: string | null;
}): ProVisiblePaperCandidate[] {
  return [
    candidateEntry("server_full_document_text", "server_full_document_text", args.serverFullDocumentText ?? ""),
    candidateEntry(
      "authoritativeAgreementDocument",
      "authoritativeAgreementDocument",
      args.authoritativeAgreementDocumentText ?? getAuthoritativeAgreementText(),
    ),
    candidateEntry(
      "paidProSourceOfTruth",
      "paidProSourceOfTruth",
      args.paidProSourceOfTruthText ?? getPaidProSourceOfTruth()?.text ?? "",
    ),
    candidateEntry("accepted_review", "accepted_review", args.acceptedReviewText ?? ""),
    candidateEntry("reviewDraft", "reviewDraft", args.reviewDraftText ?? ""),
    candidateEntry(
      "renderedAgreementPreview",
      "renderedAgreementPreview",
      args.renderedAgreementPreviewText ?? "",
    ),
    candidateEntry("free_starter", "free_starter", args.freeStarterText ?? ""),
    candidateEntry(
      "simpleProFinalReviewCorpus",
      "simpleProFinalReviewCorpus",
      args.simpleProFinalReviewCorpusText ?? "",
    ),
    candidateEntry(
      "premiumReadonlyRenderCorpus",
      args.premiumReadonlyRenderCorpusSource ?? "premiumReadonlyRenderCorpus",
      args.premiumReadonlyRenderCorpusText ?? "",
    ),
  ];
}

function detectVisibleProPaperCollision(args: {
  visiblePlain: string;
  visibleHash: string;
  declaredSource: string;
  candidates: readonly ProVisiblePaperCandidate[];
  authoritativePlain: string;
}): VisibleProPaperCollision {
  const { visiblePlain, visibleHash, declaredSource, candidates, authoritativePlain } = args;
  if (!visiblePlain) return "empty_authoritative_replacement";

  const free = candidates.find((c) => c.id === "free_starter");
  if (free?.plain && bodyHash(free.plain) === visibleHash) return "free_starter";

  const accepted = candidates.find((c) => c.id === "accepted_review");
  if (accepted?.plain && bodyHash(accepted.plain) === visibleHash) return "accepted_review";

  const rendered = candidates.find((c) => c.id === "renderedAgreementPreview");
  if (rendered?.plain && bodyHash(rendered.plain) === visibleHash) return "renderedAgreementPreview";

  const simple = candidates.find((c) => c.id === "simpleProFinalReviewCorpus");
  if (simple?.plain && bodyHash(simple.plain) === visibleHash && !isAllowedPaidProVisiblePaperSource(declaredSource)) {
    return "rendered_preview";
  }

  if (isForbiddenPaidProVisiblePaperSource(declaredSource)) return "forbidden_declared_source";

  if (authoritativePlain) {
    const authHash = bodyHash(authoritativePlain);
    if (authHash && authHash !== visibleHash) {
      if (authoritativePlain.startsWith(visiblePlain) && visiblePlain.length < authoritativePlain.length * 0.9) {
        return "sanitized_truncated_authoritative";
      }
      if (visiblePlain.length < authoritativePlain.length * 0.55) {
        return "display_layer_clipped";
      }
      return "hash_mismatch_authoritative";
    }
  }

  return null;
}

/** Plain corpus fed to buildPremiumAgreementReadonlyHtml — normalized before hash compare. */
export function normalizeVisibleProPaperComparePlain(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function pickAuthoritativePlainForVisibleProPaper(
  candidates: readonly ProVisiblePaperCandidate[],
): {
  plain: string;
  source: string;
} | null {
  const fromCandidates = [
    candidates.find((c) => c.id === "paidProSourceOfTruth"),
    candidates.find((c) => c.id === "authoritativeAgreementDocument"),
    candidates.find((c) => c.id === "server_full_document_text"),
  ];
  const minAuthoritativeLen = 400;
  for (const c of fromCandidates) {
    if (c?.plain && c.plain.length >= minAuthoritativeLen) {
      return { plain: c.plain, source: c.source };
    }
  }
  const auth = getAuthoritativeAgreementDocument()?.fullCorpusText;
  if (auth && auth.length >= minAuthoritativeLen) {
    return { plain: auth, source: "authoritativeAgreementDocument" };
  }
  const unified = resolvePaidProUnifiedSurfaceCorpus();
  if (unified?.text && unified.text.length >= minAuthoritativeLen) {
    return { plain: unified.text, source: unified.source };
  }
  const source = getPaidProSourceOfTruth();
  if (source?.text && source.text.length >= minAuthoritativeLen) {
    return { plain: source.text, source: "paidProSourceOfTruth" };
  }
  try {
    const paid = getPaidProDocumentForSurface("review") ?? getPaidProDocumentForSurface("display");
    if (paid?.text) {
      return { plain: paid.text, source: "paidProSourceOfTruth" };
    }
  } catch {
    // Tests may establish paid Pro without frozen canonical snapshot for every surface.
  }
  return null;
}

export function resolveVisibleProPaperBoundary(args: {
  visiblePlain: string;
  declaredSource: string;
  candidates: readonly ProVisiblePaperCandidate[];
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  paidProReviewSurface?: boolean;
}): VisibleProPaperBoundaryResolution {
  const paidSurface = Boolean(args.paidProReviewSurface);
  const visiblePlain = trim(args.visiblePlain);
  const visibleHash = bodyHash(visiblePlain);
  const intakeText = trim(args.intakeText);
  const authoritative = pickAuthoritativePlainForVisibleProPaper(args.candidates);
  const authoritativePlain = authoritative?.plain ?? "";
  const collision = detectVisibleProPaperCollision({
    visiblePlain,
    visibleHash,
    declaredSource: args.declaredSource,
    candidates: args.candidates,
    authoritativePlain,
  });
  const free = args.candidates.find((c) => c.id === "free_starter");
  const isFreeBodyMatch = Boolean(free?.plain && bodyHash(free.plain) === visibleHash);
  const hasRequiredProSections = visibleProPaperHasRequiredSections(
    authoritativePlain || visiblePlain,
    intakeText,
    args.draft ?? null,
  );
  const isAuthoritative = Boolean(
    authoritativePlain &&
      visiblePlain &&
      bodyHash(authoritativePlain) === visibleHash &&
      isAllowedPaidProVisiblePaperSource(args.declaredSource),
  );

  if (!paidSurface) {
    return {
      plain: visiblePlain,
      source: args.declaredSource,
      blocked: false,
      showFinalizing: false,
      collision,
      isAuthoritative,
      isFreeBodyMatch,
      hasRequiredProSections,
    };
  }

  const paidEstablished = hasPaidProSourceOfTruth() || Boolean(getAuthoritativeAgreementDocument()?.fullCorpusText);

  // Paid SoT wins: once a real authoritative paid corpus is established, it is the only legal body on
  // the paid surface. Competing candidates produced during signer hydration (handoff / starter / guided
  // / rendered preview) — or a section-quality heuristic that flips on a mutated draft — must never
  // blank, block, or replace it. This is the hard "candidate collision does not blank the paid
  // document if the authoritative paid SoT is present" invariant.
  if (paidEstablished && authoritativePlain) {
    const authSource = authoritative?.source ?? "paidProSourceOfTruth";
    const authIsRealPaidCorpus =
      isAllowedPaidProVisiblePaperSource(authSource) &&
      authoritativePlain.length >= 500 &&
      bodyHash(authoritativePlain) !== bodyHash(free?.plain ?? "");
    if (authIsRealPaidCorpus) {
      return {
        plain: authoritativePlain,
        source: authSource,
        blocked: false,
        showFinalizing: false,
        collision,
        isAuthoritative: true,
        isFreeBodyMatch: false,
        hasRequiredProSections: true,
      };
    }
  }

  if (
    isForbiddenPaidProVisiblePaperSource(args.declaredSource) ||
    isFreeBodyMatch ||
    collision === "accepted_review" ||
    collision === "renderedAgreementPreview" ||
    collision === "rendered_preview" ||
    collision === "forbidden_declared_source"
  ) {
    if (authoritativePlain && paidEstablished && hasRequiredProSections) {
      return {
        plain: authoritativePlain,
        source: authoritative?.source ?? "authoritativeAgreementDocument",
        blocked: false,
        showFinalizing: false,
        collision,
        isAuthoritative: true,
        isFreeBodyMatch: false,
        hasRequiredProSections: true,
      };
    }
    return {
      plain: "",
      source: authoritative?.source ?? args.declaredSource,
      blocked: true,
      showFinalizing: true,
      collision: collision ?? "forbidden_declared_source",
      isAuthoritative: false,
      isFreeBodyMatch,
      hasRequiredProSections,
    };
  }

  if (!authoritativePlain || !paidEstablished) {
    return {
      plain: "",
      source: "missing_authoritative",
      blocked: true,
      showFinalizing: true,
      collision: "missing_authoritative",
      isAuthoritative: false,
      isFreeBodyMatch,
      hasRequiredProSections: false,
    };
  }

  const mustBlock =
    isFreeBodyMatch ||
    collision === "empty_authoritative_replacement" ||
    collision === "display_layer_clipped" ||
    collision === "hash_mismatch_authoritative" ||
    (visiblePlain && bodyHash(authoritativePlain) !== visibleHash);

  if (mustBlock) {
    const authOk =
      authoritativePlain.length >= 500 &&
      isAllowedPaidProVisiblePaperSource(authoritative?.source ?? "") &&
      !isFreeBodyMatch &&
      bodyHash(authoritativePlain) !== bodyHash(free?.plain ?? "");
    if (authOk && hasRequiredProSections) {
      return {
        plain: authoritativePlain,
        source: authoritative?.source ?? "authoritativeAgreementDocument",
        blocked: false,
        showFinalizing: false,
        collision,
        isAuthoritative: true,
        isFreeBodyMatch: false,
        hasRequiredProSections: true,
      };
    }
    return {
      plain: "",
      source: authoritative?.source ?? "blocked",
      blocked: true,
      showFinalizing: true,
      collision,
      isAuthoritative: false,
      isFreeBodyMatch,
      hasRequiredProSections,
    };
  }

  return {
    plain: visiblePlain,
    source: args.declaredSource,
    blocked: false,
    showFinalizing: false,
    collision,
    isAuthoritative: true,
    isFreeBodyMatch,
    hasRequiredProSections,
  };
}

let visibleProPaperDiagnosticsForceEnabledForTests = false;

export function setVisibleProPaperDiagnosticsForceEnabledForTests(enabled: boolean): void {
  visibleProPaperDiagnosticsForceEnabledForTests = enabled;
}

function isDiagnosticsEnabled(): boolean {
  if (visibleProPaperDiagnosticsForceEnabledForTests) return true;
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV) && import.meta.env?.MODE !== "test";
}

export type VisibleProPaperDiagnosticsTrace = {
  declaredSource: string;
  candidates: readonly ProVisiblePaperCandidate[];
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  paidProReviewSurface?: boolean;
  isAuthoritative?: boolean;
  isFreeBodyMatch?: boolean;
  /** Plain text passed into buildPremiumAgreementReadonlyHtml (collision compare input). */
  renderPlain: string;
};

export type VisibleProPaperCollisionForensics = {
  authoritativeHash: string;
  renderedPlainHash: string;
  authoritativeLen: number;
  renderedPlainLen: number;
  firstDiffOffset: number;
  contextBefore: string;
  contextAfter: string;
  normalizedComparison: string | null;
  declaredSource: string;
  responsibleLayer: string;
  /** True when legacy HTML strip would have disagreed with render-plain compare (whitespace collapse). */
  htmlRoundTripWouldMismatch: boolean;
};

const VISIBLE_PRO_PAPER_COLLISION_COMPARE_LAYER =
  "emitVisibleProPaperBoundaryDiagnostics:renderPlain_vs_pickAuthoritativePlainForVisibleProPaper";

export function buildVisibleProPaperCollisionForensics(args: {
  renderedPlain: string;
  declaredSource: string;
  candidates: readonly ProVisiblePaperCandidate[];
  htmlRoundTripPlain?: string | null;
}): VisibleProPaperCollisionForensics | null {
  const authoritative = pickAuthoritativePlainForVisibleProPaper(args.candidates);
  const authPlain = normalizeVisibleProPaperComparePlain(authoritative?.plain ?? "");
  const renderedPlain = normalizeVisibleProPaperComparePlain(args.renderedPlain);
  if (!authPlain || !renderedPlain) return null;

  const authoritativeHash = bodyHash(authPlain);
  const renderedPlainHash = bodyHash(renderedPlain);
  if (authoritativeHash === renderedPlainHash) return null;

  const left = authPlain;
  const right = renderedPlain;
  let firstDiffOffset = 0;
  while (firstDiffOffset < left.length && firstDiffOffset < right.length && left[firstDiffOffset] === right[firstDiffOffset]) {
    firstDiffOffset += 1;
  }

  const contextRadius = 100;
  const normalizedComparison = (() => {
    if (left === right) return null;
    return [
      `first_diff_at=${firstDiffOffset}`,
      `left_len=${left.length}`,
      `right_len=${right.length}`,
      `left_snip=${JSON.stringify(left.slice(Math.max(0, firstDiffOffset - contextRadius), firstDiffOffset + contextRadius))}`,
      `right_snip=${JSON.stringify(right.slice(Math.max(0, firstDiffOffset - contextRadius), firstDiffOffset + contextRadius))}`,
    ].join("\n");
  })();

  const htmlStrip = args.htmlRoundTripPlain
    ? normalizeVisibleProPaperComparePlain(args.htmlRoundTripPlain)
    : "";
  const htmlRoundTripWouldMismatch = Boolean(
    htmlStrip && bodyHash(authPlain) !== bodyHash(htmlStrip) && bodyHash(renderedPlain) === bodyHash(authPlain),
  );

  return {
    authoritativeHash,
    renderedPlainHash,
    authoritativeLen: left.length,
    renderedPlainLen: right.length,
    firstDiffOffset,
    contextBefore: left.slice(Math.max(0, firstDiffOffset - contextRadius), firstDiffOffset),
    contextAfter: left.slice(firstDiffOffset, firstDiffOffset + contextRadius),
    normalizedComparison,
    declaredSource: args.declaredSource,
    responsibleLayer: VISIBLE_PRO_PAPER_COLLISION_COMPARE_LAYER,
    htmlRoundTripWouldMismatch,
  };
}

export function logVisibleProPaperBody(payload: {
  source: string;
  plain: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  isAuthoritative?: boolean;
  isFreeBodyMatch?: boolean;
}): void {
  if (!isDiagnosticsEnabled()) return;
  const plain = trim(payload.plain);
  // eslint-disable-next-line no-console
  console.info("[visible-pro-paper-body]", {
    source: payload.source,
    len: plain.length,
    hash: bodyHash(plain),
    first500: plain.slice(0, 500),
    hasRequiredProSections: visibleProPaperHasRequiredSections(plain, trim(payload.intakeText), payload.draft ?? null),
    isAuthoritative: Boolean(payload.isAuthoritative),
    isFreeBodyMatch: Boolean(payload.isFreeBodyMatch),
  });
}

export function logProSourceCandidateDiff(payload: {
  visiblePlain: string;
  candidates: readonly ProVisiblePaperCandidate[];
}): void {
  if (!isDiagnosticsEnabled()) return;
  const visibleHash = bodyHash(trim(payload.visiblePlain));
  // eslint-disable-next-line no-console
  console.info("[pro-source-candidate-diff]", {
    visibleHash,
    candidates: payload.candidates.map((c) => ({
      id: c.id,
      source: c.source,
      len: c.plain.length,
      hash: bodyHash(c.plain),
      matchesVisible: Boolean(c.plain && bodyHash(c.plain) === visibleHash),
    })),
  });
}

export function emitVisibleProPaperBoundaryDiagnostics(args: {
  html: string;
  /** Plain corpus passed to buildPremiumAgreementReadonlyHtml — used for authoritative collision compare. */
  renderPlain: string;
  declaredSource: string;
  candidates: readonly ProVisiblePaperCandidate[];
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  paidProReviewSurface?: boolean;
  isAuthoritative?: boolean;
  isFreeBodyMatch?: boolean;
}): void {
  const comparePlain = normalizeVisibleProPaperComparePlain(args.renderPlain);
  const htmlRoundTripPlain = stripHtmlToPlainForProPaperCompare(args.html);
  logVisibleProPaperBody({
    source: args.declaredSource,
    plain: comparePlain,
    intakeText: args.intakeText,
    draft: args.draft,
    isAuthoritative: args.isAuthoritative,
    isFreeBodyMatch: args.isFreeBodyMatch,
  });
  logProSourceCandidateDiff({ visiblePlain: comparePlain, candidates: args.candidates });
  if (!isDiagnosticsEnabled()) return;
  const resolution = resolveVisibleProPaperBoundary({
    visiblePlain: comparePlain,
    declaredSource: args.declaredSource,
    candidates: args.candidates,
    intakeText: args.intakeText,
    draft: args.draft,
    paidProReviewSurface: args.paidProReviewSurface,
  });
  if (!resolution.collision) return;

  const forensics = buildVisibleProPaperCollisionForensics({
    renderedPlain: comparePlain,
    declaredSource: args.declaredSource,
    candidates: args.candidates,
    htmlRoundTripPlain,
  });

  // eslint-disable-next-line no-console
  console.warn("[visible-pro-paper-collision]", {
    collision: resolution.collision,
    declaredSource: args.declaredSource,
    blocked: resolution.blocked,
    showFinalizing: resolution.showFinalizing,
    compareInput: "render_plain",
    ...(forensics ?? {}),
  });
}
