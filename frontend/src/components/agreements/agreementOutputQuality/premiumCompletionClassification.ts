/**
 * Premium completion outcomes — advisory clarifications separate from authoritative body.
 */

import type { PremiumCompletionOutcome, RecommendedClarifications } from "./types";

/** Align with premiumAcceptancePolicy — long HTTP-success bodies are commercially authoritative. */
const LONG_AUTHORITATIVE_MIN_LEN = 15_000;

const NEEDS_DETAILS_IN_BODY_RE =
  /\b(?:needs\s+details|to\s+be\s+completed\s+in\s+review|complete\s+in\s+review|unspecified\s+commercial\s+details|fill\s+in\s+with\s+counsel)\b/i;

const CLARIFICATION_STRIP_RE =
  /\n(?:recommended\s+clarifications?|needs\s+details|complete\s+the\s+following)[\s\S]*$/i;

export function stripAdvisoryLanguageFromAgreementBody(text: string): string {
  let t = (text || "").trim();
  t = t.replace(CLARIFICATION_STRIP_RE, "").trim();
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}

export function bodyContainsNeedsDetailsLanguage(text: string): boolean {
  return NEEDS_DETAILS_IN_BODY_RE.test(text || "");
}

export function buildRecommendedClarifications(
  missingMaterial: readonly string[],
  opts?: { advisoryOnly?: boolean },
): RecommendedClarifications {
  const items = (missingMaterial || [])
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 2 && s.length < 500)
    .slice(0, 12);
  return {
    items,
    advisoryOnly: opts?.advisoryOnly ?? items.length > 0,
  };
}

export function classifyPremiumCompletionOutcome(args: {
  documentText: string;
  missingMaterial?: readonly string[];
  validationFailed?: boolean;
  serverOutcome?: string | null;
}): PremiumCompletionOutcome {
  const len = (args.documentText || "").trim().length;
  const missing = args.missingMaterial ?? [];
  const server = (args.serverOutcome || "").trim().toLowerCase();

  // Wire "degraded" (e.g. json_parse) must not veto a substantive normalized body.
  // Short degraded stubs stay degraded; ≥4k operative prose continues to length gates.
  if (server === "degraded" && len < 4_000) return "degraded";
  if (args.validationFailed && len < 900) return "clarification_required_before_authoritative_commit";

  const body = stripAdvisoryLanguageFromAgreementBody(args.documentText);
  if (len < 400) return "clarification_required_before_authoritative_commit";
  if (bodyContainsNeedsDetailsLanguage(body) && len < 900) {
    return "clarification_required_before_authoritative_commit";
  }

  const clarifications = buildRecommendedClarifications(missing, { advisoryOnly: true });
  const hasAdvisory = clarifications.items.length > 0 || server === "needs_details";

  if (
    server === "needs_details" &&
    len >= LONG_AUTHORITATIVE_MIN_LEN &&
    !bodyContainsNeedsDetailsLanguage(body) &&
    !args.validationFailed
  ) {
    return "authoritative_draft_complete_with_recommended_clarifications";
  }

  if (hasAdvisory && len >= 900 && !bodyContainsNeedsDetailsLanguage(body)) {
    return "authoritative_draft_complete_with_recommended_clarifications";
  }
  if (len >= 900 && !bodyContainsNeedsDetailsLanguage(body)) {
    return "authoritative_draft_complete";
  }
  if (server === "needs_details" && len >= 900) {
    return "authoritative_draft_complete_with_recommended_clarifications";
  }
  if (server === "ok" || server === "authoritative_draft_complete") {
    return missing.length > 0
      ? "authoritative_draft_complete_with_recommended_clarifications"
      : "authoritative_draft_complete";
  }
  return "clarification_required_before_authoritative_commit";
}

export function isAuthoritativePremiumCompletionOutcome(outcome: PremiumCompletionOutcome): boolean {
  return (
    outcome === "authoritative_draft_complete" ||
    outcome === "authoritative_draft_complete_with_recommended_clarifications" ||
    outcome === "ok"
  );
}

/** Map new outcome to legacy API field for backward compatibility. */
export function legacyGenerationOutcomeFromClassification(
  outcome: PremiumCompletionOutcome,
): "ok" | "needs_details" | "degraded" {
  if (outcome === "degraded") return "degraded";
  if (
    outcome === "needs_details" ||
    outcome === "clarification_required_before_authoritative_commit"
  ) {
    return "needs_details";
  }
  return "ok";
}
