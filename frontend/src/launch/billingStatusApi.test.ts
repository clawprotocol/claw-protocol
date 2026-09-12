import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

vi.mock("../config/featureFlags", () => ({
  featureFlags: { serverBilling: true },
}));

import { getAuthSession } from "../auth/supabaseAuthService";
import { createBillingPortalSession, fetchBillingStatus } from "./billingStatusApi";

describe("billing status and portal API", () => {
  beforeEach(() => {
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "supabase-access-token",
      user: { id: "user-1" },
    } as never);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
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

  it("loads org-scoped status without a caller org or customer id", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        org_id: "user-user-1",
        display_state: "active",
        entitled: true,
        plan_code: "pro",
        plan_label: "LawDog Pro",
        status: "active",
        billing_interval: "month",
        current_period_end: "2099-12-31T00:00:00Z",
        canceled_at: null,
        cancel_at_period_end: false,
        has_stripe_customer: true,
        stripe_configured: true,
        manage_available: true,
      }),
    );
    const result = await fetchBillingStatus();
    expect(result.data?.display_state).toBe("active");
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1/billing/status");
    expect(String(url)).not.toContain("customer");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer supabase-access-token");
  });

  it("does not treat 404 as confirmed no-subscription", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { detail: "missing" }));
    const result = await fetchBillingStatus();
    expect(result.unavailable).toBe(true);
    expect(result.data).toBeNull();
    expect(result.data?.display_state).not.toBe("no_subscription");
  });

  it("opens a portal session without sending a customer identity", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        session_id: "bps_1",
        portal_url: "https://billing.stripe.com/p/session/1",
      }),
    );
    await createBillingPortalSession({ returnTo: "/app/send/ag-1?phase=send" });
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    expect(body.return_to).toBe("/app/send/ag-1?phase=send");
    expect(body.customer_id).toBeUndefined();
    expect(body.customer).toBeUndefined();
    expect(body.stripe_customer_id).toBeUndefined();
  });
});
