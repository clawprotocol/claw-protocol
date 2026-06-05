import { apiUrl, getLawDogApiBase, isLawDogApiCrossOrigin } from "../../lib/clawApi";
import {
  hasStoredPaidPremiumCompletionSession,
  readPaidPremiumCompletionSessionMarker,
} from "./premiumCompletionStorage";

export const REVIEW_LINK_PERSIST_ENDPOINT = "/api/agreements/draft";

/** Sent on review-first draft POST so backend can bypass free-tier draft caps for paid Pro persist. */
export const REVIEW_FIRST_PERSIST_REQUEST_HEADER = "X-Claw-Review-First-Persist";

export const REVIEW_LINK_PERSIST_BLOCKING_MESSAGE =
  "Review link could not be created because LawDog could not reach the agreement save service. Your Pro agreement is still saved in this browser. Retry creating the review link.";

export type ReviewLinkPersistFailureClass = "dns" | "network" | "cors" | "http" | "persist" | "unknown";

export type ReviewLinkPersistDiagnostics = {
  pageOrigin: string;
  apiOrigin: string;
  endpoint: string;
  method: string;
  failureClass: ReviewLinkPersistFailureClass;
  reason: string;
  rawMessage: string;
  httpStatus?: number | null;
  httpDetail?: string | null;
  responseBody?: unknown;
  reviewIntent?: string | null;
  qaBypass?: boolean;
  agreementId?: string | null;
  draftExists?: boolean;
};

export type ReviewFirstPersistRequestLog = {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  payloadKeys: string[];
  payloadLen: number;
  reviewIntent: string;
  qaBypass: boolean;
  agreementId: string | null;
  draftExists: boolean;
};

export type ReviewFirstPersistHttpError = Error & {
  httpStatus?: number;
  httpDetail?: string | null;
  responseBody?: unknown;
};

function parseHttpStatusFromMessage(msg: string): number | null {
  const m = /create_failed_http_(\d+)/i.exec(msg);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function extractHttpDetailFromDraftResponseBody(payload: unknown): string | null {
  if (payload == null) return null;
  const pe = payload as { detail?: unknown };
  const d = pe.detail;
  if (typeof d === "string") return d;
  if (d != null && typeof d === "object") {
    const obj = d as { code?: string; message?: string };
    const code = String(obj.code ?? "").trim();
    const message = String(obj.message ?? "").trim();
    if (code && message) return `${code}: ${message}`;
    if (code) return code;
    if (message) return message;
    try {
      return JSON.stringify(d);
    } catch {
      return "detail_object";
    }
  }
  if (Array.isArray(d)) return "validation_array";
  return null;
}

export function headersRecordForLog(headers: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = v;
    return out;
  }
  return { ...headers };
}

export function resolveReviewFirstPersistQaBypass(): boolean {
  const marker = readPaidPremiumCompletionSessionMarker();
  return marker?.source === "qa_bypass" || hasStoredPaidPremiumCompletionSession();
}

export function logReviewFirstPersistRequest(payload: ReviewFirstPersistRequestLog): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-persist-request]", payload);
}

export function logReviewFirstPersistResponse(payload: {
  status: number;
  detail: string | null;
  body: unknown;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-persist-response]", payload);
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
  httpDetail?: string | null;
  responseBody?: unknown;
  reason: string;
  reviewIntent?: string | null;
  qaBypass?: boolean;
  agreementId?: string | null;
  draftExists?: boolean;
}): ReviewLinkPersistDiagnostics {
  const pageOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const apiOrigin = getLawDogApiBase() || pageOrigin;
  const endpoint = apiUrl(REVIEW_LINK_PERSIST_ENDPOINT);
  const rawMessage = args.error instanceof Error ? args.error.message : String(args.error ?? "");
  const err = args.error as ReviewFirstPersistHttpError | undefined;
  const httpStatus =
    args.httpStatus ?? err?.httpStatus ?? parseHttpStatusFromMessage(rawMessage);
  const httpDetail =
    args.httpDetail ??
    err?.httpDetail ??
    (err?.responseBody != null ? extractHttpDetailFromDraftResponseBody(err.responseBody) : null);
  const responseBody = args.responseBody ?? err?.responseBody;
  const failureClass = classifyReviewLinkPersistFailure(args.error, httpStatus);
  return {
    pageOrigin,
    apiOrigin,
    endpoint,
    method: "POST",
    failureClass,
    reason: args.reason,
    rawMessage,
    httpStatus: httpStatus ?? null,
    httpDetail: httpDetail ?? null,
    responseBody,
    reviewIntent: args.reviewIntent ?? "review",
    qaBypass: args.qaBypass ?? resolveReviewFirstPersistQaBypass(),
    agreementId: args.agreementId ?? null,
    draftExists: args.draftExists ?? false,
  };
}

export function formatReviewLinkPersistUserMessage(diagnostics: ReviewLinkPersistDiagnostics): string {
  const lines = [REVIEW_LINK_PERSIST_BLOCKING_MESSAGE];
  if (diagnostics.httpStatus != null) {
    lines.push(`HTTP status: ${diagnostics.httpStatus}.`);
  }
  if (diagnostics.httpDetail?.trim()) {
    lines.push(`Backend detail: ${diagnostics.httpDetail.trim()}.`);
  }
  if (diagnostics.endpoint?.trim()) {
    lines.push(`Request endpoint: ${diagnostics.endpoint.trim()}.`);
  }
  return lines.join(" ");
}

export function logReviewLinkPersistFailure(diagnostics: ReviewLinkPersistDiagnostics): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-persist-failure]", {
    pageOrigin: diagnostics.pageOrigin,
    apiOrigin: diagnostics.apiOrigin,
    endpoint: diagnostics.endpoint,
    method: diagnostics.method,
    failureClass: diagnostics.failureClass,
    reason: diagnostics.reason,
    rawMessage: diagnostics.rawMessage,
    httpStatus: diagnostics.httpStatus ?? null,
    httpDetail: diagnostics.httpDetail ?? null,
    reviewIntent: diagnostics.reviewIntent ?? null,
    qaBypass: diagnostics.qaBypass ?? false,
    agreementId: diagnostics.agreementId ?? null,
    draftExists: diagnostics.draftExists ?? false,
  });
}

export function logReviewFirstPersistInvariantViolation(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.error("[review-first-persist-invariant-violation]", payload);
}

export function formatReviewLinkPersistDebugInfo(diagnostics: ReviewLinkPersistDiagnostics): string {
  return JSON.stringify(
    {
      pageOrigin: diagnostics.pageOrigin,
      apiOrigin: diagnostics.apiOrigin,
      endpoint: diagnostics.endpoint,
      method: diagnostics.method,
      failureClass: diagnostics.failureClass,
      reason: diagnostics.reason,
      rawMessage: diagnostics.rawMessage,
      httpStatus: diagnostics.httpStatus ?? null,
      httpDetail: diagnostics.httpDetail ?? null,
      responseBody: diagnostics.responseBody ?? null,
      reviewIntent: diagnostics.reviewIntent ?? null,
      qaBypass: diagnostics.qaBypass ?? false,
      agreementId: diagnostics.agreementId ?? null,
      draftExists: diagnostics.draftExists ?? false,
    },
    null,
    2,
  );
}
