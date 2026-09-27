import { useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import { useAuth } from "../auth/AuthProvider";
import { isGoogleAuthConfigured } from "../auth/supabaseAuthService";
import {
  AUTH_EMAIL_FAILED_COPY,
  AUTH_EMAIL_SENT_COPY,
  AUTH_GOOGLE_FAILED_COPY,
  AUTH_SIGN_IN_CONTINUING_COPY,
  AUTH_STAGING_REDIRECT_COPY,
  sanitizeAuthUserFacingError,
} from "../auth/authUserFacingCopy";
import {
  isStagingAuthMagicLinkClientSurface,
  stagingAuthDefaultTestEmail,
} from "../auth/stagingAuthMagicLink";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { resolveSignInNextDestination } from "./genesisReferral/genesisReferralColdCreateGate";
import {
  CHECKOUT_SIGN_IN_BODY,
  CHECKOUT_SIGN_IN_HEADING,
  extractAgreementIdFromCheckoutPath,
  isSecureCheckoutPath,
  resolveSignInContinuationOpts,
  sanitizeVisibleSignInUrl,
} from "../auth/safeRedirectResolver";
import {
  QUICK_PDF_AUTH_PURPOSE,
  QUICK_PDF_RETURN_PATH,
  QUICK_PDF_SIGN_IN_INTENT,
} from "./quickPdfReturnAuthority";
import {
  pinCheckoutPathToPreAuthAgreement,
  readKnownConversionAgreementId,
} from "../auth/preAuthCheckoutAgreement";
import { sanitizeConversionCheckoutDest } from "./checkoutParams";
import { getGenesisReferralCode } from "./genesisReferral/genesisReferralCapture";
import { isPublicProductionHostname } from "./devPaymentBypass";

function productionHostnameHidesStagingControls(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isPublicProductionHostname(window.location.hostname);
  } catch {
    return false;
  }
}

