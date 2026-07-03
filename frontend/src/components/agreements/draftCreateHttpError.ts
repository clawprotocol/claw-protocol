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
  if (status == null || status < 400) return null;

  const detail = readDraftCreateHttpErrorDetail(error);
  const httpDetail = err?.httpDetail ?? extractHttpDetailFromDraftResponseBody(err?.responseBody);

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
