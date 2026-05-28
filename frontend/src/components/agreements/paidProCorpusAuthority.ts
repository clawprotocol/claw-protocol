import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { corpusMatchesFreeBasicDraft, premiumReadonlyCorpusSignalHits } from "./premiumReadonlyRenderCorpus";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { tryBuildPaidProLocalDeterministicFallback } from "./paidProLocalDeterministicFallback";
import {
  isPremiumGenerationApiUnavailablePipelineSource,
  MIN_PAID_PRO_AUTHORITY_LEN,
} from "./premiumGenerationApiAvailability";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

/** Highest-first paid Pro authority tiers (Tier 4 is never authoritative). */
export type PaidProCorpusAuthorityTier =
  | "server_authoritative_paid_pro"
  | "locally_generated_paid_pro"
  | "deterministic_paid_pro_fallback"
  | "starter_preview_only";

export type PaidProCorpusAuthorityCandidate = {
  plainText: string;
  tier: PaidProCorpusAuthorityTier;
  /** Resolver / pipeline label for telemetry. */
  sourceLabel: string;
  pipelineSource?: string | null;
  /** When true, sticky corpus wins over equal-tier challengers. */
  sticky?: boolean;
};

export type PaidProCorpusValidationResult = {
  ok: boolean;
  reasons: string[];
  tier: PaidProCorpusAuthorityTier;
  len: number;
  richerThanStarter: boolean;
  starterClone: boolean;
};

export type PaidProCorpusAuthorityResolution =
  | {
      mode: "authoritative";
      plainText: string;
      tier: PaidProCorpusAuthorityTier;
      sourceLabel: string;
      pipelineSource?: string | null;
      validation: PaidProCorpusValidationResult;
      usedLocalDeterministicFallback?: boolean;
    }
  | {
      mode: "retry";
      reason: string;
      starterBaselinePlain: string;
      failedCandidates: Array<{ tier: PaidProCorpusAuthorityTier; sourceLabel: string; reasons: string[] }>;
    };

const TIER_RANK: Record<PaidProCorpusAuthorityTier, number> = {
  server_authoritative_paid_pro: 4,
  locally_generated_paid_pro: 3,
  deterministic_paid_pro_fallback: 2,
  starter_preview_only: 0,
};

const NEVER_AUTHORITATIVE_SOURCES = new Set<string>([
  "none",
  "free_starter",
  "rendered_preview",
  "starter_review_preview",
]);

const MIN_PAID_LEN_DEFAULT = 500;
const MIN_PAID_LEN_OVER_STARTER_DELTA = 80;

export function mapRenderSourceToAuthorityTier(args: {
  renderSource: string | null | undefined;
  pipelineSource?: string | null;
  usedLocalDeterministicFallback?: boolean;
}): PaidProCorpusAuthorityTier {
  if (args.usedLocalDeterministicFallback) return "deterministic_paid_pro_fallback";
  const pipe = String(args.pipelineSource || "").trim();
  if (isAuthoritativePremiumPipelineRenderSource(pipe)) return "server_authoritative_paid_pro";
  const src = String(args.renderSource || "").trim();
  if (NEVER_AUTHORITATIVE_SOURCES.has(src)) return "starter_preview_only";
  if (
    src === "server_full_document_text" ||
    src === "server_repair_document_text" ||
    src === "legacy_snapshot"
  ) {
    return "server_authoritative_paid_pro";
  }
  if (src === "live_generated_preview") return "locally_generated_paid_pro";
  return "locally_generated_paid_pro";
}

export function isNeverAuthoritativePaidProSource(source: string | null | undefined): boolean {
  const s = String(source || "").trim();
  return !s || NEVER_AUTHORITATIVE_SOURCES.has(s);
}

function isTruncatedOrPlaceholderCorpus(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (/\[not yet specified\]|\[tbd\]|\[placeholder\]/i.test(t)) return true;
  if (t.length < 280) return true;
  const numbered = (t.match(/^\s*\d+[\.)]\s+/gm) || []).length;
  if (t.length < 900 && numbered <= 1) return true;
  return false;
}

/**
 * Canonical acceptance: non-empty, richer than starter, not starter clone, structurally usable.
 * Does NOT reject solely because server fetch failed or source is local/deterministic.
 */
