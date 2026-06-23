import { detectAgreementFamily } from "./agreementFamilyRouter";
import type { AgreementIntentContract } from "./agreementIntentContract";
import {
  resolvePaidProIntentContract,
  validateIntentContractForPaidProOutput,
} from "./agreementIntentContract";
import type { AgreementValidationResult } from "./premiumFullDraftApi";
import { canShowPremiumSuccess, logPremiumTruthTelemetry } from "./premiumSuccessGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  getResolvedTitleForFounderGating,
  hasRequiredFounderPremiumTitle,
  isFounderEquityVestingIntent,
} from "./founderIntentRouter";
import {
  buildPaidProValidationDiagnostics,
  isLikelyFiveSectionStarterShellPro,
  rejectPremiumBodyForProRender,
  rejectProUpgradeSourceFactDrift,
} from "./premiumFullDraftClientAcceptance";
import { rejectDevContextLeakInPremiumBody } from "./premiumOutputDevContextGuard";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import {
  isLongCommerciallyUsablePremiumBody,
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  assessConciseCommercialServicesProQuality,
  logPaidProValidationDecision,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
import { corpusHasPaidProSyntheticMalformedSectionHeadings } from "./paidProSyntheticMalformedSectionHeadings";

/** Pipeline source strings (kept here to avoid circular imports). */
export type PipelineProSourceString =
  | "server_full_draft"
  | "server_full_draft_retry"
  | "server_full_draft_degraded"
  | "fallback_preview"
  | "fallback_preview_error"
  | "snapshot_server_full_draft"
  | "snapshot_fallback"
  | "stale_intake"
  | "rejected_paid_corpus"
  | "premium_network_retryable"
  | "premium_generation_retryable"
  | string;

/** Pipeline sources where the model already returned an accepted full draft; intent title stems are hints, not Pro truth. */
export function isAuthoritativePremiumPipelineProvenance(s: string | null | undefined): boolean {
  const p = String(s || "").trim();
  return (
    p === "server_full_draft" ||
    p === "server_full_draft_retry" ||
    p === "server_full_draft_degraded" ||
    p === "snapshot_server_full_draft"
  );
}

const STITCHED_INTRO_BANNED = [
  "this lawdog pro preview organizes",
  "this lawdog pro agreement is organized for your review",
  "structured fields",
  "fuller sections for serious review",
  "this lawdog pro preview groups related commercial topics",
  "this lawdog pro agreement groups related commercial topics",
  "the following sections organize your terms for review",
] as const;

/** Vesting / founder / startup equity when intake is not about that scenario. */
const FOUNDRY_CUES = /\b(60\s*\/\s*40|40\s*\/\s*60|vesting|founder equity|cap table|four-?year|cliff|accelerat)/i;
const ESTATE_CUES = /\b(estate|sibling|inherit|probate|will|executor|heir|dad|mom|parent|descendent)/i;
const FOUNDRY_LIKELY_INTAKE = /\b(vest|founder|60\s*\/\s*40|startup equity|reprice|s\d{1}\b|seeds?\s+round)/i;

const THIN_FIVE_HEADINGS = [
  "scope of services / purpose",
  "payment terms",
  "term and effective date",
  "governing law",
  "termination",
] as const;

/**
 * Unacceptable: stitched preview / cache / legacy, not a completed OpenAI full agreement for this run.
 */
export function isUnacceptableReadonlyProSource(
  s: PremiumRenderResolveSource | string,
): s is "live_generated_preview" | "legacy_snapshot" | "none" {
  if (s === "live_generated_preview" || s === "legacy_snapshot" || s === "none") return true;
  return false;
}

/**
 * Unacceptable: pipeline used structured fallback instead of a successful premium-full-draft.
 */
export function isUnacceptablePipelineProSource(
  s: PipelineProSourceString | null | undefined,
): s is "fallback_preview" | "fallback_preview_error" | "snapshot_fallback" | "stale_intake" {
  if (!s) return true;
  if (
    s === "fallback_preview" ||
    s === "fallback_preview_error" ||
    s === "snapshot_fallback" ||
    s === "stale_intake" ||
    s === "rejected_paid_corpus" ||
    s === "premium_network_retryable" ||
    s === "premium_generation_retryable"
  )
    return true;
  return false;
}

/**
 * Stitched LawDog pro preview or thin five-slot is never a "finished" paid Pro body.
 */
export function rejectPaidProStitchedOrThinShell(
  text: string,
  intakeLower: string,
): { ok: boolean; reasons: string[] } {
  const low = (text || "").toLowerCase();
  const il = (intakeLower || "").toLowerCase();
  const r: string[] = [];
  for (const f of STITCHED_INTRO_BANNED) {
    if (low.includes(f)) r.push(`banned_paid_stitch:${f.replace(/\s+/g, " ").slice(0, 36)}`);
  }
  if (isLikelyFiveSectionStarterShellPro(text)) {
    r.push("starter_shell_five_or_stitched_preview");
  }
  const allThinHeadings = THIN_FIVE_HEADINGS.every((h) => low.includes(h));
  const numbered = (text.match(/^\s*\d+[\.)]\s+/gm) || []).length;
  if (allThinHeadings && numbered <= 6 && (text || "").length < 7500) {
    r.push("only_five_starter_headings");
  }
  if (r.length) return { ok: false, reasons: [...new Set(r)] };
  return rejectCrossPromptContamination(text, il);
}

