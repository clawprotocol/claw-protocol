/**
 * Central Premium (LawDog Pro) “truth” gate: when may we show upgraded success, signers, and finished Pro.
 * **React / readonly surfaces** should obtain gate results via `computeProTruthSurface` in `premiumProTruth.ts`
 * (validation + this function composed once). Does not implement payment, checkout, or signing.
 */
import type { AgreementIntentContract } from "./agreementIntentContract";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import type { PipelineProSourceString } from "./paidProCorpusAcceptance";

/** Inlined to avoid a circular import with `paidProCorpusAcceptance`. */
function pipelineIsIneligible(s: string | null | undefined): boolean {
  if (!s) return true;
  return (
    s === "fallback_preview" ||
    s === "fallback_preview_error" ||
    s === "snapshot_fallback" ||
    s === "stale_intake" ||
    s === "rejected_paid_corpus" ||
    s === "premium_network_retryable" ||
    s === "premium_generation_retryable"
  );
}

export type PremiumOutputState =
  | "premium_success"
  | "premium_needs_details"
  | "premium_retry_available"
  | "premium_failed_generation"
  | "premium_fallback_preview_allowed";

const PIPELINE_SUCCESS: ReadonlySet<PipelineProSourceString> = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  /** Checkout valid; model path returned server-built structured fallback. */
  "server_full_draft_degraded",
  "snapshot_server_full_draft",
]);

function isFinishedProReadonly(readonly: PremiumRenderResolveSource | string): boolean {
  const s = String(readonly);
  return s === "server_full_document_text" || s === "server_repair_document_text";
}

function pipelineAllowsFinishedPro(s: string | null | undefined): boolean {
  if (!s) return false;
  if (pipelineIsIneligible(s)) return false;
  return Boolean(PIPELINE_SUCCESS.has(s as PipelineProSourceString));
}

function renderSourceAllowsFinishedPro(readonly: PremiumRenderResolveSource | string): boolean {
  return isFinishedProReadonly(readonly);
}

/** 0 = vague/unknown, 1 = very concrete (deterministic-style intake). */
export function computeIntentConfidence(intake: string, contract: AgreementIntentContract): number {
  if (contract.intent_id === "custom_unknown") {
    if ((intake || "").trim().length < 24) return 0.15;
    return 0.35;
  }
  let c = 0.72;
  if (/\$[\d,]+|%\s|vesting|founder|lent|borrow|logo|sibling|estate|lease|roommate|nda|settle|revis/i.test((intake || "").toLowerCase())) {
    c = 0.9;
  }
  return c;
}

