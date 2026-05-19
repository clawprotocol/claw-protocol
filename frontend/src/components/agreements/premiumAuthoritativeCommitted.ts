/**
 * Canonical post-checkout UI: authoritative Pro corpus is committed and must override
 * needs_details / soft-wait / retry fallback surfaces.
 */

import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import {
  isAuthoritativePremiumPipelineRenderSource,
  type PremiumRenderResolveSource,
} from "./premiumRenderSourceResolver";

export type ResolveAuthoritativePremiumCommittedInput = {
  winningPremiumBodyText?: string | null;
  premiumRenderSource?: string | null;
  premiumRenderResolveSource?: PremiumRenderResolveSource | string | null;
  agreementDocumentText?: string | null;
  snapshot?: PremiumCompletionSnapshot | null;
  generationOutcome?: string | null;
};

export type AuthoritativePremiumCommittedState = {
  committed: boolean;
  bodyLen: number;
  source: string | null;
  generationOutcome: string | null;
};

const MIN_AUTHORITATIVE_BODY_LEN = 500;

export function longestAuthoritativePremiumBody(
  input: ResolveAuthoritativePremiumCommittedInput,
): { body: string; source: string | null } {
  const snap = input.snapshot;
  const snapBody = (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();
  const candidates: Array<{ body: string; source: string | null }> = [
    { body: (input.winningPremiumBodyText || "").trim(), source: input.premiumRenderSource ?? null },
    { body: snapBody, source: snap?.premiumPipelineRenderSource ?? snap?.premiumRenderResolveSource ?? null },
    { body: (input.agreementDocumentText || "").trim(), source: input.premiumRenderResolveSource ?? null },
  ];
  const best = candidates.reduce((a, b) => (b.body.length > a.body.length ? b : a), { body: "", source: null });
  return best;
}

export function resolveAuthoritativePremiumCommitted(
  input: ResolveAuthoritativePremiumCommittedInput,
): AuthoritativePremiumCommittedState {
  const { body, source: bodySource } = longestAuthoritativePremiumBody(input);
  const snap = input.snapshot;
  const pipelineSources = [
    input.premiumRenderSource,
    input.premiumRenderResolveSource,
    snap?.premiumPipelineRenderSource,
    snap?.premiumRenderResolveSource,
    bodySource,
  ];
  const authoritativeSource =
    pipelineSources.find((s) => s && isAuthoritativePremiumPipelineRenderSource(String(s))) ?? null;
  const snapAccepted =
    Boolean(snap?.premiumAccepted) &&
    isAuthoritativePremiumPipelineRenderSource(String(snap?.premiumPipelineRenderSource || "")) &&
    (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim().length >= MIN_AUTHORITATIVE_BODY_LEN;
  const committed =
    body.length >= MIN_AUTHORITATIVE_BODY_LEN &&
    (Boolean(authoritativeSource) || snapAccepted || input.premiumRenderResolveSource === "server_full_document_text");
  return {
    committed,
    bodyLen: body.length,
    source: authoritativeSource,
    generationOutcome: (input.generationOutcome || "").trim() || null,
  };
}

export function resolveAuthoritativePremiumCommittedFromResult(
  result: PremiumCompletionResult | null | undefined,
  extras?: {
    agreementDocumentText?: string | null;
    snapshot?: PremiumCompletionSnapshot | null;
    generationOutcome?: string | null;
  },
): AuthoritativePremiumCommittedState {
  if (!result) {
    return resolveAuthoritativePremiumCommitted({
      winningPremiumBodyText: extras?.snapshot?.premiumWinningBodyText,
      premiumRenderSource: extras?.snapshot?.premiumPipelineRenderSource,
      premiumRenderResolveSource: extras?.snapshot?.premiumRenderResolveSource,
      agreementDocumentText: extras?.agreementDocumentText,
      snapshot: extras?.snapshot,
      generationOutcome: extras?.generationOutcome,
    });
  }
  return resolveAuthoritativePremiumCommitted({
    winningPremiumBodyText: result.winningPremiumBodyText,
    premiumRenderSource: result.premiumRenderSource,
    agreementDocumentText: extras?.agreementDocumentText,
    snapshot: extras?.snapshot,
    generationOutcome: extras?.generationOutcome,
  });
}

export function logPremiumAuthoritativeCommit(args: {
  bodyLen: number;
  source: string | null;
  generationOutcome: string | null;
}): void {
  console.info("[premium-authoritative-commit]", {
    bodyLen: args.bodyLen,
    source: args.source,
    generationOutcome: args.generationOutcome,
  });
}

export function logPremiumFallbackSuppressed(reason: "authoritative_doc_present"): void {
  console.info("[premium-fallback-suppressed]", { reason });
}

/** Remove checkout return query noise after authoritative Pro is on screen (keep session snapshot). */
export function cleanPremiumUrlAfterAuthoritativeCommit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    let changed = false;
    if (u.searchParams.get("premiumCompletion") === "1") {
      u.searchParams.delete("premiumCompletion");
      changed = true;
    }
    if (u.searchParams.get("restore") === "starterReview") {
      u.searchParams.delete("restore");
      changed = true;
    }
    if (!changed) return false;
    const qs = u.searchParams.toString();
    window.history.replaceState(window.history.state, "", qs ? `${u.pathname}?${qs}` : u.pathname);
    console.info("[premium-url-cleaned-after-commit]");
    return true;
  } catch {
    return false;
  }
}
