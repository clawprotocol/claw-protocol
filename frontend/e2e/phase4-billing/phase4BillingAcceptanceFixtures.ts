import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import type { BillingDisplayState, BillingStatusPayload } from "../../src/launch/billingStatusApi";

export const BILLING_ORG_A = "user-phase4-billing-owner";
export const BILLING_ORG_B = "user-phase4-billing-other";
export const BILLING_OWNER = {
  id: "user-phase4-billing-owner",
  email: "billing.owner@example.com",
  name: "Phase 4 Billing Owner",
};
export const BILLING_AGREEMENT_RETURN = "/app/send/ag-billing-orion?phase=send";

export type BillingFixtureMode =
  | BillingDisplayState
  | "wrong_org"
  | "provider_fail"
  | "delayed_active"
  | "checkout_unresolved"
  | "checkout_processing";

export type BillingFixtureState = {
  mode: BillingFixtureMode;
  delayMs: number;
  statusHits: number;
  portalHits: number;
  checkoutHits: number;
  lastPortalBody: Record<string, unknown> | null;
};

export function createBillingFixtureState(mode: BillingFixtureMode = "active"): BillingFixtureState {
  return {
    mode,
    delayMs: mode === "delayed_active" ? 1200 : 0,
    statusHits: 0,
    portalHits: 0,
    checkoutHits: 0,
    lastPortalBody: null,
  };
}

function authSeed() {
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: "e2e-phase4-billing-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: BILLING_OWNER.id,
      email: BILLING_OWNER.email,
      user_metadata: { full_name: BILLING_OWNER.name },
      identities: [{ provider: "email", id: `${BILLING_OWNER.id}-id` }],
    },
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function payloadFor(mode: BillingFixtureMode, orgId: string): BillingStatusPayload {
  const base = {
    org_id: orgId,
    plan_code: null as string | null,
    plan_label: null as string | null,
    status: null as string | null,
    billing_interval: null as BillingStatusPayload["billing_interval"],
    current_period_end: null as string | null,
    canceled_at: null as string | null,
    cancel_at_period_end: false,
    has_stripe_customer: false,
    stripe_configured: true,
    manage_available: false,
    entitled: false,
    display_state: "no_subscription" as BillingDisplayState,
  };
  if (mode === "active" || mode === "delayed_active") {
    return {
      ...base,
      display_state: "active",
      entitled: true,
      plan_code: "pro",
      plan_label: "LawDog Pro",
      status: "active",
      billing_interval: "month",
      current_period_end: "2099-12-31T00:00:00Z",
      has_stripe_customer: true,
      manage_available: true,
    };
  }
  if (mode === "scheduled_cancellation") {
    return {
      ...base,
      display_state: "scheduled_cancellation",
      entitled: true,
      plan_code: "pro",
      plan_label: "LawDog Pro",
      status: "active",
      billing_interval: "month",
      current_period_end: "2099-12-31T00:00:00Z",
      cancel_at_period_end: true,
      has_stripe_customer: true,
      manage_available: true,
    };
  }
  if (mode === "expired_canceled") {
    return {
      ...base,
      display_state: "expired_canceled",
      plan_code: "pro",
      plan_label: "LawDog Pro",
      status: "canceled",
      current_period_end: "2020-01-01T00:00:00Z",
    };
  }
  if (mode === "payment_problem") {
    return {
      ...base,
      display_state: "payment_problem",
      plan_code: "pro",
      plan_label: "LawDog Pro",
      status: "past_due",
      current_period_end: "2099-12-31T00:00:00Z",
      has_stripe_customer: true,
      manage_available: true,
    };
  }
  if (mode === "unavailable" || mode === "wrong_org" || mode === "provider_fail") {
    return { ...base, display_state: "unavailable" };
  }
  return { ...base, display_state: "no_subscription" };
}

