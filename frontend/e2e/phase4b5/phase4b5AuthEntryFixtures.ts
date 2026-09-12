/**
 * Phase 4B.5 sign-in / auth-callback fixtures.
 * Deterministic workspace + supabase mocks only — no live email, OAuth, or staging.
 */
import type { Page, Route } from "@playwright/test";
import { DEFAULT_E2E_AUTH_SESSION, seedE2eAuthSession } from "../helpers/rcE2eAuthBridge";
import {
  PHASE4B5_COVERAGE_AGREEMENT_ID,
  PHASE4B5_COVERAGE_AUTH_CODE,
  PHASE4B5_COVERAGE_CONTINUATION_ID,
  PHASE4B5_COVERAGE_OTHER_TITLE,
  PHASE4B5_COVERAGE_RECIPIENT_TOKEN,
  phase4b5CallbackPath,
  phase4b5SignInPath,
} from "../../src/launch/phase4b5AuthEntryCoverage";

export const PHASE4B5_AGREEMENT_ID = PHASE4B5_COVERAGE_AGREEMENT_ID;
export const PHASE4B5_CONTINUATION_ID = PHASE4B5_COVERAGE_CONTINUATION_ID;
export const PHASE4B5_AUTH_CODE = PHASE4B5_COVERAGE_AUTH_CODE;
export const PHASE4B5_RECIPIENT_TOKEN = PHASE4B5_COVERAGE_RECIPIENT_TOKEN;
export const PHASE4B5_OTHER_TITLE = PHASE4B5_COVERAGE_OTHER_TITLE;
export const PHASE4B5_CREATE_DEST = `/app/create?agreementId=${PHASE4B5_AGREEMENT_ID}`;
export const PHASE4B5_RETURN_DEST = `/app/done/${PHASE4B5_AGREEMENT_ID}`;

export const PHASE4B5_OWNER = {
  id: "user-phase4b5-owner",
  email: "owner.phase4b5@example.com",
  name: "Phase 4B.5 Owner",
  orgId: "user-phase4b5-owner",
};

export type Phase4b5OtpMode = "success" | "user_not_found" | "rate_limit";
export type Phase4b5FinalizeMode = "success" | "expired" | "consumed" | "wrong_user" | "not_found";

export type Phase4b5FixtureState = {
  continuationCreates: number;
  otpHits: number;
  otpMode: Phase4b5OtpMode;
  finalizeMode: Phase4b5FinalizeMode;
  finalizeHits: Array<{ continuationId: string; userId: string }>;
  claimedContinuations: Set<string>;
  lastContinuationId: string;
  destinationPath: string;
  agreementId: string;
  orgId: string;
};

export function createPhase4b5FixtureState(): Phase4b5FixtureState {
  return {
    continuationCreates: 0,
    otpHits: 0,
    otpMode: "success",
    finalizeMode: "success",
    finalizeHits: [],
    claimedContinuations: new Set(),
    lastContinuationId: PHASE4B5_CONTINUATION_ID,
    destinationPath: PHASE4B5_RETURN_DEST,
    agreementId: PHASE4B5_AGREEMENT_ID,
    orgId: PHASE4B5_OWNER.orgId,
  };
}

