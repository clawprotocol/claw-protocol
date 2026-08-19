import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "../auth/supabaseAuthService";
import { clearCachedAccessToken, getCachedAccessToken } from "../auth/authAccessTokenCache";
import { verifyBillingCheckoutSession } from "./billingCheckoutApi";

describe("verifyBillingCheckoutSession auth", () => {
  beforeEach(() => {
    clearCachedAccessToken();
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "supabase-access-token",
      user: { id: "user-1" },
    } as never);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearCachedAccessToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Bearer and hydrates the access-token cache", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, subscription: { plan_code: "pro", status: "active" } }),
      json: async () => ({ ok: true, subscription: { plan_code: "pro", status: "active" } }),
    } as Response);

    await verifyBillingCheckoutSession("cs_test_return");

    expect(getCachedAccessToken()).toBe("supabase-access-token");
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/billing/verify-checkout-session");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer supabase-access-token");
    expect(init?.credentials).toBe("include");
  });
});