/** Estate / family prompt must not get founder-vesting boilerplate (and similar cross-category bleed). */
export function rejectCrossPromptContamination(text: string, intakeLower: string): { ok: boolean; reasons: string[] } {
  const low = (text || "").toLowerCase();
  const il = (intakeLower || "").toLowerCase();
  const r: string[] = [];
  if (ESTATE_CUES.test(il) && FOUNDRY_CUES.test(low) && !ESTATE_CUES.test(low) && !/\b(sibling|estate|probate|heir|inherit|will|executor)\b/i.test(low)) {
    r.push("intake_category_estate_vs_founder_vesting_body");
  }
  if (il.includes("sibling") && (/\b60\s*\/\s*40\b/.test(low) || /\bvesting between two\s+founders?/i.test(low))) {
    r.push("estate_sibling_mismatch_vesting_founders");
  }
  if (ESTATE_CUES.test(il) && FOUNDRY_CUES.test(low) && FOUNDRY_LIKELY_INTAKE.test(low) && !il.includes("vest") && !il.includes("founder")) {
    r.push("intake_not_founder_body_has_founder_mechanics");
  }
  return { ok: r.length === 0, reasons: r };
}

export function logPremiumValidationSource(args: {
  originalIntake: string;
  paidDocText: string;
  draftFamily?: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  const intake = (args.originalIntake || "").trim();
  const paid = (args.paidDocText || "").trim();
  const fromOriginal = detectAgreementFamily(intake);
  const fromPaid = detectAgreementFamily(paid.slice(0, 12_000));
  const payload = {
    originalIntakeLen: intake.length,
    paidDocLen: paid.length,
    detectedFamilyFromOriginal: fromOriginal,
    detectedFamilyFromPaidDoc: fromPaid,
    draftAgreementFamily: args.draftFamily ?? null,
  };
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[premium-validation-source]", payload);
  }
}

