/**
 * Staging/local GTM: mint Supabase magic-link action_link via claw API
 * (Admin generate_link) so allowlisted test accounts skip Auth email OTP throttle.
 */

import { apiUrl, readJson } from "../lib/clawApi";
import { isPublicProductionHostname } from "../launch/devPaymentBypass";

const DEFAULT_GTM_EMAIL = "cryptocurated21+lawdogtest2@gmail.com";
const CRYPTOCURATED_PLUS = /^cryptocurated21\+[^@]+@gmail\.com$/i;

export function stagingAuthDefaultTestEmail(): string {
  return DEFAULT_GTM_EMAIL;
}

export function isStagingAuthMagicLinkClientSurface(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (isPublicProductionHostname(host)) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.includes("staging")) return true;
  if ((host.endsWith(".railway.app") || host.endsWith(".up.railway.app")) && !host.includes("production")) {
    return true;
  }
  try {
    const env = String(
      import.meta.env.VITE_LAWDOG_ENV ||
        import.meta.env.VITE_CLAW_ENVIRONMENT ||
        import.meta.env.VITE_APP_ENV ||
        "",
    )
      .trim()
      .toLowerCase();
    return env === "staging" || env === "stage" || env === "local" || env === "dev" || env === "test";
  } catch {
    return false;
  }
}

export function isStagingAuthAllowlistedEmailClient(email: string): boolean {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === DEFAULT_GTM_EMAIL) return true;
  return CRYPTOCURATED_PLUS.test(normalized);
}

export function isAuthEmailRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("email rate limit") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("429")
  );
}

type StagingMagicLinkResponse = {
  ok?: boolean;
  action_link?: string;
  mode?: string;
  detail?: string;
};

export async function mintStagingAuthMagicLinkActionLink(
  email: string,
  redirectTo: string,
): Promise<string> {
  const res = await fetch(apiUrl("/v1/workspace/staging-auth/magic-link"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      redirect_to: redirectTo,
    }),
  });
  if (!res.ok) {
    let detail = `staging_auth_magic_link_failed_${res.status}`;
    try {
      const body = await readJson<{ detail?: string }>(res);
      if (typeof body.detail === "string" && body.detail.trim()) detail = body.detail.trim();
    } catch {
      /* keep status detail */
    }
    throw new Error(detail);
  }
  const body = await readJson<StagingMagicLinkResponse>(res);
  const link = String(body.action_link || "").trim();
  if (!link.startsWith("http")) {
    throw new Error("staging_auth_action_link_missing");
  }
  return link;
}

/** Navigate to Admin-minted magic link (same callback as email OTP). */
export async function redirectViaStagingAuthMagicLink(
  email: string,
  redirectTo: string,
): Promise<void> {
  const actionLink = await mintStagingAuthMagicLinkActionLink(email, redirectTo);
  if (typeof window !== "undefined") {
    window.location.assign(actionLink);
  }
}
