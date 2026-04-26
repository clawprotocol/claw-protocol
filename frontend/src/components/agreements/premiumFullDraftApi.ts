import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";
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
}): Promise<PremiumFullDraftResult> {
  const base = resolveApiBase().replace(/\/$/, "");
  const uga = (args.userGapAnswers || "").trim();
  if (import.meta.env.DEV) {
    console.info("[gap-trace] stage=frontend_full_draft_request_body", {
      has_user_gap_answers: Boolean(uga),
      user_gap_answers_len: uga.length,
      user_gap_answers: uga,
      needles_in_gap_answers: gapTraceNeedlesHit(uga),
    });
  }
  const res = await fetch(`${base}/api/agreements/premium-full-draft`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      intake_text: args.intakeText,
      context: args.context,
      ...(uga ? { user_gap_answers: uga } : {}),
    }),
    signal: args.signal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    const msg = typeof (err as { detail?: { message?: string } })?.detail === "object"
      ? (err as { detail?: { message?: string } }).detail?.message
      : null;
    throw new Error(msg || "premium_full_draft_failed");
  }
  return readJson<PremiumFullDraftResult>(res);
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
    }
  }
  if (import.meta.env.DEV) {
    console.warn("[premium-full-draft] both attempts failed", lastErr);
  }
  return null;
}