export function validatePaidProCorpusCandidate(args: {
  plainText: string;
  tier: PaidProCorpusAuthorityTier;
  freeBaselinePlain: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  pipelineSource?: string | null;
  minLen?: number;
}): PaidProCorpusValidationResult {
  const t = (args.plainText || "").trim();
  const free = (args.freeBaselinePlain || "").trim();
  const minLen = args.minLen ?? MIN_PAID_LEN_DEFAULT;
  const reasons: string[] = [];

  if (args.tier === "starter_preview_only") {
    return {
      ok: false,
      reasons: ["starter_preview_tier_never_authoritative"],
      tier: args.tier,
      len: t.length,
      richerThanStarter: false,
      starterClone: true,
    };
  }

  if (isPremiumGenerationApiUnavailablePipelineSource(args.pipelineSource)) {
    if (args.tier === "deterministic_paid_pro_fallback") {
      reasons.push("api_unavailable_local_fallback_blocked");
    }
    if (args.tier === "locally_generated_paid_pro" && t.length < MIN_PAID_PRO_AUTHORITY_LEN) {
      reasons.push("api_unavailable_short_live_preview_blocked");
    }
  }

  if (!t) reasons.push("empty_body");
  if (t.length < minLen) reasons.push(`too_short:${t.length}`);
  if (isTruncatedOrPlaceholderCorpus(t)) reasons.push("truncated_or_placeholder");

  const starterClone = Boolean(free && t && corpusMatchesFreeBasicDraft(t, free));
  if (starterClone) reasons.push("starter_clone_hash");

  const richerThanStarter =
    !free || !t || t.length >= free.length + MIN_PAID_LEN_OVER_STARTER_DELTA || premiumReadonlyCorpusSignalHits(t) >= 4;
  if (free && t && !richerThanStarter && t.length <= free.length + 120) {
    reasons.push("not_richer_than_starter");
  }

  const sigHits = premiumReadonlyCorpusSignalHits(t);
  const sectionOk =
    sigHits >= 3 ||
    (t.match(/^\s*\d+[\.)]\s+/gm) || []).length >= 3 ||
    t.length >= 1_200;
  if (!sectionOk && t.length < 1_200) reasons.push("insufficient_sections");

  const intake = (args.intakeText || "").trim();
  if (intake.length >= 24 && t.length >= 400) {
    const useSoftIntent =
      args.tier === "deterministic_paid_pro_fallback" || args.tier === "locally_generated_paid_pro";
    const v = validatePaidProOutput({
      text: t,
      rawIntake: intake,
      draft: args.draft ?? null,
      premiumPipelineSource: args.pipelineSource ?? null,
      intentContractMode: useSoftIntent ? "base_only" : "full",
    });
    if (!v.ok) {
      const hardReasons = v.reasons.filter(
        (r) =>
          r.includes("starter_shell") ||
          r.includes("placeholder") ||
          r.includes("banned_paid_stitch") ||
          r.includes("intake_category") ||
          r.includes("source_fact_drift") ||
          r.includes("estate_sibling") ||
          r.includes("dev_context"),
      );
      if (useSoftIntent) {
        if (hardReasons.length) reasons.push(...hardReasons);
      } else if (hardReasons.length || args.tier === "server_authoritative_paid_pro") {
        reasons.push(...(hardReasons.length ? hardReasons : v.reasons));
      }
    }
  }

  const uniq = [...new Set(reasons)];
  return {
    ok: uniq.length === 0,
    reasons: uniq,
    tier: args.tier,
    len: t.length,
    richerThanStarter,
    starterClone,
  };
}

function tierFromCandidate(c: PaidProCorpusAuthorityCandidate): PaidProCorpusAuthorityTier {
  if (c.tier !== "starter_preview_only") return c.tier;
  return mapRenderSourceToAuthorityTier({
    renderSource: c.sourceLabel,
    pipelineSource: c.pipelineSource,
  });
}

/**
 * Choose the highest valid paid Pro corpus. Preserves sticky authority when still valid.
 */
