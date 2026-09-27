import { useEffect, useRef, useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import type { User } from "@supabase/supabase-js";
import { waitForAuthSession } from "../auth/supabaseAuthService";
import { finalizeAuthenticatedSessionFromAuthCallback } from "../auth/authCallbackFinalizeDedup";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { readContinuationId, writeContinuationId } from "../auth/authContinuationApi";
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
import { getOrgId, setOrgId } from "./orgContext";
import { isStaleAnonymousOrgId, isUserWorkspaceOrgId } from "./simpleProduct/createWorkspaceProbeReadiness";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";

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
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || completedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      const windowParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const continuationId =
        (params.get("continuation_id") || "").trim() ||
        (windowParams.get("continuation_id") || "").trim() ||
        (readContinuationId() || "").trim();
      const callerNext = params.get("next") ?? windowParams.get("next");
      stripSensitiveAuthCallbackUrl({ keepContinuationId: true });

      try {
        const session = await waitForAuthSession();
        if (!session?.user) {
          setError(AUTH_UNAVAILABLE_COPY);
          setPhase("unavailable");
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
          setError(AUTH_UNAVAILABLE_COPY);
          setPhase("unavailable");
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

        const serverOrg = (result.orgId || "").trim();
        if (isUserWorkspaceOrgId(serverOrg)) {
          setOrgId(serverOrg);
        }
        if (!isUserWorkspaceOrgId(getOrgId())) {
          // Prefer dashboard over create when org bind did not settle — avoids anon-* probes.
          completedRef.current = true;
          setPhase("success");
          navigate("/app");
          return;
        }

        // Server dest is pre-auth conversion id. A stale next UUID must not win.
        const destination = resolveAuthCallbackDestination({
          serverDestination: result.destinationPath,
          usedContinuation: result.usedContinuation,
          callerNext,
        });
        try {
          const destAid = new URL(destination, "http://lawdog.local").searchParams.get("agreementId")?.trim();
          if (destAid) writeCreateReviewAgreementResumeId(destAid);
        } catch {
          /* Destination path is still navigated even if resume storage is unavailable. */
        }
        completedRef.current = true;
        setPhase("success");
        navigate(destination);
      } catch {
        setError(AUTH_UNAVAILABLE_COPY);
        setPhase("unavailable");
        logProductEvent("authentication_failed", { reason: "callback_failed" });
      }
    })();
    return () => {
      if (!completedRef.current) startedRef.current = false;
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
