import { apiUrl, getLawDogApiBase, isLawDogApiCrossOrigin } from "../../lib/clawApi";

export const REVIEW_LINK_PERSIST_ENDPOINT = "/api/agreements/draft";

export const REVIEW_LINK_PERSIST_BLOCKING_MESSAGE =
  "Review link could not be created because LawDog could not reach the agreement save service. Your Pro agreement is still saved in this browser. Retry creating the review link.";

export type ReviewLinkPersistFailureClass = "dns" | "network" | "cors" | "http" | "persist" | "unknown";

export type ReviewLinkPersistDiagnostics = {
  pageOrigin: string;
  apiOrigin: string;
  endpoint: string;
  failureClass: ReviewLinkPersistFailureClass;
  reason: string;
  rawMessage: string;
  httpStatus?: number | null;
};

function parseHttpStatusFromMessage(msg: string): number | null {
  const m = /create_failed_http_(\d+)/i.exec(msg);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function classifyReviewLinkPersistFailure(
  error: unknown,
  httpStatus?: number | null,
): ReviewLinkPersistFailureClass {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const low = msg.toLowerCase();
  if (/err_name_not_resolved|enotfound|getaddrinfo|name not resolved/i.test(msg)) return "dns";
  const fromMsg = parseHttpStatusFromMessage(msg);
  const status = fromMsg ?? httpStatus ?? null;
  if (status != null && status >= 400) return "http";
  if (msg === "hydrate_failed" || /hydrate/i.test(low)) return "persist";
  if (/missing_id|persist_failed/i.test(low)) return "persist";
  if (/failed to fetch|networkerror|load failed|err_network|err_internet_disconnected|net::err_/i.test(msg)) {
    if (typeof window !== "undefined" && isLawDogApiCrossOrigin()) return "cors";
    return "network";
  }
  if (error instanceof TypeError && /fetch/i.test(msg)) {
    if (typeof window !== "undefined" && isLawDogApiCrossOrigin()) return "cors";
    return "network";
  }
  return "unknown";
}

export function buildReviewLinkPersistDiagnostics(args: {
  error?: unknown;
  httpStatus?: number | null;
  reason: string;
}): ReviewLinkPersistDiagnostics {
  const pageOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const apiOrigin = getLawDogApiBase() || pageOrigin;
  const endpoint = apiUrl(REVIEW_LINK_PERSIST_ENDPOINT);
  const rawMessage = args.error instanceof Error ? args.error.message : String(args.error ?? "");
  const failureClass = classifyReviewLinkPersistFailure(args.error, args.httpStatus);
  return {
    pageOrigin,
    apiOrigin,
    endpoint,
    failureClass,
    reason: args.reason,
    rawMessage: rawMessage.slice(0, 240),
    httpStatus: args.httpStatus ?? parseHttpStatusFromMessage(rawMessage),
  };
}

export function logReviewLinkPersistFailure(diagnostics: ReviewLinkPersistDiagnostics): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-persist-failure]", {
    pageOrigin: diagnostics.pageOrigin,
    apiOrigin: diagnostics.apiOrigin,
    endpoint: diagnostics.endpoint,
    failureClass: diagnostics.failureClass,
    reason: diagnostics.reason,
    rawMessage: diagnostics.rawMessage,
    httpStatus: diagnostics.httpStatus ?? null,
  });
}

export function formatReviewLinkPersistDebugInfo(diagnostics: ReviewLinkPersistDiagnostics): string {
  return JSON.stringify(
    {
      pageOrigin: diagnostics.pageOrigin,
      apiOrigin: diagnostics.apiOrigin,
      endpoint: diagnostics.endpoint,
      failureClass: diagnostics.failureClass,
      reason: diagnostics.reason,
      rawMessage: diagnostics.rawMessage,
      httpStatus: diagnostics.httpStatus ?? null,
    },
    null,
    2,
  );
}
