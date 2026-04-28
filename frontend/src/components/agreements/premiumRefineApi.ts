import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";

/** User-facing copy when premium-refine is unavailable (503/overload). Also thrown as Error.message. */
export const PRO_REFINE_UNAVAILABLE_USER_MESSAGE =
  "We couldn't update the Pro agreement. Your current Pro agreement is safe. Try again.";

const PREMIUM_REFINE_FETCH_TIMEOUT_MS = 120_000;

function combineAbortSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  const merged = new AbortController();
  const forward = () => merged.abort();
  if (a.aborted || b.aborted) {
    merged.abort();
    return merged.signal;
  }
  a.addEventListener("abort", forward, { once: true });
  b.addEventListener("abort", forward, { once: true });
  return merged.signal;
}

function resolvePremiumRefineFetchSignal(external?: AbortSignal): AbortSignal | undefined {
  const timeoutFn = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  if (typeof timeoutFn !== "function") return external;
  try {
    const deadline = timeoutFn.call(AbortSignal, PREMIUM_REFINE_FETCH_TIMEOUT_MS);
    return combineAbortSignals(external, deadline);
  } catch {
    return external;
  }
}

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
  const fetchSignal = resolvePremiumRefineFetchSignal(signal);
  const res = await fetch(`${base}/api/agreements/premium-refine`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      current_document_text: body.current_document_text,
      intake_text: body.intake_text,
      user_refinement_prompt: body.user_refinement_prompt,
      action: body.action,
    }),
    signal: fetchSignal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    if (res.status === 503) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[premium-refine-api] request failed (service unavailable)", {
          http: res.status,
          detail: err,
          current_document_len: (body.current_document_text || "").length,
          intake_len: (body.intake_text || "").length,
          instruction_len: (body.user_refinement_prompt || "").length,
        });
      }
      throw new Error(PRO_REFINE_UNAVAILABLE_USER_MESSAGE);
    }
    const d = (err as { detail?: { message?: string; code?: string } | string | { msg: string; type: string }[] })
      .detail;
    const msg = (() => {
      if (typeof d === "string") return d;
      if (d && typeof d === "object" && !Array.isArray(d) && "message" in d && typeof (d as { message: string }).message === "string") {
        return (d as { message: string }).message;
      }
      if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
        return String((d[0] as { msg: string }).msg);
      }
      return null;
    })();
    const withStatus = msg
      ? import.meta.env.DEV
        ? `${msg} (HTTP ${res.status})`
        : msg
      : `premium_refine_failed (HTTP ${res.status})`;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[premium-refine-api] request failed", {
        http: res.status,
        detail: err,
        current_document_len: (body.current_document_text || "").length,
        intake_len: (body.intake_text || "").length,
        instruction_len: (body.user_refinement_prompt || "").length,
      });
    }
    throw new Error(withStatus);
  }
  const j = await readJson<Record<string, unknown>>(res);
  return mapResponse(j);
}
