import type { AgreementFamily } from "./agreementFamilyRouter";
import { detectAgreementFamily, isAiSoftwareInfrastructureRolloutPrompt } from "./agreementFamilyRouter";
import { getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";
import {
  enrichParsedDraftForFullDraftUpgrade,
  FULL_DRAFT_EXPANSION_MARKER,
  mergeParsedPreferRicher,
  mergePremiumParsePreferFresh,
} from "./fullDraftUpgradeEnrich";
import { pickLongestPremiumIntakeCorpus } from "./originalUserIntakeRawStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractIntakePayment } from "./intakeCurrencyParse";
import { normalizeParsedDraftLegalConcepts } from "./intakeDraftLegalNormalize";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { partyNameLooksLikeRawPrompt, tryExtractPartyPairFromPromptBlob } from "./agreementPreviewPartyLine";
import { coercePartyNameForRecipientAutoFill } from "./partyNameConfidence";
import type { IntakePartyRoleLabels } from "./partyRoleIntake";
import {
  detectPremiumCommercialSignals,
  enrichPremiumTerminationFromContext,
  evaluatePremiumDraftQuality,
  injectCoreClausesConservative,
  looksClauseGradePremiumPurpose,
  reinforcePremiumSignalPersistence,
  repairPremiumDraftAfterQualityFailure,
  resolvePremiumJurisdiction,
  synthesizePremiumScopeAndOperativeFields,
} from "./premiumDraftTransform";
import {
  buildIntakeCarryForwardBlock,
  evaluateUniversalPremiumMateriality,
  intakeHasDenseAskTargets,
  scorePremiumAskCoverage,
} from "./premiumIntakeAskCoverage";
import { elevatePremiumPaymentTermsFromIntake } from "./premiumPaymentTermsElevate";
import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { buildCheckoutPreflightAgreementPreviewText } from "./paidProCheckoutPreviewPreflightCache";
import {
  resolveCheckoutPremiumParseSubstitute,
  shouldSkipCheckoutPremiumParseBeforeFullDraft,
} from "./paidProCheckoutParseSkip";
import { ensureMaterialAsksInAdditional } from "./materialAsksMerge";
import { setPaidFunnelLastPremiumProContext } from "../../lib/experimentation/paidFunnelIntentAttribution";
import { getOrCreateLawdogSessionId } from "../../tracking/lawdogSession";
import { formatPremiumPaidCorpusRejectedMessage } from "../../lib/premiumPostCheckoutReturnUx";
import {
  proIntentMessageWhenServerFullDraftFailed,
  proIntentPlainEnglishForGate,
  resolveAgreementIntentContract,
} from "./agreementIntentContract";
import {
  buildPremiumFullDraftContextForProRequest,
  buildSanitizedPremiumFullDraftContext,
  postPremiumFullDraftOnce,
  postPremiumFullDraftWithRetry,
  type AgreementIntelligence,
  type AgreementValidationResult,
  type PremiumFullDraftResult,
} from "./premiumFullDraftApi";
import {
  logPremiumGenerationApiUnavailable,
  PREMIUM_GENERATION_DRAFT_API_PATH,
} from "./premiumGenerationApiAvailability";
import {
  buildFounderTitleRetryIntake,
  FOUNDER_AGREEMENT_DETAILS_USER_MESSAGE,
  getResolvedTitleForFounderGating,
  hasRequiredFounderPremiumTitle,
  isFounderEquityVestingIntent,
} from "./founderIntentRouter";
import {
  logDevContextLeak,
  scanPremiumOutputForDevContextLeak,
  stripDevContextMarkersForModelRetry,
} from "./premiumOutputDevContextGuard";
import {
  buildPaidProValidationDiagnostics,
  rejectPremiumBodyForProRender,
  rejectPremiumDegradedFiller,
  stripClientPremiumArtifactBlocksFromDraft,
} from "./premiumFullDraftClientAcceptance";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";
import { gapTraceNeedlesHit } from "./gapTraceNeedles";
import { logPremiumCompletionDebug } from "./premiumCompletionDebugLog";
import { logPremiumNetworkClassification } from "./premiumNetworkClassification";
import {
  repairKnownPartyPlaceholders,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import {
  extractPremiumApiServerCorpusText,
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import {
  clearPremiumParseSessionGuard,
  markPremiumAuthoritativeServerCorpusAccepted,
} from "./premiumParseSessionGuard";
import { normalizePremiumFullDraftResponsePayload } from "./premiumFullDraftResponseNormalization";
import { logDevPostPremiumFullDraftPipelineReturn } from "./premiumFullDraftPostResponseTrace";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  isCommercialServicesIntake,
} from "./agreementIntentContract";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  countNumberedAgreementSections,
  MUTUAL_CONSULTING_LIGHTWEIGHT_SECTION_CEILING,
} from "./paidProMutualConsultingQualityFloor";
import { canShowPremiumSuccess } from "./premiumSuccessGate";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "./paidProAuthorityConstants";
import { buildPremiumPostCheckoutStitchedBody } from "./premiumCheckoutStitchedBody";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  ensurePaidProPerformanceTrace,
  readActivePaidProPerformanceTrace,
  paidProPerfSpanStart,
  paidProPerfSpanEnd,
  paidProPerfRecordInstant,
  paidProPerfRecordE2ePhase,
  finishPaidProPerformanceWaterfall,
} from "./paidProPerformanceTrace";
import {
  resolveAuthoritativePaidProAgreementFamily,
  applyAuthoritativeFamilyToDraft,
} from "./paidProAgreementFamilyAuthority";
import {
  recordPremiumFullDraftCall,
  assertAtMostOneCheckoutPremiumGenerationCall,
  type PremiumGenerationCallReason,
} from "./paidProPremiumGenerationCallAudit";
import { logPremiumSecondGenerationTriggered } from "./paidProSecondGenerationTriggerLog";
import {
  logDraftingStubOriginsFromText,
  logOrgPlaceholderOriginsFromText,
  logPaidProEntityMap,
} from "./paidProPlaceholderAttributionLog";
import {
  buildPaidProJsonParseDegradedDiagnostics,
  logPaidProJsonParseDegradedDiagnostics,
} from "./paidProJsonParseDegradedDiagnostics";
import { shouldSkipPremiumStructuralRetryForDegradedDisplay } from "./paidProPostCheckoutRenderGate";
import { markPaidProAuthoritativeValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import type { PremiumNetworkCallReason } from "./paidProPremiumGenerationCallAudit";
import { logPremiumSessionConsistency } from "./premiumSessionDiagnostics";
import { logPremiumGenerationRetryableFailure } from "./premiumGenerationRetryable";
import { resolvePremiumIntentPreflightPolicy, shouldEarlyNeedsDetailsForTierB } from "./premiumIntentPreflightPolicy";
import {
  finalizeUserVisibleAgreementPlainText,
  repairContextualDraftingStubPhrases,
  resolvePlaceholderPartyNamesWithMeta,
} from "./agreementTemplatePlaceholderSafety";
import {
  intakeHasFullLegalEntityParties,
  resolveCanonicalPartyIdentitiesFromSources,
} from "./canonicalPartyIdentityResolver";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { markPaidProLocalPostProcessingEndAt } from "./paidProQaPerfTrace";
import { adaptPremiumFullDraftToProIntelligencePacket } from "./proAgreementIntelligence";
import {
  extractJointVentureEconomicsAnchors,
  isJointVentureEconomicsIntake,
} from "./proOperationalSynthesis";
import {
  buildMaterialMissingItems,
  isCatastrophicStructuralFailure,
  type MaterialMissingItem,
} from "./proAgreementCompleteness";
import {
  detectHeadingOnlyClauses,
  detectPlaceholderLeakage,
  detectSpliceContamination,
  detectStructuralNumberingIssues,
} from "./proAgreementCompleteness/proStructuralDetection";
import {
  buildRecommendedClarifications,
  isAuthoritativePremiumCompletionOutcome,
  legacyGenerationOutcomeFromClassification,
} from "./agreementOutputQuality";
import {
  buildPremiumRecipientCandidatesFromIntake,
  classifyLongPremiumHttpOutcome,
  countStructuralFatals,
  freezeAcceptedPremiumBodyForSession,
  getFrozenPremiumBodyForSession,
  isLongCommerciallyUsablePremiumBody,
  isNonfatalParseDegradedPaidAccept,
  logPremiumAcceptanceDecision,
  partyPlaceholderRepairYieldsAuthoritativePaidBody,
  premiumBodyHasRequiredPaidSections,
  resolvePremiumBodyAgainstSessionFreeze,
  serverFullDocumentWinsOverClientGates,
  shouldPreserveLongPremiumDespiteSoftGateFailure,
  shouldSuppressShortFallbackOverLongCandidate,
} from "./premiumAcceptancePolicy";
import type { PremiumCompletionOutcome, RecommendedClarifications } from "./agreementOutputQuality/types";

export type PremiumCompletionInput = {
  intakeText: string;
  structuredDraft: ParsedDraftShape;
  /** Longest preserved home-path prompt (ex upgrade-notes block); drives merge thin-parse guards. */
  originalUserIntakeRawForMerge?: string | null;
  agreementFamily?: AgreementFamily | null;
  guidedFlowId?: string | null;
  simpleProductFlow: boolean;
  partyRoleLabels: IntakePartyRoleLabels;
  parseDraft: (raw: string) => Promise<ParsedDraftShape>;
  /** One-field user completion from the pre-finalization “Finish your agreement” step; sent to premium full-draft. */
  userGapAnswers?: string | null;
  /** True if the user skipped the gap step and accepted neutral defaults for open items. */
  gapResolverSkippedWithDefaults?: boolean;
  agreementGenerationId?: string;
  /** Persisted agreement workspace id (distinct from session generation id). */
  agreementId?: string | null;
  premiumRequestIntakeFingerprint?: string;
  isPremiumRequestStillValid?: () => boolean;
  /** Why premium-full-draft is being invoked (checkout vs explicit retry). */
  premiumGenerationCallReason?: PremiumGenerationCallReason;
  /** When true, waterfall finishes after review surface visible (checkout path). */
  deferWaterfallFinish?: boolean;
};

export type PremiumRecipientCandidate = { name: string; email: string; role: string };

export type PremiumRenderSource =
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
  | "premium_network_local_recovery"
  | "premium_degraded_server_local_recovery"
  | "premium_generation_retryable";

export type PremiumCompletionResult = {
  premiumDraft: ParsedDraftShape;
  premiumParties: { name: string; role: string }[];
  recipientCandidates: PremiumRecipientCandidate[];
  /** Authoritative post-gate winning premium paper corpus for readonly rendering. */
  winningPremiumBodyText: string;
  /** Where `winningPremiumBodyText` came from (for QA / observability). */
  premiumRenderSource: PremiumRenderSource;
  /** After premium full draft only; null if not run, skipped, or failed. */
  premiumReview: PremiumAgreementReview | null;
  /** After premium final document; null if not run, skipped, or failed. */
  premiumFinalizeAudit: PremiumFinalizeAudit | null;
  /** Final decision layer for send/review/fix recommendation. */
  premiumReviewRoute: PremiumReviewRoute | null;
  /** True when the request was dropped because intake/generation changed during async work. */
  staleIntakeOrGeneration?: boolean;
  /** Echo of request context for DEV trace. */
  agreementGenerationId?: string;
  /** Echo of the intake fingerprint when the run started. */
  premiumRequestIntakeFingerprint?: string;
  /** Set when founder-equity intent could not be satisfied with a professional title after one retry. */
  founderDetailsGateMessage?: string | null;
  /** Set when a recognized Pro intent can't be satisfied (server failure, validation, or quality). */
  proIntentGateMessage?: string | null;
  /** DEV-only trace helper for Tier A pipeline misses. */
  tierADiagnostic?: {
    enabled: boolean;
    backendReturnedDocumentText: boolean;
    backendDocumentTextLen: number;
    backendGenerationOutcome: string;
    schemaValidationReasons: string[];
    serverTextClearedBeforeMerge: boolean;
    serverTextClearReason: string;
    staleOrFingerprintMismatch: boolean;
    premiumPipelineSource: PremiumRenderSource;
  };
  /** When the API returned 200 with a non-model structured fallback (checkout still valid). */
  serverGenerationDegraded?: { code: string; message: string } | null;
  /** Transient browser/network failure during premium-full-draft — free draft must stay visible; retry in modal. */
  premiumNetworkRetryable?: boolean;
  /** Local stitched Pro draft shown after network failure until server retry succeeds. */
  premiumNetworkLocalRecovery?: boolean;
  /** HTTP 200 degraded/rejected server corpus — retry Pro draft without re-checkout. */
  premiumDegradedServerRecoverable?: boolean;
  /** Local stitched Pro draft after rejected degraded server corpus until server retry succeeds. */
  premiumDegradedServerLocalRecovery?: boolean;
  /** Recoverable server generation failure (e.g. airlock_blocked with empty document) — retry in modal. */
  premiumGenerationRetryable?: boolean;
  /** Client classification after output-quality pipeline (authoritative vs advisory clarifications). */
  premiumCompletionOutcome?: PremiumCompletionOutcome | null;
  /** Non-authoritative clarifications surfaced outside agreement body. */
  recommendedClarifications?: RecommendedClarifications | null;
  /** True only for malformed/empty/corrupt bodies — not material Ask LawDog items alone. */
  structuralCatastrophic?: boolean;
  /** Structured material questions for Ask LawDog to revise. */
  materialMissingItems?: MaterialMissingItem[];
  /** First-stage OpenAI semantic extraction; passive for now. */
  agreementIntelligence?: AgreementIntelligence | null;
  /** Deterministic validation; passive for now. */
  agreementValidation?: AgreementValidationResult | null;
};

const dualTrackStats: { A: number; B: number } = { A: 0, B: 0 };

export function resetPremiumDualTrackStats(): void {
  dualTrackStats.A = 0;
  dualTrackStats.B = 0;
}

export function getPremiumDualTrackStats(): { A: number; B: number } {
  return { ...dualTrackStats };
}

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

/** Must match premium checkout merge in AgreementBuilderIntake (Stripe return path). */
export const PREMIUM_EXACT_WORDING_MARKER_LINE = "--- Complete Version: exact wording / notes to apply ---";

export function extractPremiumUserUpgradeNotes(rawIntake: string): string {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n");
  const idx = raw.indexOf(PREMIUM_EXACT_WORDING_MARKER_LINE);
  if (idx < 0) return "";
  return raw.slice(idx + PREMIUM_EXACT_WORDING_MARKER_LINE.length).trim();
}

/** Strip the exact-wording / upgrade-notes tail so merge guards key off the original commercial corpus. */
export function stripPremiumUserNotesFromMergedIntake(text: string): string {
  const raw = (text || "").replace(/\r\n/g, "\n");
  const idx = raw.indexOf(PREMIUM_EXACT_WORDING_MARKER_LINE);
  if (idx < 0) return raw.trim();
  return raw.slice(0, idx).trim();
}

/** Append delimiter + user notes when notes are not already present in base intake. */
export function buildPremiumMergedIntakeWithUserNotes(baseIntake: string, userNotes: string): string {
  const base = (baseIntake || "").trim();
  const u = (userNotes || "").trim();
  if (!u) return base;
  if (base.includes(u)) return base;
  return `${base}\n\n${PREMIUM_EXACT_WORDING_MARKER_LINE}\n${u}`;
}

/** Strip internal markers and bracket tags (never user-visible on premium path). */
export function stripPremiumInternalArtifacts(text: string): string {
  let t = (text || "").replaceAll(FULL_DRAFT_EXPANSION_MARKER, "");
  t = t.replace(/\[(?:claw)[^\]]+\]/gi, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function dedupeNonEmptyLines(block: string): string {
  const lines = block.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (!key) {
      out.push(line);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function upgradeWeakCommercialLanguage(text: string): string {
  let t = text;
  t = t.replace(/\beconomics?\s+and\s+fees\s+to\s+be\s+described\b/gi, "Compensation shall be agreed upon by the Parties and set forth in this Agreement.");
  t = t.replace(/\bto\s+be\s+described\b/gi, "as set forth in this Agreement");
  t = t.replace(/\bto\s+be\s+refined\s+in\s+review\b/gi, "as set forth in this Agreement");
  t = t.replace(/\bfor\s+further\s+description\b/gi, "as set forth herein");
  return t;
}

function alignTitleWithCanonical(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (parsed.agreement_family === "operating_agreement") return parsed;
  const raw = rawIntake.trim();
  if (raw.length < 8) return parsed;
  const current = (parsed.title || "").trim();
  if (
    /\breferral\b/i.test(current) &&
    /\b(agreement|commission|channel|partner|business development)\b/i.test(current) &&
    !/^business agreement$/i.test(current)
  ) {
    return parsed;
  }
  const canon = getCanonicalAgreementTypeForCreate(raw, buildLiveDraftPreview(raw));
  const headline = (canon.headline || "").trim();
  if (!headline) return parsed;
  return { ...parsed, title: headline };
}

function familyTitleFallback(family: AgreementFamily): string {
  switch (family) {
    case "consulting_agreement":
      return "Consulting Agreement";
    case "independent_contractor_agreement":
      return "Independent Contractor Agreement";
    case "services_agreement":
      return "Services Agreement";
    case "nda":
      return "Mutual Non-Disclosure Agreement";
    case "confidentiality_commercial_protections_agreement":
      return "Confidentiality and Commercial Protections Agreement";
    case "operating_agreement":
      return "Limited Liability Company Operating Agreement";
    case "generic_business_agreement":
      return "Business Agreement";
    default:
      return "Business Agreement";
  }
}

function isNdaCommercialHybridPrompt(rawIntake: string): boolean {
  const low = (rawIntake || "").toLowerCase();
  const confidentiality = /\b(nda|confidential|non[-\s]?disclosure)\b/.test(low);
  if (!confidentiality) return false;
  return /\b(ownership|ip|intellectual\s+property|invention|work\s+product|non[-\s]?solicit|no[-\s]?hire|poach|non[-\s]?circumvent|contractor|services?|collaboration|referral|introductions?|commission|customer\s+list|crm|lead\s+data|pilot|trial|evaluation)\b/.test(
    low,
  );
}

function sparseSignalCount(rawIntake: string): number {
  const s = detectPremiumCommercialSignals(rawIntake);
  return [
    s.commission,
    s.clawback,
    s.reimbursement,
    s.ownershipData,
    s.adCompliance,
    s.exclusivity,
    s.nonsolicit,
    s.noncircumvent,
    s.termRenewal,
    s.terminationCause,
    s.disputeArbitration,
    s.confidentiality,
    s.referralChannel,
    s.contractorServices,
    s.collaborationPilot,
  ].filter(Boolean).length;
}

function isSparsePrompt(rawIntake: string): boolean {
  const t = (rawIntake || "").trim();
  if (t.length < 170) return true;
  return sparseSignalCount(t) <= 3;
}

function applyHardFamilyLocks(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const low = (rawIntake || "").toLowerCase();
  if (isAiSoftwareInfrastructureRolloutPrompt(rawIntake)) {
    const title =
      (parsed.title || "").trim() &&
      !/confidentiality\s+and\s+commercial\s+protections/i.test(parsed.title || "")
        ? parsed.title
        : "Multi-Party Technology Services and Implementation Agreement";
    return {
      ...parsed,
      agreement_family: "services_agreement",
      title: title || "Multi-Party Technology Services and Implementation Agreement",
    };
  }
  const confidentiality = /\b(nda|confidential|non[-\s]?disclosure)\b/.test(low);
  const ownership = /\b(ownership|ip|intellectual\s+property|invention|work\s+product|customer\s+list|crm|lead\s+data)\b/.test(low);
  if (confidentiality && ownership) {
    return {
      ...parsed,
      agreement_family: "confidentiality_commercial_protections_agreement",
      title: "Confidentiality and Commercial Protections Agreement",
    };
  }
  if (
    /\bconfidential|nda|non[-\s]?disclosure\b/.test(low) &&
    !/\bmarketing|campaign|lead\s+gen|media\s+buy|ad\s+ops\b/.test(low)
  ) {
    return { ...parsed, agreement_family: parsed.agreement_family === "confidentiality_commercial_protections_agreement" ? parsed.agreement_family : "nda" };
  }
  if (
    !/\bconfidential|nda|non[-\s]?disclosure\b/.test(low) &&
    !/\bno\s+service\s+scope\b/.test(low) &&
    /\bagency|services?|pharma|approval|claims?\b/.test(low) &&
    !/\bindependent\s+contractor|contractor|1099|freelance\b/.test(low)
  ) {
    return { ...parsed, agreement_family: "services_agreement" };
  }
  return parsed;
}

function applyHardTitleLocks(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const low = (rawIntake || "").toLowerCase();
  if (/\bconfidential|nda|non[-\s]?disclosure\b/.test(low) && /\b(ownership|invention|intellectual\s+property|work\s+product|crm|lead\s+data)\b/.test(low)) {
    return { ...parsed, title: "Confidentiality and Commercial Protections Agreement" };
  }
  if (
    !/\bconfidential|nda|non[-\s]?disclosure\b/.test(low) &&
    !/\bno\s+service\s+scope\b/.test(low) &&
    /\bagency|services?|pharma|approval|claims?\b/.test(low) &&
    !/\bindependent\s+contractor|contractor|1099|freelance\b/.test(low)
  ) {
    return { ...parsed, title: "Services Agreement" };
  }
  if ((parsed.agreement_family === "nda" || /\bconfidential|nda|non[-\s]?disclosure\b/.test(low)) && /marketing services/i.test(parsed.title || "")) {
    return { ...parsed, title: "Confidentiality Agreement" };
  }
  return parsed;
}

function buildSparseExpansionPack(family: AgreementFamily, _rawIntake: string): string {
  const schedule = "Where commercial details are unspecified, use 'as specified in Schedule A'.";
  if (family === "nda" || family === "confidentiality_commercial_protections_agreement") {
    return [
      "Sparse-prompt premium expansion (NDA default pack):",
      "• Confidential Information: define non-public information categories and permitted use strictly for the evaluation/relationship purpose.",
      "• Exclusions and compelled disclosure: standard public-domain, prior-knowledge, independent-development, and legal-compulsion carve-outs.",
      "• Safeguards and return/destruction: reasonable protection standards plus return or certified destruction on request/termination.",
      "• Non-use and reverse-use restrictions: no reverse engineering or competing use of disclosed materials.",
      "• Remedies and survival: injunctive relief language plus survival period for confidentiality obligations.",
      "• Dispute and venue: escalation path and venue/governing law framework.",
      "• Execution and signatures: authorized signers, title, and date lines are included for both Parties.",
      `• ${schedule}`,
    ].join("\n");
  }
  if (family === "independent_contractor_agreement") {
    return [
      "Sparse-prompt premium expansion (Contractor default pack):",
      "• Independent contractor status: no employment relationship, tax withholding, or benefits obligations.",
      "• No authority to bind: contractor has no authority to bind the company, alter pricing, or make guarantees unless expressly authorized in writing.",
      "• Scope and deliverables: milestones, acceptance criteria, and revision process in Schedule A.",
      "• Fees and invoicing: invoice cadence, payment timing, and late-payment handling.",
      "• IP/work product and licenses: ownership assignment of agreed deliverables and retained pre-existing tools.",
      "• Compliance and confidentiality: lawful performance and protection of non-public information.",
      "• Termination and transition: termination rights, cure periods, and handoff obligations.",
      "• Execution and signatures: authorized representatives execute with name, title, and date.",
      `• ${schedule}`,
    ].join("\n");
  }
  return [
    "Sparse-prompt premium expansion (Services default pack):",
    "• Scope and change-order process: baseline services, assumptions, and formal change approvals.",
    "• No unauthorized promises: provider may not make misleading claims or commitments outside approved statements and contract scope.",
    "• Fees, payment, and expense controls: fee structure, invoice deadlines, dispute windows, and reimbursable expense rules.",
    "• Ownership and use rights: ownership of deliverables/data and license boundaries for pre-existing materials.",
    "• Liability and indemnity framework: balanced allocation with carve-outs as permitted by law.",
    "• Term, termination, and post-termination obligations: convenience/cause triggers and transition requirements.",
    "• Dispute resolution and governing law: escalation path and venue framework.",
    "• Execution and signatures: signature blocks and date lines for authorized representatives.",
    `• ${schedule}`,
  ].join("\n");
}

function applySparseDefaultExpansion(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (!isSparsePrompt(rawIntake)) return parsed;
  const fam = parsed.agreement_family ?? detectAgreementFamily(rawIntake);
  const pack = buildSparseExpansionPack(fam, rawIntake);
  const add = nz(parsed.additional_terms);
  return {
    ...parsed,
    additional_terms: add ? `${add}\n\n${pack}` : pack,
  };
}

function inferPremiumTitle(parsed: ParsedDraftShape, rawIntake: string): string {
  const t = nz(parsed.title).replace(/^review:\s*/i, "");
  const signals = detectPremiumCommercialSignals(rawIntake);
  const low = rawIntake.toLowerCase();
  const referralHeavy =
    signals.referralChannel ||
    /\b(referral|channel\s+partner|introduced?\s+accounts?|sourced\s+deals?|business\s+development|growth\s+partner)\b/.test(low);
  const contractorHeavy = signals.contractorServices || /\bindependent\s+contractor|contractor|1099|freelance\b/.test(low);
  const confidentialityHybrid = signals.confidentiality && (referralHeavy || signals.ownershipData || signals.adCompliance);
  const commercialHybridFamily = parsed.agreement_family === "confidentiality_commercial_protections_agreement";
  const serviceHeavy =
    signals.commission ||
    signals.exclusivity ||
    signals.ownershipData ||
    signals.reimbursement ||
    signals.adCompliance;
  const strongReferralTitle =
    /\breferral\b/.test(t.toLowerCase()) &&
    /\b(agreement|commission|channel|partner|business development)\b/.test(t.toLowerCase()) &&
    !/\b(payment plan|business agreement|agreement)\b$/i.test(t);
  if (strongReferralTitle && referralHeavy) {
    return t;
  }
  if (t && t.length >= 4 && !/^agreement$/i.test(t)) {
    if (isNdaCommercialHybridPrompt(rawIntake)) {
      if (referralHeavy) return "Confidentiality and Referral Protection Agreement";
      if (signals.contractorServices || /\bcollaborat|pilot|trial|evaluation|services?\b/.test(low)) {
        return "Mutual Confidentiality and Collaboration Agreement";
      }
      return "Confidentiality and Commercial Protections Agreement";
    }
    if (commercialHybridFamily) {
      if (referralHeavy) return "Confidentiality and Referral Protection Agreement";
      if (signals.contractorServices || /\bcollaborat|pilot|trial|evaluation|services?\b/.test(low)) {
        return "Mutual Confidentiality and Collaboration Agreement";
      }
      return "Confidentiality and Commercial Protections Agreement";
    }
    if (referralHeavy && /\bbusiness agreement\b/i.test(t)) return "Business Development Agreement";
    if (contractorHeavy && !/contractor/i.test(t)) return "Independent Contractor Agreement";
    if (confidentialityHybrid && /confidentiality|nda|non[-\s]?disclosure/i.test(t)) return "Confidentiality and Referral Agreement";
    if (/confidentiality|non[-\s]?disclosure|nda/i.test(t) && serviceHeavy) {
      return "Marketing Services Agreement";
    }
    return t;
  }
  const family = parsed.agreement_family ?? detectAgreementFamily(rawIntake);
  if (family === "confidentiality_commercial_protections_agreement") {
    if (referralHeavy) return "Confidentiality and Referral Protection Agreement";
    if (signals.contractorServices || /\bcollaborat|pilot|trial|evaluation|services?\b/.test(low)) {
      return "Mutual Confidentiality and Collaboration Agreement";
    }
    return "Confidentiality and Commercial Protections Agreement";
  }
  if (family === "nda" && signals.confidentiality) return "Confidentiality Agreement";
  if (referralHeavy && confidentialityHybrid) return "Confidentiality and Referral Agreement";
  if (referralHeavy && /\bchannel\b/.test(low)) return "Channel Partner Agreement";
  if (referralHeavy) return "Business Development Agreement";
  if (contractorHeavy) return "Independent Contractor Agreement";
  if (serviceHeavy && family === "nda") return "Marketing Services Agreement";
  if (serviceHeavy && /\bmarketing|campaign|ad\s+accounts?|lead\s+gen|growth\b/.test(low)) return "Marketing Services Agreement";
  return familyTitleFallback(family);
}

function protectionSignalsPresent(text: string): number {
  const t = (text || "").toLowerCase();
  const checks = [
    /\bcommission|%\s*(?:of\s+)?(?:sales|revenue|net|gross)\b/,
    /\bclawback|refund|reversal|chargeback\b/,
    /\breimburs|pre-?approved\s+expenses?\b/,
    /\bownership|lead|crm|data|work\s+product|intellectual\s+property\b/,
    /\bcompliance|approval|misleading|ftc|claims?\b/,
    /\bexclusive|exclusivity|territory|qualified\s+leads?\b/,
    /\bnon[-\s]?solicit\b/,
    /\bnon[-\s]?circumvent|anti[-\s]?bypass|bypass\b/,
    /\bterm|renew|auto[-\s]?renew\b/,
    /\btermination|for\s+cause|fraud|criminal|brand\s+damage|material\s+breach\b/,
    /\bdispute|arbitrat|governing\s+law|jurisdiction\b/,
    /\bconfidential|non[-\s]?disclosure|nda\b/,
  ];
  return checks.reduce((n, re) => (re.test(t) ? n + 1 : n), 0);
}

function extractEconomicAnchors(rawIntake: string): string[] {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const units = raw.includes("\n")
    ? raw.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    : raw.split(/(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of units) {
    if (
      !/\$|%\s*(?:of\s+)?(?:sales|revenue|net|gross)|commission|retainer|monthly|milestone|net[-\s]?\d+|profit\s+split|waterfall|preferred\s+return|capital\s+calls?/i.test(
        line,
      )
    ) {
      continue;
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line.length > 320 ? `${line.slice(0, 317)}…` : line);
    if (out.length >= 6) break;
  }
  return out;
}

function applyJointVentureEconomicsExpansion(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (!isJointVentureEconomicsIntake(rawIntake)) return parsed;
  const anchors = extractJointVentureEconomicsAnchors(rawIntake);
  if (!anchors.length) return parsed;
  const marker = "Joint venture economics carried forward from intake";
  let next = { ...parsed };
  const add = nz(next.additional_terms);
  if (!add.toLowerCase().includes(marker.toLowerCase())) {
    const block = [`${marker} (edit before send):`, "", ...anchors.map((a, i) => `${i + 1}. ${a}`)].join("\n");
    next = { ...next, additional_terms: add ? `${add}\n\n${block}` : block };
  }
  const pay = nz(next.payment_terms);
  if (
    !/\bprofit\s+split|waterfall|preferred\s+return|capital\s+calls?|50\s*\/\s*50\b/i.test(pay) ||
    /\beconomics to be agreed\b/i.test(pay)
  ) {
    const econ = anchors.filter((a) =>
      /\bprofit\s+split|waterfall|preferred\s+return|pref(?:erred)?\s+equity|\$\d|capital\s+calls?|50\s*\/\s*50\b/i.test(a),
    );
    if (econ.length) {
      next = {
        ...next,
        payment_terms: `Joint venture economics (confirm in Schedule A): ${econ.join(" ")}`,
      };
    }
  }
  return next;
}

/**
 * Last-line guard: premium (3b) parse is often richer than post-transform five-slot fields.
 * If merged draft lost most of the parse corpus, restore payment and/or append purpose to additional_terms.
 */
function mergePremiumParseSubstanceBackstop(merged: ParsedDraftShape, premiumParse: ParsedDraftShape): ParsedDraftShape {
  let next = { ...merged };
  const pPay = nz(premiumParse.payment_terms);
  const mPay = nz(next.payment_terms);
  if (pPay.length >= 72 && mPay.length < Math.min(48, Math.floor(pPay.length * 0.4))) {
    next = { ...next, payment_terms: pPay };
  }
  const pPurpose = nz(premiumParse.purpose);
  const mPurpose = nz(next.purpose);
  const mAdd = nz(next.additional_terms);
  if (pPurpose.length < 380 || !looksClauseGradePremiumPurpose(pPurpose)) return next;
  const head = pPurpose.slice(0, 220).trim().toLowerCase().replace(/\s+/g, " ");
  if (head.length < 70) return next;
  const corpus = `${mPurpose}\n${mAdd}`.toLowerCase();
  if (corpus.includes(head.slice(0, Math.min(120, head.length)))) return next;
  const block = `Premium generation detail (edit before send):\n\n${pPurpose}`;
  next = { ...next, additional_terms: mAdd ? `${mAdd}\n\n${block}` : block };
  return next;
}

function enforceEconomicsSafety(draft: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const rawHasEconomics = /\$|%\s*(?:of\s+)?(?:sales|revenue|net|gross)|commission|retainer|monthly|milestone/i.test(rawIntake);
  const pay = nz(draft.payment_terms);
  if (rawHasEconomics) return draft;
  if (!/\$|%\s*(?:of\s+)?(?:sales|revenue|net|gross)|commission|retainer|monthly|milestone/i.test(pay)) return draft;
  return {
    ...draft,
    payment_terms:
      "Compensation terms require confirmation by the Parties and should be set out in Schedule A before signature.",
  };
}

function applyRawIntentPremiumBoost(draft: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  let next = draft;
  if (isJointVentureEconomicsIntake(rawIntake)) {
    next = applyJointVentureEconomicsExpansion(next, rawIntake);
  }
  const signals = detectPremiumCommercialSignals(rawIntake);
  const blocks: string[] = [];
  const anchors = extractEconomicAnchors(rawIntake);
  if (anchors.length) {
    blocks.push(`Economics preserved from intake (confirm in Schedule A):\n${anchors.map((a) => `- ${a}`).join("\n")}`);
  }
  if (isJointVentureEconomicsIntake(rawIntake)) {
    blocks.push(
      "Joint venture / profit-share structure: preserve waterfall, preferred return, profit split, capital call notice/cure, deadlock resolution, and confidentiality on underwriting materials without inventing new fund mechanics.",
    );
  }
  if (signals.ownershipData) {
    blocks.push(
      "Ownership / IP / data: discloser or client ownership of work product, inventions, customer lists, CRM records, and lead data is preserved unless expressly licensed in writing.",
    );
  }
  if (signals.adCompliance) {
    blocks.push(
      "Compliance controls: externally-facing claims require written approval and must comply with applicable advertising and consumer-protection standards.",
    );
  }
  if (signals.nonsolicit) {
    blocks.push(
      "Non-solicit / no-hire: neither Party may solicit, recruit, or hire the other Party’s employees, contractors, or key team members during the term and agreed tail period.",
    );
  }
  if (signals.noncircumvent || signals.referralChannel) {
    blocks.push(
      "Non-circumvent: introduced counterparties and protected opportunities may not be bypassed to avoid agreed economics during the protection period.",
    );
  }
  if (signals.terminationCause) {
    blocks.push(
      "Termination for cause: immediate rights apply for fraud, criminal conduct, reputational harm, or uncured material breach.",
    );
  }
  if (signals.disputeArbitration || signals.confidentiality) {
    blocks.push("Dispute and remedies: confidentiality misuse supports equitable relief, and disputes proceed in the agreed venue/jurisdiction after good-faith escalation.");
  }
  if (!blocks.length) return next;
  const add = nz(next.additional_terms);
  const boosted = `Raw-intent premium protections\n\n${blocks.map((b) => `• ${b}`).join("\n")}`;
  return { ...next, additional_terms: add ? `${add}\n\n${boosted}` : boosted };
}

function scorePremiumCandidate(
  draft: ParsedDraftShape,
  rawIntake: string,
  baseFreeSignals: number,
): { score: number; reason: string } {
  const title = nz(draft.title).toLowerCase();
  const corpus = `${nz(draft.purpose)}\n${nz(draft.payment_terms)}\n${nz(draft.additional_terms)}\n${nz(draft.termination_summary)}`.toLowerCase();
  const signals = detectPremiumCommercialSignals(rawIntake);
  const requestedSignals = [
    signals.commission,
    signals.clawback,
    signals.reimbursement,
    signals.ownershipData,
    signals.adCompliance,
    signals.exclusivity,
    signals.nonsolicit,
    signals.noncircumvent,
    signals.termRenewal,
    signals.terminationCause,
    signals.disputeArbitration,
    signals.confidentiality,
  ].filter(Boolean).length;
  const preservedSignals = [
    /\bcommission|%\s*(?:of\s+)?(?:sales|revenue|net|gross)\b/.test(corpus),
    /\bclawback|refund|reversal|chargeback\b/.test(corpus),
    /\breimburs|pre-?approved\s+expenses?\b/.test(corpus),
    /\bownership|lead|crm|data|work\s+product|intellectual\s+property|invention\b/.test(corpus),
    /\bcompliance|approval|misleading|ftc|claims?\b/.test(corpus),
    /\bexclusive|exclusivity|territory|qualified\s+leads?\b/.test(corpus),
    /\b(?:non[-\s]?solicit|anti[-\s]?solicit|no[-\s]?hire)\b/.test(corpus),
    /\b(?:non[-\s]?circumvent|anti[-\s]?circumvention|anti[-\s]?bypass|bypass)\b/.test(corpus),
    /\bterm|renew|auto[-\s]?renew\b/.test(corpus),
    /\btermination|for\s+cause|fraud|criminal|material\s+breach|brand\s+harm\b/.test(corpus),
    /\bdispute|arbitrat|governing\s+law|jurisdiction|venue\b/.test(corpus),
    /\bconfidential|non[-\s]?disclosure|nda\b/.test(corpus),
  ].filter(Boolean).length;
  const titleSpecificity = /^(agreement|business agreement)$/i.test(title) ? 0 : 1;
  const protections = protectionSignalsPresent(corpus);
  const delta = protections - baseFreeSignals;
  const lengthFloor = corpus.length >= 1000 ? 1 : 0;
  const clarity = /\bshall|must|will\b/.test(corpus) && !/\bto be agreed\b/.test(corpus) ? 1 : 0;
  const sparse = isSparsePrompt(rawIntake);
  const sparseStructure =
    /\bscope\b/.test(corpus) &&
    /\bpayment|fee|invoice\b/.test(corpus) &&
    /\btermination\b/.test(corpus) &&
    /\bdispute|jurisdiction|governing law|venue\b/.test(corpus)
      ? 1
      : 0;
  const requestedRatio = requestedSignals ? preservedSignals / requestedSignals : 1;
  const askCov = scorePremiumAskCoverage(rawIntake, corpus);
  const askCovPts = askCov.total >= 5 ? Math.round(Math.min(24, askCov.ratio * 24)) : 0;
  const score =
    titleSpecificity * 15 +
    Math.min(30, protections * 3) +
    Math.min(20, Math.round(requestedRatio * 20)) +
    (delta >= 3 ? 20 : Math.max(0, delta * 5)) +
    lengthFloor * 10 +
    clarity * 5 +
    askCovPts +
    (sparse ? sparseStructure * 12 + (corpus.length >= 1200 ? 8 : 0) : 0);
  return {
    score,
    reason: `title=${titleSpecificity};requested=${preservedSignals}/${requestedSignals};protections=${protections};delta=${delta};len=${corpus.length};sparse=${sparse ? 1 : 0};ask=${askCov.covered}/${askCov.total}`,
  };
}

function lexicalSimilarity(a: string, b: string): number {
  const ta = (a || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const tb = (b || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union ? inter / union : 0;
}

function preserveSpecificPartyRoles(
  draft: ParsedDraftShape,
  preferred: Array<{ role: string }> | undefined,
): ParsedDraftShape {
  const current = draft.parties || [];
  const pref = preferred || [];
  if (!current.length || !pref.length) return draft;
  const currentSpecific = current.some((p) => nz(p.role).toLowerCase() !== "party");
  if (currentSpecific) return draft;
  const prefSpecific = pref.some((p) => nz(p.role).toLowerCase() !== "party");
  if (!prefSpecific) return draft;
  const parties = current.map((p, i) => {
    const role = nz(pref[i]?.role);
    if (!role || role.toLowerCase() === "party") return p;
    return { ...p, role };
  });
  return { ...draft, parties };
}

function meetsPremiumSubstanceFloor(draft: ParsedDraftShape, rawIntake: string): { ok: boolean; missing: string[] } {
  const sig = detectPremiumCommercialSignals(rawIntake);
  const corpus = `${nz(draft.title)}\n${nz(draft.purpose)}\n${nz(draft.payment_terms)}\n${nz(draft.additional_terms)}\n${nz(draft.termination_summary)}`.toLowerCase();
  const missing: string[] = [];
  if (corpus.length < 1100) missing.push("final_len_short");
  if (sig.commission && !/\bcommission|%\s*(?:of\s+)?(?:sales|revenue|net|gross)\b/.test(corpus)) missing.push("commission");
  if (sig.clawback && !/\bclawback|refund|reversal|chargeback\b/.test(corpus)) missing.push("clawback");
  if (sig.reimbursement && !/\breimburs|pre-?approved\s+expenses?\b/.test(corpus)) missing.push("reimbursement");
  if (sig.ownershipData && !/\bownership|lead|crm|data|work\s+product|intellectual\s+property\b/.test(corpus)) missing.push("ownership_data");
  if (sig.adCompliance && !/\bcompliance|approval|misleading|ftc|claims?\b/.test(corpus)) missing.push("ad_compliance");
  if (sig.exclusivity && !/\bexclusive|exclusivity|territory|qualified\s+leads?\b/.test(corpus)) missing.push("exclusivity");
  if (sig.nonsolicit && !/\b(?:non[-\s]?solicit|anti[-\s]?solicit|no\s+solicitation)\b/.test(corpus)) missing.push("nonsolicit");
  if (sig.noncircumvent && !/\b(?:non[-\s]?circumvent|anti[-\s]?circumvention|anti[-\s]?bypass|bypass|no\s+circumvention)\b/.test(corpus)) missing.push("noncircumvent");
  if (sig.termRenewal && !/\bterm|renew|auto[-\s]?renew\b/.test(corpus)) missing.push("term_renewal");
  if (sig.terminationCause && !/\btermination|for\s+cause|fraud|brand\s+damage|criminal|material\s+breach\b/.test(corpus)) missing.push("termination");
  if (sig.disputeArbitration && !/\bdispute|arbitrat|governing\s+law|jurisdiction\b/.test(corpus)) missing.push("dispute");
  if (sig.confidentiality && !/\bconfidential|non[-\s]?disclosure|nda\b/.test(corpus)) missing.push("confidentiality");
  const hybridFamily = (draft.agreement_family ?? detectAgreementFamily(rawIntake)) === "confidentiality_commercial_protections_agreement";
  if (hybridFamily) {
    const protections = [
      /\bconfidential(?:ity)?|non[-\s]?disclosure|permitted use\b/.test(corpus),
      /\bownership|return|destroy|destruction|work\s+product|intellectual\s+property|crm|lead|data\b/.test(corpus),
      /\bnon[-\s]?solicit|no[-\s]?hire|no\s+solicitation\b/.test(corpus),
      /\bnon[-\s]?circumvent|anti[-\s]?circumvention|bypass\b/.test(corpus),
      /\breverse[-\s]?engineer|competing use|compete\b/.test(corpus),
      /\binjunctive|equitable relief|remedies\b/.test(corpus),
      /\bterm|surviv(?:e|al)\b/.test(corpus),
      /\bdispute|venue|governing law|jurisdiction|arbitrat\b/.test(corpus),
    ].filter(Boolean).length;
    if (protections < 4) missing.push("hybrid_protection_floor");
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Extract real entity names; never echo raw prompt instructions as party names.
 */
export function extractCleanPremiumParties(intakeText: string, draft: ParsedDraftShape): { name: string; role: string }[] {
  const rawIntake = intakeText.trim();
  const fam = draft.agreement_family ?? null;
  if ((draft.parties?.length ?? 0) >= 2 && !draftHasPlaceholderParties(draft)) {
    return (draft.parties || []).map((p, idx) => ({
      name: coercePartyNameForRecipientAutoFill(nz(p.name), idx <= 1 ? (idx as 0 | 1) : 1, fam),
      role: nz(p.role) || "party",
    }));
  }
  const names = (draft.parties || []).map((p) => nz(p.name)).filter(Boolean);

  for (const n of names) {
    if (partyNameLooksLikeRawPrompt(n)) {
      const pair = tryExtractPartyPairFromPromptBlob(n);
      if (pair) {
        return [
          { name: coercePartyNameForRecipientAutoFill(pair.a, 0, fam), role: "party" },
          { name: coercePartyNameForRecipientAutoFill(pair.b, 1, fam), role: "party" },
        ];
      }
    }
  }

  const fromIntake = tryExtractPartyPairFromPromptBlob(rawIntake);
  if (fromIntake) {
    return [
      { name: coercePartyNameForRecipientAutoFill(fromIntake.a, 0, fam), role: "party" },
      { name: coercePartyNameForRecipientAutoFill(fromIntake.b, 1, fam), role: "party" },
    ];
  }

  const cleaned = names.map((n) => (partyNameLooksLikeRawPrompt(n) ? "" : n)).filter(Boolean);
  if (cleaned.length >= 2) {
    return [
      { name: coercePartyNameForRecipientAutoFill(cleaned[0], 0, fam), role: "party" },
      { name: coercePartyNameForRecipientAutoFill(cleaned[1], 1, fam), role: "party" },
    ];
  }
  if (cleaned.length === 1) {
    const only = cleaned[0];
    return [
      { name: coercePartyNameForRecipientAutoFill(only, 0, fam), role: "party" },
      { name: coercePartyNameForRecipientAutoFill("", 1, fam), role: "party" },
    ];
  }
  return [
    { name: coercePartyNameForRecipientAutoFill("", 0, fam), role: "party" },
    { name: coercePartyNameForRecipientAutoFill("", 1, fam), role: "party" },
  ];
}

function ensurePremiumDraftMeetsReviewGate(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  let next = { ...parsed };
  const fam = next.agreement_family ?? detectAgreementFamily(rawIntake);
  if (!nz(next.title)) next = { ...next, title: familyTitleFallback(fam) };
  next = { ...next, jurisdiction: resolvePremiumJurisdiction(next, rawIntake) };
  if ((next.parties?.length ?? 0) < 2) {
    next = { ...next, parties: extractCleanPremiumParties(rawIntake, next) };
  }
  if (!nz(next.purpose)) {
    next = {
      ...next,
      purpose: "The Parties enter into this Agreement for the relationship, services, and obligations described herein.",
    };
  }
  if (fam !== "nda" && fam !== "confidentiality_commercial_protections_agreement" && fam !== "operating_agreement" && !nz(next.payment_terms)) {
    next = {
      ...next,
      payment_terms: intakeHasDenseAskTargets(rawIntake)
        ? "Compensation, fees, deposits, and invoicing follow the Parties’ written intake and any attached schedule; specific amounts and cadence to be confirmed where not fixed in this Agreement."
        : "Compensation, fees, and invoicing shall be as set forth in this Agreement or an attached fee schedule.",
    };
  }
  if (fam === "generic_business_agreement") {
    if (!nz(next.duration) && !nz(next.due_date)) {
      next = { ...next, duration: "As stated in this Agreement unless amended in writing by the Parties." };
    }
    if (!nz(next.effective_date)) {
      next = { ...next, effective_date: "Upon full execution by the Parties unless otherwise specified in writing." };
    }
  } else if (fam !== "nda" && fam !== "confidentiality_commercial_protections_agreement" && fam !== "operating_agreement") {
    if (!nz(next.duration) && !nz(next.due_date)) {
      next = { ...next, duration: "As stated in this Agreement unless extended or terminated as provided herein." };
    }
    if (!nz(next.effective_date)) {
      next = { ...next, effective_date: "Upon full execution by the Parties unless otherwise specified in writing." };
    }
  }
  return next;
}

function polishAllTextFields(parsed: ParsedDraftShape): ParsedDraftShape {
  const strippedAdd = stripPremiumInternalArtifacts(parsed.additional_terms ?? "");
  const additional_terms =
    strippedAdd.length > 1200
      ? dedupeNonEmptyLines(strippedAdd)
      : dedupeNonEmptyLines(upgradeWeakCommercialLanguage(strippedAdd));
  const next: ParsedDraftShape = {
    ...parsed,
    title: upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.title)),
    purpose: upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.purpose)),
    payment_terms: upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.payment_terms)),
    jurisdiction: upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.jurisdiction)),
    duration: parsed.duration ? upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.duration)) : parsed.duration,
    due_date: parsed.due_date ? stripPremiumInternalArtifacts(parsed.due_date) : parsed.due_date,
    effective_date: parsed.effective_date ? stripPremiumInternalArtifacts(parsed.effective_date) : parsed.effective_date,
    termination_summary: parsed.termination_summary
      ? upgradeWeakCommercialLanguage(stripPremiumInternalArtifacts(parsed.termination_summary))
      : parsed.termination_summary,
    additional_terms,
  };
  return next;
}

