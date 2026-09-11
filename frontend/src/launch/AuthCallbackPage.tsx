import { useEffect, useRef, useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import type { User } from "@supabase/supabase-js";
import { waitForAuthSession } from "../auth/supabaseAuthService";
import { finalizeAuthenticatedSessionFromAuthCallback } from "../auth/authCallbackFinalizeDedup";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { writeContinuationId } from "../auth/authContinuationApi";
import {
  resolveAuthCallbackDestination,
  stripSensitiveAuthCallbackUrl,
} from "../auth/safeRedirectResolver";
import {
  AUTH_CALLBACK_LOADING_COPY,
  AUTH_CALLBACK_SUCCESS_COPY,
  AUTH_UNAVAILABLE_COPY,
} from "../auth/authUserFacingCopy";
import { bindAuthenticatedUserToWorkspace } from "../auth/workspaceBindingApi";
import { displayNameFromUser } from "../auth/postAuthFinalizer";
import { getOrgId } from "./orgContext";
import { isStaleAnonymousOrgId, isUserWorkspaceOrgId } from "./simpleProduct/createWorkspaceProbeReadiness";

function inferClaimMethod(user: User): "magic_link" | "google" | "session_restore" {
  const provider =
    (user.app_metadata?.provider as string | undefined) ??
    user.identities?.[0]?.provider ??
    "";
  if (provider === "google") return "google";
  if (provider === "email") return "magic_link";
  return "session_restore";
}

/**
 * Supabase OAuth / magic-link return handler — server continuation is authority.
 */
export function AuthCallbackPage() {
  const { navigate, search } = useLaunchNav();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "success" | "unavailable">("loading");
  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    let cancel = false;
    void (async () => {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const continuationId = (params.get("continuation_id") || "").trim();
      const callerNext = params.get("next");
      stripSensitiveAuthCallbackUrl();

      try {
        const session = await waitForAuthSession();
        if (!session?.user) {
          if (!cancel) {
            setError(AUTH_UNAVAILABLE_COPY);
            setPhase("unavailable");
          }
          logProductEvent("authentication_failed", { reason: "no_session" });
          return;
        }
        if (continuationId) writeContinuationId(continuationId);

        let result;
        try {
          result = await finalizeAuthenticatedSessionFromAuthCallback({
            user: session.user,
            claimMethod: inferClaimMethod(session.user),
            continuationId: continuationId || null,
          });
        } catch (finalizeErr) {
          if (!cancel) {
            setError(AUTH_UNAVAILABLE_COPY);
            setPhase("unavailable");
          }
          logProductEvent("authentication_failed", { reason: "continuation_failed" });
          return;
        }

        if (isStaleAnonymousOrgId(getOrgId())) {
          try {
            await bindAuthenticatedUserToWorkspace({
              userId: session.user.id,
              email: session.user.email,
              displayName: displayNameFromUser(session.user),
              claimMethod: inferClaimMethod(session.user),
              accessToken: session.access_token,
            });
          } catch {
            /* Server finalize already bound the workspace when continuation succeeded. */
          }
        }
        if (result.usedFallback) {
          logProductEvent("continuation_fallback_used", { surface: "auth_callback" });
        } else {
          logProductEvent("continuation_restored", { surface: "auth_callback" });
        }

        if (!isUserWorkspaceOrgId(getOrgId())) {
          if (!cancel) {
            completedRef.current = true;
            setPhase("success");
            navigate("/app");
          }
          return;
        }

        const destination = resolveAuthCallbackDestination({
          serverDestination: result.destinationPath,
          usedContinuation: result.usedContinuation,
          callerNext,
        });
        if (!cancel) {
          completedRef.current = true;
          setPhase("success");
          navigate(destination);
        }
      } catch {
        if (!cancel) {
          setError(AUTH_UNAVAILABLE_COPY);
          setPhase("unavailable");
          logProductEvent("authentication_failed", { reason: "callback_failed" });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [navigate, search]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center" data-testid="auth-callback-page">
      <h1 className="text-lg font-semibold text-white">Finishing sign-in</h1>
      {phase === "loading" ? (
        <p className="mt-3 text-sm text-slate-400" data-testid="auth-callback-loading">
          {AUTH_CALLBACK_LOADING_COPY}
        </p>
      ) : null}
      {phase === "success" ? (
        <p className="mt-3 text-sm text-slate-400" data-testid="auth-callback-success">
          {AUTH_CALLBACK_SUCCESS_COPY}
        </p>
      ) : null}
      {phase === "unavailable" && error ? (
        <div className="mt-4 space-y-3" data-testid="auth-callback-unavailable">
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="text-sm font-medium text-slate-300 underline hover:text-white"
              data-testid="auth-callback-retry"
              onClick={() => navigate("/app/sign-in")}
            >
              Try sign-in again
            </button>
            <button
              type="button"
              className="text-sm font-medium text-slate-300 underline hover:text-white"
              data-testid="auth-callback-dashboard"
              onClick={() => navigate("/app")}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
