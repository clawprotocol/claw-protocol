import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { readJson, resolveApiBase } from "../../lib/clawApi";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";

type ReviewRouteRequest = {
  intake_text: string;
  finalize_answers: string;
  agreement_text: string;
  party_count: number;
  agreement_family: string;
};

function clamp01To100(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function mapPremiumReviewRoute(j: Record<string, unknown>): PremiumReviewRoute {
  const routeRaw = String(j.route || "review").toLowerCase();
  const route: PremiumReviewRoute["route"] =
    routeRaw === "signature" || routeRaw === "fix" || routeRaw === "review" ? routeRaw : "review";
  const confRaw = String(j.confidence || "medium").toLowerCase();
  const confidence: PremiumReviewRoute["confidence"] =
    confRaw === "low" || confRaw === "high" ? confRaw : "medium";
  const ctaByRoute: Record<PremiumReviewRoute["route"], PremiumReviewRoute["recommended_cta"]> = {
    signature: "Send for signature",
    review: "Send for review",
    fix: "Fix a few items first",
  };
  const sa = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 5);
  const ctaRaw = String(j.recommended_cta || "").trim() as PremiumReviewRoute["recommended_cta"];
  const recommended_cta =
    ctaRaw === "Send for signature" || ctaRaw === "Send for review" || ctaRaw === "Fix a few items first"
      ? ctaRaw
      : ctaByRoute[route];
  const short_summary = String(j.short_summary || "").trim();
  return {
    route,
    confidence,
    unresolved_items: sa(j.unresolved_items),
    reasons: sa(j.reasons),
    send_readiness_score: clamp01To100(j.send_readiness_score),
    recommended_cta,
    short_summary:
      short_summary ||
      (route === "signature"
        ? "Agreement appears complete enough to send for signatures."
        : route === "fix"
          ? "A few unresolved items should be fixed before sending."
          : "This agreement is best sent for review/redline before signatures."),
  };
}

async function postOnce(args: ReviewRouteRequest, signal?: AbortSignal): Promise<PremiumReviewRoute> {
  const base = resolveApiBase().replace(/\/$/, "");
  const res = await fetch(`${base}/api/agreements/premium-review-route`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));
    const d = (err as { detail?: { message?: string } | string })?.detail;
    const m = typeof d === "object" && d && "message" in d ? d.message : typeof d === "string" ? d : null;
    throw new Error(m || "premium_review_route_failed");
  }
  const j = await readJson<Record<string, unknown>>(res);
  return mapPremiumReviewRoute(j);
}

export async function postPremiumReviewRouteWithRetry(args: ReviewRouteRequest): Promise<PremiumReviewRoute | null> {
  if (import.meta.env.MODE === "test") return null;
  if (!(args.agreement_text || "").trim() || !(args.intake_text || "").trim()) return null;
  let last: unknown;
  for (let i = 0; i < 2; i += 1) {
    try {
      return await postOnce(args);
    } catch (e) {
      last = e;
    }
  }
  if (import.meta.env.DEV) {
    console.warn("[premium-review-route] failed (fail-open)", last);
  }
  return null;
}