/** Universal repair: carry forward missing intake sentences + clause/signal reinforcement (not family-specific). */
function amplifyPremiumMaterialityRepair(
  draft: ParsedDraftShape,
  rawSoT: string,
  priorPremiumBody: string,
): ParsedDraftShape {
  let x = { ...draft };
  x = applyJointVentureEconomicsExpansion(x, rawSoT);
  const add0 = nz(x.additional_terms);
  const carry = buildIntakeCarryForwardBlock(rawSoT, priorPremiumBody);
  if (carry && !add0.includes("Commercial detail carried forward from user notes")) {
    x = { ...x, additional_terms: add0 ? `${add0}\n\n${carry}` : carry };
  }
  x = applySparseDefaultExpansion(x, rawSoT);
  x = injectCoreClausesConservative(x, rawSoT);
  x = reinforcePremiumSignalPersistence(x, rawSoT);
  x = applyRawIntentPremiumBoost(x, rawSoT);
  x = elevatePremiumPaymentTermsFromIntake(x, rawSoT);
  x = applyHardFamilyLocks(x, rawSoT);
  x = applyHardTitleLocks(x, rawSoT);
  x = polishAllTextFields(x);
  return x;
}

function logPremiumSecondGenerationBeforePost(args: {
  reason: PremiumNetworkCallReason;
  doc: string;
  effectiveFull: PremiumFullDraftResult;
  clientAcceptanceOk: boolean;
  clientAcceptanceReasons: readonly string[];
  skipStructuralRetryApplied: boolean;
  lexicalSimilarityToFreePreview: number | null;
  traceCtx: { traceId: string; intakeFingerprintEarly: string };
  agreementGenerationId?: string | null;
  intakeFingerprint: string;
}): void {
  const validation = args.effectiveFull.agreement_validation;
  logPremiumSecondGenerationTriggered({
    reason: args.reason,
    firstDocumentLen: args.doc.length,
    firstServerFullDocumentLen: (args.effectiveFull.server_full_document_text || "").trim().length,
    generationOutcome: (args.effectiveFull.generation_outcome || "").trim() || null,
    agreementValidationPassed: validation?.passed ?? null,
    agreementValidationFailureCodes: (validation?.failures || []).map((f) => f.code),
    clientAcceptanceOk: args.clientAcceptanceOk,
    clientAcceptanceReasons: [...args.clientAcceptanceReasons],
    lexicalSimilarityToFreePreview: args.lexicalSimilarityToFreePreview,
    skipStructuralRetryApplied: args.skipStructuralRetryApplied,
    traceId: args.traceCtx.traceId,
    sessionGenerationId: args.agreementGenerationId ?? null,
    intakeFingerprint: args.intakeFingerprint,
  });
}

