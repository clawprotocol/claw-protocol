/**
 * Final review / signer handoff / VS01 — prefer accepted premium authoritative body over short fallbacks.
 */

import {
  AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO,
  AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN,
  coalesceAuthoritativePremiumBody,
  wouldMateriallyShrinkAuthoritativeBody,
} from "./premiumAuthoritativeBodyPreservation";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { getPaidProDocumentForSurface } from "./paidProSourceOfTruth";

export type AuthoritativeHandoffCandidate = {
  text: string;
  source: string;
};

const BLOCKED_SHORT_SOURCES = new Set([
  "free_starter",
  "starter_fallback",
  "rendered_preview",
  "rendered_preview_fallback",
  "live_generated_preview",
  "legacy_snapshot",
  "none",
  "blocked_short_preview",
]);

export type PickAuthoritativeHandoffCorpusResult = {
  text: string;
  source: string;
  downgradePrevented: boolean;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function pickAuthoritativeSigningHandoffCorpus(args: {
  candidates: readonly AuthoritativeHandoffCandidate[];
  acceptedAuthoritativeBody?: string | null;
  premiumAccepted?: boolean;
  pipelineSource?: string | null;
  allowValidatedRepairSuccess?: boolean;
}): PickAuthoritativeHandoffCorpusResult {
  const paidPro = getPaidProDocumentForSurface("signer_setup");
  if (paidPro) {
    return {
      text: paidPro.text,
      source: "paidProSourceOfTruth",
      downgradePrevented: false,
    };
  }
  const accepted = trim(args.acceptedAuthoritativeBody);
  const hasAcceptedAnchor =
    Boolean(args.premiumAccepted) &&
    isAuthoritativePremiumPipelineRenderSource(args.pipelineSource) &&
    accepted.length >= AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN;

  const filtered: AuthoritativeHandoffCandidate[] = [];
  for (const c of args.candidates) {
    const t = trim(c.text);
    if (!t) continue;
    if (
      hasAcceptedAnchor &&
      BLOCKED_SHORT_SOURCES.has(c.source) &&
      wouldMateriallyShrinkAuthoritativeBody(accepted.length, t.length)
    ) {
      continue;
    }
    filtered.push({ text: t, source: c.source });
  }

  if (hasAcceptedAnchor) {
    filtered.push({ text: accepted, source: "accepted_server_full_draft" });
  }

  let best: AuthoritativeHandoffCandidate = { text: "", source: "none" };
  for (const c of filtered) {
    if (c.text.length > best.text.length) best = c;
  }

  if (!best.text) {
    return { text: "", source: "none", downgradePrevented: false };
  }

  if (!hasAcceptedAnchor) {
    return { text: best.text, source: best.source, downgradePrevented: false };
  }

  const coalesced = coalesceAuthoritativePremiumBody({
    preservedBody: accepted,
    candidateBody: best.text,
    preservedSource: args.pipelineSource ?? "server_full_draft",
    candidateSource: best.source,
    allowValidatedRepairSuccess: args.allowValidatedRepairSuccess,
  });

  const source = coalesced.preserved
    ? "accepted_server_full_draft"
    : best.source;
  return {
    text: coalesced.text,
    source,
    downgradePrevented: coalesced.downgradePrevented,
  };
}

/** @deprecated Use pickAuthoritativeSigningHandoffCorpus */
export function pickBestAuthoritativeHandoffPlain(
  candidates: readonly (string | null | undefined)[],
  acceptedAuthoritativeBody?: string | null,
): string {
  const mapped = candidates
    .map((t, i) => ({ text: trim(t), source: `candidate_${i}` }))
    .filter((c) => c.text.length > 0);
  return pickAuthoritativeSigningHandoffCorpus({
    candidates: mapped,
    acceptedAuthoritativeBody,
    premiumAccepted: Boolean(acceptedAuthoritativeBody && acceptedAuthoritativeBody.length >= 500),
    pipelineSource: "server_full_draft",
  }).text;
}

export { AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO, AUTHORITATIVE_BODY_PRESERVE_MIN_WINNING_LEN };
