import { describe, expect, it } from "vitest";
import {
  formatDraftCreateHttpUserMessage,
  isDraftCreateHttpForbidden,
} from "./draftCreateHttpError";
import type { ReviewFirstPersistHttpError } from "./reviewLinkPersistDiagnostics";

describe("draftCreateHttpError", () => {
  it("maps usage_restricted 403", () => {
    const err = Object.assign(new Error("create_failed_http_403"), {
      httpStatus: 403,
      responseBody: {
        detail: {
          code: "usage_restricted",
          message: "This workspace needs verification or an upgrade to create new drafts.",
          paywall: true,
        },
      },
    }) as ReviewFirstPersistHttpError;
    expect(isDraftCreateHttpForbidden(err)).toBe(true);
    expect(formatDraftCreateHttpUserMessage(err)).toContain("verification");
  });
});
