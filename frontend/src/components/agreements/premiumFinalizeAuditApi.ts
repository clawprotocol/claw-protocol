import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function mapAudit(j: Record<string, unknown>): PremiumFinalizeAudit {
  const stepRaw = String(j.best_next_step || "review").toLowerCase();
  const best_next_step: PremiumFinalizeAudit["best_next_step"] =
    stepRaw === "edit" || stepRaw === "send" || stepRaw === "review" ? (stepRaw as "edit" | "review" | "send") : "review";
  const confRaw = String(j.confidence || "medium").toLowerCase();
  const confidence: PremiumFinalizeAudit["confidence"] =
    confRaw === "low" || confRaw === "high" ? confRaw : "medium";
  const sa = (k: string) => {
    const a = j[k];
    if (!Array.isArray(a)) return [] as string[];
    return a.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 5);
  };
  return {
    deal_specific_missing_terms: sa("deal_specific_missing_terms"),
    placeholder_terms_found: sa("placeholder_terms_found"),
    resolved_strengths: sa("resolved_strengths"),
    best_next_step,
    confidence,
  };
}

export type PremiumFinalizeAuditRequest = {
  intake_text: string;
  document_text: string;
  context?: {
    agreement_family?: string;
    material_asks?: string[];
    user_gap_answers?: string;
    party_labels?: string[];
    parse_extract?: Record<string, unknown>;
    premium_review?: Record<string, unknown>;
  };
};

export function buildPremiumFinalizeAuditContext(
  draft: ParsedDraftShape,
  opts: { userGapAnswers: string | null | undefined; premiumReview: PremiumAgreementReview | null },
): PremiumFinalizeAuditRequest["context"] {
  return {
    agreement_family: (draft.agreement_family || draft.title || "").trim(),
    material_asks: (draft.material_asks || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 32),
    user_gap_answers: (opts.userGapAnswers || "").trim(),
    party_labels: (draft.parties || []).map((p) => (p.name || "").trim()).filter(Boolean).slice(0, 6),
    parse_extract: {
      material_asks: (draft.material_asks || []).slice(0, 20),
      agreement_family: draft.agreement_family,
      title: draft.title,
      purpose: (draft.purpose || "").trim().slice(0, 4000),
    },
    premium_review: opts.premiumReview
      ? {
          priority_score: opts.premiumReview.priority_score,
          missing_or_weak_terms: opts.premiumReview.missing_or_weak_terms,
          questions_for_user: opts.premiumReview.questions_for_user,
        }
      : undefined,
  };
}

async function postOnce(body: PremiumFinalizeAuditRequest, signal?: AbortSignal): Promise<PremiumFinalizeAudit> {
  const b = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(`${b}/api/agreements/premium-finalize-audit`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      intake_text: body.intake_text,
      document_text: body.document_text,
      ...(body.context ? { context: body.context } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    const d = (err as { detail?: { message?: string; code?: string } | string })?.detail;
    const msg = typeof d === "object" && d && "message" in d ? d.message : typeof d === "string" ? d : null;
    const e = new Error(msg || "premium_finalize_audit_failed") as Error & { status: number; code?: string };
    e.code = typeof d === "object" && d && "code" in d ? (d as { code?: string }).code : undefined;
    e.status = res.status;
    throw e;
  }
  const j = await readJson<Record<string, unknown>>(res);
  return mapAudit(j);
}

/**
 * After premium body is final; best-effort — returns null on failure.
 * In Vitest (`import.meta.env.MODE === "test"`) returns null without HTTP.
 */
export async function postPremiumFinalizeAuditWithRetry(
  body: PremiumFinalizeAuditRequest,
  options?: { logPostAcceptFailure?: boolean },
): Promise<PremiumFinalizeAudit | null> {
  if (import.meta.env.MODE === "test") {
    return null;
  }
  if (!(body.document_text || "").trim() || !(body.intake_text || "").trim()) {
    return null;
  }
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await postOnce(body);
    } catch (e) {
      last = e;
    }
  }
  if (import.meta.env.DEV) {
    if (options?.logPostAcceptFailure) {
      const st = (last as Error & { status?: number })?.status;
      // eslint-disable-next-line no-console
      console.info("[premium-post-accept-advisory-failed]", {
        endpoint: "POST /api/agreements/premium-finalize-audit",
        status: st ?? "unknown",
      });
    } else {
      console.warn("[premium-finalize-audit] failed (fail open)", last);
    }
  }
  return null;
}