export function buildPremiumDetailsGateCopy(
  contract: AgreementIntentContract,
  _rejectionReasons: string[],
): { title: string; body: string; cta: string; bullets: string[] } {
  const label = contract.intent_id.replace(/_/g, " ");
  const baseTerms = (contract.required_material_terms || [])
    .filter((t) => (t || "").length > 2)
    .slice(0, 3)
    .map((t) => `• ${(t as string).replace(/^\w/, (c) => c.toUpperCase())} — spell out the operative terms`);
  const minSec = contract.minimum_section_expectations
    .split(/[.;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 3);
  const bullets: string[] = [
    `Parties, roles, and the relationship this agreement governs (aligned with **${label}**).`,
    `Key numbers, dates, or property scope from your intake, stated explicitly.`,
    `Operative terms your scenario needs (as above), not generic boilerplate.`,
  ];
  for (const m of minSec) {
    if (bullets.length >= 5) break;
    if (!bullets.some((b) => b.includes(m.slice(0, 24)))) {
      bullets.push(m.slice(0, 200));
    }
  }
  for (const b of baseTerms) {
    if (b && bullets.length < 5) bullets.push(b);
  }
  return {
    title: "Need a few more details to complete this agreement",
    body: `We recognized this as: **${label}**.\n\nAdd the missing details below, then retry the Pro draft.`,
    cta: "Retry Pro Draft",
    bullets: bullets.slice(0, 5),
  };
}

export type PremiumSuccessGateResult = {
  state: PremiumOutputState;
  /** "Your agreement has been upgraded" and equivalent */
  successBannerAllowed: boolean;
  /** Primary send / signers CTAs on the completion strip */
  signerCtaAllowed: boolean;
  /** `validatePaidProOutput` result */
  validation: { ok: boolean; reasons: string[] };
  successBannerReasons: string[];
  intent_id: string;
  intent_confidence: number;
  strict_intent: boolean;
};

export type CanShowPremiumSuccessArgs = {
  intentContract: AgreementIntentContract | null;
  /** Resolved readonly tier from `resolvePremiumRenderSource` */
  renderSource: PremiumRenderResolveSource | string;
  /** Pre-computed `validatePaidProOutput` (must be run with same contract + text + draft). */
  validation: { ok: boolean; reasons: string[] };
  documentText: string;
  intakeText: string;
  premiumPipelineSource: PipelineProSourceString | string | null | undefined;
  /** Generation / fingerprint no longer current */
  stale: boolean;
  /** From draft, for title-aware validation */
  draft?: ParsedDraftShape | null;
  /** When true, skip all success (e.g. pipeline already set retry gate) */
  qualityRetryActive?: boolean;
  /**
   * API returned 200 with explicit degraded fallback (model unavailable); user paid and should
   * see a finished surface + optional “try again later” copy — not a quality-gate dead end.
   */
  serverGenerationDegraded?: boolean;
  /**
   * After checkout, accept a long stitched/fallback body (model or HTTP failed) as “review-ready Pro”
   * so the user is not forced into a retry-only dead end.
   */
  allowPaidSubstantiveStitch?: boolean;
};

/**
 * Single entry point: whether Pro may present as a completed, upgraded agreement for this run.
 */
export function canShowPremiumSuccess(args: CanShowPremiumSuccessArgs): PremiumSuccessGateResult {
  const c = args.intentContract;
  const strict = Boolean(c?.pro_strict);
  const ic = c
    ? computeIntentConfidence(args.intakeText, c)
    : 0;
  const id = c?.intent_id ?? "custom_unknown";
  const validation = args.validation;

  const outBase = {
    validation,
    successBannerReasons: [] as string[],
    intent_id: id,
    intent_confidence: ic,
    strict_intent: strict,
  } as const;

  if (args.qualityRetryActive) {
    return {
      state: "premium_needs_details",
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
      successBannerReasons: ["quality_retry_active"],
    };
  }

  if (args.serverGenerationDegraded) {
    if (!args.validation.ok) {
      return {
        state: "premium_needs_details",
        successBannerAllowed: false,
        signerCtaAllowed: false,
        ...outBase,
        successBannerReasons: [
          "server_generation_degraded_failed_fact_or_shell_check",
          ...args.validation.reasons.slice(0, 8),
        ],
      };
    }
    return {
      state: "premium_success",
      successBannerAllowed: true,
      signerCtaAllowed: true,
      ...outBase,
      successBannerReasons: ["server_generation_degraded_structured_fallback"],
      validation: args.validation,
    };
  }

  if (args.allowPaidSubstantiveStitch) {
    const p = String(args.premiumPipelineSource || "");
    if (pipelineIsIneligible(p)) {
      return {
        state: "premium_retry_available",
        successBannerAllowed: false,
        signerCtaAllowed: false,
        ...outBase,
        successBannerReasons: [`paid_stitch_blocked_pipeline:${p || "null"}`],
      };
    }
    const t = String(args.documentText || "").trim();
    if (t.length >= 500) {
      return {
        state: "premium_success",
        successBannerAllowed: true,
        signerCtaAllowed: true,
        ...outBase,
        successBannerReasons: ["paid_substantive_stitch_or_fallback", `pipeline:${String(args.premiumPipelineSource || "unknown")}`],
        validation: validation.ok ? validation : { ok: true, reasons: [] },
      };
    }
  }

  if (args.stale) {
    return {
      state: "premium_failed_generation",
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
      successBannerReasons: ["stale_intake_or_generation"],
    };
  }

  if (!String(args.documentText || "").trim()) {
    return {
      state: "premium_failed_generation",
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
      successBannerReasons: ["empty_document"],
    };
  }

  const p = (args.premiumPipelineSource || "") as string;
  const plOk = pipelineAllowsFinishedPro(p);
  const rs = String(args.renderSource);
  const rOk = renderSourceAllowsFinishedPro(args.renderSource);

  if (strict) {
    if (!plOk) {
      const st: PremiumOutputState =
        p === "rejected_paid_corpus" || p === "fallback_preview" || p === "fallback_preview_error"
          ? "premium_needs_details"
          : p === "stale_intake"
            ? "premium_failed_generation"
            : "premium_retry_available";
      return {
        state: st,
        successBannerAllowed: false,
        signerCtaAllowed: false,
        ...outBase,
        successBannerReasons: [`strict_pipeline_rejected:${p || "null"}`],
        validation: !validation.ok ? validation : { ok: false, reasons: ["strict_pipeline_ineligible"] },
      };
    }
    if (!rOk) {
      return {
        state: "premium_needs_details",
        successBannerAllowed: false,
        signerCtaAllowed: false,
        ...outBase,
        successBannerReasons: [`strict_readonly_rejected:${rs}`],
        validation: !validation.ok
          ? validation
          : { ok: false, reasons: ["strict_intent_disallows_readonly_tier:live_or_legacy"] },
      };
    }
  }

  if (!validation.ok) {
    return {
      state: "premium_needs_details",
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
    };
  }

  if (!plOk) {
    const st: PremiumOutputState = strict ? "premium_retry_available" : "premium_fallback_preview_allowed";
    return {
      state: st,
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
      successBannerReasons: [`pipeline_ineligible:${p || "null"}`],
    };
  }
  if (!rOk) {
    return {
      state: !strict && c?.intent_id === "custom_unknown" ? "premium_fallback_preview_allowed" : "premium_needs_details",
      successBannerAllowed: false,
      signerCtaAllowed: false,
      ...outBase,
      successBannerReasons: [`readonly_ineligible_for_finished_pro:${rs}`],
    };
  }

  return {
    state: "premium_success",
    successBannerAllowed: true,
    signerCtaAllowed: true,
    ...outBase,
  };
}

export function logPremiumTruthTelemetry(
  o: PremiumSuccessGateResult & {
    render_source: string;
    premium_pipeline_source: string;
  },
): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-truth-telemetry]", {
    intent_id: o.intent_id,
    intent_confidence: o.intent_confidence,
    strict_intent: o.strict_intent,
    render_source: o.render_source,
    premium_pipeline_source: o.premium_pipeline_source,
    validation_passed: o.validation.ok,
    rejection_reasons: o.validation.reasons,
    success_banner_allowed: o.successBannerAllowed,
    signer_cta_allowed: o.signerCtaAllowed,
    state: o.state,
  });
}
