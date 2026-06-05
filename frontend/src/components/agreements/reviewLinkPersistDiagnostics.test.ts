import { describe, expect, it } from "vitest";
import {
  buildReviewLinkPersistDiagnostics,
  extractHttpDetailFromDraftResponseBody,
  formatReviewLinkPersistUserMessage,
  REVIEW_FIRST_PERSIST_REQUEST_HEADER,
} from "./reviewLinkPersistDiagnostics";

describe("reviewLinkPersistDiagnostics (Test278)", () => {
  it("extracts structured draft_limit detail from 403 body", () => {
    expect(
      extractHttpDetailFromDraftResponseBody({
        detail: {
          code: "draft_limit_reached",
          message: "Free workspaces can have up to 2 active drafts. Finish or upgrade to add another.",
          paywall: true,
        },
      }),
    ).toBe(
      "draft_limit_reached: Free workspaces can have up to 2 active drafts. Finish or upgrade to add another.",
    );
  });

  it("buildReviewLinkPersistDiagnostics preserves full http error body", () => {
    const err = Object.assign(new Error("create_failed_http_403"), {
      httpStatus: 403,
      httpDetail: "draft_limit_reached: capped",
      responseBody: { detail: { code: "draft_limit_reached" } },
    });
    const diag = buildReviewLinkPersistDiagnostics({ error: err, reason: "persist_failed" });
    expect(diag.httpStatus).toBe(403);
    expect(diag.httpDetail).toBe("draft_limit_reached: capped");
    expect(diag.responseBody).toEqual({ detail: { code: "draft_limit_reached" } });
    expect(diag.rawMessage).toBe("create_failed_http_403");
  });

  it("formatReviewLinkPersistUserMessage exposes status, detail, and endpoint", () => {
    const msg = formatReviewLinkPersistUserMessage({
      pageOrigin: "https://app.lawdog.ai",
      apiOrigin: "https://api.lawdog.ai",
      endpoint: "https://api.lawdog.ai/api/agreements/draft",
      method: "POST",
      failureClass: "http",
      reason: "persist_failed",
      rawMessage: "create_failed_http_403",
      httpStatus: 403,
      httpDetail: "draft_limit_reached: capped",
    });
    expect(msg).toContain("HTTP status: 403");
    expect(msg).toContain("Backend detail: draft_limit_reached: capped");
    expect(msg).toContain("Request endpoint: https://api.lawdog.ai/api/agreements/draft");
  });

  it("exports review-first persist request header constant", () => {
    expect(REVIEW_FIRST_PERSIST_REQUEST_HEADER).toBe("X-Claw-Review-First-Persist");
  });
});
