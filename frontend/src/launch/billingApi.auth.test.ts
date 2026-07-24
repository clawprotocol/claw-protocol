import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

vi.mock("../config/featureFlags", () => ({
  featureFlags: { serverBilling: true },
}));

import { getAuthSession } from "../auth/supabaseAuthService";
import { fetchKeyBalance, fetchSubscription } from "./billingApi";
import {
  clearCachedSubscriptionEntitlement,
  readCachedSubscriptionEntitlement,
  refreshSubscriptionEntitlement,
  writeCachedSubscriptionEntitlement,
} from "../access/subscriptionEntitlementCache";

describe("billingApi authenticated probes", () => {
  beforeEach(() => {
    clearCachedSubscriptionEntitlement();
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "supabase-access-token",
      user: { id: "user-1" },
    } as never);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearCachedSubscriptionEntitlement();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function jsonResponse(status: number, body: unknown): Response {
    const text = JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => body,
    } as Response;
  }

  it("fetchSubscription sends Authorization Bearer", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { subscription: null }));

    await fetchSubscription("user-user-1");

    expect(fetch).toHaveBeenCalled();
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/subscriptions/user-user-1");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer supabase-access-token");
    expect(init?.credentials).toBe("include");
  });

  it("fetchKeyBalance sends Authorization Bearer on protected keys route", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, { org_id: "user-user-1", keys_available: 0 }),
    );

    await fetchKeyBalance("user-user-1");

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/orgs/user-user-1/keys");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer supabase-access-token");
  });

  it("treats 200 { subscription: null } as free/empty no-subscription state", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { subscription: null }));

    const result = await fetchSubscription("user-user-1");
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.noSubscription).toBe(true);
    expect(result.authFailure).toBeFalsy();

    const snap = await refreshSubscriptionEntitlement("user-user-1");
    expect(snap?.tier).toBeNull();
    expect(snap?.orgId).toBe("user-user-1");
  });

  it("does not treat 401 as a free entitlement", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { detail: { code: "invalid_auth_token", message: "Unauthorized" } }),
    );

    const result = await fetchSubscription("user-user-1");
    expect(result.error).toBeTruthy();
    expect(result.noSubscription).toBe(false);
    expect(result.authFailure).toBe(true);

    writeCachedSubscriptionEntitlement(
      { org_id: "user-user-1", plan_code: "pro", status: "active" },
      "other-org",
    );
    const snap = await refreshSubscriptionEntitlement("user-user-1");
    expect(snap).toBeNull();
    // Must not invent a free/null entitlement cache for this org on auth failure.
    const cached = readCachedSubscriptionEntitlement();
    expect(cached?.orgId === "user-user-1" && cached.tier === null).toBe(false);
  });

  it("does not treat 403 as a free entitlement", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(403, { detail: { code: "cross_org_denied", message: "cross org" } }),
    );

    const result = await fetchSubscription("user-victim");
    expect(result.authFailure).toBe(true);
    expect(result.noSubscription).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
