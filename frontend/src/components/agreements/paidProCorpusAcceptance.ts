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
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  assessConciseCommercialServicesProQuality,
  logPaidProValidationDecision,
  preparePaidProServerDocumentForAcceptance,
  validateProMinimumSubstance,
} from "./paidProConciseServicesQuality";
import { corpusHasPaidProSyntheticMalformedSectionHeadings } from "./paidProSyntheticMalformedSectionHeadings";
import {
  buildPaidProFreezeCandidate,
  logPaidProFreezeCandidateDecision,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { applyPaidProCorpusDuplicationAuthority } from "./paidProCorpusDuplicationAuthority";
import { intakeDescribesBrandLicensingDistributionManufacturingStack } from "./paidProAgreementTitleScope";

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
  const rawInput = args.text || "";
  const inputLen = rawInput.trim().length;
  const rawI = String(args.rawIntake || "");
  const pipelineSource = args.premiumPipelineSource ?? null;
  const inputHash = paidProPipelineAcceptedCorpusHash(rawInput);
  const serverFullDocExists =
    isAuthoritativePremiumPipelineProvenance(pipelineSource) &&
    inputLen >= PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN;
  const substantiveServerDraft =
    serverFullDocExists && inputLen >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;

  let validationInput = rawInput;
  let preparationStage = "raw_input";
  const acceptanceRepairs: string[] = [];
  if (substantiveServerDraft) {
    const prep = preparePaidProServerDocumentForAcceptance(
      rawInput,
      args.draft ?? null,
      rawI,
      { surface: "validatePaidProOutput_acceptance_prep" },
    );
    validationInput = prep.text;
    acceptanceRepairs.push(...prep.repairs);
    preparationStage = "preparePaidProServerDocumentForAcceptance";
  }

  const t = validationInput;
  const docLen = t.trim().length;
  const preparedHash = paidProPipelineAcceptedCorpusHash(t);
  const conciseQuality = assessConciseCommercialServicesProQuality({
    text: t,
    rawIntake: rawI,
    draft: args.draft ?? null,
    agreementValidation: args.agreementValidation ?? null,
  });
  let freezeCandidateHashForLog: string | null = null;
  let intentValidationHashForLog: string | null = null;
  const logDecision = (
    accepted: boolean,
    reasons: string[],
    validationStage: string,
    rejectedRule?: string | null,
  ) => {
    logPaidProValidationDecision({
      accepted,
      reasons,
      allReasons: reasons,
      rejectedRule: rejectedRule ?? (accepted ? null : reasons[0] ?? "validation_failed"),
      validationStage,
      preparationStage,
      docLen,
      inputLen,
      preparedLen: docLen,
      inputHash,
      preparedHash,
      acceptanceRepairs,
      source: pipelineSource,
      serverFullDocExists,
      serverLen: inputLen,
      recoveryCandidateLen: docLen,
      acceptedSource: accepted ? pipelineSource : null,
      rejectedReason: accepted ? null : reasons[0] ?? "validation_failed",
      requiredFactsFound: conciseQuality.requiredFactsFound,
      requiredFactsMissing: conciseQuality.requiredFactsMissing,
      freezeCandidateHash: freezeCandidateHashForLog,
      intentValidationHash: intentValidationHashForLog,
    });
  };
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
  const rejectAt = (validationStage: string, reasons: string[]) => {
    logVpaidDevFail(reasons);
    logDecision(false, reasons, validationStage, reasons[0] ?? "validation_failed");
    return { ok: false as const, reasons };
  };
  logPremiumValidationSource({
    originalIntake: rawI,
    paidDocText: t,
    draftFamily: args.draft?.agreement_family ?? null,
  });
  const dcl = rejectDevContextLeakInPremiumBody(t);
  if (!dcl.ok) {
    return rejectAt("dev_context_leak", dcl.reasons);
  }
  if (corpusHasPaidProSyntheticMalformedSectionHeadings(t)) {
    return rejectAt("section_structure_synthetic_malformed_headings", [
      "section_structure_synthetic_malformed_headings",
    ]);
  }
  const freezeCandidate = buildPaidProFreezeCandidate({
    text: t,
    draft: args.draft ?? null,
    intakeText: rawI,
    source: pipelineSource ?? "server_full_draft",
    surface: "validatePaidProOutput",
  });
  const preparedCandidateText = freezeCandidate.text;
  const validationCorpus = freezeCandidate.ok ? freezeCandidate.text : preparedCandidateText;
  const preparedStableHash = paidProPipelineAcceptedCorpusHash(preparedCandidateText);
  const validationCorpusHash = paidProPipelineAcceptedCorpusHash(validationCorpus);
  freezeCandidateHashForLog = freezeCandidate.hash ?? validationCorpusHash;
  logPaidProFreezeCandidateDecision({
    accepted: freezeCandidate.ok,
    source: pipelineSource ?? "server_full_draft",
    preparedFreezeCandidateHash: freezeCandidate.hash,
    validationInputHash: validationCorpusHash,
    validationInputMatchesPreparedFreeze:
      Boolean(preparedStableHash) && validationCorpusHash === preparedStableHash,
    rejectReason: freezeCandidate.rejectReason,
    candidateLen: preparedCandidateText.length,
  });
  let validationCorpusForGates = validationCorpus;
  if (freezeCandidate.ok) {
    const duplicationAuthority = applyPaidProCorpusDuplicationAuthority(validationCorpusForGates);
    if (duplicationAuthority.repairs.length > 0) {
      validationCorpusForGates = duplicationAuthority.text;
    }
    if (duplicationAuthority.rejected) {
      return rejectAt("paid_pro_corpus_duplication", duplicationAuthority.reasons);
    }
    if (
      serverFullDocExists &&
      validationCorpus.length < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN
    ) {
      return rejectAt("freeze_candidate_thin_vs_server_full", ["freeze_candidate_thin_vs_server_full"]);
    }
  }
  if (!freezeCandidate.ok) {
    if (!serverFullDocExists) {
      const recovery = previewRecoverPaidProFreezeCandidate({
        draft: args.draft ?? null,
        intakeText: rawI,
        surface: "validatePaidProOutput_recovery",
      });
      logPaidProFreezeCandidateDecision({
        accepted: recovery.ok,
        source: "deterministic_recovery_freeze_candidate",
        preparedFreezeCandidateHash: recovery.hash,
        validationInputHash: validationCorpusHash,
        validationInputMatchesPreparedFreeze:
          Boolean(preparedStableHash) && validationCorpusHash === preparedStableHash,
        rejectReason: recovery.rejectReason,
        candidateLen: recovery.text.length,
      });
      if (recovery.ok) {
        logDecision(
          true,
          [
            "deterministic_recovery_freeze_candidate_ok",
            freezeCandidate.rejectReason ?? "server_freeze_failed",
          ],
          "deterministic_recovery_freeze_candidate_ok",
        );
        return {
          ok: true,
          reasons: ["deterministic_recovery_freeze_candidate_ok"],
        };
      }
    } else if (substantiveServerDraft) {
      return rejectAt("paid_pro_validation", [
        freezeCandidate.rejectReason ?? "freeze_candidate_rejected",
        "substantive_server_draft_recovery_blocked",
      ]);
    }
    return rejectAt("paid_pro_validation", [
      freezeCandidate.rejectReason ?? "freeze_candidate_rejected",
    ]);
  }
  const bodyForGates = validationCorpusForGates;
  const intakeLower = rawI.toLowerCase();
  const minimumSubstance = validateProMinimumSubstance({
    text: bodyForGates,
    rawIntake: rawI,
    draft: args.draft ?? null,
    source: pipelineSource,
  });
  if (minimumSubstance.applies && !minimumSubstance.ok) {
    const reasons = minimumSubstance.missingSections.length
      ? minimumSubstance.missingSections.map((s) => `minimum_substance_missing:${s}`)
      : ["minimum_substance_failed"];
    return rejectAt("minimum_substance", reasons);
  }
  const acc = rejectPremiumBodyForProRender(bodyForGates, {
    intakeLower,
    intakeText: args.rawIntake,
    partyNames: args.draft?.parties?.map((p) => p.name) ?? null,
  });
  if (!acc.ok) {
    return rejectAt("rejectPremiumBodyForProRender", acc.reasons);
  }
  const s = rejectPaidProStitchedOrThinShell(bodyForGates, intakeLower);
  if (!s.ok) {
    if (conciseQuality.applies && conciseQuality.ok && serverFullDocExists) {
      /* concise commercial services server body — not a stitched starter shell */
    } else {
      return rejectAt("rejectPaidProStitchedOrThinShell", s.reasons);
    }
  }
  const drift = rejectProUpgradeSourceFactDrift(bodyForGates, { intakeLower });
  if (!drift.ok) {
    return rejectAt("rejectProUpgradeSourceFactDrift", drift.reasons);
  }
  if (args.intentContractMode === "base_only") {
    logDecision(true, [], "base_only_pass");
    return { ok: true, reasons: [] };
  }
  const resolvedIntentContract = resolvePaidProIntentContract({
    rawIntake: rawI,
    draftFamily: args.draft?.agreement_family ?? null,
    agreementValidation: args.agreementValidation ?? null,
  });
  const intentContractForValidation = resolvedIntentContract;
  if (intentContractForValidation) {
    const intentValidationText = freezeCandidate.ok
      ? validationCorpusForGates
      : serverFullDocExists && intakeDescribesBrandLicensingDistributionManufacturingStack(rawI)
        ? t
        : bodyForGates;
    const intentValidationHash = paidProPipelineAcceptedCorpusHash(intentValidationText);
    intentValidationHashForLog = intentValidationHash;
    const vi = validateIntentContractForPaidProOutput({
      contract: intentContractForValidation,
      text: intentValidationText,
      rawIntake: args.rawIntake,
      draftTitle: args.draft?.title,
      authoritativeProPipelineAccepted: isAuthoritativePremiumPipelineProvenance(args.premiumPipelineSource),
      agreementValidation: args.agreementValidation ?? null,
    });
    if (import.meta.env.DEV && freezeCandidate.ok) {
      const freezeHash = paidProPipelineAcceptedCorpusHash(validationCorpusForGates);
      if (freezeHash && intentValidationHash && freezeHash !== intentValidationHash) {
        // eslint-disable-next-line no-console
        console.warn("[paid-pro-intent-validation-hash-divergence]", {
          freezeCandidateHash: freezeHash,
          intentValidationHash,
        });
      }
    }
    if (!vi.ok) {
      const intentTitleCategoryFailure = vi.reasons.some((r) =>
        r.startsWith("intent:brand_licensing_title") ||
        r.startsWith("intent:design_title_requires") ||
        r.startsWith("intent:title_mismatch_category") ||
        r.startsWith("intent:generic_agreement_title"),
      );
      if (
        !intentTitleCategoryFailure &&
        conciseQuality.applies &&
        conciseQuality.ok &&
        serverFullDocExists
      ) {
        logDecision(true, ["concise_commercial_services_override"], "intent_contract_override");
        return { ok: true, reasons: [] };
      }
      return rejectAt("validateIntentContractForPaidProOutput", vi.reasons);
    }
  } else if (import.meta.env.MODE !== "test" && !args.skipFounderTitleCheck && isFounderEquityVestingIntent(args.rawIntake)) {
    const titleG = getResolvedTitleForFounderGating(
      (args.draft?.title && String(args.draft.title).trim()) || "",
      t,
    );
    if (!hasRequiredFounderPremiumTitle(titleG, t)) {
      return rejectAt("founder_premium_title_phrase_required", ["founder_premium_title_phrase_required"]);
    }
  }
  const finalConciseQuality = assessConciseCommercialServicesProQuality({
    text: bodyForGates,
    rawIntake: rawI,
    draft: args.draft ?? null,
    agreementValidation: args.agreementValidation ?? null,
  });
  if (finalConciseQuality.malformedOpening) {
    if (serverFullDocExists && freezeCandidate.ok) {
      logDecision(true, ["concise_malformed_opening_overridden_after_freeze_pass"], "final_concise_quality");
      return { ok: true, reasons: [] };
    }
    return rejectAt("concise_services_malformed_opening", ["concise_services_malformed_opening"]);
  }
  logDecision(
    true,
    finalConciseQuality.applies && finalConciseQuality.ok ? ["concise_commercial_services"] : [],
    "accepted",
  );
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
