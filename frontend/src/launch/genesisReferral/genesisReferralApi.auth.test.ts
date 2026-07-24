import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "../../auth/supabaseAuthService";
import {
  fetchGenesisAffiliateAccess,
  fetchGenesisAffiliateDashboard,
  postGenesisReferralCapture,
} from "./genesisReferralApi";
import { clearGenesisAffiliateAccessCache } from "./genesisAffiliateAccess";

describe("genesisReferralApi auth headers", () => {
  beforeEach(() => {
    clearGenesisAffiliateAccessCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, allowed: true }),
      }),
    );
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "real-supabase-bearer",
      user: { id: "u1" },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Authorization Bearer on affiliate/access and never X-Claw-User-Id", async () => {
    await fetchGenesisAffiliateAccess();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer real-supabase-bearer");
    expect(headers["X-Claw-User-Id"]).toBeUndefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/genesis-referral/affiliate/access");
  });

  it("sends Authorization Bearer on affiliate/me dashboard fetch", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        affiliate: { referral_code: "X", display_name: "D", payout_rate: 0.3, affiliate_status: "active" },
      }),
    } as Response);
    await fetchGenesisAffiliateDashboard();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer real-supabase-bearer");
    expect(headers["X-Claw-User-Id"]).toBeUndefined();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("/v1/genesis-referral/affiliate/me");
  });

  it("public capture does not require Authorization and exposes no private dashboard fields", async () => {
    vi.mocked(getAuthSession).mockResolvedValue(null);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    const out = await postGenesisReferralCapture({
      referral_code: "CAP1",
      visitor_id: "visitor_public_01",
    });
    expect(out.ok).toBe(true);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("/v1/genesis-referral/capture");
  });

  it("denies dashboard client path when no Bearer session", async () => {
    vi.mocked(getAuthSession).mockResolvedValue(null);
    const dash = await fetchGenesisAffiliateDashboard();
    expect(dash.ok).toBe(false);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
