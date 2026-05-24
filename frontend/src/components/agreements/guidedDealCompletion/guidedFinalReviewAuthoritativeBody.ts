/**
 * Authoritative guided Pro final-review body — priority resolution and placeholder scan scope.
 * Never evaluates preview starter / intake preview bodies for final-review transition gates.
 */

import type { GuidedFinalCorpusCandidateSource } from "./guidedFinalCorpusFinalizer";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import {
  scanFatalPartyPlaceholdersAfterManifestApply,
  buildCanonicalFinalPartyManifestFromIdentities,
  type CanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";

export const GUIDED_FINAL_REVIEW_AUTHORITATIVE_MIN_LEN = 1500;

/** Sources that must never drive final-review transition validation. */
export const GUIDED_FINAL_REVIEW_REJECTED_SOURCES = new Set<GuidedFinalCorpusCandidateSource>([
  "rendered_preview",
  "draft_fallback",
]);

/** Sources that must never drive signing/final corpus until guided apply + signer setup complete. */
export const GUIDED_PRE_SIGNING_CORPUS_SOURCES = new Set<GuidedFinalCorpusCandidateSource>([
  "canonical_working_draft",
  "hydrated_premium_with_signers",
  "hydrated_premium",
  "picker_authoritative",
  "agreement_document",
  "last_known_good_authoritative",
  "authoritative_snapshot",
  "server_full_document_text",
  "last_accepted_premium_candidate",
  "finalized_guided_corpus",
]);

/** Stale server/picker drafts — must not override frozen signer-applied corpus on final review. */
export const GUIDED_STALE_POST_SIGNER_CORPUS_SOURCES = new Set<GuidedFinalCorpusCandidateSource>([
  "server_full_document_text",
  "picker_authoritative",
  "agreement_document",
  "last_accepted_premium_candidate",
]);

export function isGuidedSigningCorpusSelectionReady(args: {
  guidedUxState?: string;
  signerSetupComplete?: boolean;
  finalReviewExplicitlyOpened?: boolean;
}): boolean {
  if (
    args.guidedUxState === "guided_final_review" ||
    args.guidedUxState === "signing_packet_setup" ||
    args.guidedUxState === "send_intent_selected"
  ) {
    return true;
  }
  return Boolean(args.signerSetupComplete && args.finalReviewExplicitlyOpened);
}

export function rejectGuidedAuthoritativeSourceUntilSigningReady(
  source: GuidedFinalCorpusCandidateSource,
  signingReady: boolean,
): boolean {
  if (signingReady) return GUIDED_STALE_POST_SIGNER_CORPUS_SOURCES.has(source);
  return GUIDED_PRE_SIGNING_CORPUS_SOURCES.has(source);
}

/** Priority order for authoritative final-review corpus (first match wins). */
export const GUIDED_FINAL_REVIEW_SOURCE_PRIORITY: readonly GuidedFinalCorpusCandidateSource[] = [
  "finalized_signer_applied_guided_corpus",
  "canonical_working_draft",
  "hydrated_premium_with_signers",
  "finalized_guided_corpus",
  "finalized_signing",
  "accepted_review",
  "authoritative_snapshot",
  "hydrated_premium",
  "server_full_document_text",
  "last_known_good_authoritative",
  "agreement_document",
  "picker_authoritative",
  "last_accepted_premium_candidate",
];

export type GuidedFinalReviewAuthoritativeCandidate = {
  source: GuidedFinalCorpusCandidateSource;
  body: string | null | undefined;
};

export type GuidedFinalReviewAuthoritativeBodyResolution = {
  body: string;
  source: GuidedFinalCorpusCandidateSource | "none";
  len: number;
  hasSignerHydration: boolean;
  finalizedHash: string;
};

export type GuidedAuthoritativePlaceholderScan = {
  ok: boolean;
  placeholderCount: number;
  actionablePlaceholders: string[];
  source: GuidedFinalCorpusCandidateSource | "none";
};

function norm(s: string | null | undefined): string {
  return (s || "").trim();
}

function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

function sourcePriority(source: GuidedFinalCorpusCandidateSource): number {
  const idx = GUIDED_FINAL_REVIEW_SOURCE_PRIORITY.indexOf(source);
  return idx >= 0 ? idx : GUIDED_FINAL_REVIEW_SOURCE_PRIORITY.length + 1;
}

export function isRejectedGuidedFinalReviewSource(source: GuidedFinalCorpusCandidateSource): boolean {
  return GUIDED_FINAL_REVIEW_REJECTED_SOURCES.has(source);
}

export function resolveGuidedFinalReviewAuthoritativeBody(args: {
  candidates: readonly GuidedFinalReviewAuthoritativeCandidate[];
  minLen?: number;
  signerIdentities?: readonly CanonicalPartyIdentity[];
  signingCorpusReady?: boolean;
}): GuidedFinalReviewAuthoritativeBodyResolution {
  const minLen = args.minLen ?? GUIDED_FINAL_REVIEW_AUTHORITATIVE_MIN_LEN;
  const identities = args.signerIdentities ?? [];
  const hasSignerHydration = identities.filter((p) => p.partyDisplayName.trim().length >= 2).length >= 2;
  const signingReady = args.signingCorpusReady ?? false;

  const eligible = args.candidates
    .filter((c) => !isRejectedGuidedFinalReviewSource(c.source))
    .filter((c) => !rejectGuidedAuthoritativeSourceUntilSigningReady(c.source, signingReady))
    .map((c) => ({ source: c.source, body: norm(c.body) }))
    .filter((c) => c.body.length >= minLen)
    .sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source) || b.body.length - a.body.length);

  const picked = eligible[0] ?? { source: "none" as const, body: "" };

  const resolution: GuidedFinalReviewAuthoritativeBodyResolution = {
    body: picked.body,
    source: picked.source,
    len: picked.body.length,
    hasSignerHydration,
    finalizedHash: picked.body ? hashText(picked.body) : "",
  };

  logGuidedFinalReviewAuthoritativeBody(resolution);
  return resolution;
}

