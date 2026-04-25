import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";

export type PremiumRefineAction = "update" | "ask_missing" | "ready";

export type SuggestedNextStep = "edit" | "review" | "send";

export type PremiumRefineResponse = {
  updated_document_text: string;
  summary_changes: string[];
  readiness_score: number;
  suggested_next_step: SuggestedNextStep;
};

function mapResponse(j: Record<string, unknown>): PremiumRefineResponse {
  const nextRaw = String(j.suggested_next_step || "review").toLowerCase();
  const suggested_next_step: SuggestedNextStep =
    nextRaw === "edit" || nextRaw === "send" || nextRaw === "review" ? (nextRaw as SuggestedNextStep) : "review";
  const rs = Math.min(100, Math.max(0, Math.round(Number(j.readiness_score) || 0)));
  const sc = Array.isArray(j.summary_changes) ? (j.summary_changes as unknown[]).map((s) => String(s ?? "").trim()) : [];
  return {
    updated_document_text: String(j.updated_document_text ?? ""),
    summary_changes: sc.filter(Boolean),
    readiness_score: Number.isFinite(rs) ? rs : 0,
    suggested_next_step,
  };
}

export async function postPremiumRefine(
  body: {
    current_document_text: string;
    intake_text: string;
    user_refinement_prompt: string;
    action: PremiumRefineAction;
  },
  signal?: AbortSignal,
): Promise<PremiumRefineResponse> {
  if (import.meta.env.MODE === "test") {
    return {
      updated_document_text: body.current_document_text,
      summary_changes: ["(test) Suggestion one", "(test) Suggestion two", "(test) Suggestion three"],
      readiness_score: 72,
      suggested_next_step: "review",
    };
  }
  const base = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/api/agreements/premium-refine`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      current_document_text: body.current_document_text,
      intake_text: body.intake_text,
      user_refinement_prompt: body.user_refinement_prompt,
      action: body.action,
    }),
    signal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    const d = (err as { detail?: { message?: string } | string })?.detail;
    const msg = typeof d === "object" && d && "message" in d ? d.message : typeof d === "string" ? d : null;
    throw new Error(msg || "premium_refine_failed");
  }
  const j = await readJson<Record<string, unknown>>(res);
  return mapResponse(j);
}