/**
 * Async premium completion: clean parties, normalize law/payment language, enrich clauses,
 * strip internal artifacts, and build recipient name candidates (emails blank unless present on draft).
 */
export async function runPremiumCompletion(input: PremiumCompletionInput): Promise<PremiumCompletionResult> {
  const rawIntake = input.intakeText.trim();
  const intakeFingerprintEarly =
    input.premiumRequestIntakeFingerprint ?? shortIntakeFingerprint(rawIntake);
  const traceId = input.agreementGenerationId ?? intakeFingerprintEarly;
  ensurePaidProPerformanceTrace({
    traceId,
    sessionGenerationId: input.agreementGenerationId ?? null,
    intakeFingerprint: intakeFingerprintEarly,
    deferFinish: input.deferWaterfallFinish ?? false,
  });
  paidProPerfRecordE2ePhase("premium_completion_started");
  try {
  return await runPremiumCompletionInner(input, { traceId, intakeFingerprintEarly });
  } finally {
    if (!readActivePaidProPerformanceTrace()?.deferFinish) {
      finishPaidProPerformanceWaterfall();
    }
    assertAtMostOneCheckoutPremiumGenerationCall();
  }
}

async function runPremiumCompletionInner(
  input: PremiumCompletionInput,
  traceCtx: { traceId: string; intakeFingerprintEarly: string },
): Promise<PremiumCompletionResult> {
  clearPremiumParseSessionGuard();
  const rawIntake = input.intakeText.trim();
  logPremiumSessionConsistency({
    context: "runPremiumCompletion_start",
    agreementId: input.agreementId,
    agreementGenerationId: input.agreementGenerationId,
    intakeFingerprint: input.premiumRequestIntakeFingerprint ?? shortIntakeFingerprint(rawIntake),
  });
  const upgradeNotes = extractPremiumUserUpgradeNotes(rawIntake);
  const baseWithoutNotes = stripPremiumUserNotesFromMergedIntake(rawIntake);
  const structuredCorpus = buildReviewCoercionRawIntakeFromDraft(
    input.structuredDraft,
    (baseWithoutNotes || rawIntake).trim() || baseWithoutNotes,
  );
  const rawForSoT = pickLongestPremiumIntakeCorpus(
    48,
    input.originalUserIntakeRawForMerge,
    baseWithoutNotes,
    rawIntake,
    structuredCorpus,
  );
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[premium-upgrade-source] runPremiumCompletion", {
      intakeTextLen: rawIntake.length,
      stripNotesLen: baseWithoutNotes.length,
      originalMergeLen: nz(input.originalUserIntakeRawForMerge).length,
      structuredCoercedLen: structuredCorpus.length,
      rawForSoTChosenLen: rawForSoT.length,
    });
  }
  const parseIntakeForSkip = rawForSoT || rawIntake;
  const skipInitialCheckoutParse = shouldSkipCheckoutPremiumParseBeforeFullDraft({
    premiumGenerationCallReason: input.premiumGenerationCallReason,
    structuredDraft: input.structuredDraft,
    rawIntake: parseIntakeForSkip,
  });
  paidProPerfSpanStart("parse_draft");
  const premiumParse = skipInitialCheckoutParse
    ? resolveCheckoutPremiumParseSubstitute(input.structuredDraft)
    : await input.parseDraft(rawIntake);
  paidProPerfSpanEnd("parse_draft", {
    outcome: skipInitialCheckoutParse ? "skipped_checkout_structured" : "parsed",
    extra: {
      skipped: skipInitialCheckoutParse,
      callReason: input.premiumGenerationCallReason ?? null,
    },
  });
  let merged = mergePremiumParsePreferFresh(input.structuredDraft, premiumParse, rawForSoT);
  merged = ensureMaterialAsksInAdditional(merged);
  if (import.meta.env.DEV) {
    console.info("[premium-trace] stage_post_parse", {
      timestamp: new Date().toISOString(),
      rawPremiumResponseChars: JSON.stringify(premiumParse).length,
      purposeLen: nz(premiumParse.purpose).length,
      paymentLen: nz(premiumParse.payment_terms).length,
      additionalLen: nz(premiumParse.additional_terms).length,
      terminationLen: nz(premiumParse.termination_summary).length,
    });
  }
  if (upgradeNotes.length >= 20) {
    const tag = "Premium upgrade wording (user-provided; edit before send)";
    const existing = nz(merged.additional_terms);
    const block = `${tag}:\n\n${upgradeNotes}`;
    merged = { ...merged, additional_terms: existing ? `${block}\n\n${existing}` : block };
  }
  const mergedAfterPremiumModelMerge = merged;
  if (import.meta.env.DEV) {
    console.info("[premium-trace] stage_post_merge", {
      timestamp: new Date().toISOString(),
      mergedChars: JSON.stringify(mergedAfterPremiumModelMerge).length,
      purposeLen: nz(mergedAfterPremiumModelMerge.purpose).length,
      paymentLen: nz(mergedAfterPremiumModelMerge.payment_terms).length,
      additionalLen: nz(mergedAfterPremiumModelMerge.additional_terms).length,
      terminationLen: nz(mergedAfterPremiumModelMerge.termination_summary).length,
    });
  }
  merged = { ...merged, payment: extractIntakePayment(rawIntake) };
  if (!input.agreementFamily && isNdaCommercialHybridPrompt(rawIntake)) {
    merged = { ...merged, agreement_family: "confidentiality_commercial_protections_agreement" };
  }
  if (input.agreementFamily) {
    merged = { ...merged, agreement_family: input.agreementFamily };
  }
  paidProPerfSpanStart("intake_classification");
  merged = runIntakeDefaultsAndRoles(merged, rawIntake, input.simpleProductFlow, input.partyRoleLabels);
  const intakeFingerprint =
    input.premiumRequestIntakeFingerprint ??
    shortIntakeFingerprint(rawForSoT || rawIntake);
  const familyAtIntake = resolveAuthoritativePaidProAgreementFamily({
    intakeText: rawForSoT || rawIntake,
    draft: merged,
    inputAgreementFamily: input.agreementFamily ?? null,
    traceId: traceCtx.traceId,
    sessionGenerationId: input.agreementGenerationId ?? null,
    intakeFingerprint,
  });
  merged = applyAuthoritativeFamilyToDraft(merged, familyAtIntake);
  paidProPerfSpanEnd("intake_classification", {
    outcome: familyAtIntake.family,
    extra: { source: familyAtIntake.source, intakeFamily: familyAtIntake.intakeFamily },
  });
  merged = applyHardFamilyLocks(merged, rawIntake);
  merged = alignTitleWithCanonical(merged, rawIntake);
  merged = normalizeParsedDraftLegalConcepts(merged, rawIntake);
  merged = { ...merged, parties: extractCleanPremiumParties(rawIntake, merged) };
  merged = { ...merged, title: inferPremiumTitle(merged, rawIntake) };
  if (import.meta.env.DEV) {
    console.info("[premium-trace] stage_post_transform", {
      timestamp: new Date().toISOString(),
      transformedChars: JSON.stringify(merged).length,
      purposeLen: nz(merged.purpose).length,
      paymentLen: nz(merged.payment_terms).length,
      additionalLen: nz(merged.additional_terms).length,
      terminationLen: nz(merged.termination_summary).length,
      title: nz(merged.title),
    });
  }
  merged = enrichParsedDraftForFullDraftUpgrade(merged, rawIntake);
  merged = synthesizePremiumScopeAndOperativeFields(merged, rawIntake);
  merged = injectCoreClausesConservative(merged, rawIntake);
  merged = polishAllTextFields(merged);
  merged = normalizeParsedDraftLegalConcepts(merged, rawIntake);
  merged = ensurePremiumDraftMeetsReviewGate(merged, rawIntake);
  merged = elevatePremiumPaymentTermsFromIntake(merged, rawIntake);
  merged = applyJointVentureEconomicsExpansion(merged, rawForSoT || rawIntake);
  merged = enrichPremiumTerminationFromContext(merged, rawIntake);
  merged = reinforcePremiumSignalPersistence(merged, rawIntake);
  merged = applySparseDefaultExpansion(merged, rawIntake);
  merged = { ...merged, title: inferPremiumTitle(merged, rawIntake) };
  let quality = evaluatePremiumDraftQuality(merged, rawIntake);
  let substance = meetsPremiumSubstanceFloor(merged, rawForSoT || rawIntake);
  const baseFreeSignals = protectionSignalsPresent(
    `${nz(input.structuredDraft.purpose)}\n${nz(input.structuredDraft.payment_terms)}\n${nz(input.structuredDraft.additional_terms)}\n${nz(input.structuredDraft.termination_summary)}`,
  );
  let premiumSignals = protectionSignalsPresent(
    `${nz(merged.purpose)}\n${nz(merged.payment_terms)}\n${nz(merged.additional_terms)}\n${nz(merged.termination_summary)}`,
  );
  const promptSignals = detectPremiumCommercialSignals(rawForSoT || rawIntake);
  const commercialPrompt =
    promptSignals.commission ||
    promptSignals.clawback ||
    promptSignals.referralChannel ||
    promptSignals.contractorServices ||
    promptSignals.noncircumvent ||
    promptSignals.nonsolicit ||
    promptSignals.ownershipData ||
    promptSignals.adCompliance;
  const hybridPrompt = isNdaCommercialHybridPrompt(rawForSoT || rawIntake);
  const sparsePrompt = isSparsePrompt(rawForSoT || rawIntake);
  let deltaOk =
    (!commercialPrompt || premiumSignals - baseFreeSignals >= 3) &&
    (!hybridPrompt || premiumSignals - baseFreeSignals >= 2) &&
    (!sparsePrompt || premiumSignals - baseFreeSignals >= 2);
  let regenTriggered = false;
  if (import.meta.env.DEV) {
    const corpus = `${nz(merged.purpose)}\n${nz(merged.payment_terms)}\n${nz(merged.additional_terms)}`.toLowerCase();
    const upgradeEcho =
      upgradeNotes.length >= 12 &&
      corpus.includes(upgradeNotes.slice(0, Math.min(24, upgradeNotes.length)).toLowerCase());
    const mergeBaseOnly = mergeParsedPreferRicher(input.structuredDraft, premiumParse);
    const mergeBasePurpose = nz(mergeBaseOnly.purpose);
    const mergeBasePay = nz(mergeBaseOnly.payment_terms);
    const mergeBaseDur = nz(mergeBaseOnly.duration ?? "");
    const mergeBaseJ = nz(mergeBaseOnly.jurisdiction);
    const intakeWrapsOriginal =
      rawForSoT.length >= 48 &&
      rawIntake.includes(rawForSoT.slice(0, Math.min(120, Math.max(1, rawForSoT.length))));
    const postMergePurpose = nz(mergedAfterPremiumModelMerge.purpose);
    console.info("[premium-completion] merge_gate", {
      originalHintLen: nz(input.originalUserIntakeRawForMerge).length,
      rawForSoTLen: rawForSoT.length,
      intakePayloadLen: rawIntake.length,
      intakeWrapsOriginalCorpus: intakeWrapsOriginal,
      structuredPurposeLen: nz(input.structuredDraft.purpose).length,
      premiumParsePurposeLen: nz(premiumParse.purpose).length,
      mergeBasePurposeLen: mergeBasePurpose.length,
      mergedPurposeAfterPremiumModelMergeLen: postMergePurpose.length,
      purposeApproxSourceRightAfterModelMerge:
        postMergePurpose === nz(premiumParse.purpose)
          ? "premium_parse"
          : postMergePurpose === mergeBasePurpose
            ? "merge_base"
            : "other",
      paymentLens: {
        structuredLen: nz(input.structuredDraft.payment_terms).length,
        premiumParseLen: nz(premiumParse.payment_terms).length,
        mergeBaseLen: mergeBasePay.length,
        mergedAfterModelMergeLen: nz(mergedAfterPremiumModelMerge.payment_terms).length,
      },
      termLens: {
        structuredLen: nz(input.structuredDraft.duration).length,
        premiumParseLen: nz(premiumParse.duration).length,
        mergeBaseLen: mergeBaseDur.length,
        mergedAfterModelMergeLen: nz(mergedAfterPremiumModelMerge.duration).length,
      },
      jurisdictionLens: {
        structuredSample: nz(input.structuredDraft.jurisdiction).slice(0, 60),
        premiumParseSample: nz(premiumParse.jurisdiction).slice(0, 60),
        mergeBaseSample: mergeBaseJ.slice(0, 60),
        mergedAfterModelMergeSample: nz(mergedAfterPremiumModelMerge.jurisdiction).slice(0, 60),
      },
      upgradeNotesMerged: upgradeNotes.length >= 20,
    });
    console.info("[premium-completion] transform_gate", {
      qualityScore: quality.score,
      qualityOk: quality.ok,
      qualityReasons: quality.reasons,
      purposeLen: nz(merged.purpose).length,
      jurisdiction: nz(merged.jurisdiction).slice(0, 80),
      intakeChars: rawIntake.length,
      upgradeNotesChars: upgradeNotes.length,
      upgradeNotesInjected: upgradeNotes.length >= 20,
      finalCorpusChars: corpus.length,
      finalSourceHint: upgradeNotes.length >= 20 ? "user_upgrade_block+parse_merge" : "parse_merge_only",
      userWordingEchoInFinal: upgradeEcho,
    });
  }
  if (!quality.ok || !substance.ok || !deltaOk) {
    regenTriggered = true;
    merged = repairPremiumDraftAfterQualityFailure(merged, rawIntake);
    merged = elevatePremiumPaymentTermsFromIntake(merged, rawIntake);
    merged = enrichPremiumTerminationFromContext(merged, rawIntake);
    merged = injectCoreClausesConservative(merged, rawIntake);
    merged = reinforcePremiumSignalPersistence(merged, rawIntake);
    merged = applySparseDefaultExpansion(merged, rawIntake);
    merged = polishAllTextFields(merged);
    quality = evaluatePremiumDraftQuality(merged, rawIntake);
    substance = meetsPremiumSubstanceFloor(merged, rawForSoT || rawIntake);
    premiumSignals = protectionSignalsPresent(
      `${nz(merged.purpose)}\n${nz(merged.payment_terms)}\n${nz(merged.additional_terms)}\n${nz(merged.termination_summary)}`,
    );
    deltaOk =
      (!commercialPrompt || premiumSignals - baseFreeSignals >= 3) &&
      (!hybridPrompt || premiumSignals - baseFreeSignals >= 2) &&
      (!sparsePrompt || premiumSignals - baseFreeSignals >= 2);
    if (!substance.ok || !deltaOk) {
      if (input.premiumGenerationCallReason !== "checkout_completion") {
        const reparsed = await input.parseDraft(rawForSoT || rawIntake);
        merged = mergePremiumParsePreferFresh(input.structuredDraft, reparsed, rawForSoT || rawIntake);
        merged = synthesizePremiumScopeAndOperativeFields(merged, rawForSoT || rawIntake);
        merged = { ...merged, jurisdiction: resolvePremiumJurisdiction(merged, rawForSoT || rawIntake) };
        merged = elevatePremiumPaymentTermsFromIntake(merged, rawForSoT || rawIntake);
        merged = injectCoreClausesConservative(merged, rawForSoT || rawIntake);
        merged = enrichPremiumTerminationFromContext(merged, rawForSoT || rawIntake);
        merged = reinforcePremiumSignalPersistence(merged, rawForSoT || rawIntake);
        merged = applySparseDefaultExpansion(merged, rawForSoT || rawIntake);
        merged = polishAllTextFields(merged);
        premiumSignals = protectionSignalsPresent(
          `${nz(merged.purpose)}\n${nz(merged.payment_terms)}\n${nz(merged.additional_terms)}\n${nz(merged.termination_summary)}`,
        );
        deltaOk =
          (!commercialPrompt || premiumSignals - baseFreeSignals >= 3) &&
          (!hybridPrompt || premiumSignals - baseFreeSignals >= 2) &&
          (!sparsePrompt || premiumSignals - baseFreeSignals >= 2);
      }
    }
    merged = { ...merged, title: inferPremiumTitle(merged, rawForSoT || rawIntake) };
  }

  const trackA = enforceEconomicsSafety(merged, rawForSoT || rawIntake);

  // Paid Pro checkout uses server_full_draft as authority. Track B is a third premium parse that
  // frequently hit premium_parse_timeout (~60s) after the HTTP draft had already succeeded on retry.
  const trackBParse = premiumParse;
  let trackB = mergePremiumParsePreferFresh(input.structuredDraft, trackBParse, rawForSoT || rawIntake);
  trackB = runIntakeDefaultsAndRoles(trackB, rawForSoT || rawIntake, input.simpleProductFlow, input.partyRoleLabels);
  trackB = applyHardFamilyLocks(trackB, rawForSoT || rawIntake);
  trackB = normalizeParsedDraftLegalConcepts(trackB, rawForSoT || rawIntake);
  trackB = synthesizePremiumScopeAndOperativeFields(trackB, rawForSoT || rawIntake);
  trackB = injectCoreClausesConservative(trackB, rawForSoT || rawIntake);
  trackB = elevatePremiumPaymentTermsFromIntake(trackB, rawForSoT || rawIntake);
  trackB = enrichPremiumTerminationFromContext(trackB, rawForSoT || rawIntake);
  trackB = reinforcePremiumSignalPersistence(trackB, rawForSoT || rawIntake);
  trackB = applyRawIntentPremiumBoost(trackB, rawForSoT || rawIntake);
  trackB = applySparseDefaultExpansion(trackB, rawForSoT || rawIntake);
  trackB = ensurePremiumDraftMeetsReviewGate(trackB, rawForSoT || rawIntake);
  trackB = polishAllTextFields(trackB);
  trackB = { ...trackB, title: inferPremiumTitle(trackB, rawForSoT || rawIntake) };
  trackB = enforceEconomicsSafety(trackB, rawForSoT || rawIntake);

  const trackAScore = scorePremiumCandidate(trackA, rawForSoT || rawIntake, baseFreeSignals);
  const trackBScore = scorePremiumCandidate(trackB, rawForSoT || rawIntake, baseFreeSignals);
  const winner = trackBScore.score > trackAScore.score ? "B" : "A";
  merged = winner === "B" ? trackB : trackA;
  merged = applyHardFamilyLocks(merged, rawForSoT || rawIntake);
  merged = applySparseDefaultExpansion(merged, rawForSoT || rawIntake);
  merged = elevatePremiumPaymentTermsFromIntake(merged, rawForSoT || rawIntake);
  merged = { ...merged, title: inferPremiumTitle(merged, rawForSoT || rawIntake) };
  merged = applyHardTitleLocks(merged, rawForSoT || rawIntake);
  const rawSoT = rawForSoT || rawIntake;
  const preflightPreviewCtx = {
    premiumGenerationCallReason: input.premiumGenerationCallReason,
    sessionGenerationId: input.agreementGenerationId ?? null,
    intakeFingerprint,
  };
  paidProPerfSpanStart("client_preflight_preview");
  let freeBaseline = buildCheckoutPreflightAgreementPreviewText(
    input.structuredDraft,
    { starterPreview: true },
    preflightPreviewCtx,
  );
  let premiumFinal = buildCheckoutPreflightAgreementPreviewText(
    merged,
    {
      starterPreview: false,
      premiumDeliverablePreview: true,
      intakeText: rawSoT,
    },
    preflightPreviewCtx,
  );
  let similarity = lexicalSimilarity(freeBaseline, premiumFinal);
  let deltaSignals = protectionSignalsPresent(premiumFinal) - protectionSignalsPresent(freeBaseline);
  let lengthRatio = premiumFinal.length / Math.max(1, freeBaseline.length);
  let mat = evaluateUniversalPremiumMateriality(freeBaseline, premiumFinal, rawSoT);
  if ((similarity > 0.78 && (deltaSignals < 2 || lengthRatio < 1.2)) || !mat.ok) {
    regenTriggered = true;
    merged = amplifyPremiumMaterialityRepair(merged, rawSoT, premiumFinal);
    premiumFinal = buildCheckoutPreflightAgreementPreviewText(
      merged,
      {
        starterPreview: false,
        premiumDeliverablePreview: true,
        intakeText: rawSoT,
      },
      preflightPreviewCtx,
    );
    similarity = lexicalSimilarity(freeBaseline, premiumFinal);
    deltaSignals = protectionSignalsPresent(premiumFinal) - protectionSignalsPresent(freeBaseline);
    lengthRatio = premiumFinal.length / Math.max(1, freeBaseline.length);
    mat = evaluateUniversalPremiumMateriality(freeBaseline, premiumFinal, rawSoT);
    if (import.meta.env.DEV) {
      console.info("[premium-quality] similarity_or_materiality_regen", {
        similarity,
        deltaSignals,
        lengthRatio,
        materiality_ok: mat.ok,
        materiality_reasons: mat.reasons,
      });
    }
  }
  if (!mat.ok) {
    regenTriggered = true;
    merged = amplifyPremiumMaterialityRepair(merged, rawSoT, premiumFinal);
    premiumFinal = buildCheckoutPreflightAgreementPreviewText(
      merged,
      {
        starterPreview: false,
        premiumDeliverablePreview: true,
        intakeText: rawSoT,
      },
      preflightPreviewCtx,
    );
    mat = evaluateUniversalPremiumMateriality(freeBaseline, premiumFinal, rawSoT);
    if (import.meta.env.DEV) {
      console.info("[premium-universal-materiality]", { pass: 2, ok: mat.ok, reasons: mat.reasons, metrics: mat.metrics });
    }
  }
  paidProPerfSpanEnd("client_preflight_preview", {
    docLen: premiumFinal.length,
    extra: { regenTriggered },
  });
  const parsePayment = nz(premiumParse.payment_terms);
  const finalPayment = nz(merged.payment_terms);
  const finalGeneric = /\b(to be agreed|to be specified|payment schedule to be agreed|tbd)\b/i.test(finalPayment);
  const parseHasEconomics = /\b\d{1,2}\s*%|commission|referral|rev(?:enue)?\s*share|deposit\s+clears?|chargeback|clawback\b/i.test(parsePayment);
  const finalHasEconomics = /\b\d{1,2}\s*%|commission|referral|rev(?:enue)?\s*share|deposit\s+clears?|chargeback|clawback\b/i.test(finalPayment);
  const parseSpecific = parsePayment.length >= 18 && !/\b(to be agreed|to be specified|payment schedule to be agreed|tbd)\b/i.test(parsePayment);
  if (parseSpecific && (!finalPayment || finalGeneric || (parseHasEconomics && !finalHasEconomics))) {
    merged = { ...merged, payment_terms: parsePayment };
  }
  const lensPreBackstop = {
    purposeLen: nz(merged.purpose).length,
    paymentLen: nz(merged.payment_terms).length,
    additionalLen: nz(merged.additional_terms).length,
  };
  merged = mergePremiumParseSubstanceBackstop(merged, premiumParse);
  const lensPostBackstop = {
    purposeLen: nz(merged.purpose).length,
    paymentLen: nz(merged.payment_terms).length,
    additionalLen: nz(merged.additional_terms).length,
  };
  const parseLens = {
    purposeLen: nz(premiumParse.purpose).length,
    paymentLen: nz(premiumParse.payment_terms).length,
    additionalLen: nz(premiumParse.additional_terms).length,
  };
  const mergePostModelLens = {
    purposeLen: nz(mergedAfterPremiumModelMerge.purpose).length,
    paymentLen: nz(mergedAfterPremiumModelMerge.payment_terms).length,
    additionalLen: nz(mergedAfterPremiumModelMerge.additional_terms).length,
  };
  const parseSubstance = parseLens.purposeLen + parseLens.paymentLen + parseLens.additionalLen;
  const finalSubstance = lensPostBackstop.purposeLen + lensPostBackstop.paymentLen + lensPostBackstop.additionalLen;
  const preBackstopSubstance =
    lensPreBackstop.purposeLen + lensPreBackstop.paymentLen + lensPreBackstop.additionalLen;
  const substanceAtRisk =
    parseSubstance > 900 &&
    preBackstopSubstance < Math.floor(parseSubstance * 0.5) &&
    looksClauseGradePremiumPurpose(nz(premiumParse.purpose));
  const premiumSubstanceDropped =
    substanceAtRisk && finalSubstance < Math.floor(parseSubstance * 0.55);
  if (import.meta.env.DEV) {
    console.info("[premium-trace] stage_pre_snapshot", {
      timestamp: new Date().toISOString(),
      parseLens,
      mergePostModelLens,
      lensPreBackstop,
      lensPostBackstop,
      snapshotFieldLens: lensPostBackstop,
      substanceAtRisk,
      premiumSubstanceDropped,
      backstopRecoveredSubstance: substanceAtRisk && !premiumSubstanceDropped,
      backstopTouched:
        lensPostBackstop.additionalLen !== lensPreBackstop.additionalLen ||
        lensPostBackstop.paymentLen !== lensPreBackstop.paymentLen,
    });
  }
  merged = preserveSpecificPartyRoles(merged, premiumParse.parties);
  dualTrackStats[winner] += 1;

  if (import.meta.env.DEV) {
    console.info("[premium-dualtrack]", {
      trackA_score: trackAScore.score,
      trackB_score: trackBScore.score,
      winner,
      reason: winner === "B" ? trackBScore.reason : trackAScore.reason,
    });
  }
  if (import.meta.env.DEV) {
    const signals = detectPremiumCommercialSignals(rawForSoT || rawIntake);
    const sectionsBuilt = [merged.purpose, merged.payment_terms, merged.duration, merged.termination_summary, merged.additional_terms]
      .map((s) => (s || "").trim())
      .filter(Boolean).length;
    console.info("[premium-quality]", {
      docType: nz(merged.title),
      sectionsBuilt,
      signalsDetected: signals,
      sourceUsed: "raw_intake_then_snapshot_then_merged",
      rawLen: (rawForSoT || rawIntake).length,
      finalLen: `${nz(merged.purpose)}\n${nz(merged.payment_terms)}\n${nz(merged.additional_terms)}`.length,
      qualityPassed: evaluatePremiumDraftQuality(merged, rawIntake).ok && meetsPremiumSubstanceFloor(merged, rawForSoT || rawIntake).ok,
      premiumDelta: premiumSignals - baseFreeSignals,
      premiumDeltaPassed: deltaOk,
      regenTriggered,
    });
  }

  let outMerged: ParsedDraftShape = merged;
  let winningPremiumBodyText = "";
  const intakeLowerGlobal = (rawForSoT || rawIntake).toLowerCase();
  const premiumRejectCtx = {
    intakeLower: intakeLowerGlobal,
    intakeText: rawForSoT || rawIntake,
    partyNames:
      (merged.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean).length >= 2
        ? merged.parties?.map((p) => p.name) ?? null
        : null,
  };
  let premiumRenderSource: PremiumRenderSource = "fallback_preview";
  let founderDetailsGateMessage: string | null = null;
  let proIntentGateMessage: string | null = null;
  let serverGenerationDegraded: { code: string; message: string } | null = null;
  /** Preserves HTTP degraded metadata for local recovery when client gates reject the server body. */
  let serverDegradedHttpMetaForRecovery: { code: string; message: string } | null = null;
  let premiumCompletionOutcome: PremiumCompletionOutcome | null = null;
  let recommendedClarifications: RecommendedClarifications | null = null;
  let agreementIntelligence: AgreementIntelligence | null = null;
  let agreementValidation: AgreementValidationResult | null = null;
  let structuralCatastrophic = false;
  let materialMissingItems: MaterialMissingItem[] = [];
  const intentContract = resolveAgreementIntentContract(rawForSoT || rawIntake);
  const intentPreflightPolicy = resolvePremiumIntentPreflightPolicy(intentContract);
  const tierAEnabled = intentPreflightPolicy.tier === "A";
  const tierADiag = {
    enabled: tierAEnabled,
    backendReturnedDocumentText: false,
    backendDocumentTextLen: 0,
    backendGenerationOutcome: "none",
    schemaValidationReasons: [] as string[],
    serverTextClearedBeforeMerge: false,
    serverTextClearReason: "none",
    staleOrFingerprintMismatch: false,
    premiumPipelineSource: "fallback_preview" as PremiumRenderSource,
  };
  let lastClientGateTrace: {
    accOk: boolean;
    accReasons: string[];
    vPaidOk: boolean;
    vPaidReasons: string[];
    docLen: number;
    effGen: string;
  } | null = null;
  let pipelineNormalizedAuthoritativeText = "";

  try {
    const mergedForApi = stripClientPremiumArtifactBlocksFromDraft(merged);
    const fullCtx = buildPremiumFullDraftContextForProRequest(rawForSoT || rawIntake, mergedForApi, intentContract);
    setPaidFunnelLastPremiumProContext(getOrCreateLawdogSessionId(), fullCtx);
    const gapAns = (input.userGapAnswers || "").trim();
    const soT = rawForSoT || rawIntake;
    logPremiumCompletionDebug({
      stage: "premium_full_draft_with_retry_start",
      intakeLen: soT.length,
    });
    const callReason = input.premiumGenerationCallReason ?? "checkout_completion";
    const genCall = recordPremiumFullDraftCall({
      reason: callReason,
      intakeFingerprint,
      agreementGenerationId: input.agreementGenerationId ?? null,
    });
    paidProPerfSpanStart("premium_full_draft_api");
    const premiumRequestStartedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let fullResp: Awaited<ReturnType<typeof postPremiumFullDraftWithRetry>>;
    if (genCall.duplicateBlocked) {
      logPremiumNetworkClassification({
        cause: "duplicate_checkout_suppressed",
        recoverable: false,
        sessionGenerationIdShort: (input.agreementGenerationId ?? "").trim().slice(0, 8) || null,
        intakeFingerprint,
        duplicateCheckoutBlocked: true,
        note: "second_checkout_orchestration_blocked",
      });
      logPremiumCompletionDebug({
        stage: "premium_full_draft_duplicate_checkout_blocked",
        intakeLen: soT.length,
        accepted: false,
        rejectedReason: "duplicate_checkout_premium_call",
      });
      fullResp = {
        ok: false,
        failure_kind: "http",
        retryable: false,
        error_code: "duplicate_checkout_premium_call",
        document_text: "",
        attemptCount: 0,
      };
    } else {
      fullResp = await postPremiumFullDraftWithRetry({
        intakeText: soT,
        context: fullCtx,
        userGapAnswers: gapAns || null,
        agreementId: input.agreementId ?? null,
        agreementGenerationId: input.agreementGenerationId ?? null,
        networkCallReason: callReason as PremiumNetworkCallReason,
      });
    }
    const premiumServerModelMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - premiumRequestStartedAt,
    );
    const wireMeta = fullResp.ok
      ? {
          responseBodyLen: JSON.stringify(fullResp.result).length,
          documentTextLen: (fullResp.result.document_text || "").trim().length,
          serverFullDocumentTextLen: (fullResp.result.server_full_document_text || "").trim().length,
          generationOutcome: (fullResp.result.generation_outcome || "").trim(),
          failureCode: (fullResp.result.server_generation_failure_code || "").trim() || undefined,
        }
      : {};
    paidProPerfSpanEnd("premium_full_draft_api", {
      outcome: genCall.duplicateBlocked ? "duplicate_blocked" : fullResp.ok ? "ok" : "fail",
      failureCode: fullResp.ok ? undefined : fullResp.error_code,
      extra: {
        attempt: genCall.callIndex,
        requestReason: callReason,
        ...wireMeta,
      },
    });
    paidProPerfRecordInstant("server_model", premiumServerModelMs, {
      outcome: fullResp.ok ? "ok" : fullResp.failure_kind ?? "fail",
      failureCode: fullResp.ok ? undefined : fullResp.error_code,
      extra: {
        attempt: genCall.callIndex,
        requestReason: callReason,
        ...wireMeta,
      },
    });
    if (!fullResp.ok) {
      if (fullResp.failure_kind === "network" && fullResp.retryable) {
        logPremiumGenerationApiUnavailable({
          endpoint: PREMIUM_GENERATION_DRAFT_API_PATH,
          error: fullResp.error_code ?? fullResp.browserErrorMessage ?? "network_error",
          fallbackBlocked: true,
          stage: "premiumCompletionPipeline",
          pipelineSource: "premium_network_retryable",
        });
        logPremiumCompletionDebug({
          stage: "premium_full_draft_network_retryable",
          intakeLen: soT.length,
          accepted: false,
          rejectedReason: fullResp.error_code,
          premiumRenderSource: "premium_network_retryable",
        });
        premiumRenderSource = "premium_network_retryable";
        if (tierAEnabled) {
          tierADiag.backendGenerationOutcome = "network_error";
        }
      } else if (fullResp.failure_kind === "generation" && fullResp.retryable) {
        logPremiumGenerationRetryableFailure({
          stage: "premium_full_draft_generation_retryable",
          error_code: fullResp.error_code,
          intakeLen: soT.length,
          agreementId: input.agreementId ?? null,
        });
        logPremiumCompletionDebug({
          stage: "premium_full_draft_generation_retryable",
          intakeLen: soT.length,
          accepted: false,
          rejectedReason: fullResp.error_code,
          premiumRenderSource: "premium_generation_retryable",
        });
        premiumRenderSource = "premium_generation_retryable";
        if (tierAEnabled) {
          tierADiag.backendGenerationOutcome = "generation_retryable";
        }
      } else {
        logPremiumCompletionDebug({
          stage: "premium_full_draft_client_null",
          intakeLen: soT.length,
          accepted: false,
          rejectedReason: fullResp.error_code || "postPremiumFullDraftWithRetry_failed",
        });
        if (import.meta.env.MODE !== "test" && intentContract.pro_strict) {
          proIntentGateMessage = proIntentMessageWhenServerFullDraftFailed(intentContract);
          premiumRenderSource = "rejected_paid_corpus";
        }
        if (tierAEnabled) {
          tierADiag.backendGenerationOutcome = "no_response";
        }
      }
    } else {
      const normalizedFull = normalizePremiumFullDraftResponsePayload(
        fullResp.result as PremiumFullDraftResult & Record<string, unknown>,
      );
      const full = normalizedFull.wire;
      pipelineNormalizedAuthoritativeText = normalizedFull.authoritativeText;
      if (import.meta.env.DEV && normalizedFull.sourceField) {
        // eslint-disable-next-line no-console
        console.info("[premium-completion] wire_document_normalized", {
          sourceField: normalizedFull.sourceField,
          authoritativeLen: normalizedFull.authoritativeText.length,
          rawServerLen: String(fullResp.result.server_full_document_text ?? "").trim().length,
          rawDocumentLen: String(fullResp.result.document_text ?? "").trim().length,
          rejectedCandidates: normalizedFull.rejectedCandidates.slice(0, 8),
        });
      }
      logPremiumApiResultFromWire({ ok: true, status: 200, wire: full });
      if (premiumApiResultHasAuthoritativeServerCorpus(full)) {
        markPremiumAuthoritativeServerCorpusAccepted();
      }
      if (!premiumApiResultHasAuthoritativeServerCorpus(full) && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[premium-api-handoff] server_full_document_text missing or short after HTTP ok", {
          serverLen: String(full.server_full_document_text ?? "").trim().length,
          documentLen: String(full.document_text ?? "").trim().length,
          generationOutcome: full.generation_outcome,
        });
      }
      agreementIntelligence = full.agreement_intelligence ?? null;
      agreementValidation = full.agreement_validation ?? null;
      adaptPremiumFullDraftToProIntelligencePacket(full);
      if (tierAEnabled) {
        tierADiag.backendReturnedDocumentText = Boolean((full.document_text || "").trim());
        tierADiag.backendDocumentTextLen = (full.document_text || "").trim().length;
        tierADiag.backendGenerationOutcome = (full.generation_outcome || "ok").trim();
        tierADiag.schemaValidationReasons = (full.schema_validation_reasons || []).filter(Boolean).slice(0, 8);
      }
      let effectiveFull: PremiumFullDraftResult = full;
      if ((full.generation_outcome || "").trim() === "degraded") {
        const fcRecover = (full.server_generation_failure_code || "").trim();
        const msgRecover = (full.server_generation_failure_message || "").trim();
        serverDegradedHttpMetaForRecovery = {
          code: fcRecover || "unknown",
          message: msgRecover || "Your agreement is ready. You can refine any wording below.",
        };
      }
      let doc = (effectiveFull.document_text || "").trim();
      const canonicalPartyNamesForAttribution = (merged.parties || [])
        .map((p) => String(p?.name ?? "").trim())
        .filter(Boolean);
      logOrgPlaceholderOriginsFromText({
        text: doc,
        sourceModule: "premium_full_draft_http",
        canonicalPartyCount: canonicalPartyNamesForAttribution.length,
      });
      logDraftingStubOriginsFromText({ text: doc, sourceModule: "premium_full_draft_http" });
      logPaidProEntityMap({
        sourceModule: "premium_completion_pipeline",
        organizations: canonicalPartyNamesForAttribution.slice(0, 2),
        signers: [],
        noticeRecipients: [],
        affiliates: [],
      });
      // Tracks deterministic known-party placeholder repair so a `needs_details`/soft-gate response
      // whose only gap was a party name we already know is accepted rather than rejected.
      let partyPlaceholderRepairApplied = false;
      let partyPlaceholderRepairResolvesPaidBody = false;
      if (doc) {
        const preGateIntake = (rawForSoT || rawIntake).trim();
        paidProPerfSpanStart("premium_local_pre_processing");
        const postProcessStartedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const polishStartedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        doc = applyAcceptedProCorpusSafeDisplay(doc, {
          draft: mergedForApi,
          intakeText: preGateIntake,
          surface: "premium_completion_pipeline",
        }).text;
        paidProPerfRecordInstant(
          "enterprise_polish",
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - polishStartedAt,
          ),
          { docLen: doc.length },
        );
        // Deterministic known-party placeholder repair. A paid server body that still contains
        // [ORG_1]/[ORG_2]-style PARTY placeholders must not be rejected when the canonical parties are
        // already known (from the free draft / intake). Replace only slots with a real canonical name —
        // unknown slots are left intact so genuine unresolved placeholders / dev-context leaks still
        // hard-fail downstream. Runs before structural/placeholder/acceptance gates so the repaired body
        // is what gets validated and (if clean) accepted as the paid SoT.
        if (textContainsUnresolvedIdentityPlaceholders(doc)) {
          const canonicalPartyNamesForRepair = (merged.parties || []).map((p) =>
            String(p?.name ?? "").trim(),
          );
          const structuredPartyCount = (merged.parties || []).length;
          const canonicalIdentityCount = resolveCanonicalPartyIdentitiesFromSources({
            rawIntake: preGateIntake,
            starterNames: canonicalPartyNamesForRepair,
          }).length;
          const placeholderResolution = resolvePlaceholderPartyNamesWithMeta(
            { intakeRaw: preGateIntake, partyNames: canonicalPartyNamesForRepair },
            null,
          );
          const placeholderResolutionPartyCount = resolveCanonicalPartyIdentitiesFromSources({
            rawIntake: preGateIntake,
            starterNames: placeholderResolution.names,
          }).length;
          const repair = repairKnownPartyPlaceholders(
            doc,
            canonicalPartyNamesForRepair,
            preGateIntake,
            {
              structuredPartyCount,
              canonicalIdentityCount,
              placeholderResolutionPartyCount,
              intakeHasFullLegalEntities: intakeHasFullLegalEntityParties(
                preGateIntake,
                canonicalPartyNamesForRepair,
              ),
            },
          );
          if (repair.repaired) {
            doc = repair.text;
            partyPlaceholderRepairApplied = true;
            partyPlaceholderRepairResolvesPaidBody = partyPlaceholderRepairYieldsAuthoritativePaidBody({
              repaired: true,
              hasRemainingIdentityPlaceholder: repair.hasRemainingIdentityPlaceholder,
              // Structural acceptance is re-run downstream; the substance/section gate is the decisive
              // floor here. If a real structural defect exists, the body is still rejected by `acc`.
              structuralOk: true,
              bodyLen: doc.length,
              hasRequiredSections: premiumBodyHasRequiredPaidSections({
                text: doc,
                rawIntake: preGateIntake,
                draft: mergedForApi,
              }),
            });
            logPremiumCompletionDebug({
              stage: "pipeline_party_placeholder_repaired",
              repairedSlots: repair.repairedSlots,
              collapsedExtraOrgSlots: repair.collapsedExtraOrgSlots,
              remainingIdentityPlaceholder: repair.hasRemainingIdentityPlaceholder,
              resolvesPaidBody: partyPlaceholderRepairResolvesPaidBody,
              currentDocLen: doc.length,
            });
          }
        }
        const structureStartedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (
          isCommercialServicesIntake(preGateIntake) &&
          (doc.length < 2_500 ||
            countNumberedAgreementSections(doc) <= MUTUAL_CONSULTING_LIGHTWEIGHT_SECTION_CEILING)
        ) {
          doc = preparePaidProServerDocumentForAcceptance(doc, mergedForApi, preGateIntake, {
            surface: "premium_completion_pipeline:thin_services",
          }).text;
        }
        paidProPerfRecordInstant(
          "structure_repair",
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - structureStartedAt,
          ),
          { docLen: doc.length },
        );
        const completenessCtx = {
          intakeRaw: preGateIntake,
          partyNames: premiumRejectCtx.partyNames ?? undefined,
        };
        const structuralIssues = [
          ...detectHeadingOnlyClauses(doc),
          ...detectPlaceholderLeakage(doc, completenessCtx),
          ...detectStructuralNumberingIssues(doc),
          ...detectSpliceContamination(doc),
        ];
        structuralCatastrophic = isCatastrophicStructuralFailure({
          text: doc,
          issues: structuralIssues,
          partyNames: premiumRejectCtx.partyNames ?? undefined,
        });
        materialMissingItems = buildMaterialMissingItems({
          intakeRaw: preGateIntake,
          body: doc,
          structuralIssues,
          serverMissing: effectiveFull.missing_material_info ?? undefined,
        });
        const postProcessMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - postProcessStartedAt,
        );
        paidProPerfSpanEnd("premium_local_pre_processing", { docLen: doc.length, docText: doc });
        paidProPerfRecordInstant("structure_repair", postProcessMs, { docLen: doc.length });
        markPaidProLocalPostProcessingEndAt();
        const classified = classifyLongPremiumHttpOutcome({
          documentText: doc,
          missingMaterial: effectiveFull.missing_material_info,
          serverOutcome: effectiveFull.generation_outcome,
          fatalPlaceholderCount: 0,
          httpOk: fullResp.ok,
        });
        premiumCompletionOutcome = classified;
        const clarificationLines = [
          ...materialMissingItems.map((i) => i.question),
          ...(effectiveFull.missing_material_info ?? []),
        ];
        recommendedClarifications = buildRecommendedClarifications(clarificationLines);
        if (!isAuthoritativePremiumCompletionOutcome(classified)) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info("[premium-completion] blocked authoritative commit", { classified });
          }
        }
        effectiveFull = {
          ...effectiveFull,
          document_text: doc,
          generation_outcome: legacyGenerationOutcomeFromClassification(classified),
        };
      }
      const firstCallOutcomeDegraded = (full.generation_outcome || "").trim() === "degraded";
      let serverGenDegraded = firstCallOutcomeDegraded;
      if (serverGenDegraded) {
        const c0 = (full.server_generation_failure_code || "").trim();
        if (c0 === "json_parse") {
          paidProPerfSpanStart("json_parse_degraded_handling");
          logPaidProJsonParseDegradedDiagnostics(
            buildPaidProJsonParseDegradedDiagnostics({
              documentText: doc,
              serverFullDocumentText: effectiveFull.server_full_document_text,
              failureCode: c0,
              failureMessage: effectiveFull.server_generation_failure_message,
              rawResponseLen: JSON.stringify(full).length,
            }),
          );
          paidProPerfSpanEnd("json_parse_degraded_handling", {
            failureCode: c0,
            docLen: doc.length,
            docText: doc,
          });
        }
        const hard0 = c0 === "airlock_blocked" || c0 === "dev_context_leak";
        const authoritativeCandidate = (pipelineNormalizedAuthoritativeText || doc).trim();
        if (hard0 || !rejectPremiumDegradedFiller(authoritativeCandidate).ok) {
          doc = "";
          effectiveFull = { ...full, document_text: "" };
        } else if (authoritativeCandidate && authoritativeCandidate !== doc) {
          doc = authoritativeCandidate;
          effectiveFull = {
            ...effectiveFull,
            document_text: doc,
            server_full_document_text: doc,
            authoritative_draft: doc,
          };
        }
      }
      let usedClientRetry = false;
      {
        const firstOk =
          (full.generation_outcome || "ok") === "ok" && !firstCallOutcomeDegraded && doc.length >= 400;
        if (firstOk && import.meta.env.MODE !== "test" && !isLongCommerciallyUsablePremiumBody(doc.length)) {
          const freeB = buildAgreementPreviewText(input.structuredDraft, { starterPreview: true });
          const sim0 = lexicalSimilarity(freeB, doc);
          if (sim0 > 0.75) {
            // eslint-disable-next-line no-console
            console.info("[CLAW] premium similarity retry", { sim: Number(sim0.toFixed(4)) });
            const accSimLog = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
            logPremiumSecondGenerationBeforePost({
              reason: "similarity_regeneration",
              doc,
              effectiveFull: full,
              clientAcceptanceOk: accSimLog.ok,
              clientAcceptanceReasons: accSimLog.reasons,
              skipStructuralRetryApplied: false,
              lexicalSimilarityToFreePreview: sim0,
              traceCtx,
              agreementGenerationId: input.agreementGenerationId,
              intakeFingerprint,
            });
            try {
              const regenSim = await postPremiumFullDraftOnce({
                intakeText: rawForSoT || rawIntake,
                context: fullCtx,
                userGapAnswers: gapAns || null,
                similarityRegeneration: true,
                networkCallReason: "similarity_regeneration",
                agreementGenerationId: input.agreementGenerationId ?? null,
                intakeFingerprint,
              });
              const d2 = (regenSim?.document_text || "").trim();
              if (d2.length >= 400 && (regenSim?.generation_outcome || "ok") === "ok") {
                const sim1 = lexicalSimilarity(freeB, d2);
                if (sim1 < sim0 - 0.01 || d2.length > doc.length * 1.08) {
                  const frozenSim = resolvePremiumBodyAgainstSessionFreeze(
                    input.agreementGenerationId,
                    d2,
                    "server_full_draft_retry",
                  );
                  effectiveFull = regenSim;
                  doc = frozenSim.body;
                  usedClientRetry = true;
                }
              }
            } catch {
              /* keep primary */
            }
          }
        }
      }
      let effGenNarrow: "ok" | "needs_details" | "degraded" | undefined = (() => {
        const t = (effectiveFull.generation_outcome ?? "").trim();
        if (t === "ok" || t === "needs_details" || t === "degraded") return t;
        return undefined;
      })();
      let serverSchemaNeedsDetails = effGenNarrow === "needs_details" && !serverGenDegraded;
      const tierBEarlyNeedsDetails = shouldEarlyNeedsDetailsForTierB({
        policy: intentPreflightPolicy,
        generationOutcome: effGenNarrow,
        missingMaterialInfo: effectiveFull.missing_material_info,
      });
      if (
        serverSchemaNeedsDetails &&
        !isLongCommerciallyUsablePremiumBody(doc.length) &&
        !partyPlaceholderRepairResolvesPaidBody
      ) {
        const lines = (effectiveFull.schema_validation_reasons || []).filter(Boolean).slice(0, 8);
        const tierARecoveryAttempt = tierAEnabled && doc.length >= 900;
        if (!tierARecoveryAttempt) {
          proIntentGateMessage =
            lines.length > 0
              ? `We need a few more details so the Pro draft matches your deal type, then you can tap Retry Pro draft.\n\n${lines
                  .map((l) => `• ${l}`)
                  .join("\n")}`
              : "We need a few more details so the Pro draft matches your deal type — add specifics to your intake, then tap Retry Pro draft.";
          doc = "";
          if (tierAEnabled) {
            tierADiag.serverTextClearedBeforeMerge = true;
            tierADiag.serverTextClearReason = "server_generation_outcome_needs_details";
          }
          effectiveFull = { ...effectiveFull, document_text: "" };
        } else if (tierAEnabled) {
          tierADiag.serverTextClearReason = "kept_server_text_for_tier_a_recovery";
        }
      } else if (serverSchemaNeedsDetails && isLongCommerciallyUsablePremiumBody(doc.length)) {
        tierADiag.serverTextClearReason = "long_body_needs_details_advisory_only";
        premiumCompletionOutcome = "authoritative_draft_complete_with_recommended_clarifications";
        const lines = (effectiveFull.schema_validation_reasons || []).filter(Boolean).slice(0, 8);
        if (lines.length > 0) {
          recommendedClarifications = buildRecommendedClarifications(lines, { advisoryOnly: true });
        }
      } else if (
        tierBEarlyNeedsDetails &&
        !isLongCommerciallyUsablePremiumBody(doc.length) &&
        !partyPlaceholderRepairResolvesPaidBody
      ) {
        const lines = (effectiveFull.missing_material_info || []).filter(Boolean).slice(0, 8);
        proIntentGateMessage =
          lines.length > 0
            ? `We need a few more details to finish this Pro draft.\n\n${lines.map((l) => `• ${l}`).join("\n")}`
            : "We need a few more details to finish this Pro draft. Add specifics, then tap Retry Pro draft.";
        doc = "";
        effectiveFull = {
          ...effectiveFull,
          document_text: "",
          generation_outcome: "needs_details",
          schema_validation_reasons: lines,
        };
      } else if (tierBEarlyNeedsDetails && isLongCommerciallyUsablePremiumBody(doc.length)) {
        premiumCompletionOutcome = "authoritative_draft_complete_with_recommended_clarifications";
        recommendedClarifications = buildRecommendedClarifications(
          effectiveFull.missing_material_info ?? [],
          { advisoryOnly: true },
        );
      }
      if (isLongCommerciallyUsablePremiumBody(doc.length)) {
        freezeAcceptedPremiumBodyForSession(input.agreementGenerationId, doc, "server_full_draft");
      }
      {
        const draftingStubRepair = repairContextualDraftingStubPhrases(doc);
        if (draftingStubRepair.repaired.length) {
          doc = draftingStubRepair.text;
          logPremiumCompletionDebug({
            stage: "pipeline_contextual_drafting_stub_repaired",
            repairedCount: draftingStubRepair.repaired.length,
            currentDocLen: doc.length,
          });
        }
        const acc0 = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
        const skipStructuralRetry =
          !acc0.ok &&
          shouldSkipPremiumStructuralRetryForDegradedDisplay({
            documentText: doc,
            intakeText: rawForSoT || rawIntake,
            generationOutcome: effectiveFull.generation_outcome,
            failureCode: effectiveFull.server_generation_failure_code,
            accRejected: true,
          });
        if (skipStructuralRetry) {
          paidProPerfRecordInstant("json_parse_degraded_handling", 0, {
            outcome: "skip_structural_retry",
            extra: {
              retryReason: "degraded_display_eligible",
              documentTextLen: doc.length,
              failureCode: (effectiveFull.server_generation_failure_code || "").trim() || "json_parse",
            },
          });
        }
        const structuralRetryEnabled =
          import.meta.env.MODE !== "test" ||
          Boolean(
            (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest,
          );
        if (
          !acc0.ok &&
          structuralRetryEnabled &&
          !isLongCommerciallyUsablePremiumBody(doc.length) &&
          !skipStructuralRetry
        ) {
          const freeSimBaseline = buildAgreementPreviewText(input.structuredDraft, { starterPreview: true });
          logPremiumSecondGenerationBeforePost({
            reason: "degraded_structural_retry",
            doc,
            effectiveFull,
            clientAcceptanceOk: acc0.ok,
            clientAcceptanceReasons: acc0.reasons,
            skipStructuralRetryApplied: skipStructuralRetry,
            lexicalSimilarityToFreePreview: lexicalSimilarity(freeSimBaseline, doc),
            traceCtx,
            agreementGenerationId: input.agreementGenerationId,
            intakeFingerprint,
          });
          try {
            const full2 = await postPremiumFullDraftOnce({
              intakeText: rawForSoT || rawIntake,
              context: fullCtx,
              userGapAnswers: gapAns || null,
              networkCallReason: "degraded_structural_retry",
              agreementGenerationId: input.agreementGenerationId ?? null,
              intakeFingerprint: intakeFingerprint,
            });
            const nextDoc = (full2.document_text || "").trim();
            const frozen = resolvePremiumBodyAgainstSessionFreeze(
              input.agreementGenerationId,
              nextDoc,
              "server_full_draft_retry",
            );
            doc = frozen.body;
            usedClientRetry = true;
            effectiveFull = full2;
          } catch {
            /* keep first doc */
          }
        }
      }
      {
        const leak0 = scanPremiumOutputForDevContextLeak(doc);
        if (!leak0.ok) {
          logDevContextLeak("premium_completion_pipeline", leak0.labels, { stage: "pre_sanitized_rerun" });
          // Do not bump session generation id here: this run is tied to
          // `isPremiumRequestStillValid()` and bumping would discard a successful regen.
          if (import.meta.env.MODE !== "test") {
            try {
              const minIntake = stripDevContextMarkersForModelRetry(rawForSoT || rawIntake);
              const accDevLog = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
              const freeDevBaseline = buildAgreementPreviewText(input.structuredDraft, { starterPreview: true });
              logPremiumSecondGenerationBeforePost({
                reason: "dev_context_regen",
                doc,
                effectiveFull,
                clientAcceptanceOk: accDevLog.ok,
                clientAcceptanceReasons: accDevLog.reasons,
                skipStructuralRetryApplied: false,
                lexicalSimilarityToFreePreview: lexicalSimilarity(freeDevBaseline, doc),
                traceCtx,
                agreementGenerationId: input.agreementGenerationId,
                intakeFingerprint,
              });
              const regen = await postPremiumFullDraftOnce({
                intakeText: minIntake,
                context: buildSanitizedPremiumFullDraftContext(mergedForApi, rawForSoT || rawIntake),
                userGapAnswers: (gapAns || "").trim() ? stripDevContextMarkersForModelRetry(gapAns) : null,
                networkCallReason: "dev_context_regen",
                agreementGenerationId: input.agreementGenerationId ?? null,
                intakeFingerprint,
              });
              if (regen) {
                doc = (regen.document_text || "").trim();
                effectiveFull = regen;
                usedClientRetry = true;
              }
            } catch {
              /* doc may still be leaking; cleared below */
            }
          }
          const leak1 = scanPremiumOutputForDevContextLeak(doc);
          if (!leak1.ok) {
            logDevContextLeak("premium_completion_pipeline", leak1.labels, { stage: "post_sanitized_rerun" });
            doc = "";
            if (tierAEnabled) {
              tierADiag.serverTextClearedBeforeMerge = true;
              tierADiag.serverTextClearReason = "dev_context_leak_after_rerun";
            }
          }
        }
      }
      {
        const t = (effectiveFull.generation_outcome ?? "").trim();
        effGenNarrow = t === "ok" || t === "needs_details" || t === "degraded" ? t : undefined;
        const fc = (effectiveFull.server_generation_failure_code || "").trim();
        const hardFailure = fc === "airlock_blocked" || fc === "dev_context_leak";
        const docTrim = (doc || "").trim();
        const fillerBad = Boolean(docTrim) && !rejectPremiumDegradedFiller(docTrim).ok;
        serverGenDegraded =
          effGenNarrow === "degraded" && (hardFailure || !docTrim || fillerBad);
        serverSchemaNeedsDetails = effGenNarrow === "needs_details" && !serverGenDegraded;
        if (serverGenDegraded) {
          const c = fc || "unknown";
          const m = (effectiveFull.server_generation_failure_message || "").trim();
          serverGenerationDegraded = {
            code: c,
            message: m || "Your agreement is ready. You can refine any wording below.",
          };
          if ((hardFailure || !docTrim || fillerBad) && m) {
            proIntentGateMessage = m;
          }
          if (import.meta.env.MODE !== "test") {
            const emptyDoc = !docTrim;
            if (hardFailure || emptyDoc || fillerBad) {
              // eslint-disable-next-line no-console
              console.warn("[CLAW] premium generation incomplete", {
                code: c,
                document_empty: emptyDoc,
                degraded_filler: fillerBad,
                generation_outcome: (effectiveFull.generation_outcome || "").trim(),
              });
            } else {
              // eslint-disable-next-line no-console
              console.info("[CLAW] premium degraded accepted", { code: c });
            }
          }
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info("[premium-completion] server_generation_degraded", {
              code: c,
              reasons: (effectiveFull.schema_validation_reasons || []).slice(0, 6),
            });
          }
        } else {
          serverGenerationDegraded = null;
        }
      }
      const clientGatesStartedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      let acc = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
      const intakeS = (rawForSoT || rawIntake).trim();
      const founderIntent = isFounderEquityVestingIntent(intakeS);
      const intentModeFirst: "full" | "base_only" =
        founderIntent && import.meta.env.MODE !== "test" ? "base_only" : "full";
      let vPaid = validatePaidProOutput({
        text: doc,
        rawIntake: rawForSoT || rawIntake,
        draft: mergedForApi,
        skipFounderTitleCheck: founderIntent,
        intentContract,
        intentContractMode: intentModeFirst,
        premiumPipelineSource: "server_full_draft",
      });
      if (intentModeFirst === "full" && !vPaid.ok && !serverSchemaNeedsDetails) {
        proIntentGateMessage = proIntentPlainEnglishForGate(intentContract, vPaid.reasons);
      }
      if (import.meta.env.MODE !== "test" && acc.ok && vPaid.ok && doc && founderIntent) {
        let titleForGate = getResolvedTitleForFounderGating((effectiveFull.title || "").trim(), doc);
        if (!hasRequiredFounderPremiumTitle(titleForGate, doc)) {
          try {
            const freeFounderBaseline = buildAgreementPreviewText(input.structuredDraft, { starterPreview: true });
            logPremiumSecondGenerationBeforePost({
              reason: "founder_title_retry",
              doc,
              effectiveFull,
              clientAcceptanceOk: acc.ok,
              clientAcceptanceReasons: acc.reasons,
              skipStructuralRetryApplied: false,
              lexicalSimilarityToFreePreview: lexicalSimilarity(freeFounderBaseline, doc),
              traceCtx,
              agreementGenerationId: input.agreementGenerationId,
              intakeFingerprint,
            });
            const fr = await postPremiumFullDraftOnce({
              intakeText: buildFounderTitleRetryIntake(intakeS),
              context: fullCtx,
              userGapAnswers: gapAns || null,
              networkCallReason: "founder_title_retry",
              agreementGenerationId: input.agreementGenerationId ?? null,
              intakeFingerprint,
            });
            if (fr) {
              const nextDoc = (fr.document_text || "").trim();
              if (nextDoc) {
                const leakF = scanPremiumOutputForDevContextLeak(nextDoc);
                if (!leakF.ok) {
                  logDevContextLeak("premium_completion_pipeline", leakF.labels, { stage: "post_founder_title_retry" });
                } else {
                  doc = nextDoc;
                  effectiveFull = fr;
                  usedClientRetry = true;
                  acc = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
                  vPaid = validatePaidProOutput({
                    text: doc,
                    rawIntake: rawForSoT || rawIntake,
                    draft: mergedForApi,
                    intentContract,
                    intentContractMode: "full",
                    premiumPipelineSource: "server_full_draft",
                  });
                }
              }
            }
          } catch {
            /* fall through to gate if title still wrong */
          }
        }
        if (acc.ok && vPaid.ok && doc) {
          titleForGate = getResolvedTitleForFounderGating((effectiveFull.title || "").trim(), doc);
          if (!hasRequiredFounderPremiumTitle(titleForGate, doc)) {
            founderDetailsGateMessage = FOUNDER_AGREEMENT_DETAILS_USER_MESSAGE;
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.info("[founder_intent] title gate: required title phrase not found after retry");
            }
            doc = "";
            acc = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
            vPaid = validatePaidProOutput({
              text: doc,
              rawIntake: rawForSoT || rawIntake,
              draft: mergedForApi,
              intentContract,
              intentContractMode: "full",
              premiumPipelineSource: "server_full_draft",
            });
            if (!vPaid.ok) {
              proIntentGateMessage = proIntentPlainEnglishForGate(intentContract, vPaid.reasons);
            }
          }
        }
        if (intentModeFirst === "base_only" && acc.ok && vPaid.ok && doc) {
          vPaid = validatePaidProOutput({
            text: doc,
            rawIntake: rawForSoT || rawIntake,
            draft: mergedForApi,
            skipFounderTitleCheck: false,
            intentContract,
            intentContractMode: "full",
            premiumPipelineSource: "server_full_draft",
          });
          if (!vPaid.ok) {
            proIntentGateMessage = proIntentPlainEnglishForGate(intentContract, vPaid.reasons);
            doc = "";
            if (tierAEnabled) {
              tierADiag.serverTextClearedBeforeMerge = true;
              tierADiag.serverTextClearReason = "paid_output_validation_failed";
            }
            acc = rejectPremiumBodyForProRender(doc, premiumRejectCtx);
          }
        }
      }
      {
        const t = (effectiveFull.generation_outcome ?? "").trim();
        effGenNarrow = t === "ok" || t === "needs_details" || t === "degraded" ? t : undefined;
        const fc = (effectiveFull.server_generation_failure_code || "").trim();
        const hardFailure = fc === "airlock_blocked" || fc === "dev_context_leak";
        const docTrim = (doc || "").trim();
        const fillerBad = Boolean(docTrim) && !rejectPremiumDegradedFiller(docTrim).ok;
        serverGenDegraded =
          effGenNarrow === "degraded" && (hardFailure || !docTrim || fillerBad);
        serverSchemaNeedsDetails = effGenNarrow === "needs_details" && !serverGenDegraded;
        if (serverGenDegraded) {
          const c = fc || "unknown";
          const m = (effectiveFull.server_generation_failure_message || "").trim();
          serverGenerationDegraded = {
            code: c,
            message: m || "Your agreement is ready. You can refine any wording below.",
          };
        } else {
          serverGenerationDegraded = null;
        }
      }
      lastClientGateTrace = {
        accOk: acc.ok,
        accReasons: acc.reasons.slice(0, 20),
        vPaidOk: vPaid.ok,
        vPaidReasons: vPaid.reasons.slice(0, 20),
        docLen: (doc || "").length,
        effGen: (effectiveFull.generation_outcome || "").trim(),
      };
      // A long, validated server_full_document_text is the authoritative paid corpus: it must win
      // over client structural soft gates (similarity / anchor / length-shape). Adopt it as the body
      // and clear soft structural rejections so a complete server document is never dropped to
      // "Retry Pro draft" (which let a short fallback masquerade as the SoT). Fatal placeholders and
      // dev-context leaks are still enforced (hard failure codes + the finalize pass below).
      const serverFullDoc =
        (effectiveFull.server_full_document_text || "").trim() ||
        extractPremiumApiServerCorpusText(effectiveFull);
      const serverFailureCodeForWin = (effectiveFull.server_generation_failure_code || "").trim();
      const serverHardFailureForWin =
        serverFailureCodeForWin === "airlock_blocked" || serverFailureCodeForWin === "dev_context_leak";
      const serverFullDocumentAuthoritative = serverFullDocumentWinsOverClientGates({
        serverFullDocumentLen: serverFullDoc.length,
        httpOk: true,
        hardStructuralFailure: serverHardFailureForWin,
      });
      if (serverFullDocumentAuthoritative) {
        const adoptedServerFull = applyAcceptedProCorpusSafeDisplay(serverFullDoc, {
          draft: mergedForApi,
          intakeText: rawForSoT || rawIntake,
          surface: "premium_completion_pipeline:server_full_adopt",
        }).text.trim();
        if (adoptedServerFull.length >= (doc || "").length) {
          doc = adoptedServerFull;
        }
        acc = { ok: true, reasons: [] };
      }
      let placeholderClientOk = true;
      let fatalPlaceholderCount = 0;
      if (acc.ok) {
        const placeholderStartedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const ph = finalizeUserVisibleAgreementPlainText(doc, {
          intakeRaw: (rawForSoT || rawIntake || "").trim(),
          partyNames: (merged.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean),
          agreementFamily: merged.agreement_family ?? null,
          surface: "premium_completion_pipeline",
        });
        fatalPlaceholderCount = ph.remainingFatal.length;
        if (!ph.ok) {
          placeholderClientOk = false;
          if (!proIntentGateMessage) {
            proIntentGateMessage =
              "Unresolved drafting placeholders remain in the Pro agreement. Edit the document or run **Retry Pro draft**.";
          }
          logPremiumCompletionDebug({
            stage: "pipeline_placeholder_blocked",
            remaining: ph.remainingFatal,
            remaining_fatal: ph.remainingFatal,
            remaining_nonfatal: ph.remainingDetail.filter((d) => !d.fatal).map((d) => d.token),
            repaired: ph.repaired,
            accepted: false,
          });
        } else {
          doc = ph.text;
        }
        paidProPerfRecordInstant(
          "placeholder_gate",
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - placeholderStartedAt,
          ),
          { docLen: doc.length, outcome: placeholderClientOk ? "ok" : "blocked" },
        );
      }
      paidProPerfRecordE2ePhase("frontend_client_gates", {
        durationMs: Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - clientGatesStartedAt,
        ),
        accOk: acc.ok,
        vPaidOk: vPaid.ok,
        placeholderOk: placeholderClientOk,
      });
      const structuralFatalCount = countStructuralFatals(acc.reasons);
      const longAdvisoryAccept = shouldPreserveLongPremiumDespiteSoftGateFailure({
        bodyLen: (doc || "").length,
        fatalPlaceholderCount,
        structuralFatalCount,
        httpOk: true,
      });
      // A `degraded` HTTP-200 body whose only failure is a nonfatal parse error (e.g. json_parse)
      // must NOT be rejected when it is long, placeholder-clean, structurally sound and has the
      // required paid sections. Only the intelligence metadata degrades — the agreement body stays
      // authoritative. Without this a complete ~9k draft is wrongly dropped to "Retry Pro draft".
      const standardClientGatesPass = acc.ok && vPaid.ok && placeholderClientOk;
      const jsonParseNonfatalAccept =
        !standardClientGatesPass &&
        !longAdvisoryAccept &&
        acc.ok &&
        placeholderClientOk &&
        isNonfatalParseDegradedPaidAccept({
          failureCode: (effectiveFull.server_generation_failure_code || "").trim(),
          bodyLen: (doc || "").length,
          fatalPlaceholderCount,
          structuralOk: acc.ok && placeholderClientOk,
          hasRequiredSections: premiumBodyHasRequiredPaidSections({
            text: doc,
            rawIntake: rawForSoT || rawIntake,
            draft: mergedForApi,
          }),
        });
      // A validated long server_full_document_text wins over soft vPaid failures too.
      const serverFullDocumentWins = serverFullDocumentAuthoritative && placeholderClientOk;
      // A deterministically party-placeholder-repaired body (only gap was a known party name) is
      // authoritative once it is structurally clean, placeholder-free, and section-complete. This
      // accepts the repaired body even when vPaid soft-fails — without it the paid user is stranded.
      const partyPlaceholderRepairAccept =
        partyPlaceholderRepairResolvesPaidBody &&
        acc.ok &&
        placeholderClientOk &&
        partyPlaceholderRepairYieldsAuthoritativePaidBody({
          repaired: partyPlaceholderRepairApplied,
          hasRemainingIdentityPlaceholder: !placeholderClientOk || fatalPlaceholderCount > 0,
          structuralOk: acc.ok,
          bodyLen: (doc || "").length,
          hasRequiredSections: premiumBodyHasRequiredPaidSections({
            text: doc,
            rawIntake: rawForSoT || rawIntake,
            draft: mergedForApi,
          }),
        });
      const advisoryAccept =
        longAdvisoryAccept || jsonParseNonfatalAccept || serverFullDocumentWins || partyPlaceholderRepairAccept;
      if (advisoryAccept && (!vPaid.ok || !placeholderClientOk)) {
        if (jsonParseNonfatalAccept || serverFullDocumentWins || partyPlaceholderRepairAccept) {
          // The body is authoritative; only the intelligence metadata / soft gate failed. Override any
          // earlier "degraded" classification so the surface treats this as a complete paid draft.
          premiumCompletionOutcome = "authoritative_draft_complete_with_recommended_clarifications";
        } else if (!premiumCompletionOutcome) {
          premiumCompletionOutcome = classifyLongPremiumHttpOutcome({
            documentText: doc,
            missingMaterial: effectiveFull.missing_material_info,
            serverOutcome: effectiveFull.generation_outcome,
            fatalPlaceholderCount,
            httpOk: true,
          });
        }
        if (!recommendedClarifications?.items.length) {
          recommendedClarifications = buildRecommendedClarifications(
            effectiveFull.missing_material_info ?? effectiveFull.schema_validation_reasons ?? [],
            { advisoryOnly: true },
          );
        }
        if (!proIntentGateMessage && vPaid.reasons.length > 0) {
          proIntentGateMessage = proIntentPlainEnglishForGate(intentContract, vPaid.reasons.slice(0, 6));
        }
      }
      if (standardClientGatesPass || advisoryAccept) {
        const familyDecision = resolveAuthoritativePaidProAgreementFamily({
          intakeText: rawForSoT || rawIntake,
          draft: merged,
          serverFamilyHint: effectiveFull.agreement_family,
          inputAgreementFamily: input.agreementFamily ?? null,
          traceId: traceCtx.traceId,
          sessionGenerationId: input.agreementGenerationId ?? null,
          intakeFingerprint,
        });
        const srvFull =
          (effectiveFull.server_full_document_text || "").trim() ||
          extractPremiumApiServerCorpusText(effectiveFull) ||
          doc;
        const srvRepair = (effectiveFull.server_repair_document_text || "").trim();
        outMerged = stripClientPremiumArtifactBlocksFromDraft({
          ...merged,
          premium_full_document_text: doc,
          premium_server_full_document_text: srvFull.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN ? srvFull : doc,
          premium_server_repair_document_text: srvRepair || null,
          premium_full_draft_key_terms: effectiveFull.key_terms_found,
          premium_full_draft_missing_info: effectiveFull.missing_material_info,
          title: (effectiveFull.title || "").trim() || merged.title,
          agreement_family: familyDecision.family,
        });
        winningPremiumBodyText = doc;
        if (serverGenDegraded) {
          const fc = (effectiveFull.server_generation_failure_code || "").trim();
          if (fc !== "airlock_blocked" && fc !== "dev_context_leak") {
            premiumRenderSource = "server_full_draft_degraded";
          } else {
            premiumRenderSource = usedClientRetry ? "server_full_draft_retry" : "server_full_draft";
          }
        } else {
          premiumRenderSource = usedClientRetry ? "server_full_draft_retry" : "server_full_draft";
        }
        outMerged = applyAuthoritativeFamilyToDraft(outMerged, familyDecision);
        if (import.meta.env.DEV) {
          console.info("[premium-render-source]", {
            premiumRenderSource,
            doc_len: doc.length,
            client_retry: usedClientRetry,
            server_gen_degraded: serverGenDegraded,
          });
        }
        if (import.meta.env.MODE !== "test" && !serverGenDegraded) {
          // eslint-disable-next-line no-console
          console.info("[CLAW] premium accepted", { source: premiumRenderSource, doc_len: doc.length });
        }
        paidProPerfSpanStart("post_accept_commit_render");
        freezeAcceptedPremiumBodyForSession(
          input.agreementGenerationId,
          doc,
          usedClientRetry ? "server_full_draft_retry" : "server_full_draft",
        );
        markPaidProAuthoritativeValidationPassed({
          text: doc,
          source: premiumRenderSource,
        });
        if (import.meta.env.MODE !== "test") {
          // eslint-disable-next-line no-console
          console.info("[paid-pro-acceptance]", {
            renderSource: premiumRenderSource,
            docLen: doc.length,
            generationOutcome: (effectiveFull.generation_outcome || "").trim(),
            failureCode: serverGenDegraded
              ? (effectiveFull.server_generation_failure_code || "").trim()
              : undefined,
            clientRetry: usedClientRetry,
          });
        }
        logPremiumAcceptanceDecision({
          accepted: true,
          reason: serverFullDocumentWins && (!vPaid.ok || !acc.ok)
            ? "server_full_document_authoritative"
            : partyPlaceholderRepairAccept && (!vPaid.ok || !standardClientGatesPass)
              ? "party_placeholder_repaired_authoritative"
              : jsonParseNonfatalAccept
                ? "json_parse_nonfatal_body_authoritative"
                : longAdvisoryAccept && (!vPaid.ok || !placeholderClientOk)
                  ? "long_body_advisory_accept"
                  : "client_gates_passed",
          bodyLen: doc.length,
          fatalPlaceholderCount,
          structuralFatalCount,
          generationOutcome: (effectiveFull.generation_outcome || "").trim(),
          renderSource: premiumRenderSource,
        });
        paidProPerfRecordE2ePhase("authoritative_commit", {
          renderSource: premiumRenderSource,
          docLen: doc.length,
        });
        paidProPerfSpanEnd("post_accept_commit_render", {
          docLen: doc.length,
          docText: doc,
          outcome: premiumRenderSource,
        });
        logPremiumCompletionDebug({
          stage: "pipeline_client_gates_passed",
          docLen: doc.length,
          placeholder_fatal_count: fatalPlaceholderCount,
          generationOutcome: (effectiveFull.generation_outcome || "").trim(),
          degraded: serverGenDegraded,
          failureCode:
            serverGenDegraded || jsonParseNonfatalAccept
              ? (effectiveFull.server_generation_failure_code || "").trim()
              : undefined,
          accepted: true,
          advisoryOnly: advisoryAccept && (!vPaid.ok || !placeholderClientOk),
        });
      } else {
        const intakeSForGate = (rawForSoT || rawIntake) || "";
        const vpaidDiag = acc.ok && !vPaid.ok ? buildPaidProValidationDiagnostics(doc || "", intakeSForGate) : null;
        logPremiumCompletionDebug({
          stage: "pipeline_client_gates_rejected",
          accStructuralOk: acc.ok,
          accStructuralReasons: acc.reasons.slice(0, 20),
          validationOk: vPaid.ok,
          validationReasons: vPaid.reasons.slice(0, 20),
          docLen: (doc || "").length,
          intakeLen: intakeSForGate.length,
          normalizedSourceField:
            pipelineNormalizedAuthoritativeText.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN
              ? normalizePremiumFullDraftResponsePayload(
                  effectiveFull as PremiumFullDraftResult & Record<string, unknown>,
                ).sourceField
              : null,
          normalizedAuthoritativeLen: pipelineNormalizedAuthoritativeText.length,
          sourceFactHits: vpaidDiag?.sourceFactHits,
          validationDiagnostics: vpaidDiag
            ? {
                partyAnchorsSatisfied: vpaidDiag.partyAnchorsSatisfied,
                namePairsInBody: vpaidDiag.namePairsInBody,
                projectAnchor: vpaidDiag.projectAnchor,
                governingLaw: {
                  delawareOperative: vpaidDiag.sourceFactHits.governingLawDelawareMention,
                  oklahoma: vpaidDiag.sourceFactHits.governingLawOklahomaMention,
                },
              }
            : undefined,
          generationOutcome: (effectiveFull.generation_outcome || "").trim(),
          degraded: serverGenDegraded,
          failureCode: serverGenDegraded ? (effectiveFull.server_generation_failure_code || "").trim() : undefined,
          accepted: false,
          rejectedReason: "acc_or_vpaid_failed",
        });
        if (import.meta.env.DEV) {
          if (!acc.ok) {
            console.warn("[premium-full-draft] client acceptance rejected server body; using fallback", acc.reasons);
          } else {
            // eslint-disable-next-line no-console
            console.warn("[premium-full-draft] paid-pro quality gate rejected server body", vPaid.reasons, vpaidDiag);
          }
          // eslint-disable-next-line no-console
          console.info("[premium-completion-accept] gate_fail", {
            acc_ok: acc.ok,
            vpaid_ok: vPaid.ok,
            server_degraded: serverGenDegraded,
            doc_len: (doc || "").length,
            premium_gen_out: (effectiveFull.generation_outcome || "").trim(),
          });
        }
        logPremiumAcceptanceDecision({
          accepted: false,
          reason: "client_gates_rejected",
          bodyLen: (doc || "").length,
          fatalPlaceholderCount,
          structuralFatalCount,
          generationOutcome: (effectiveFull.generation_outcome || "").trim(),
          renderSource: premiumRenderSource,
        });
        if (!proIntentGateMessage && intentContract.pro_strict && (!acc.ok || !vPaid.ok)) {
          const gateReasons = !vPaid.ok ? vPaid.reasons : acc.reasons;
          if (!acc.ok && gateReasons.some((r) => r.startsWith("placeholder:"))) {
            proIntentGateMessage = formatPremiumPaidCorpusRejectedMessage();
          } else {
            proIntentGateMessage = proIntentPlainEnglishForGate(intentContract, gateReasons);
          }
        }
        const frozenReject = getFrozenPremiumBodyForSession(input.agreementGenerationId);
        if (
          longAdvisoryAccept ||
          (frozenReject && isLongCommerciallyUsablePremiumBody(frozenReject.body.length))
        ) {
          const preserved = frozenReject?.body || doc;
          doc = preserved;
          winningPremiumBodyText = preserved;
          premiumRenderSource = (frozenReject?.source || "server_full_draft") as PremiumRenderSource;
          const preservedFamily = resolveAuthoritativePaidProAgreementFamily({
            intakeText: rawForSoT || rawIntake,
            draft: merged,
            serverFamilyHint: effectiveFull.agreement_family,
            inputAgreementFamily: input.agreementFamily ?? null,
            traceId: traceCtx.traceId,
            sessionGenerationId: input.agreementGenerationId ?? null,
            intakeFingerprint,
          });
          outMerged = applyAuthoritativeFamilyToDraft(
            stripClientPremiumArtifactBlocksFromDraft({
              ...merged,
              premium_full_document_text: preserved,
              premium_server_full_document_text:
                (effectiveFull.server_full_document_text || "").trim() || preserved,
              premium_server_repair_document_text: (effectiveFull.server_repair_document_text || "").trim() || null,
              premium_full_draft_key_terms: effectiveFull.key_terms_found,
              premium_full_draft_missing_info: effectiveFull.missing_material_info,
              title: (effectiveFull.title || "").trim() || merged.title,
              agreement_family: preservedFamily.family,
            }),
            preservedFamily,
          );
          premiumCompletionOutcome =
            premiumCompletionOutcome ||
            "authoritative_draft_complete_with_recommended_clarifications";
          logPremiumAcceptanceDecision({
            accepted: true,
            reason: "preserved_long_corpus_after_soft_reject",
            bodyLen: preserved.length,
            fatalPlaceholderCount,
            structuralFatalCount,
            generationOutcome: (effectiveFull.generation_outcome || "").trim(),
            renderSource: premiumRenderSource,
          });
        } else if (acc.ok || founderDetailsGateMessage || proIntentGateMessage) {
          premiumRenderSource = "rejected_paid_corpus";
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logPremiumCompletionDebug({
      stage: "premium_full_draft_try_catch",
      accepted: false,
      rejectedReason: "exception",
      errSnippet: msg.slice(0, 300),
    });
    if (import.meta.env.DEV) {
      console.warn("[premium-full-draft] call failed, using dynamic sections", e);
    }
  }
  if (
    !(winningPremiumBodyText || "").trim() &&
    premiumRenderSource !== "rejected_paid_corpus" &&
    premiumRenderSource !== "premium_network_retryable" &&
    premiumRenderSource !== "premium_generation_retryable"
  ) {
    const stripped = stripClientPremiumArtifactBlocksFromDraft(outMerged);
    const rawSoT = rawForSoT || rawIntake;
    let fb =
      import.meta.env.MODE === "test"
        ? buildAgreementPreviewText(stripped, {
            starterPreview: false,
            premiumDeliverablePreview: true,
            intakeText: rawSoT,
          })
        : buildPremiumPostCheckoutStitchedBody(stripped, rawSoT);
    const phFb = finalizeUserVisibleAgreementPlainText(fb, {
      intakeRaw: (rawSoT || "").trim(),
      partyNames: (merged.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean),
      agreementFamily: merged.agreement_family ?? null,
      surface: "premium_completion_fallback_stitched",
    });
    if (!phFb.ok) {
      logPremiumCompletionDebug({
        stage: "fallback_stitched_placeholder_blocked",
        remaining: phFb.remaining,
        repaired: phFb.repaired,
        accepted: false,
      });
      if (!proIntentGateMessage) {
        proIntentGateMessage =
          "Unresolved drafting placeholders remain in the fallback preview. Edit fields or run **Retry Pro draft**.";
      }
      fb = "";
    } else {
      fb = phFb.text;
    }
    const frozenFallback = getFrozenPremiumBodyForSession(input.agreementGenerationId);
    const candidateLen = frozenFallback?.body.length ?? 0;
    const fbLen = (fb || "").trim().length;
    if (shouldSuppressShortFallbackOverLongCandidate(candidateLen, fbLen) && frozenFallback) {
      winningPremiumBodyText = frozenFallback.body;
      premiumRenderSource = frozenFallback.source as PremiumRenderSource;
      outMerged = stripClientPremiumArtifactBlocksFromDraft({
        ...outMerged,
        premium_full_document_text: frozenFallback.body,
      });
      premiumCompletionOutcome =
        premiumCompletionOutcome || "authoritative_draft_complete_with_recommended_clarifications";
      logPremiumAcceptanceDecision({
        accepted: true,
        reason: "suppressed_short_fallback_over_frozen_long_corpus",
        bodyLen: frozenFallback.body.length,
        fatalPlaceholderCount: 0,
        structuralFatalCount: 0,
        generationOutcome: (tierADiag.backendGenerationOutcome || "needs_details").trim() || "needs_details",
        renderSource: frozenFallback.source,
      });
    } else if (import.meta.env.MODE === "test") {
      winningPremiumBodyText = fb;
      premiumRenderSource = "fallback_preview";
    } else {
      winningPremiumBodyText = "";
      premiumRenderSource = "rejected_paid_corpus";
      if (!proIntentGateMessage) {
        proIntentGateMessage =
          "LawDog could not establish a secure Pro agreement from the server. Tap **Retry Pro draft** to try again.";
      }
      logPremiumCompletionDebug({
        stage: "post_checkout_fallback_preview_blocked",
        accepted: false,
        rejectedReason: "no_server_full_document_after_checkout",
        fbLen,
        candidateLen,
      });
    }
  }

  if (input.isPremiumRequestStillValid && !input.isPremiumRequestStillValid()) {
    if (tierAEnabled) {
      tierADiag.staleOrFingerprintMismatch = true;
      tierADiag.premiumPipelineSource = "stale_intake";
    }
    const cleared = {
      ...outMerged,
      premium_full_document_text: null,
      premium_server_full_document_text: null,
      premium_server_repair_document_text: null,
    };
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[premium-completion] stale_intake_or_generation; discarding result", {
        active_generation_id: input.agreementGenerationId,
        raw_intake_fingerprint: shortIntakeFingerprint(rawIntake),
        request_fingerprint: input.premiumRequestIntakeFingerprint,
      });
    }
    return {
      premiumDraft: stripClientPremiumArtifactBlocksFromDraft(cleared),
      premiumParties: (cleared.parties || []).map((p) => ({ name: nz(p.name), role: nz(p.role) || "party" })),
      recipientCandidates: (cleared.parties || []).map((p) => ({ name: p.name, email: "", role: "Party" })),
      winningPremiumBodyText: "",
      premiumRenderSource: "stale_intake",
      premiumReview: null,
      premiumFinalizeAudit: null,
      premiumReviewRoute: null,
      staleIntakeOrGeneration: true,
      agreementGenerationId: input.agreementGenerationId,
      premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
      tierADiagnostic: tierADiag,
    };
  }

  const fullDraftAccepted =
    Boolean((outMerged.premium_full_document_text || "").trim()) &&
    rejectPremiumBodyForProRender((outMerged.premium_full_document_text || "").trim(), {
      intakeLower: intakeLowerGlobal,
      intakeText: rawForSoT || rawIntake,
      partyNames: outMerged.parties?.map((p) => p.name) ?? null,
    }).ok;
  if (import.meta.env.DEV) {
    const hit = gapTraceNeedlesHit(winningPremiumBodyText || "");
    console.info("[gap-trace] stage=frontend_acceptance_step", {
      full_draft_accepted: fullDraftAccepted,
      premium_render_source: premiumRenderSource,
      winning_len: (winningPremiumBodyText || "").length,
      winning_contains_needles: hit.length > 0,
      needles_hit: hit,
      user_gap_answers_len: (input.userGapAnswers || "").trim().length,
    });
  }
  const premiumReview: PremiumAgreementReview | null = null;
  const premiumFinalizeAudit: PremiumFinalizeAudit | null = null;
  const premiumReviewRoute: PremiumReviewRoute | null = null;

  const premiumParties = (outMerged.parties || []).map((p) => ({
    name: nz(p.name),
    role: nz(p.role) || "party",
  }));

  const recipientCandidates: PremiumRecipientCandidate[] = buildPremiumRecipientCandidatesFromIntake(
    premiumParties.map((p) => p.name),
    rawForSoT || rawIntake,
  );

  void input.guidedFlowId;

  const finalWinning = (winningPremiumBodyText || "").trim();
  if (premiumRenderSource === "premium_network_retryable") {
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: outMerged,
      rawIntake: rawForSoT || rawIntake,
      intakeLower: intakeLowerGlobal,
      recoverySurface: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    if (localRecovery.ok && localRecovery.body.length >= PREMIUM_USABLE_BODY_MIN_LEN) {
      const recoverySource = PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
      if (tierAEnabled) tierADiag.premiumPipelineSource = recoverySource;
      logPremiumCompletionDebug({
        stage: "premium_network_local_recovery",
        accepted: true,
        rejectedReason: undefined,
        premiumRenderSource: recoverySource,
        bodyLen: localRecovery.body.length,
      });
      outMerged = stripClientPremiumArtifactBlocksFromDraft({
        ...outMerged,
        premium_full_document_text: localRecovery.body,
      });
      return {
        premiumDraft: outMerged,
        premiumParties,
        recipientCandidates,
        winningPremiumBodyText: localRecovery.body,
        premiumRenderSource: recoverySource,
        premiumReview,
        premiumFinalizeAudit,
        premiumReviewRoute,
        staleIntakeOrGeneration: false,
        agreementGenerationId: input.agreementGenerationId,
        premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
        founderDetailsGateMessage: null,
        proIntentGateMessage: null,
        serverGenerationDegraded: null,
        premiumNetworkRetryable: true,
        premiumNetworkLocalRecovery: true,
        tierADiagnostic: tierADiag,
      };
    }
    if (tierAEnabled) tierADiag.premiumPipelineSource = premiumRenderSource;
    logPremiumGenerationApiUnavailable({
      endpoint: PREMIUM_GENERATION_DRAFT_API_PATH,
      error: "network_retryable",
      fallbackBlocked: !localRecovery.ok,
      stage: "pipeline_return_premium_network_retryable",
      pipelineSource: premiumRenderSource,
    });
    logPremiumCompletionDebug({
      stage: "pipeline_return_premium_network_retryable",
      accepted: false,
      rejectedReason: localRecovery.ok ? "network_retryable" : localRecovery.reasons.join(","),
      premiumRenderSource: "premium_network_retryable",
      localRecoveryAttempted: true,
      localRecoveryOk: localRecovery.ok,
    });
    return {
      premiumDraft: outMerged,
      premiumParties,
      recipientCandidates,
      winningPremiumBodyText: "",
      premiumRenderSource,
      premiumReview,
      premiumFinalizeAudit,
      premiumReviewRoute,
      staleIntakeOrGeneration: false,
      agreementGenerationId: input.agreementGenerationId,
      premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
      premiumNetworkRetryable: true,
      tierADiagnostic: tierADiag,
    };
  }
  if (premiumRenderSource === "premium_generation_retryable") {
    if (tierAEnabled) tierADiag.premiumPipelineSource = premiumRenderSource;
    logPremiumCompletionDebug({
      stage: "pipeline_return_premium_generation_retryable",
      accepted: false,
      rejectedReason: "generation_retryable",
      premiumRenderSource: "premium_generation_retryable",
    });
    return {
      premiumDraft: outMerged,
      premiumParties,
      recipientCandidates,
      winningPremiumBodyText: "",
      premiumRenderSource,
      premiumReview,
      premiumFinalizeAudit,
      premiumReviewRoute,
      staleIntakeOrGeneration: false,
      agreementGenerationId: input.agreementGenerationId,
      premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
      premiumGenerationRetryable: true,
      tierADiagnostic: tierADiag,
    };
  }
  if (premiumRenderSource === "rejected_paid_corpus") {
    const suppressDegradedLocalRecovery =
      pipelineNormalizedAuthoritativeText.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN;
    if (suppressDegradedLocalRecovery) {
      if (tierAEnabled) tierADiag.premiumPipelineSource = premiumRenderSource;
      logPremiumCompletionDebug({
        stage: "pipeline_return_rejected_paid_corpus",
        accepted: false,
        rejectedReason: "rejected_paid_corpus_normalized_server_present",
        premiumRenderSource: "rejected_paid_corpus",
        lastClientGate: lastClientGateTrace,
        localRecoveryAttempted: false,
        localRecoveryOk: false,
        localRecoverySuppressed: true,
        normalizedAuthoritativeLen: pipelineNormalizedAuthoritativeText.length,
      });
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[paid-pro-gate] rejected normalized server document; local recovery suppressed", {
          normalizedLen: pipelineNormalizedAuthoritativeText.length,
          lastClientGate: lastClientGateTrace,
        });
      }
      return {
        premiumDraft: outMerged,
        premiumParties,
        recipientCandidates,
        winningPremiumBodyText: "",
        premiumRenderSource,
        premiumReview,
        premiumFinalizeAudit,
        premiumReviewRoute,
        staleIntakeOrGeneration: false,
        agreementGenerationId: input.agreementGenerationId,
        premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
        founderDetailsGateMessage: null,
        proIntentGateMessage,
        serverGenerationDegraded: serverGenerationDegraded ?? serverDegradedHttpMetaForRecovery,
        tierADiagnostic: tierADiag,
      };
    }
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: outMerged,
      rawIntake: rawForSoT || rawIntake,
      intakeLower: intakeLowerGlobal,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    if (localRecovery.ok && localRecovery.body.length >= PREMIUM_USABLE_BODY_MIN_LEN) {
      const recoverySource = PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE;
      if (tierAEnabled) tierADiag.premiumPipelineSource = recoverySource;
      logPremiumCompletionDebug({
        stage: "premium_degraded_server_local_recovery",
        accepted: true,
        rejectedReason: undefined,
        premiumRenderSource: recoverySource,
        bodyLen: localRecovery.body.length,
        lastClientGate: lastClientGateTrace,
      });
      outMerged = stripClientPremiumArtifactBlocksFromDraft({
        ...outMerged,
        premium_full_document_text: localRecovery.body,
      });
      return {
        premiumDraft: outMerged,
        premiumParties,
        recipientCandidates,
        winningPremiumBodyText: localRecovery.body,
        premiumRenderSource: recoverySource,
        premiumReview,
        premiumFinalizeAudit,
        premiumReviewRoute,
        staleIntakeOrGeneration: false,
        agreementGenerationId: input.agreementGenerationId,
        premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
        founderDetailsGateMessage: null,
        proIntentGateMessage: null,
        serverGenerationDegraded: serverGenerationDegraded ?? serverDegradedHttpMetaForRecovery,
        premiumDegradedServerRecoverable: true,
        premiumDegradedServerLocalRecovery: true,
        tierADiagnostic: tierADiag,
      };
    }
    if (tierAEnabled) tierADiag.premiumPipelineSource = premiumRenderSource;
    logPremiumCompletionDebug({
      stage: "pipeline_return_rejected_paid_corpus",
      accepted: false,
      rejectedReason: "rejected_paid_corpus",
      premiumRenderSource: "rejected_paid_corpus",
      lastClientGate: lastClientGateTrace,
      localRecoveryAttempted: true,
      localRecoveryOk: localRecovery.ok,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-gate] rejected; omitting fallback stitched body", {
        premiumRenderSource,
        localRecoveryOk: localRecovery.ok,
      });
    }
    return {
      premiumDraft: outMerged,
      premiumParties,
      recipientCandidates,
      winningPremiumBodyText: "",
      premiumRenderSource,
      premiumReview,
      premiumFinalizeAudit,
      premiumReviewRoute,
      staleIntakeOrGeneration: false,
      agreementGenerationId: input.agreementGenerationId,
      premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
      founderDetailsGateMessage: founderDetailsGateMessage ?? null,
      proIntentGateMessage:
        proIntentGateMessage ||
        "We couldn’t complete the Pro upgrade with your terms yet. Tap **Retry Pro draft** to try again, or add more deal detail to your intake first.",
      serverGenerationDegraded: serverGenerationDegraded ?? serverDegradedHttpMetaForRecovery,
      premiumDegradedServerRecoverable: true,
      tierADiagnostic: tierADiag,
    };
  }
  if (tierAEnabled) tierADiag.premiumPipelineSource = premiumRenderSource;
  const finalFallback = buildAgreementPreviewText(stripClientPremiumArtifactBlocksFromDraft(outMerged), {
    starterPreview: false,
    premiumDeliverablePreview: true,
    intakeText: rawForSoT || rawIntake,
  });

  if (import.meta.env.DEV) {
    const src = String(premiumRenderSource || "");
    const win = (finalWinning || "").trim();
    if (win.length >= 500 && isAuthoritativePremiumPipelineRenderSource(src)) {
      const rawSoT = (rawForSoT || rawIntake || "").trim() || rawIntake;
      const ic = resolveAgreementIntentContract(rawSoT);
      const vPaidOut = validatePaidProOutput({
        text: win,
        rawIntake: rawSoT,
        intentContract: ic,
        draft: outMerged,
        premiumPipelineSource: premiumRenderSource,
      });
      const gOut = canShowPremiumSuccess({
        intentContract: ic,
        renderSource: "server_full_document_text",
        validation: vPaidOut,
        documentText: win,
        intakeText: rawSoT,
        premiumPipelineSource: premiumRenderSource,
        stale: false,
        draft: outMerged,
        qualityRetryActive: false,
        serverGenerationDegraded: Boolean(serverGenerationDegraded),
        allowPaidSubstantiveStitch: win.length >= 500,
      });
      logDevPostPremiumFullDraftPipelineReturn({
        winningBodyLen: win.length,
        premiumRenderSource: src,
        validatePaidProOutputOk: vPaidOut.ok,
        validatePaidProReasons: vPaidOut.reasons,
        canShowPremiumSuccessState: gOut.state,
        successBannerReasons: (gOut as { successBannerReasons?: string[] }).successBannerReasons,
      });
    }
  }

  return {
    premiumDraft: outMerged,
    premiumParties,
    recipientCandidates,
    winningPremiumBodyText: finalWinning || finalFallback,
    premiumRenderSource,
    premiumReview,
    premiumFinalizeAudit,
    premiumReviewRoute,
    staleIntakeOrGeneration: false,
    agreementGenerationId: input.agreementGenerationId,
    premiumRequestIntakeFingerprint: input.premiumRequestIntakeFingerprint,
    founderDetailsGateMessage: null,
    proIntentGateMessage: null,
    serverGenerationDegraded,
    tierADiagnostic: tierADiag,
    premiumCompletionOutcome,
    recommendedClarifications,
    structuralCatastrophic,
    materialMissingItems: materialMissingItems.length ? materialMissingItems : undefined,
    agreementIntelligence,
    agreementValidation,
  };
}
