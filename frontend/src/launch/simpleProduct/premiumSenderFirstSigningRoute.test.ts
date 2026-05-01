import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import * as recipientAccessApi from "../../agreement/recipientAccessApi";
import {
  resolvePremiumSenderFirstSigningPath,
  SENDER_FIRST_PROFESSIONAL_AGREEMENT_SIGNING_REGRESSION,
  waitForSigningLockLockedVersionId,
} from "./premiumSenderFirstSigningRoute";

describe("resolvePremiumSenderFirstSigningPath", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      error: null,
    });
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

  it("409 recovery uses workspace-index locked_version_id when GET omits signing_lock briefly", async () => {
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
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        {
          id: "agr-ws-1",
          title: "t",
          updated_at: "",
          party_count: 0,
          signer_count: 0,
          version_ledger_count: 0,
          completed_signed: false,
          has_server_signing_lock: true,
          locked_version_id: "lv-from-index",
          workspace_archived_at: null,
          review_sent_at: null,
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signing_lock: null }),
      }),
    );

    const r = await resolvePremiumSenderFirstSigningPath({
      agreementId: "agr-ws-1",
      ownerPartyId: "pid-owner",
    });
    expect(r?.path).toContain("v=lv-from-index");
    expect(r?.tokenStatus).toBe("legacy_v_param");
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
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      error: null,
    });
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

describe("professional agreement signing regression anchor", () => {
  it("documents AgreementRecipientReview sign stack (not Vs01 /app/quick)", () => {
    expect(SENDER_FIRST_PROFESSIONAL_AGREEMENT_SIGNING_REGRESSION).toMatch(/AgreementRecipientReview/);
    expect(SENDER_FIRST_PROFESSIONAL_AGREEMENT_SIGNING_REGRESSION).toMatch(/\/agreements\//);
    expect(SENDER_FIRST_PROFESSIONAL_AGREEMENT_SIGNING_REGRESSION).not.toMatch(/\/app\/quick/);
  });
});
