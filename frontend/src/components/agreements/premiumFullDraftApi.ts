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
import { logDevPostPremiumFullDraftHttp } from "./premiumFullDraftPostResponseTrace";
import { rejectPremiumDegradedFiller } from "./premiumFullDraftClientAcceptance";
import { stripDevContextMarkersForModelRetry } from "./premiumOutputDevContextGuard";
import { enrichPremiumContextWithOperationalSynthesis } from "./proOperationalSynthesis";

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

export type PremiumFullDraftResult = {
  title: string;
  agreement_family: string;
  document_text: string;
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

export function isPremiumFullDraftNetworkFailure(error: unknown): boolean {
  if (error == null) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (/ERR_NETWORK_CHANGED|network changed/i.test(msg)) return true;
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT/i.test(msg)) return true;
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
  if (import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[CLAW] premium request start", {
      intake_len: (args.intakeText || "").length,
      intake_fingerprint: shortIntakeFingerprint(args.intakeText),
      similarity_regeneration: Boolean(args.similarityRegeneration),
    });
  }
  const res = await fetch(apiUrl("/api/agreements/premium-full-draft"), {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
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
    }),
    signal: args.signal,
  });
  const bodyText = await res.text();
  let parsed: Partial<PremiumFullDraftResult> & { detail?: unknown } = {};
  try {
    if (bodyText) parsed = JSON.parse(bodyText) as Partial<PremiumFullDraftResult> & { detail?: unknown };
  } catch {
    parsed = {};
  }
  if (import.meta.env.MODE !== "test") {
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
    try {
      const result = await postPremiumFullDraftOnce({
        intakeText: args.intakeText,
        context: args.context,
        userGapAnswers: args.userGapAnswers,
        signal: args.signal,
        agreementGenerationId,
        intakeFingerprint: shortIntakeFingerprint(args.intakeText),
        agreementId,
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
