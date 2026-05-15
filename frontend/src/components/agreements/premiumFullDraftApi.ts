import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { apiUrl } from "../../lib/clawApi";
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
  /** `needs_details` = validator/quality; `degraded` = model path failed, structured server fallback in `document_text`. */
  generation_outcome?: "ok" | "needs_details" | "degraded";
  schema_validation_reasons?: string[];
  server_generation_failure_code?: string;
  server_generation_failure_message?: string;
};

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
  return { ...withTitle, intent_contract: buildIntentContractApiPayload(intent) };
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

/** When the server marks `degraded` but returned a substantial operative body with no hard failure, treat as OK for UX. */
function normalizePremiumFullDraftHttpResult(result: PremiumFullDraftResult): PremiumFullDraftResult {
  const gen = (result.generation_outcome || "").trim();
  const fc = (result.server_generation_failure_code || "").trim();
  const d = (result.document_text || "").trim();
  const hard = fc === "airlock_blocked" || fc === "dev_context_leak";
  if (gen === "degraded" && !hard && d.length >= 400 && rejectPremiumDegradedFiller(d).ok) {
    return {
      ...result,
      generation_outcome: "ok",
      server_generation_failure_code: "",
      server_generation_failure_message: "",
    };
  }
  return result;
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
  return normalizePremiumFullDraftHttpResult(parsed as PremiumFullDraftResult);
}

/**
 * Retry once; returns null on failure (caller must fall back to legacy premium preview build).
 */
export async function postPremiumFullDraftWithRetry(
  args: {
    intakeText: string;
    context: PremiumFullDraftContextPayload;
    userGapAnswers?: string | null;
    signal?: AbortSignal;
  },
): Promise<PremiumFullDraftResult | null> {
  // Vitest runs in `test` mode — never block on real HTTP (local backend may be absent).
  if (import.meta.env.MODE === "test") {
    console.info("[gap-trace] stage=frontend_full_draft_skipped_test_mode", {
      mode: import.meta.env.MODE,
      has_user_gap_answers: Boolean((args.userGapAnswers || "").trim()),
      user_gap_answers_len: (args.userGapAnswers || "").trim().length,
    });
    return null;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await postPremiumFullDraftOnce({
        intakeText: args.intakeText,
        context: args.context,
        userGapAnswers: args.userGapAnswers,
        signal: args.signal,
      });
    } catch (e) {
      lastErr = e;
      if (import.meta.env.DEV) {
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.warn("[premium-full-draft] attempt_failed", { attempt: attempt + 1, message: msg });
      }
    }
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[premium-full-draft] both attempts failed", { lastError: lastErr });
  }
  return null;
}