export async function installBillingApiMocks(page: Page, state: BillingFixtureState): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/__supabase") || url.includes("/auth/v1/")) {
      await json(route, { user: authSeed().user, access_token: authSeed().access_token });
      return;
    }

    if (url.includes("/v1/billing/status") && method === "GET") {
      state.statusHits += 1;
      if (state.delayMs > 0 && state.statusHits === 1) {
        await new Promise((resolve) => setTimeout(resolve, state.delayMs));
      }
      if (state.mode === "wrong_org") {
        await json(route, { detail: { code: "cross_org_denied", message: "cross org" } }, 403);
        return;
      }
      if (state.mode === "unavailable" || state.mode === "provider_fail") {
        await json(route, { detail: { code: "billing_unavailable", message: "provider failed" } }, 503);
        return;
      }
      await json(route, payloadFor(state.mode, BILLING_ORG_A));
      return;
    }

    if (url.includes("/v1/billing/portal-session") && method === "POST") {
      state.portalHits += 1;
      try {
        state.lastPortalBody = route.request().postDataJSON() as Record<string, unknown>;
      } catch {
        state.lastPortalBody = {};
      }
      if (state.mode === "provider_fail") {
        await json(
          route,
          { detail: { code: "stripe_api_503", message: "Billing management is unavailable." } },
          503,
        );
        return;
      }
      if (state.lastPortalBody && ("customer_id" in state.lastPortalBody || "customer" in state.lastPortalBody)) {
        await json(route, { detail: { code: "caller_customer_rejected" } }, 400);
        return;
      }
      await json(route, {
        ok: true,
        session_id: "bps_phase4_billing",
        portal_url: "https://billing.stripe.com/p/session/phase4-billing-mock",
        org_id: BILLING_ORG_A,
        return_url: "http://127.0.0.1:4186/app/billing",
      });
      return;
    }

    if (url.includes("/v1/billing/verify-checkout-session")) {
      await json(route, { detail: { code: "verify_rejected", message: "query is not payment authority" } }, 400);
      return;
    }

    if (url.includes("/v1/billing/checkout-session")) {
      state.checkoutHits += 1;
      if (state.mode === "checkout_unresolved") {
        await json(
          route,
          {
            detail: {
              code: "purchase_unresolved",
              message: "We could not confirm the previous checkout. Do not pay again.",
              session_id: "cs_unresolved_a",
            },
          },
          409,
        );
        return;
      }
      if (state.mode === "checkout_processing") {
        await json(
          route,
          {
            detail: {
              code: "payment_processing",
              message: "Your payment is being processed. Do not pay again.",
              session_id: "cs_processing_a",
            },
          },
          409,
        );
        return;
      }
      await json(route, { detail: { code: "already_subscribed", message: "already subscribed" } }, 409);
      return;
    }

    if (url.includes("/v1/workspace") || url.includes("/bind-user-org") || url.includes("/anonymous-session")) {
      await json(route, { ok: true, org_id: BILLING_ORG_A });
      return;
    }

    if (url.includes("/v1/subscriptions") || url.includes("/api/agreements")) {
      await json(route, { ok: true, subscription: null, agreements: [] });
      return;
    }

    if (url.includes("billing.stripe.com")) {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "mocked-stripe-portal" });
      return;
    }

    if (url.includes("/v1/") || url.includes("/api/")) {
      await json(route, { ok: true });
      return;
    }

    await route.continue();
  });
}

export async function seedBillingOwner(page: Page, state: BillingFixtureState, orgId = BILLING_ORG_A): Promise<void> {
  await seedE2eAuthSession(page, authSeed());
  await page.addInitScript(
    ({ nextOrg, name }) => {
      try {
        localStorage.setItem("claw_org_id", nextOrg);
        localStorage.setItem("claw_user_display_name", name);
        sessionStorage.setItem("claw_authenticated_workspace_session", "1");
      } catch {
        /* ignore */
      }
    },
    { nextOrg: orgId, name: BILLING_OWNER.name },
  );
  await installBillingApiMocks(page, state);
}

export async function seedBillingSignedOut(page: Page, state: BillingFixtureState): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("claw_org_id");
      localStorage.removeItem("claw_e2e_auth_session_v1");
    } catch {
      /* ignore */
    }
  });
  await installBillingApiMocks(page, state);
}

export async function switchBillingOrg(page: Page, orgId: string): Promise<void> {
  await page.evaluate((next) => {
    localStorage.setItem("claw_org_id", next);
    window.dispatchEvent(new Event("lawdog:org-context-changed"));
  }, orgId);
}