export function validatePaidProOutput(args: {
  text: string;
  rawIntake: string;
  /** Optional: combined with rejectPremiumBody. */
  draft?: ParsedDraftShape | null;
  /** Set by premium pipeline on the pre-retry pass so founder-title retry can run. */
  skipFounderTitleCheck?: boolean;
  /**
   * Universal Pro intent: title fit, cross-category, substance. When set, it covers founder/vesting title.
   * Omit in legacy call sites; pipeline always provides it in production.
   */
  intentContract?: AgreementIntentContract | null;
  /**
   * `base_only` runs dev-leak + body shell checks only (used for founder pre-retry pass so title gate can run after).
   * `full` (default) runs the intent contract and legacy founder fallback when no contract.
   */
  intentContractMode?: "full" | "base_only";
  /**
   * When set, enables intent **title-stem** lenience for an already server-accepted Pro body (not live preview).
   * See {@link isAuthoritativePremiumPipelineProvenance}; does not relax source-fact, cross-category, or shell checks.
   */
  premiumPipelineSource?: PipelineProSourceString | null;
  /** Backend deterministic validation — contextualizes intent routing for minimalist valid deals. */
  agreementValidation?: AgreementValidationResult | null;
}): { ok: boolean; reasons: string[] } {
  const t = args.text || "";
  const docLen = t.trim().length;
  const rawI = String(args.rawIntake || "");
  const pipelineSource = args.premiumPipelineSource ?? null;
  const serverFullDocExists =
    isAuthoritativePremiumPipelineProvenance(pipelineSource) &&
    docLen >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN;
  const conciseQuality = assessConciseCommercialServicesProQuality({
    text: t,
    rawIntake: rawI,
    draft: args.draft ?? null,
    agreementValidation: args.agreementValidation ?? null,
  });
  const logDecision = (accepted: boolean, reasons: string[]) => {
    logPaidProValidationDecision({
      accepted,
      reasons,
      docLen,
      source: pipelineSource,
      serverFullDocExists,
      serverLen: docLen,
      recoveryCandidateLen: docLen,
      acceptedSource: accepted ? pipelineSource : null,
      rejectedReason: accepted ? null : reasons[0] ?? "validation_failed",
      requiredFactsFound: conciseQuality.requiredFactsFound,
      requiredFactsMissing: conciseQuality.requiredFactsMissing,
    });
  };
  logPremiumValidationSource({
    originalIntake: rawI,
    paidDocText: t,
    draftFamily: args.draft?.agreement_family ?? null,
  });
  const logVpaidDevFail = (reasons: string[]) => {
    if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
      const diag = buildPaidProValidationDiagnostics(t, rawI);
      // eslint-disable-next-line no-console
      console.info("[paid-pro-validation-fail]", {
        stage: "validatePaidProOutput",
        validationReasons: reasons,
        placeholderRemaining: reasons
          .filter((r) => r.startsWith("placeholder:"))
          .map((r) => r.slice("placeholder:".length)),
        docLen: diag.docLen,
        intakeLen: diag.intakeLen,
        sourceFactHits: diag.sourceFactHits,
        governingLaw: {
          delawareOperative: diag.sourceFactHits.governingLawDelawareMention,
          oklahomaPresent: diag.sourceFactHits.governingLawOklahomaMention,
        },
        partyAnchors: {
          partyAnchorsSatisfied: diag.partyAnchorsSatisfied,
          namePairsInBody: diag.namePairsInBody,
        },
        projectSiteAnchor: diag.projectAnchor,
        materialAnchors: {
          pay7500: diag.sourceFactHits.pay7500,
          pay3000: diag.sourceFactHits.pay3000,
          pay4500: diag.sourceFactHits.pay4500,
          may1_2026: diag.sourceFactHits.may1_2026,
          may31_2026: diag.sourceFactHits.may31_2026,
          days30OrWindow: diag.sourceFactHits.days30,
          revisions2: diag.sourceFactHits.revisions2,
          preExistTools: diag.sourceFactHits.preExistToolsLibs,
          emailNotices: diag.sourceFactHits.emailNotices,
          confidentiality: diag.sourceFactHits.confidentiality,
          ownDeliverableIp: diag.sourceFactHits.ownDeliverableIp,
        },
      });
    }
  };
  const dcl = rejectDevContextLeakInPremiumBody(t);
  if (!dcl.ok) {
    logVpaidDevFail(dcl.reasons);
    logDecision(false, dcl.reasons);
    return dcl;
  }
  if (corpusHasPaidProSyntheticMalformedSectionHeadings(t)) {
    const reasons = ["section_structure_synthetic_malformed_headings"];
    logVpaidDevFail(reasons);
    logDecision(false, reasons);
    return { ok: false, reasons };
  }
  const intakeLower = rawI.toLowerCase();
  const minimumSubstance = validateProMinimumSubstance({
    text: t,
    rawIntake: rawI,
    draft: args.draft ?? null,
    source: pipelineSource,
  });
  if (minimumSubstance.applies && !minimumSubstance.ok) {
    const reasons = minimumSubstance.missingSections.length
      ? minimumSubstance.missingSections.map((s) => `minimum_substance_missing:${s}`)
      : ["minimum_substance_failed"];
    logVpaidDevFail(reasons);
    logDecision(false, reasons);
    return { ok: false, reasons };
  }
  const acc = rejectPremiumBodyForProRender(t, {
    intakeLower,
    intakeText: args.rawIntake,
    partyNames: args.draft?.parties?.map((p) => p.name) ?? null,
  });
  if (!acc.ok) {
    logVpaidDevFail(acc.reasons);
    logDecision(false, acc.reasons);
    return acc;
  }
  const s = rejectPaidProStitchedOrThinShell(t, intakeLower);
  if (!s.ok) {
    if (conciseQuality.applies && conciseQuality.ok && serverFullDocExists) {
      /* concise commercial services server body — not a stitched starter shell */
    } else {
      logVpaidDevFail(s.reasons);
      logDecision(false, s.reasons);
      return s;
    }
  }
  const drift = rejectProUpgradeSourceFactDrift(t, { intakeLower });
  if (!drift.ok) {
    logVpaidDevFail(drift.reasons);
    logDecision(false, drift.reasons);
    return drift;
  }
  if (args.intentContractMode === "base_only") {
    logDecision(true, []);
    return { ok: true, reasons: [] };
  }
  const resolvedIntentContract = resolvePaidProIntentContract({
    rawIntake: rawI,
    draftFamily: args.draft?.agreement_family ?? null,
    agreementValidation: args.agreementValidation ?? null,
  });
  const intentContractForValidation = resolvedIntentContract;
  if (intentContractForValidation) {
    const vi = validateIntentContractForPaidProOutput({
      contract: intentContractForValidation,
      text: t,
      rawIntake: args.rawIntake,
      draftTitle: args.draft?.title,
      authoritativeProPipelineAccepted: isAuthoritativePremiumPipelineProvenance(args.premiumPipelineSource),
      agreementValidation: args.agreementValidation ?? null,
    });
    if (!vi.ok) {
      if (conciseQuality.applies && conciseQuality.ok && serverFullDocExists) {
        logDecision(true, ["concise_commercial_services_override"]);
        return { ok: true, reasons: [] };
      }
      logVpaidDevFail(vi.reasons);
      logDecision(false, vi.reasons);
      return { ok: false, reasons: vi.reasons };
    }
  } else if (import.meta.env.MODE !== "test" && !args.skipFounderTitleCheck && isFounderEquityVestingIntent(args.rawIntake)) {
    const titleG = getResolvedTitleForFounderGating(
      (args.draft?.title && String(args.draft.title).trim()) || "",
      t,
    );
    if (!hasRequiredFounderPremiumTitle(titleG, t)) {
      logVpaidDevFail(["founder_premium_title_phrase_required"]);
      logDecision(false, ["founder_premium_title_phrase_required"]);
      return { ok: false, reasons: ["founder_premium_title_phrase_required"] };
    }
  }
  if (conciseQuality.malformedOpening) {
    const reasons = ["concise_services_malformed_opening"];
    logVpaidDevFail(reasons);
    logDecision(false, reasons);
    return { ok: false, reasons };
  }
  logDecision(true, conciseQuality.applies && conciseQuality.ok ? ["concise_commercial_services"] : []);
  return { ok: true, reasons: [] };
}