export function phase4b5OwnerSession(provider: "email" | "google" = "email") {
  return {
    ...DEFAULT_E2E_AUTH_SESSION,
    access_token: "e2e-phase4b5-access-token",
    user: {
      ...DEFAULT_E2E_AUTH_SESSION.user,
      id: PHASE4B5_OWNER.id,
      email: PHASE4B5_OWNER.email,
      app_metadata: { provider },
      user_metadata: { full_name: PHASE4B5_OWNER.name },
      identities: [{ provider, id: "e2e-phase4b5-id" }],
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

function readJsonBody(route: Route): Record<string, unknown> {
  try {
    return JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

const PHASE4B5_API_GLOBS = [
  "**/api/**",
  "**/v1/**",
  "**/health",
  "**/health/**",
  "**/version",
  "**/version/**",
  "**/__supabase/**",
] as const;

export async function installPhase4b5ApiMocks(page: Page, state: Phase4b5FixtureState): Promise<void> {
  for (const glob of PHASE4B5_API_GLOBS) {
    await page.route(glob, (route) => fulfillPhase4b5Api(route, state));
  }
  await page.route("**/v1/workspace/finalize-auth", (route) => fulfillPhase4b5Api(route, state));
  await page.route("**/v1/workspace/auth-continuation", (route) => fulfillPhase4b5Api(route, state));
  await page.route("**/v1/workspace/bind-user-org", (route) => fulfillPhase4b5Api(route, state));
}

async function fulfillPhase4b5Api(route: Route, state: Phase4b5FixtureState): Promise<void> {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (
      !url.includes("/api/") &&
      !url.includes("/v1/") &&
      !url.includes("/health") &&
      !url.includes("/version") &&
      !url.includes("/__supabase")
    ) {
      await route.continue();
      return;
    }

    if (url.includes("/__supabase")) {
      if (url.includes("/auth/v1/otp") && method === "POST") {
        state.otpHits += 1;
        if (state.otpMode === "user_not_found") {
          await json(route, { error: "user_not_found", message: "User not found" }, 400);
          return;
        }
        if (state.otpMode === "rate_limit") {
          await json(route, { error: "over_email_send_rate_limit", message: "rate limit 429" }, 429);
          return;
        }
        await json(route, { ok: true });
        return;
      }
      if (url.includes("/auth/v1/token") || url.includes("/auth/v1/session") || url.includes("/auth/v1/user")) {
        const session = phase4b5OwnerSession();
        await json(route, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          token_type: "bearer",
          expires_in: 3600,
          user: session.user,
        });
        return;
      }
      await json(route, { ok: true });
      return;
    }

    if (url.includes("/health") || url.includes("/version")) {
      await json(route, { ok: true });
      return;
    }

    if (url.includes("/v1/workspace/auth-continuation") && method === "POST") {
      state.continuationCreates += 1;
      const body = readJsonBody(route);
      const dest = String(body.destination_path || state.destinationPath);
      state.destinationPath = dest.includes("agreementId=") ? dest : state.destinationPath;
      await json(route, {
        ok: true,
        continuation_id: state.lastContinuationId,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        org_id: "",
      });
      return;
    }

    if (url.includes("/v1/workspace/finalize-auth") && method === "POST") {
      const body = readJsonBody(route);
      const continuationId = String(body.continuation_id || "").trim();
      const auth = (req.headers().authorization || "").trim();
      const userId = auth.includes(PHASE4B5_OWNER.id) || auth.includes("e2e-phase4b5")
        ? PHASE4B5_OWNER.id
        : "user-phase4b5-other";
      state.finalizeHits.push({ continuationId, userId });

      if (state.finalizeMode === "not_found" || !continuationId) {
        await json(route, { detail: { code: "continuation_not_found" } }, 404);
        return;
      }
      if (state.finalizeMode === "expired") {
        await json(route, { detail: { code: "continuation_expired" } }, 410);
        return;
      }
      if (state.finalizeMode === "wrong_user") {
        await json(route, { detail: { code: "continuation_consumed" } }, 409);
        return;
      }
      if (state.finalizeMode === "consumed" && state.claimedContinuations.has(continuationId)) {
        await json(route, { detail: { code: "continuation_consumed" } }, 409);
        return;
      }
      const already = state.claimedContinuations.has(continuationId);
      state.claimedContinuations.add(continuationId);
      await json(route, {
        ok: true,
        org_id: state.orgId,
        user_id: PHASE4B5_OWNER.id,
        destination_path: state.destinationPath,
        migrated_agreement_count: already ? 0 : 1,
        migrated_agreement_ids: already ? [] : [state.agreementId],
        idempotent: already,
      });
      return;
    }

    if (url.includes("/v1/workspace/bind-user-org") && method === "POST") {
      await json(route, {
        ok: true,
        org_id: state.orgId,
        user_id: PHASE4B5_OWNER.id,
        migrated_agreement_count: 0,
        migrated_agreement_ids: [],
      });
      return;
    }

    if (url.includes("/v1/workspace/anonymous-session") || url.includes("/anonymous-session")) {
      await json(route, {
        ok: true,
        org_id: "anon-phase4b5",
        session_id: "anon-session-phase4b5",
        token: "anon-token-phase4b5",
      });
      return;
    }

    if (url.includes("/v1/billing/status")) {
      await json(route, {
        org_id: state.orgId,
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
      });
      return;
    }

    if (url.includes("/v1/subscriptions")) {
      await json(route, {
        ok: true,
        subscription: { org_id: state.orgId, plan_code: "pro", status: "active" },
        plan: "pro",
        status: "active",
      });
      return;
    }

    if (url.includes("/workspace-index") || url.includes("/api/agreements")) {
      await json(route, { ok: true, agreements: [] });
      return;
    }

    await json(route, { ok: true });
}

export async function stubFinalizeAuthFetch(page: Page, state: Phase4b5FixtureState): Promise<void> {
  await page.addInitScript(
    ({ dest, orgId, userId, agreementId }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/v1/workspace/finalize-auth")) {
          let continuationId = "";
          try {
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
            continuationId = String(body.continuation_id || "").trim();
          } catch {
            continuationId = "";
          }
          (window as unknown as { __phase4b5FinalizeHits?: string[] }).__phase4b5FinalizeHits = [
            ...((window as unknown as { __phase4b5FinalizeHits?: string[] }).__phase4b5FinalizeHits || []),
            continuationId,
          ];
          if (continuationId === "cont-phase4b5-expired") {
            return new Response(JSON.stringify({ detail: { code: "continuation_expired" } }), {
              status: 410,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({
              ok: true,
              org_id: orgId,
              user_id: userId,
              destination_path: dest,
              migrated_agreement_count: 1,
              migrated_agreement_ids: [agreementId],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return original(input, init);
      };
    },
    {
      dest: state.destinationPath,
      orgId: state.orgId,
      userId: PHASE4B5_OWNER.id,
      agreementId: state.agreementId,
    },
  );
}

export async function seedPhase4b5Owner(page: Page, provider: "email" | "google" = "email"): Promise<void> {
  const session = phase4b5OwnerSession(provider);
  await seedE2eAuthSession(page, session);
  await page.addInitScript(
    ({ orgId, payload, e2eKey }) => {
      try {
        localStorage.setItem("claw_org_id", orgId);
        localStorage.setItem("sb-127-auth-token", JSON.stringify(payload));
        sessionStorage.setItem(e2eKey, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    { orgId: PHASE4B5_OWNER.orgId, payload: session, e2eKey: "claw_e2e_auth_session_v1" },
  );
}

export { phase4b5CallbackPath, phase4b5SignInPath };