export function collectActionableGuidedAuthoritativePlaceholders(text: string): string[] {
  return collectFatalPartyNamePlaceholders(text);
}

function collectFatalPartyNamePlaceholders(text: string): string[] {
  const checks: Array<[string, RegExp]> = [
    ["Your Company Name", /\bYour Company Name\b/i],
    ["[Your Company Name]", /\[Your Company Name\]/i],
    ["Service Provider Name", /\bService Provider Name\b/i],
    ["[Service Provider Name]", /\[Service Provider Name\]/i],
    ["[Client's Full Legal Name]", /\[Client's Full Legal Name\]/i],
    ["[Client Name]", /\[Client Name\]/i],
    ["[Provider Name]", /\[Provider Name\]/i],
    ["Name: ____________________", /^name\s*:\s*_{6,}\s*$/im],
  ];
  return checks.filter(([, re]) => re.test(text)).map(([label]) => label);
}

function identitiesToManifest(identities: readonly CanonicalPartyIdentity[]): CanonicalFinalPartyManifest {
  return buildCanonicalFinalPartyManifestFromIdentities(identities);
}

export function scanGuidedAuthoritativePlaceholders(args: {
  body: string;
  source: GuidedFinalCorpusCandidateSource | "none";
  signerIdentities?: readonly CanonicalPartyIdentity[];
  signerManifestPresent?: boolean;
  partyManifest?: CanonicalFinalPartyManifest;
}): GuidedAuthoritativePlaceholderScan {
  const body = norm(args.body);
  const manifest =
    args.partyManifest ??
    (args.signerIdentities?.length
      ? identitiesToManifest(args.signerIdentities)
      : { parties: [] });
  const fatalScan = scanFatalPartyPlaceholdersAfterManifestApply({ body, manifest });
  const actionablePlaceholders = fatalScan.missingPartyReason
    ? [fatalScan.missingPartyReason, ...fatalScan.fatalPlaceholders]
    : fatalScan.fatalPlaceholders;
  const scan: GuidedAuthoritativePlaceholderScan = {
    ok: fatalScan.ok,
    placeholderCount: actionablePlaceholders.length,
    actionablePlaceholders,
    source: args.source,
  };

  logGuidedPlaceholderScan(scan);
  return scan;
}

export function logGuidedFinalReviewAuthoritativeBody(
  payload: GuidedFinalReviewAuthoritativeBodyResolution,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-authoritative-body]", {
    source: payload.source,
    len: payload.len,
    hasSignerHydration: payload.hasSignerHydration,
    finalizedHash: payload.finalizedHash,
  });
}

export function logGuidedPlaceholderScan(payload: GuidedAuthoritativePlaceholderScan): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-placeholder-scan]", {
    source: payload.source,
    placeholderCount: payload.placeholderCount,
    actionablePlaceholders: payload.actionablePlaceholders,
  });
}

export function logGuidedFinalReviewRender(payload: {
  source: string;
  hash: string;
  len: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-render]", payload);
}