/** Sign-in — dashboard for returning users; checkout `?next=` claims the pre-auth agreement. */
export function SignInPage() {
  const { navigate, search } = useLaunchNav();
  const { enabled, loading, user, signInEmail, signInGoogle } = useAuth();
  const stagingAuthSurface =
    isStagingAuthMagicLinkClientSurface() && !productionHostnameHidesStagingControls();
  const [email, setEmail] = useState(() => (stagingAuthSurface ? stagingAuthDefaultTestEmail() : ""));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const quickPdfReturn = useMemo(() => {
    try {
      const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search || "");
      return (q.get("intent") || "").trim().toLowerCase() === QUICK_PDF_SIGN_IN_INTENT;
    } catch {
      return false;
    }
  }, [search]);
  const destinationPath = useMemo(
    () => (quickPdfReturn ? QUICK_PDF_RETURN_PATH : resolveSignInNextDestination(search, "/app")),
    [quickPdfReturn, search],
  );
  const checkoutContinuation = isSecureCheckoutPath(destinationPath);
  const referralCode = useMemo(() => getGenesisReferralCode(), []);
  const signInOpts = useMemo(
    () =>
      quickPdfReturn
        ? {
            returningSignIn: true as const,
            destinationPath,
            authPurpose: QUICK_PDF_AUTH_PURPOSE,
          }
        : resolveSignInContinuationOpts(destinationPath),
    [destinationPath, quickPdfReturn],
  );

  useEffect(() => {
    sanitizeVisibleSignInUrl();
  }, []);

  useEffect(() => {
    if (!enabled || loading || !user) return;
    if (quickPdfReturn) {
      navigate(destinationPath);
      return;
    }
    const pinned = pinCheckoutPathToPreAuthAgreement(destinationPath);
    navigate(
      sanitizeConversionCheckoutDest({
        dest: pinned,
        persistAgreementId:
          extractAgreementIdFromCheckoutPath(pinned) || readKnownConversionAgreementId(),
      }),
    );
  }, [destinationPath, enabled, loading, navigate, quickPdfReturn, user]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-slate-400" data-testid="auth-sign-in-unconfigured">
        Sign-in is not configured in this environment.
      </div>
    );
  }

  if (loading) {
    return (
      <p className="px-4 py-16 text-center text-sm text-slate-400" data-testid="auth-sign-in-checking">
        Checking sign-in…
      </p>
    );
  }

  if (user) {
    return (
      <p className="px-4 py-16 text-center text-sm text-slate-400" data-testid="auth-sign-in-continuing">
        {AUTH_SIGN_IN_CONTINUING_COPY}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12" data-testid="auth-sign-in-page">
      <h1 className="text-xl font-semibold text-white">
        {checkoutContinuation ? CHECKOUT_SIGN_IN_HEADING : "Sign in to LawDog"}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {checkoutContinuation
          ? CHECKOUT_SIGN_IN_BODY
          : quickPdfReturn
            ? "Sign in to continue preparing your existing PDF for e-sign. After sign-in you’ll return to that step."
            : referralCode
              ? "Sign in to continue with your referral invite and open create."
              : "Access your agreements and workspace."}
      </p>
      {isGoogleAuthConfigured() ? (
        <button
          type="button"
          data-testid="auth-sign-in-google"
          className="mt-6 w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          disabled={busy || emailSent}
          onClick={() => {
            if (busy || emailSent) return;
            logProductEvent("dashboard_sign_in_initiated", {
              surface: "sign_in_page",
              method: "google",
              has_referral: Boolean(referralCode),
            });
            setBusy(true);
            setStatus(null);
            void signInGoogle(signInOpts)
              .catch(() => setStatus(sanitizeAuthUserFacingError(null, AUTH_GOOGLE_FAILED_COPY)))
              .finally(() => setBusy(false));
          }}
        >
          Continue with Google
        </button>
      ) : null}
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim() || busy || emailSent) return;
          setBusy(true);
          setStatus(null);
          logProductEvent("magic_link_requested", {
            surface: "sign_in_page",
            has_referral: Boolean(referralCode),
          });
          void signInEmail(email.trim(), signInOpts)
            .then((result) => {
              if (result.mode === "staging_redirect") {
                setStatus(AUTH_STAGING_REDIRECT_COPY);
                return;
              }
              setEmailSent(true);
              setStatus(AUTH_EMAIL_SENT_COPY);
            })
            .catch(() => setStatus(sanitizeAuthUserFacingError(null, AUTH_EMAIL_FAILED_COPY)))
            .finally(() => setBusy(false));
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          data-testid="auth-sign-in-email"
          autoComplete="email"
          disabled={busy || emailSent}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={busy || emailSent}
          data-testid="auth-sign-in-submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
        >
          Email me a sign-in link
        </button>
      </form>
      {stagingAuthSurface ? (
        <button
          type="button"
          data-testid="auth-sign-in-staging"
          className="mt-3 w-full rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-amber-900/50 disabled:opacity-60"
          disabled={busy || emailSent}
          onClick={() => {
            const target = email.trim() || stagingAuthDefaultTestEmail();
            setEmail(target);
            setBusy(true);
            setStatus(null);
            logProductEvent("magic_link_requested", { surface: "sign_in_page_staging_bypass" });
            void signInEmail(target, { ...signInOpts, stagingDirectOnly: true })
              .then((result) => {
                if (result.mode === "staging_redirect") {
                  setStatus(AUTH_STAGING_REDIRECT_COPY);
                  return;
                }
                setStatus(sanitizeAuthUserFacingError(null, AUTH_EMAIL_FAILED_COPY));
              })
              .catch(() => setStatus(sanitizeAuthUserFacingError(null, AUTH_EMAIL_FAILED_COPY)))
              .finally(() => setBusy(false));
          }}
        >
          Staging test login (skip email throttle)
        </button>
      ) : null}
      {status ? (
        <p className="mt-3 text-sm text-slate-400" data-testid="auth-sign-in-status" role="status">
          {status}
        </p>
      ) : null}
      <button
        type="button"
        className="mt-8 text-sm text-slate-500 underline hover:text-slate-300"
        data-testid="auth-sign-in-home"
        onClick={() => navigate("/")}
      >
        Back to homepage
      </button>
    </div>
  );
}
