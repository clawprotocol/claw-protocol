/**
 * Dev-only E2E auth session bridge — lets Playwright exercise AuthCallbackPage
 * without live Supabase. Production auth paths remain unchanged when unset.
 */
import type { Page } from "@playwright/test";

export const E2E_AUTH_SESSION_KEY = "claw_e2e_auth_session_v1";

export type E2eAuthSessionSeed = {
  access_token: string;
  user: {
    id: string;
    email: string;
    app_metadata?: { provider?: string };
    user_metadata?: { full_name?: string };
    identities?: Array<{ provider: string }>;
  };
};

export const DEFAULT_E2E_AUTH_SESSION = {
  access_token: "e2e-access-token",
  refresh_token: "e2e-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "e2e-user-rc-authority",
    email: "owner.rc-authority@example.com",
    app_metadata: { provider: "email" },
    user_metadata: { full_name: "RC Authority Owner" },
    identities: [{ provider: "email", id: "e2e-id" }],
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
  },
};

export async function seedE2eAuthSession(page: Page, session = DEFAULT_E2E_AUTH_SESSION): Promise<void> {
  await page.addInitScript(
    ({ key, payload }) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    { key: E2E_AUTH_SESSION_KEY, payload: session },
  );
}

export async function clearE2eAuthSession(page: Page): Promise<void> {
  await page.evaluate((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, E2E_AUTH_SESSION_KEY);
}
