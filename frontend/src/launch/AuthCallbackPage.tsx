import { useEffect, useState } from "react";
import { useLaunchNav } from "./LaunchNavContext";
import type { User } from "@supabase/supabase-js";
import { getAuthSession } from "../auth/supabaseAuthService";
import { finalizeAuthenticatedSessionFromAuthCallback } from "../auth/authCallbackFinalizeDedup";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { writeContinuationId } from "../auth/authContinuationApi";
import { resolveSafeRedirectPath } from "../auth/safeRedirectResolver";
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
 * Supabase OAuth / magic-link return handler — uses server continuation_id from URL.
 */
export function AuthCallbackPage() {
  const { navigate, search } = useLaunchNav();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const session = await getAuthSession();
        if (!session?.user) {
          if (!cancel) {
            setError("Sign-in could not be completed. Try again from your agreement.");
            setBusy(false);
          }
          logProductEvent("authentication_failed", { reason: "no_session" });
          return;
        }
        const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
        const continuationId = params.get("continuation_id");
        if (continuationId) writeContinuationId(continuationId);
        const result = await finalizeAuthenticatedSessionFromAuthCallback({
          user: session.user,
          claimMethod: inferClaimMethod(session.user),
          continuationId,
        });
        // OAuth return must hydrate user-* org before create/dashboard probes run.
        if (isStaleAnonymousOrgId(getOrgId())) {
          await bindAuthenticatedUserToWorkspace({
            userId: session.user.id,
            email: session.user.email,
            displayName: displayNameFromUser(session.user),
            claimMethod: inferClaimMethod(session.user),
            accessToken: session.access_token,
          });
        }
        if (result.usedFallback) {
          logProductEvent("continuation_fallback_used", { surface: "auth_callback" });
        } else {
          logProductEvent("continuation_restored", { surface: "auth_callback" });
        }
        const nextDest = resolveSafeRedirectPath(params.get("next"), "");
        const destination = nextDest || result.destinationPath;
        if (!cancel) {
          if (!isUserWorkspaceOrgId(getOrgId())) {
            // Prefer dashboard over create when org bind did not settle — avoids anon-* probes.
            navigate("/app");
            return;
          }
          navigate(destination);
        }
      } catch (e) {
        if (!cancel) {
          setError(e instanceof Error ? e.message : "Sign-in failed.");
          setBusy(false);
          logProductEvent("authentication_failed", {
            reason: e instanceof Error ? e.message : "unknown",
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [navigate, search]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-white">Finishing sign-in</h1>
      {busy ? (
        <p className="mt-3 text-sm text-slate-400">Restoring your workspace…</p>
      ) : null}
      {error ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="text-sm font-medium text-slate-300 underline hover:text-white"
            onClick={() => navigate("/app")}
          >
            Go to dashboard
          </button>
        </div>
      ) : null}
    </div>
  );
}
