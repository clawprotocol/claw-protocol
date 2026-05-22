/**
 * Resolve authoritative signing corpus and avoid shortened rendered preview regressions.
 */

import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedReviewSigningContinuity";

export type ResolveGuidedSigningAuthoritativeArgs = {
  snapshot?: string;
  accepted?: string;
  finalReviewCorpus?: string;
  guidedAuthoritative?: string;
  renderedPreview?: string;
  minLen?: number;
};

/** Prefer longest frozen/authoritative plain text; never pick a short rendered preview over a full corpus. */
export function resolveGuidedSigningAuthoritativePlain(
  args: ResolveGuidedSigningAuthoritativeArgs,
): string {
  const minLen = args.minLen ?? 500;
  const authoritativeCandidates = [
    args.snapshot,
    args.accepted,
    args.finalReviewCorpus,
    args.guidedAuthoritative,
  ]
    .map((t) => (t || "").trim())
    .filter((t) => t.length >= minLen);
  const longest = authoritativeCandidates.sort((a, b) => b.length - a.length)[0] ?? "";
  const rendered = (args.renderedPreview || "").trim();
  if (
    longest.length >= GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN &&
    rendered.length > 0 &&
    rendered.length < longest.length * 0.8
  ) {
    return longest;
  }
  return longest || rendered;
}
