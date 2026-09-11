/**
 * Enumeration-safe, provider-sanitized copy for /app/sign-in and /app/auth/callback.
 * Never surface raw provider messages, credentials, codes, tokens, or account existence.
 */

export const AUTH_EMAIL_SENT_COPY = "Check your email for a sign-in link.";
export const AUTH_EMAIL_FAILED_COPY =
  "We could not send a sign-in link right now. Try again in a moment.";
export const AUTH_GOOGLE_FAILED_COPY = "Google sign-in could not be started. Try again.";
export const AUTH_UNAVAILABLE_COPY =
  "Sign-in could not be completed. Try again or return to the dashboard.";
export const AUTH_SIGN_IN_CONTINUING_COPY = "Continuing to your workspace…";
export const AUTH_CALLBACK_LOADING_COPY = "Restoring your workspace…";
export const AUTH_CALLBACK_SUCCESS_COPY = "Continuing to your workspace…";
export const AUTH_STAGING_REDIRECT_COPY = "Signing you in…";

export class AuthContinuationFailure extends Error {
  readonly code: string;

  constructor(code = "auth_unavailable") {
    super(AUTH_UNAVAILABLE_COPY);
    this.name = "AuthContinuationFailure";
    this.code = code;
  }
}

export function sanitizeAuthUserFacingError(_err: unknown, fallback: string): string {
  return fallback;
}

export function authContinuationFailureCode(err: unknown): string {
  if (err instanceof AuthContinuationFailure) return err.code;
  return "auth_unavailable";
}
