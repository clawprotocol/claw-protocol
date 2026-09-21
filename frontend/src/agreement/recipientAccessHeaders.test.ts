import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECIPIENT_ACCESS_NETWORK_RETRY_MESSAGE,
  isRecipientAccessRetryableCode,
  recipientAgreementReadHeaders,
  validateRecipientAccessToken,
} from "./recipientAccessApi";

describe("recipientAgreementReadHeaders", () => {
  it("returns empty object when explicit token is missing (no session fallback)", () => {
    expect(recipientAgreementReadHeaders("ag_1", "")).toEqual({});
    expect(recipientAgreementReadHeaders("ag_1", null)).toEqual({});
    expect(recipientAgreementReadHeaders("ag_1", "   ")).toEqual({});
  });

  it("sets X-Claw-Recipient-Access-Token from explicit token only", () => {
    expect(recipientAgreementReadHeaders("ag_1", "secret-token")).toEqual({
      "X-Claw-Recipient-Access-Token": "secret-token",
    });
  });
});

describe("validateRecipientAccessToken retryable network", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats 5xx and thrown fetch as network_retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "upstream" }), { status: 503 }),
    );
    const failed = await validateRecipientAccessToken("tok", "ag-1");
    expect(failed).toEqual({
      ok: false,
      code: "network_retryable",
      message: RECIPIENT_ACCESS_NETWORK_RETRY_MESSAGE,
    });
    expect(isRecipientAccessRetryableCode("network_retryable")).toBe(true);
    expect(isRecipientAccessRetryableCode("token_expired")).toBe(false);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const thrown = await validateRecipientAccessToken("tok", "ag-1");
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) expect(thrown.code).toBe("network_retryable");
  });
});
