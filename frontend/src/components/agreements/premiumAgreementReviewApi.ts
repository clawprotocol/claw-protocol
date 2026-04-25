import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";
import { buildPremiumFullDraftContext, type PremiumFullDraftContextPayload } from "./premiumFullDraftApi";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

type ReviewRequest = {
  intakeText: string;
  documentText: string;
  context: PremiumFullDraftContextPayload;
};

function mapJsonToReview(body: Record<string, unknown>): PremiumAgreementReview {
  const num = (v: unknown) => {
    if (v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  };
  const asStrArr = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 16) as string[];
  return {
    strengths: asStrArr(body.strengths).slice(0, 10),
    missing_or_weak_terms: asStrArr(body.missing_or_weak_terms).slice(0, 10),
    questions_for_user: asStrArr(body.questions_for_user).slice(0, 5),
    suggested_clause_upgrades: asStrArr(body.suggested_clause_upgrades).slice(0, 8),
    priority_score: num(body.priority_score),
  };
}

async function postOnce(args: ReviewRequest, signal?: AbortSignal): Promise<PremiumAgreementReview> {
  const base = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/api/agreements/premium-review`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      intake_text: args.intakeText,
      document_text: args.documentText,
      context: args.context,
    }),
    signal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    const msg = typeof (err as { detail?: { message?: string } })?.detail === "object"
      ? (err as { detail?: { message?: string } }).detail?.message
      : null;
    throw new Error(msg || "premium_review_failed");
  }
  const j = await readJson<Record<string, unknown>>(res);
  return mapJsonToReview(j);
}

/**
 * After premium body is final; best-effort — returns null on failure.
 * Skipped in Vitest (`import.meta.env.MODE === "test"`) to avoid real HTTP.
 */
export async function postPremiumAgreementReviewWithRetry(args: ReviewRequest): Promise<PremiumAgreementReview | null> {
  if (import.meta.env.MODE === "test") {
    return null;
  }
  const t = (args.documentText || "").trim();
  if (t.length < 400) {
    return null;
  }
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await postOnce(args);
    } catch (e) {
      last = e;
    }
  }
  if (import.meta.env.DEV) {
    console.warn("[premium-review] both attempts failed", last);
  }
  return null;
}

export function buildContextForReview(draft: ParsedDraftShape): PremiumFullDraftContextPayload {
  return buildPremiumFullDraftContext(draft);
}
