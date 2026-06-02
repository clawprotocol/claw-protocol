import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { apiUrl } from "../../lib/clawApi";
import { waitForBrowserOnline } from "./premiumBackendHealth";
import { logPremiumSessionConsistency, shortIdForPremiumLog } from "./premiumSessionDiagnostics";
import {
  classifyPremiumFullDraftGenerationRetryable,
  logPremiumAirlockEmptyOutput,
  logPremiumGenerationRetryableFailure,
} from "./premiumGenerationRetryable";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { IntakePaymentField } from "./intakeCurrencyParse";
import {
  type AgreementIntentContract,
  type AgreementIntentContractApi,
  buildIntentContractApiPayload,
  resolveAgreementIntentContract,
} from "./agreementIntentContract";
import { applyDeterministicIntentToPremiumFullDraftContext } from "./deterministicIntentTitleMapper";
import { gapTraceNeedlesHit } from "./gapTraceNeedles";
import { logPremiumCompletionDebug } from "./premiumCompletionDebugLog";
import { logPremiumApiResultFromWire } from "./premiumApiHandoff";
import { logDevPostPremiumFullDraftHttp } from "./premiumFullDraftPostResponseTrace";
import { rejectPremiumDegradedFiller } from "./premiumFullDraftClientAcceptance";
import { stripDevContextMarkersForModelRetry } from "./premiumOutputDevContextGuard";
import { enrichPremiumContextWithOperationalSynthesis } from "./proOperationalSynthesis";
import type { ProAgreementIntelligencePacket } from "./proAgreementIntelligence";
import {
  recordPremiumNetworkCall,
  type PremiumNetworkCallReason,
} from "./paidProPremiumGenerationCallAudit";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import {
  paidProPerfRecordE2ePhase,
  readActivePaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import { ingestPaidProPaymentToReviewServerTiming } from "./paidProPaymentToReviewTrace";
import { paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";

const MAX_CONTEXT_CHARS = 22_000;

function truncate(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n[…]`;
}

export type PremiumFullDraftContextPayload = {
  title: string;
  jurisdiction: string;
  parties: { name: string; role: string }[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  termination_summary?: string;
  additional_terms?: string;
  agreement_family: string;
  material_asks: string[];
  payment?: { amount: number | null; cadence: string | null; valid: boolean };
  /** Pre-LLM clause coverage hints (mapped from intake; see `deterministicIntentTitleMapper.ts`). */
  clause_pack_seed?: string;
  /** Which deterministic intent row produced `title` / `clause_pack_seed` (if any). */
  deterministic_intent_id?: string;
  /**
   * Universal LawDog Pro intent (routing, validation, model coverage). Guidance only — not a form template.
   * @see `agreementIntentContract.ts`
   */
  intent_contract?: AgreementIntentContractApi;
};

export type ExtractedParty = {
  name: string;
  role: string;
};

export type ExtractedPartyRole = {
  party_name: string;
  role: string;
};

export type PaymentMilestone = {
  label: string;
  amount?: string | null;
  percentage?: string | null;
  trigger?: string | null;
};

export type RecurringSupportTerms = {
  amount?: string | null;
  cadence?: string | null;
  renewal?: string | null;
};

export type AgreementAmbiguity = {
  id: string;
  topic: string;
  description: string;
  severity: "low" | "medium" | "high";
  source?: string | null;
};

export type AgreementConflict = {
  id: string;
  topic: string;
  description: string;
  conflicting_values: string[];
  severity: "low" | "medium" | "high";
};

export type MissingMaterialTerm = {
  id: string;
  topic: string;
  reason: string;
  severity: "low" | "medium" | "high";
};

export type RecommendedQuestion = {
  id: string;
  topic: string;
  question: string;
  reason: string;
  priority: "low" | "medium" | "high";
};

export type AgreementQualityFlag = {
  id: string;
  topic: string;
  description: string;
  severity: "low" | "medium" | "high";
};

export type AgreementIntelligence = {
  extracted_terms: {
    parties: ExtractedParty[];
    party_roles: ExtractedPartyRole[];
    governing_law?: string | null;
    payment_terms?: {
      total_amount?: string | null;
      currency?: string | null;
      milestones?: PaymentMilestone[];
      recurring_support?: RecurringSupportTerms | null;
    } | null;
    ownership_terms?: {
      deliverable_ownership?: string | null;
      retained_materials?: string | null;
    } | null;
    termination_terms?: {
      convenience_termination?: boolean | null;
      breach_termination?: boolean | null;
      notice_period?: string | null;
    } | null;
    confidentiality?: {
      included: boolean;
      survival?: string | null;
    } | null;
    notices?: {
      method?: string | null;
    } | null;
    support_terms?: {
      included?: boolean | null;
      standard?: string | null;
    } | null;
    third_party_dependency_terms?: {
      included?: boolean | null;
      uptime_disclaimer?: boolean | null;
    } | null;
    electronic_signatures?: boolean | null;
  };
  ambiguities: AgreementAmbiguity[];
  conflicts: AgreementConflict[];
  missing_material_terms: MissingMaterialTerm[];
  recommended_questions: RecommendedQuestion[];
  quality_flags: AgreementQualityFlag[];
};

export type AgreementValidationFailure = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
  section?: string | null;
};

export type AgreementValidationWarning = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high";
  section?: string | null;
};

export type AgreementValidationResult = {
  passed: boolean;
  failures: AgreementValidationFailure[];
  warnings: AgreementValidationWarning[];
  minimum_contract_elements: {
    identifiable_parties: boolean;
    agreement_purpose_or_scope: boolean;
    exchange_of_value_or_consideration: boolean;
    obligations_or_performance: boolean;
    execution_or_acceptance_mechanism: boolean;
  };
  summary: {
    failure_count: number;
    warning_count: number;
    checked_at: string;
  };
};

export type PremiumFullDraftResult = {
  title: string;
  agreement_family: string;
  document_text: string;
  authoritative_draft?: string;
  agreement_intelligence?: AgreementIntelligence;
  agreement_validation?: AgreementValidationResult | null;
  server_full_document_text?: string;
  server_repair_document_text?: string;
  key_terms_found: string[];
  missing_material_info: string[];
  /**
   * Legacy wire field: `ok` | `needs_details` | `degraded`.
   * Client may also classify into `authoritative_draft_complete` (+ `_with_recommended_clarifications`).
   */
  generation_outcome?:
    | "ok"
    | "needs_details"
    | "degraded"
    | "authoritative_draft_complete"
    | "authoritative_draft_complete_with_recommended_clarifications";
  schema_validation_reasons?: string[];
  server_generation_failure_code?: string;
  server_generation_failure_message?: string;
  /** When false, HTTP 200 still means generation did not produce an acceptable Pro document. */
  generation_ok?: boolean;
  /** Client may retry premium-full-draft without losing checkout or free draft. */
  retryable?: boolean;
  pro_intelligence_packet?: Partial<ProAgreementIntelligencePacket>;
};

export type PremiumFinalizationClarificationAnswer = {
  question_id?: string | null;
  question: string;
  answer: string;
};

export type PremiumFinalizationRequest = {
  original_intake: string;
  first_draft: string;
  agreement_intelligence?: AgreementIntelligence | null;
  agreement_validation?: AgreementValidationResult | null;
  clarification_answers?: PremiumFinalizationClarificationAnswer[];
  force_finalize?: boolean;
};

export type PremiumFinalizationReason =
  | "not_needed"
  | "validation_failed"
  | "clarifications_answered"
  | "conflicts_or_ambiguities"
  | "forced";

export type PremiumFinalizationResult = {
  finalized: boolean;
  reason: PremiumFinalizationReason;
  document_text: string;
  agreement_validation: AgreementValidationResult;
  agreement_intelligence: AgreementIntelligence;
  model_call_count: number;
  repair_attempted: boolean;
  repair_succeeded: boolean;
};

export type PremiumFullDraftFailureKind = "network" | "http" | "exception" | "generation";

export type PremiumFullDraftNetworkErrorCode = "network_changed" | "network_error";

export type PremiumFullDraftApiFailure = {
  ok: false;
  failure_kind: PremiumFullDraftFailureKind;
  retryable: boolean;
  error_code: string;
  document_text: "";
  attemptCount: number;
  httpStatus?: number;
  browserErrorName?: string;
  browserErrorMessage?: string;
};

export type PremiumFullDraftApiSuccess = {
  ok: true;
  result: PremiumFullDraftResult;
};

export type PremiumFullDraftApiResult = PremiumFullDraftApiSuccess | PremiumFullDraftApiFailure;

/** True when fetch failed before a normal HTTP response (transient browser/network). */
/** Transient browser errors (e.g. ERR_NETWORK_CHANGED): retry twice with backoff. */
export const PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS = 2;

/** Client ceiling aligned with common Railway/proxy limits (~150s) before ERR_CONNECTION_RESET. */
export const PREMIUM_FULL_DRAFT_FETCH_TIMEOUT_MS = 150_000;

export function isPremiumFullDraftNetworkFailure(error: unknown): boolean {
  if (error == null) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return /premium_full_draft_fetch_timeout/i.test(error.message);
  }
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (/ERR_NETWORK_CHANGED|network changed/i.test(msg)) return true;
  if (/premium_full_draft_fetch_timeout/i.test(msg)) return true;
  if (
    /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT/i.test(
      msg,
    )
  ) {
    return true;
  }
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED|net::ERR_/i.test(msg)) return true;
  if (/network error|connection.*(lost|reset|closed|aborted)/i.test(msg)) return true;
  if (/browser offline/i.test(msg)) return true;
  if (name === "TypeError" && /fetch|network/i.test(msg)) return true;
  return false;
}

function premiumRetryBackoffMs(attemptIndex: number): number {
  const base = 600 * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * 220);
  return base + jitter;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function premiumFullDraftNetworkErrorCode(error: unknown): PremiumFullDraftNetworkErrorCode {
  const msg = error instanceof Error ? error.message : String(error);
  return /ERR_NETWORK_CHANGED|network changed/i.test(msg) ? "network_changed" : "network_error";
}

export function logPremiumNetworkError(args: {
  agreementId?: string | null;
  agreementGenerationId?: string | null;
  intakeLen: number;
  attemptCount: number;
  browserErrorName?: string;
  browserErrorMessage?: string;
  retryable: boolean;
  errorCode: string;
  retryAttempt?: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-network-error]", {
    agreementIdShort: shortIdForPremiumLog(args.agreementId),
    sessionGenerationIdShort: shortIdForPremiumLog(args.agreementGenerationId),
    intakeLen: args.intakeLen,
    attemptCount: args.attemptCount,
    retryAttempt: args.retryAttempt ?? null,
    browserErrorName: args.browserErrorName ?? null,
    browserErrorMessage: (args.browserErrorMessage ?? "").slice(0, 160) || null,
    retryable: args.retryable,
    error_code: args.errorCode,
  });
}

export function logAgreementIntelligenceExtraction(result: Partial<PremiumFullDraftResult>): void {
  if (import.meta.env.MODE === "test") return;
  const intel = result.agreement_intelligence;
  if (!intel) {
    // eslint-disable-next-line no-console
    console.info("[agreement-intelligence] frontend_received", { hasIntelligence: false });
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[agreement-intelligence] frontend_received", {
    hasIntelligence: true,
    parties: intel.extracted_terms?.parties?.length ?? 0,
    governingLaw: Boolean(intel.extracted_terms?.governing_law),
    paymentTotal: Boolean(intel.extracted_terms?.payment_terms?.total_amount),
    ambiguities: intel.ambiguities?.length ?? 0,
    conflicts: intel.conflicts?.length ?? 0,
    missingMaterialTerms: intel.missing_material_terms?.length ?? 0,
    recommendedQuestions: intel.recommended_questions?.length ?? 0,
    qualityFlags: intel.quality_flags?.length ?? 0,
  });
}

export function logAgreementValidationResult(result: Partial<PremiumFullDraftResult>): void {
  if (import.meta.env.MODE === "test") return;
  const validation = result.agreement_validation;
  if (!validation) return;
  // eslint-disable-next-line no-console
  console.info("[agreement-validation] frontend_received", {
    passed: validation.passed,
    failureCount: validation.summary.failure_count,
    warningCount: validation.summary.warning_count,
    failureCodes: validation.failures.map((f) => f.code).slice(0, 16),
  });
}

function isPremiumFinalizationResult(value: unknown): value is PremiumFinalizationResult {
  const obj = value as Partial<PremiumFinalizationResult> | null;
  return Boolean(
    obj &&
      typeof obj.finalized === "boolean" &&
      typeof obj.reason === "string" &&
      typeof obj.document_text === "string" &&
      typeof obj.agreement_validation?.passed === "boolean" &&
      typeof obj.model_call_count === "number" &&
      typeof obj.repair_attempted === "boolean" &&
      typeof obj.repair_succeeded === "boolean",
  );
}

export function logPremiumFinalizationEvent(
  event:
    | "finalization_started"
    | "finalization_skipped_not_needed"
    | "finalization_succeeded"
    | "finalization_failed",
  details: {
    finalization_reason?: PremiumFinalizationReason | string | null;
    model_call_count?: number | null;
    repair_attempted?: boolean | null;
    repair_succeeded?: boolean | null;
    signature?: string | null;
    document_text_len?: number | null;
  } = {},
): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-finalization]", {
    event,
    finalization_reason: details.finalization_reason ?? null,
    model_call_count: details.model_call_count ?? null,
    repair_attempted: details.repair_attempted ?? null,
    repair_succeeded: details.repair_succeeded ?? null,
    signature: details.signature ? details.signature.slice(0, 24) : null,
    document_text_len: details.document_text_len ?? null,
  });
}

export async function finalizePremiumAgreement(
  request: PremiumFinalizationRequest,
  options?: { signal?: AbortSignal },
): Promise<PremiumFinalizationResult> {
  const res = await fetch(apiUrl("/api/agreements/premium/finalize"), {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(request),
    signal: options?.signal,
  });
  const bodyText = await res.text();
  let parsed: unknown = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail = (parsed as { detail?: { message?: string } } | null)?.detail;
    throw new Error(detail?.message || `premium_finalization_http_${res.status}`);
  }
  if (!isPremiumFinalizationResult(parsed)) {
    throw new Error("premium_finalization_malformed_response");
  }
  return parsed;
}

/** @deprecated Use agreementId + agreementGenerationId on logPremiumNetworkError. */
export function legacyAgreementIdShortFromGenerationId(generationId: string | null | undefined): string | null {
  return shortIdForPremiumLog(generationId);
}

export function buildPremiumFullDraftContext(draft: ParsedDraftShape): PremiumFullDraftContextPayload {
  return {
    title: draft.title || "",
    jurisdiction: draft.jurisdiction || "",
    parties: (draft.parties || []).map((p) => ({ name: p.name || "", role: p.role || "party" })),
    purpose: draft.purpose || "",
    payment_terms: draft.payment_terms || "",
    duration: draft.duration,
    due_date: draft.due_date,
    effective_date: draft.effective_date,
    termination_summary: (draft.termination_summary || "").trim() || undefined,
    additional_terms: draft.additional_terms ? truncate(draft.additional_terms, MAX_CONTEXT_CHARS) : undefined,
    agreement_family: draft.agreement_family || "",
    material_asks: (draft.material_asks || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 32),
    payment: summarizePaymentForFullDraft(draft.payment),
  };
}

/**
 * LawDog Pro full draft: apply deterministic title + clause pack from raw intake, then pass through to the model.
 */
export function buildPremiumFullDraftContextWithIntentMapping(
  rawIntake: string,
  draft: ParsedDraftShape,
): PremiumFullDraftContextPayload {
  return applyDeterministicIntentToPremiumFullDraftContext(rawIntake, buildPremiumFullDraftContext(draft));
}

/**
 * LawDog Pro: deterministic title/clause pack + full **intent contract** for the premium full-draft model.
 */
export function buildPremiumFullDraftContextForProRequest(
  rawIntake: string,
  draft: ParsedDraftShape,
  intent: AgreementIntentContract = resolveAgreementIntentContract(rawIntake),
): PremiumFullDraftContextPayload {
  const withTitle = buildPremiumFullDraftContextWithIntentMapping(rawIntake, draft);
  const withIntent = { ...withTitle, intent_contract: buildIntentContractApiPayload(intent) };
  return enrichPremiumContextWithOperationalSynthesis(withIntent, rawIntake, draft);
}

/** P0: second-chance call after a dev-leak in model output; strips repo/env/path echo from all prompt fields. */
export function buildSanitizedPremiumFullDraftContext(
  draft: ParsedDraftShape,
  rawIntakeForIntent?: string | null,
): PremiumFullDraftContextPayload {
  const c = buildPremiumFullDraftContext(draft);
  const base: PremiumFullDraftContextPayload = {
    title: stripDevContextMarkersForModelRetry(c.title).slice(0, 2_000),
    jurisdiction: stripDevContextMarkersForModelRetry(c.jurisdiction).slice(0, 2_000),
    parties: c.parties.map((p) => ({
      name: stripDevContextMarkersForModelRetry(p.name).slice(0, 800),
      role: stripDevContextMarkersForModelRetry(p.role).slice(0, 200),
    })),
    purpose: stripDevContextMarkersForModelRetry(c.purpose).slice(0, MAX_CONTEXT_CHARS),
    payment_terms: stripDevContextMarkersForModelRetry(c.payment_terms).slice(0, MAX_CONTEXT_CHARS),
    duration: c.duration,
    due_date: c.due_date,
    effective_date: c.effective_date,
    termination_summary: c.termination_summary
      ? stripDevContextMarkersForModelRetry(c.termination_summary).slice(0, 6_000)
      : undefined,
    additional_terms: c.additional_terms
      ? truncate(
          stripDevContextMarkersForModelRetry(
            typeof c.additional_terms === "string" ? c.additional_terms : String(c.additional_terms),
          ),
          MAX_CONTEXT_CHARS,
        )
      : undefined,
    agreement_family: stripDevContextMarkersForModelRetry(c.agreement_family || "").slice(0, 1_200),
    material_asks: (c.material_asks || [])
      .map((s) => stripDevContextMarkersForModelRetry(String(s)).trim())
      .filter(Boolean)
      .slice(0, 32),
    payment: c.payment,
  };
  if (rawIntakeForIntent && rawIntakeForIntent.trim()) {
    const withIntent = applyDeterministicIntentToPremiumFullDraftContext(rawIntakeForIntent, base);
    const c = resolveAgreementIntentContract(rawIntakeForIntent);
    return { ...withIntent, intent_contract: buildIntentContractApiPayload(c) };
  }
  return base;
}

function summarizePaymentForFullDraft(
  p: IntakePaymentField,
): { amount: number | null; cadence: string | null; valid: boolean } {
  if (!p) {
    return { amount: null, cadence: null, valid: false };
  }
  return {
    amount: p.amount ?? null,
    cadence: p.cadence != null && String(p.cadence).trim() ? String(p.cadence).trim() : null,
    valid: Boolean(p.valid),
  };
}

export async function postPremiumFullDraftOnce(args: {
  intakeText: string;
  context: PremiumFullDraftContextPayload;
  userGapAnswers?: string | null;
  signal?: AbortSignal;
  /** Second pass: server uses stronger / distinct pass when output was too close to a free outline. */
  similarityRegeneration?: boolean;
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
  agreementId?: string | null;
  networkCallReason?: PremiumNetworkCallReason;
}): Promise<PremiumFullDraftResult> {
  const uga = (args.userGapAnswers || "").trim();
  if (import.meta.env.DEV) {
    console.info("[gap-trace] stage=frontend_full_draft_request_body", {
      has_user_gap_answers: Boolean(uga),
      user_gap_answers_len: uga.length,
      user_gap_answers: uga,
      needles_in_gap_answers: gapTraceNeedlesHit(uga),
    });
  }
  if (import.meta.env.MODE !== "test" && paidProVerboseDetailLogsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[CLAW] premium request start", {
      intake_len: (args.intakeText || "").length,
      intake_fingerprint: shortIntakeFingerprint(args.intakeText),
      similarity_regeneration: Boolean(args.similarityRegeneration),
      network_call_reason: args.networkCallReason ?? "unknown",
      traceId: readActivePaidProPerformanceTrace()?.traceId,
      sessionGenerationId: readActivePaidProPerformanceTrace()?.sessionGenerationId,
    });
  }
  paidProPerfRecordE2ePhase("frontend_request_assembled", {
    networkCallReason: args.networkCallReason ?? "unknown",
    intakeLen: (args.intakeText || "").length,
  });
  paidProPerfRecordE2ePhase("premium_http_fetch_started", {
    networkCallReason: args.networkCallReason ?? "unknown",
  });
  const fetchStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const res = await fetch(apiUrl("/api/agreements/premium-full-draft"), {
    method: "POST",
    headers: clawAgreementHeaders({
      "Content-Type": "application/json",
      ...(paidProPerfTraceEnabled() ? { "X-Claw-Paid-Pro-Perf-Trace": "1" } : {}),
    }),
    body: JSON.stringify({
      intake_text: args.intakeText,
      context: args.context,
      ...(uga ? { user_gap_answers: uga } : {}),
      ...(args.similarityRegeneration ? { similarity_regeneration: true } : {}),
      ...((args.agreementGenerationId || "").trim()
        ? { agreement_generation_id: (args.agreementGenerationId || "").trim() }
        : {}),
      ...((args.intakeFingerprint || "").trim()
        ? { intake_fingerprint: (args.intakeFingerprint || "").trim() }
        : {}),
      ...((args.agreementId || "").trim() ? { agreement_id: (args.agreementId || "").trim() } : {}),
      ...(args.networkCallReason ? { network_call_reason: args.networkCallReason } : {}),
    }),
    signal: args.signal,
  });
  const fetchMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - fetchStartedAt,
  );
  paidProPerfRecordE2ePhase("frontend_response_received", { httpStatus: res.status, fetchMs });
  const bodyText = await res.text();
  const parseStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  let parsed: Partial<PremiumFullDraftResult> & { detail?: unknown } = {};
  try {
    if (bodyText) parsed = JSON.parse(bodyText) as Partial<PremiumFullDraftResult> & { detail?: unknown };
  } catch {
    parsed = {};
  }
  paidProPerfRecordE2ePhase("frontend_parse_normalize", {
    durationMs: Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - parseStartedAt,
    ),
    responseBodyLen: bodyText.length,
  });
  ingestPaidProPaymentToReviewServerTiming(res.headers.get("X-Claw-Paid-Pro-Server-Timing"));
  const networkReason: PremiumNetworkCallReason = args.networkCallReason
    ?? (args.similarityRegeneration ? "similarity_regeneration" : "unknown");
  recordPremiumNetworkCall({
    reason: networkReason,
    intakeFingerprint: (args.intakeFingerprint || "").trim() || shortIntakeFingerprint(args.intakeText),
    agreementGenerationId: args.agreementGenerationId ?? null,
    responseBodyLen: bodyText.length,
    documentTextLen: typeof parsed?.document_text === "string" ? parsed.document_text.length : 0,
    serverFullDocumentTextLen:
      typeof parsed?.server_full_document_text === "string" ? parsed.server_full_document_text.length : 0,
    generationOutcome: parsed?.generation_outcome,
    failureCode: parsed?.server_generation_failure_code,
  });

  if (import.meta.env.MODE !== "test" && paidProVerboseDetailLogsEnabled()) {
    const genOutLog = String(parsed?.generation_outcome || "").trim();
    const failCodeLog = String(parsed?.server_generation_failure_code || "").trim();
    const docStr = typeof parsed?.document_text === "string" ? (parsed.document_text as string) : "";
    const dLen = docStr.length;
    const fillerBad = docStr.trim().length > 0 && !rejectPremiumDegradedFiller(docStr).ok;
    const hardIncomplete =
      genOutLog === "degraded" &&
      (failCodeLog === "airlock_blocked" ||
        failCodeLog === "dev_context_leak" ||
        dLen === 0 ||
        fillerBad);
    if (failCodeLog === "airlock_blocked" && dLen === 0) {
      logPremiumAirlockEmptyOutput({
        http_status: res.status,
        generation_outcome: genOutLog,
        document_text_len: dLen,
      });
    }
    if (hardIncomplete) {
      // eslint-disable-next-line no-console
      console.warn("[CLAW] premium response", {
        http_status: res.status,
        http_ok: res.ok,
        generation_outcome: parsed?.generation_outcome,
        server_generation_failure_code: parsed?.server_generation_failure_code,
        document_text_len: dLen,
        note: "incomplete_or_blocked",
      });
    } else {
      // eslint-disable-next-line no-console
      console.info("[CLAW] premium response", {
        http_status: res.status,
        http_ok: res.ok,
        generation_outcome: parsed?.generation_outcome,
        server_generation_failure_code: parsed?.server_generation_failure_code,
        document_text_len: dLen,
      });
    }
  }
  const genOut = String(parsed?.generation_outcome || "").trim();
  const degraded = genOut === "degraded";
  const failCode = String(parsed?.server_generation_failure_code || "").trim();
  logPremiumCompletionDebug({
    stage: "premium_full_draft_http",
    httpStatus: res.status,
    intakeLen: (args.intakeText || "").length,
    responseBodyLen: bodyText.length,
    currentDocLen: typeof parsed?.document_text === "string" ? parsed.document_text.length : 0,
    generationOutcome: genOut || (res.ok ? "unknown" : "http_error"),
    degraded,
    failureCode: failCode || undefined,
  });
  const docLen = typeof parsed?.document_text === "string" ? parsed.document_text.length : 0;
  logDevPostPremiumFullDraftHttp({
    httpStatus: res.status,
    responseBodyLen: bodyText.length,
    documentTextLen: docLen,
    generationOutcome: genOut || undefined,
  });
  if (!res.ok) {
    const wire = parsed as PremiumFullDraftResult;
    logPremiumApiResultFromWire({
      ok: false,
      status: res.status,
      wire,
      error: typeof (parsed as { detail?: { message?: string } })?.detail === "object"
        ? String((parsed as { detail?: { message?: string } }).detail?.message ?? "")
        : "http_error",
    });
    const genRetry503 = classifyPremiumFullDraftGenerationRetryable(wire);
    if (genRetry503.retryable) {
      logPremiumGenerationRetryableFailure({
        error_code: genRetry503.errorCode,
        reason: genRetry503.reason,
        generation_outcome: wire.generation_outcome,
        document_text_len: (wire.document_text || "").trim().length,
        generation_ok: wire.generation_ok ?? false,
        retryable: wire.retryable ?? true,
        http_status: res.status,
      });
      return wire;
    }
    const err = parsed as { detail?: { message?: string; code?: string } };
    const msg = typeof err?.detail === "object" ? err.detail?.message : null;
    const detail = err?.detail;
    const bodyPreview = truncate(bodyText, 4_000);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[premium-full-draft] http_error", {
        status: res.status,
        detail,
        bodyPreview,
        path: "/api/agreements/premium-full-draft",
      });
    }
    if (import.meta.env.PROD) {
      // eslint-disable-next-line no-console
      console.warn("[CLAW] premium-full-draft failed", {
        status: res.status,
        path: "/api/agreements/premium-full-draft",
        detail: typeof detail === "object" ? detail : undefined,
      });
    }
    throw new Error((msg as string) || "premium_full_draft_failed");
  }
  const wire = parsed as PremiumFullDraftResult;
  logPremiumApiResultFromWire({ ok: true, status: res.status, wire });
  logAgreementIntelligenceExtraction(wire);
  logAgreementValidationResult(wire);
  const genRetry = classifyPremiumFullDraftGenerationRetryable(wire);
  if (genRetry.retryable) {
    logPremiumGenerationRetryableFailure({
      error_code: genRetry.errorCode,
      reason: genRetry.reason,
      generation_outcome: wire.generation_outcome,
      document_text_len: (wire.document_text || "").trim().length,
      generation_ok: wire.generation_ok ?? false,
      retryable: wire.retryable ?? true,
    });
  }
  return wire;
}

function premiumFullDraftApiFailureFromRetryableGeneration(
  parsed: PremiumFullDraftResult,
  classification: ReturnType<typeof classifyPremiumFullDraftGenerationRetryable>,
  attemptCount: number,
): PremiumFullDraftApiFailure {
  return {
    ok: false,
    failure_kind: "generation",
    retryable: true,
    error_code: classification.errorCode,
    document_text: "",
    attemptCount,
    browserErrorMessage: (parsed.server_generation_failure_message || "").slice(0, 200) || undefined,
  };
}

/**
 * Retry once. Returns a typed failure for network/HTTP errors (never `null` for transient network).
 */
export async function postPremiumFullDraftWithRetry(
  args: {
    intakeText: string;
    context: PremiumFullDraftContextPayload;
    userGapAnswers?: string | null;
    signal?: AbortSignal;
    /** Persisted LawDog agreement id (review workspace). */
    agreementId?: string | null;
    /** Session generation id for stale-response guards — not the agreement id. */
    agreementGenerationId?: string | null;
    /** @deprecated Use agreementGenerationId */
    agreementIdShort?: string | null;
    networkCallReason?: PremiumNetworkCallReason;
  },
): Promise<PremiumFullDraftApiResult> {
  const agreementId = (args.agreementId ?? "").trim() || null;
  const agreementGenerationId =
    (args.agreementGenerationId ?? args.agreementIdShort ?? "").trim() || null;
  logPremiumSessionConsistency({
    context: "postPremiumFullDraftWithRetry_start",
    agreementId,
    agreementGenerationId,
    intakeFingerprint: shortIntakeFingerprint(args.intakeText),
  });

  // Vitest runs in `test` mode — never block on real HTTP (local backend may be absent).
  if (import.meta.env.MODE === "test") {
    console.info("[gap-trace] stage=frontend_full_draft_skipped_test_mode", {
      mode: import.meta.env.MODE,
      has_user_gap_answers: Boolean((args.userGapAnswers || "").trim()),
      user_gap_answers_len: (args.userGapAnswers || "").trim().length,
    });
    return {
      ok: false,
      failure_kind: "http",
      retryable: false,
      error_code: "test_mode_skipped",
      document_text: "",
      attemptCount: 0,
    };
  }
  let lastErr: unknown;
  const intakeLen = (args.intakeText || "").length;
  let networkAttempt = 0;
  let totalAttempts = 0;

  while (networkAttempt < PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS) {
    if (args.signal?.aborted) {
      return {
        ok: false,
        failure_kind: "network",
        retryable: false,
        error_code: "aborted",
        document_text: "",
        attemptCount: totalAttempts,
      };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const backOnline = await waitForBrowserOnline(12_000);
      if (!backOnline) {
        lastErr = new TypeError("Failed to fetch: browser offline");
        networkAttempt += 1;
        totalAttempts += 1;
        if (networkAttempt < PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS) {
          await sleepMs(premiumRetryBackoffMs(networkAttempt - 1));
        }
        continue;
      }
    }
    totalAttempts += 1;
    const fetchTimeoutController = new AbortController();
    const fetchTimeoutId = window.setTimeout(() => {
      fetchTimeoutController.abort(
        new DOMException("premium_full_draft_fetch_timeout", "AbortError"),
      );
    }, PREMIUM_FULL_DRAFT_FETCH_TIMEOUT_MS);
    const fetchSignal = args.signal
      ? (() => {
          if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
            return AbortSignal.any([args.signal, fetchTimeoutController.signal]);
          }
          return args.signal;
        })()
      : fetchTimeoutController.signal;
    try {
      const result = await postPremiumFullDraftOnce({
        intakeText: args.intakeText,
        context: args.context,
        userGapAnswers: args.userGapAnswers,
        signal: fetchSignal,
        agreementGenerationId,
        intakeFingerprint: shortIntakeFingerprint(args.intakeText),
        agreementId,
        networkCallReason: args.networkCallReason ?? "checkout_completion",
      });
      const genRetry = classifyPremiumFullDraftGenerationRetryable(result);
      if (genRetry.retryable) {
        return premiumFullDraftApiFailureFromRetryableGeneration(result, genRetry, totalAttempts);
      }
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[premium-network-retry-success]", {
          agreementIdShort: shortIdForPremiumLog(agreementId),
          sessionGenerationIdShort: shortIdForPremiumLog(agreementGenerationId),
          attemptCount: totalAttempts,
          networkAttempts: networkAttempt + 1,
        });
      }
      return { ok: true, result };
    } catch (e) {
      lastErr = e;
      if (!isPremiumFullDraftNetworkFailure(e)) {
        if (import.meta.env.DEV) {
          const msg = e instanceof Error ? e.message : String(e);
          // eslint-disable-next-line no-console
          console.warn("[premium-full-draft] non_network_failure", { message: msg });
        }
        const msg = e instanceof Error ? e.message : String(e ?? "premium_full_draft_failed");
        return {
          ok: false,
          failure_kind: "exception",
          retryable: false,
          error_code: "premium_full_draft_failed",
          document_text: "",
          attemptCount: totalAttempts,
          browserErrorName: e instanceof Error ? e.name : undefined,
          browserErrorMessage: msg.slice(0, 200),
        };
      }
      networkAttempt += 1;
      const msg = e instanceof Error ? e.message : String(e);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[premium-full-draft] network_attempt_failed", {
          networkAttempt,
          totalAttempts,
          message: msg,
        });
      }
      logPremiumNetworkError({
        agreementId,
        agreementGenerationId,
        intakeLen,
        attemptCount: totalAttempts,
        retryAttempt: networkAttempt,
        browserErrorName: e instanceof Error ? e.name : undefined,
        browserErrorMessage: msg,
        retryable: networkAttempt < PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS,
        errorCode: premiumFullDraftNetworkErrorCode(e),
      });
      if (networkAttempt < PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS) {
        await sleepMs(premiumRetryBackoffMs(networkAttempt - 1));
      }
    } finally {
      window.clearTimeout(fetchTimeoutId);
    }
  }

  const attemptCount = totalAttempts;
  if (isPremiumFullDraftNetworkFailure(lastErr)) {
    const errorCode = premiumFullDraftNetworkErrorCode(lastErr);
    const browserErrorName = lastErr instanceof Error ? lastErr.name : undefined;
    const browserErrorMessage = lastErr instanceof Error ? lastErr.message : String(lastErr);
    logPremiumNetworkError({
      agreementId,
      agreementGenerationId,
      intakeLen,
      attemptCount,
      retryAttempt: networkAttempt,
      browserErrorName,
      browserErrorMessage,
      retryable: true,
      errorCode,
    });
    return {
      ok: false,
      failure_kind: "network",
      retryable: true,
      error_code: errorCode,
      document_text: "",
      attemptCount,
      browserErrorName,
      browserErrorMessage: browserErrorMessage.slice(0, 200),
    };
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[premium-full-draft] attempts_exhausted", { lastError: lastErr });
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "premium_full_draft_failed");
  return {
    ok: false,
    failure_kind: "exception",
    retryable: false,
    error_code: "premium_full_draft_failed",
    document_text: "",
    attemptCount,
    browserErrorName: lastErr instanceof Error ? lastErr.name : undefined,
    browserErrorMessage: msg.slice(0, 200),
  };
}