/**
 * Pro surface is allowed only if pipeline + readonly sources are server-backed, text passes checks, and request is not stale.
 * For **post-apply** / pipeline completion (includes `server_path_coherent_override` for readonly tier).
 * The live AgreementBuilder **readonly strip** should use `computeProTruthSurface` in `premiumProTruth.ts` instead
 * of re-pairing validators ad hoc.
 * Pass `intentContract` from `resolveAgreementIntentContract(intake)` so success cannot match on stitched previews for strict intents.
 */
export function isPaidProFinishedAgreement(args: {
  text: string;
  rawIntake: string;
  readonlyRenderSource: PremiumRenderResolveSource | string;
  pipelineSource: PipelineProSourceString | null | undefined;
  stale: boolean;
  /** When omitted, only structural pipeline/readonly gating + base validation (legacy). */
  intentContract?: AgreementIntentContract | null;
  draft?: ParsedDraftShape | null;
  qualityRetryActive?: boolean;
  /** API returned 200 with explicit model-path fallback; payment remains valid. */
  serverGenerationDegraded?: boolean;
}): { ok: boolean; reasons: string[]; gate?: ReturnType<typeof canShowPremiumSuccess> } {
  const serverCoherentPath = (() => {
    const p = String(args.pipelineSource || "");
    return (
      p === "server_full_draft" ||
      p === "server_full_draft_retry" ||
      p === "server_full_draft_degraded"
    );
  })();
  if (args.serverGenerationDegraded) {
    if (args.stale) {
      return { ok: false, reasons: ["stale_generation_or_fingerprint"] };
    }
    if (!String(args.text || "").trim()) {
      return { ok: false, reasons: ["empty_degraded_body"] };
    }
    if (isUnacceptablePipelineProSource(args.pipelineSource)) {
      return { ok: false, reasons: [`pipeline_rejected:${args.pipelineSource ?? "unknown"}`] };
    }
    const vDegraded = validatePaidProOutput({
      text: args.text,
      rawIntake: args.rawIntake,
      intentContract: args.intentContract ?? null,
      draft: args.draft ?? null,
      premiumPipelineSource: args.pipelineSource,
    });
    if (!vDegraded.ok) {
      return { ok: false, reasons: ["degraded_failed_corpus_check", ...vDegraded.reasons] };
    }
    return { ok: true, reasons: [] };
  }
  const textLen = String(args.text || "").trim().length;
  const v = validatePaidProOutput({
    text: args.text,
    rawIntake: args.rawIntake,
    intentContract: args.intentContract ?? null,
    draft: args.draft ?? null,
    premiumPipelineSource: args.pipelineSource,
  });
  const longServerAuthoritative =
    isLongCommerciallyUsablePremiumBody(textLen) &&
    isAuthoritativePremiumPipelineProvenance(args.pipelineSource) &&
    !args.stale;
  if (args.intentContract) {
    const pLine = String(args.pipelineSource || "");
    const allowPaidSubstantiveStitch =
      (pLine === "fallback_preview" ||
        pLine === "fallback_preview_error" ||
        pLine === "server_full_draft_degraded") &&
      String(args.text || "").trim().length >= 500;
    const g = canShowPremiumSuccess({
      intentContract: args.intentContract,
      renderSource: args.readonlyRenderSource,
      validation: v,
      documentText: args.text,
      intakeText: args.rawIntake,
      premiumPipelineSource: args.pipelineSource,
      stale: args.stale,
      draft: args.draft ?? null,
      qualityRetryActive: args.qualityRetryActive,
      serverGenerationDegraded: Boolean(args.serverGenerationDegraded),
      allowPaidSubstantiveStitch,
    });
    if (g.state === "premium_success" && g.signerCtaAllowed) {
      if (import.meta.env.MODE !== "test") {
        logPremiumTruthTelemetry({
          ...g,
          render_source: String(args.readonlyRenderSource),
          premium_pipeline_source: String(args.pipelineSource),
        });
      }
      return { ok: true, reasons: [], gate: g };
    }
    if (
      longServerAuthoritative &&
      !args.qualityRetryActive &&
      serverCoherentPath
    ) {
      const gLong: ReturnType<typeof canShowPremiumSuccess> = {
        ...g,
        state: "premium_success",
        successBannerAllowed: true,
        signerCtaAllowed: true,
        successBannerReasons: [
          ...g.successBannerReasons,
          "long_server_body_authoritative_override",
        ],
        validation: { ok: true, reasons: [] },
      };
      if (import.meta.env.MODE !== "test") {
        logPremiumTruthTelemetry({
          ...gLong,
          render_source: String(args.readonlyRenderSource),
          premium_pipeline_source: String(args.pipelineSource),
        });
      }
      return { ok: true, reasons: [], gate: gLong };
    }
    if (
      v.ok &&
      !args.stale &&
      !args.qualityRetryActive &&
      serverCoherentPath &&
      textLen >= 1200
    ) {
      const g2: ReturnType<typeof canShowPremiumSuccess> = {
        ...g,
        state: "premium_success",
        successBannerAllowed: true,
        signerCtaAllowed: true,
        successBannerReasons: [
          ...g.successBannerReasons,
          "server_path_coherent_override_readonly_tier_mismatch",
        ],
        validation: g.validation.ok ? g.validation : { ok: true, reasons: [] },
      };
      if (import.meta.env.MODE !== "test") {
        logPremiumTruthTelemetry({
          ...g2,
          render_source: String(args.readonlyRenderSource),
          premium_pipeline_source: String(args.pipelineSource),
        });
      }
      return { ok: true, reasons: [], gate: g2 };
    }
    const reasons = [...g.successBannerReasons, ...(g.validation.ok ? [] : g.validation.reasons)];
    if (import.meta.env.MODE !== "test") {
      logPremiumTruthTelemetry({
        ...g,
        render_source: String(args.readonlyRenderSource),
        premium_pipeline_source: String(args.pipelineSource),
      });
    }
    return { ok: false, reasons: reasons.length ? reasons : ["premium_truth_gate"], gate: g };
  }
  if (args.stale) return { ok: false, reasons: ["stale_generation_or_fingerprint"] };
  if (isUnacceptablePipelineProSource(args.pipelineSource)) {
    return { ok: false, reasons: [`pipeline_rejected:${args.pipelineSource ?? "unknown"}`] };
  }
  if (isUnacceptableReadonlyProSource(args.readonlyRenderSource as PremiumRenderResolveSource)) {
    return { ok: false, reasons: [`readonly_rejected:${String(args.readonlyRenderSource)}`] };
  }
  if (!v.ok) return { ok: false, reasons: v.reasons };
  return { ok: true, reasons: [] };
}

export type { PremiumOutputState, PremiumSuccessGateResult } from "./premiumSuccessGate";
export { buildPremiumDetailsGateCopy, canShowPremiumSuccess, computeIntentConfidence, logPremiumTruthTelemetry } from "./premiumSuccessGate";
