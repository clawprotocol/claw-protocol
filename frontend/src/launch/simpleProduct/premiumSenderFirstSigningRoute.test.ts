import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as recipientAccessApi from "../../agreement/recipientAccessApi";
import { resolvePremiumSenderFirstSigningPath, waitForSigningLockLockedVersionId } from "./premiumSenderFirstSigningRoute";

describe("resolvePremiumSenderFirstSigningPath", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("409 mint + signing_lock still resolves to /agreements/:id/sign with v= and party (no /app/send)", async () => {
    vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: false,
      status: 409,
      detail: "signing_not_finalized_server_side",
    });
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signing_lock: { locked_version_id: "lv-pro" } }),
      }),
    );

    const r = await resolvePremiumSenderFirstSigningPath({
      agreementId: "agr-sf-1",
      ownerPartyId: "pid-owner",
    });
    expect(r).not.toBeNull();
    expect(r!.path).toMatch(/^\/agreements\/agr-sf-1\/sign\?/);
    expect(r!.path).toContain("v=lv-pro");
    expect(r!.path).toContain("p=pid-owner");
    expect(r!.path).not.toContain("/app/send");
    expect(r!.tokenStatus).toBe("legacy_v_param");
  });

  it("when recipient_link_token_required, remints after lock and uses token in path", async () => {
    vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult")
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        detail: "signing_not_finalized_server_side",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          token: "signed-tok",
          expires_in_seconds: 3600,
          locked_version_id: "lv-x",
        },
      });
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: true,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signing_lock: { locked_version_id: "lv-x" } }),
      }),
    );

    const r = await resolvePremiumSenderFirstSigningPath({
      agreementId: "agr-sf-2",
      ownerPartyId: "pid-o",
    });
    expect(r?.path).toContain("t=signed-tok");
    expect(r?.tokenStatus).toBe("minted_after_lock");
  });

  it("returns null when lock never appears and mint failed", async () => {
    vi.useFakeTimers();
    vi.spyOn(recipientAccessApi, "mintRecipientAccessTokenResult").mockResolvedValue({
      ok: false,
      status: 409,
      detail: "signing_not_finalized_server_side",
    });
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: true,
      signing_token_configured: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signing_lock: null }),
      }),
    );
    const p = resolvePremiumSenderFirstSigningPath({ agreementId: "agr-sf-3", ownerPartyId: null });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r).toBeNull();
    vi.useRealTimers();
  });
});

describe("waitForSigningLockLockedVersionId", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns locked version once GET includes signing_lock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signing_lock: { locked_version_id: "lv-wait" } }),
      }),
    );
    const lv = await waitForSigningLockLockedVersionId("agr-w");
    expect(lv).toBe("lv-wait");
  });
});
