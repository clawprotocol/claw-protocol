/**
 * Auth handoff for claim-record flow — prefers Supabase when configured.
 */
import { isGoogleAuthConfigured, isSupabaseAuthEnabled } from "../auth/supabaseAuthService";

export function isClaimAuthConfigured(): boolean {
  return isSupabaseAuthEnabled();
}

export function getClaimRecordEmailContinueHref(): string {
  if (isSupabaseAuthEnabled()) return "/app/settings";
  const v = import.meta.env.VITE_LAWDOG_SIGNUP_EMAIL_URL;
  return typeof v === "string" && v.trim() ? v.trim() : "/app/settings";
}

/** @deprecated Use {@link isGoogleAuthConfigured} — env URL fallback for legacy deploys. */
export function getClaimRecordGoogleAuthHref(): string | null {
  if (isGoogleAuthConfigured()) return null;
  const v = import.meta.env.VITE_LAWDOG_GOOGLE_AUTH_URL;
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

export function shouldDeferClaimUpgradePrompt(_recordId: string): boolean {
  return false;
}