export function resolvePaidProCorpusAuthority(args: {
  candidates: PaidProCorpusAuthorityCandidate[];
  draft: ParsedDraftShape | null;
  intakeText?: string | null;
  freeBaselinePlain?: string;
  stickyPlainText?: string | null;
  stickyTier?: PaidProCorpusAuthorityTier | null;
  allowDeterministicFallback?: boolean;
}): PaidProCorpusAuthorityResolution {
  const freeBaseline = (
    args.freeBaselinePlain ??
    (args.draft ? buildAgreementPreviewTextCore(args.draft, { starterPreview: true }).trim() : "")
  ).trim();
  const failed: Array<{ tier: PaidProCorpusAuthorityTier; sourceLabel: string; reasons: string[] }> = [];

  type Scored = {
    candidate: PaidProCorpusAuthorityCandidate;
    tier: PaidProCorpusAuthorityTier;
    validation: PaidProCorpusValidationResult;
    rank: number;
    sticky: boolean;
  };

  const scored: Scored[] = [];

  for (const raw of args.candidates) {
    const tier = tierFromCandidate(raw);
    if (tier === "starter_preview_only") continue;
    const validation = validatePaidProCorpusCandidate({
      plainText: raw.plainText,
      tier,
      freeBaselinePlain: freeBaseline,
      intakeText: args.intakeText,
      draft: args.draft,
      pipelineSource: raw.pipelineSource,
    });
    if (!validation.ok) {
      failed.push({ tier, sourceLabel: raw.sourceLabel, reasons: validation.reasons });
      continue;
    }
    scored.push({
      candidate: raw,
      tier,
      validation,
      rank: TIER_RANK[tier],
      sticky: Boolean(raw.sticky),
    });
  }

  const apiUnavailable = args.candidates.some((c) =>
    isPremiumGenerationApiUnavailablePipelineSource(c.pipelineSource),
  );
  if (args.allowDeterministicFallback !== false && !apiUnavailable && args.intakeText) {
    const local = tryBuildPaidProLocalDeterministicFallback(args.intakeText, args.draft);
    if (local) {
      const validation = validatePaidProCorpusCandidate({
        plainText: local,
        tier: "deterministic_paid_pro_fallback",
        freeBaselinePlain: freeBaseline,
        intakeText: args.intakeText,
        draft: args.draft,
        pipelineSource: "deterministic_paid_pro_fallback",
      });
      if (validation.ok) {
        scored.push({
          candidate: {
            plainText: local,
            tier: "deterministic_paid_pro_fallback",
            sourceLabel: "deterministic_paid_pro_fallback",
            pipelineSource: "deterministic_paid_pro_fallback",
          },
          tier: "deterministic_paid_pro_fallback",
          validation,
          rank: TIER_RANK.deterministic_paid_pro_fallback,
          sticky: false,
        });
      } else {
        failed.push({
          tier: "deterministic_paid_pro_fallback",
          sourceLabel: "deterministic_paid_pro_fallback",
          reasons: validation.reasons,
        });
      }
    }
  }

  const sticky = (args.stickyPlainText || "").trim();
  if (sticky.length >= MIN_PAID_LEN_DEFAULT) {
    const stickyTier = args.stickyTier ?? "locally_generated_paid_pro";
    const validation = validatePaidProCorpusCandidate({
      plainText: sticky,
      tier: stickyTier,
      freeBaselinePlain: freeBaseline,
      intakeText: args.intakeText,
      draft: args.draft,
    });
    if (validation.ok) {
      const existing = scored.find((s) => s.sticky);
      if (!existing || TIER_RANK[stickyTier] >= existing.rank) {
        scored.push({
          candidate: {
            plainText: sticky,
            tier: stickyTier,
            sourceLabel: "sticky_authoritative",
            sticky: true,
          },
          tier: stickyTier,
          validation,
          rank: TIER_RANK[stickyTier],
          sticky: true,
        });
      }
    }
  }

  if (!scored.length) {
    return {
      mode: "retry",
      reason: "all_authority_candidates_failed",
      starterBaselinePlain: freeBaseline,
      failedCandidates: failed,
    };
  }

  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.sticky !== b.sticky) return a.sticky ? -1 : 1;
    return b.validation.len - a.validation.len;
  });

  const winner = scored[0];

  return {
    mode: "authoritative",
    plainText: winner.candidate.plainText.trim(),
    tier: winner.tier,
    sourceLabel: winner.candidate.sourceLabel,
    pipelineSource: winner.candidate.pipelineSource ?? null,
    validation: winner.validation,
    usedLocalDeterministicFallback: winner.tier === "deterministic_paid_pro_fallback",
  };
}

/** Maps authority tier to readonly render source for downstream pickers. */
export function authorityTierToRenderSource(tier: PaidProCorpusAuthorityTier): PremiumRenderResolveSource {
  if (tier === "starter_preview_only") return "none";
  return "server_full_document_text";
}

export function isPaidProCorpusAuthoritativeForUi(args: {
  plainText: string;
  tier: PaidProCorpusAuthorityTier;
  freeBaselinePlain: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  pipelineSource?: string | null;
}): boolean {
  if (args.tier === "starter_preview_only") return false;
  return validatePaidProCorpusCandidate({
    plainText: args.plainText,
    tier: args.tier,
    freeBaselinePlain: args.freeBaselinePlain,
    intakeText: args.intakeText,
    draft: args.draft,
    pipelineSource: args.pipelineSource,
  }).ok;
}
