import {
  extractHttpDetailFromDraftResponseBody,
  type ReviewFirstPersistHttpError,
} from "./reviewLinkPersistDiagnostics";

export type DraftCreateHttpErrorDetail = {
  code?: string;
  message?: string;
  paywall?: boolean;
};

export function readDraftCreateHttpErrorDetail(error: unknown): DraftCreateHttpErrorDetail | null {
  const err = error as ReviewFirstPersistHttpError;
  const body = err?.responseBody as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (detail == null || typeof detail !== "object" || Array.isArray(detail)) return null;
  const obj = detail as DraftCreateHttpErrorDetail;
  return {
    code: typeof obj.code === "string" ? obj.code : undefined,
    message: typeof obj.message === "string" ? obj.message : undefined,
    paywall: Boolean(obj.paywall),
  };
}

/** User-facing copy when POST /api/agreements/draft fails — never imply success. */
export function formatDraftCreateHttpUserMessage(error: unknown): string | null {
  const err = error as ReviewFirstPersistHttpError;
  const status = err?.httpStatus ?? null;
  const httpDetail = err?.httpDetail ?? extractHttpDetailFromDraftResponseBody(err?.responseBody);
  const errMessage = err instanceof Error ? err.message : null;

  // Handle missing_id case: server returned 200 but no agreement id in response.
  // This is a malformed response that should surface a specific error.
  if (errMessage === "missing_id") {
    if (httpDetail?.trim()) return httpDetail.trim();
    return "LawDog received a response but no agreement id was returned. Please try again.";
  }

  // Handle generic JS errors (network failures, etc.) that have no httpStatus.
  // Surface the error message if it looks like a create_failed_http_* error.
  if (status == null && errMessage) {
    const httpMatch = errMessage.match(/create_failed_http_(\d+)/);
    if (httpMatch) {
      const extractedStatus = parseInt(httpMatch[1], 10);
      if (httpDetail?.trim()) return httpDetail.trim();
      return `LawDog could not save this draft (HTTP ${extractedStatus}).`;
    }
    // Network or other JS error - surface the message
    if (errMessage !== "missing_id" && !errMessage.startsWith("create_failed_http_")) {
      return `LawDog could not save this draft: ${errMessage}`;
    }
  }

  if (status == null || status < 400) return null;

  const detail = readDraftCreateHttpErrorDetail(error);

  if (detail?.message?.trim()) return detail.message.trim();

  if (status === 403) {
    if (detail?.code === "draft_limit_reached") {
      return "Free workspaces can have up to 2 active drafts. Finish an existing draft or upgrade to Pro to create another.";
    }
    if (detail?.code === "usage_restricted") {
      return "This workspace needs verification or an upgrade before you can create new drafts.";
    }
    if (httpDetail?.trim()) return httpDetail.trim();
    return "LawDog could not save this draft. Your workspace may need verification or a Pro upgrade.";
  }

  if (httpDetail?.trim()) return httpDetail.trim();
  return `LawDog could not save this draft (HTTP ${status}).`;
}

export function isDraftCreateHttpForbidden(error: unknown): boolean {
  const err = error as ReviewFirstPersistHttpError;
  return err?.httpStatus === 403;
}

export function logDraftPostHttpFailure(args: {
  status: number;
  payload: unknown;
  reviewFirstHandoffPersist?: boolean;
}): void {
  const detail = extractHttpDetailFromDraftResponseBody(args.payload);
  const body = args.payload as { detail?: unknown };
  // eslint-disable-next-line no-console
  console.warn("[CLAW] draft POST error detail", {
    status: args.status,
    path: "/api/agreements/draft",
    httpDetail: detail,
    detail: body?.detail ?? null,
    reviewFirstHandoffPersist: Boolean(args.reviewFirstHandoffPersist),
  });
}
