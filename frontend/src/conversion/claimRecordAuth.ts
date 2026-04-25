/**
 * Auth handoff URLs for the claim-record flow.
 * Set in env when real auth is wired; defaults keep the app usable without OAuth.
 */
export function getClaimRecordEmailContinueHref(): string {
  const v = import.meta.env.VITE_LAWDOG_SIGNUP_EMAIL_URL;
  return typeof v === "string" && v.trim() ? v.trim() : "/app";
}

export function getClaimRecordGoogleAuthHref(): string | null {
  const v = import.meta.env.VITE_LAWDOG_GOOGLE_AUTH_URL;
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim();
}

/**
 * FUTURE: free-tier limit (e.g. 1 saved agreement) and upgrade after reuse attempt.
 * Wire billing checks here; do not block claim UI on this hook.
 */
export function shouldDeferClaimUpgradePrompt(_recordId: string): boolean {
  return false;
}
