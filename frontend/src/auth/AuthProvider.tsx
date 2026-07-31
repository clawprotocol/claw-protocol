import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getAuthSession,
  isSupabaseAuthEnabled,
  onAuthStateChange,
  signInWithEmailMagicLink,
  signInWithGoogle,
  signOutAuth,
  buildAuthCallbackUrl,
} from "./supabaseAuthService";
import { displayNameFromUser, finalizeAuthenticatedSession } from "./postAuthFinalizer";
import { prepareAuthContinuation } from "./prepareAuthContinuation";
import { setCachedAccessToken, clearCachedAccessToken } from "./authAccessTokenCache";
import { bindAuthenticatedUserToWorkspace } from "./workspaceBindingApi";

export type AuthContextValue = {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInEmail: (email: string, opts?: { returningSignIn?: boolean }) => Promise<void>;
  signInGoogle: (opts?: { returningSignIn?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

function isAuthCallbackPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/$/, "") === "/app/auth/callback";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = isSupabaseAuthEnabled();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);
  const finalizedUserRef = useRef<string | null>(null);

  const finalizeUser = useCallback(async (user: User, claimMethod: "magic_link" | "google" | "session_restore") => {
    if (finalizedUserRef.current === user.id) {
      // Idempotent identity upsert so Admin Console can find returning sessions by email.
      try {
        const s = await getAuthSession();
        await bindAuthenticatedUserToWorkspace({
          userId: user.id,
          email: user.email,
          displayName: displayNameFromUser(user) || undefined,
          claimMethod: "session_restore",
          accessToken: s?.access_token,
        });
      } catch {
        // Non-blocking — full finalize already succeeded for this session.
      }
      return;
    }
    finalizedUserRef.current = user.id;
    await finalizeAuthenticatedSession({ user, claimMethod });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let unsub: { unsubscribe: () => void } | null = null;
    void getAuthSession().then(async (s) => {
      setSession(s);
      if (s?.access_token) setCachedAccessToken(s.access_token);
      else clearCachedAccessToken();
      if (s?.user && !isAuthCallbackPath()) {
        await finalizeUser(s.user, "session_restore");
      }
      setLoading(false);
    });
    unsub = onAuthStateChange((s) => {
      setSession(s);
      if (s?.access_token) setCachedAccessToken(s.access_token);
      else clearCachedAccessToken();
      if (s?.user && !isAuthCallbackPath()) {
        void finalizeUser(s.user, "session_restore");
      }
    }) ?? null;
    return () => {
      unsub?.unsubscribe();
    };
  }, [enabled, finalizeUser]);

  const signInEmail = useCallback(async (email: string, opts?: { returningSignIn?: boolean }) => {
    const continuationId = await prepareAuthContinuation({
      returningSignIn: opts?.returningSignIn,
      workflowStage: opts?.returningSignIn ? "dashboard" : "claim",
      destinationPath: opts?.returningSignIn ? "/app" : undefined,
      provider: "email",
    });
    await signInWithEmailMagicLink(email, buildAuthCallbackUrl(undefined, continuationId));
  }, []);

  const signInGoogle = useCallback(async (opts?: { returningSignIn?: boolean }) => {
    const continuationId = await prepareAuthContinuation({
      returningSignIn: opts?.returningSignIn,
      workflowStage: opts?.returningSignIn ? "dashboard" : "claim",
      destinationPath: opts?.returningSignIn ? "/app" : undefined,
      provider: "google",
    });
    await signInWithGoogle(buildAuthCallbackUrl(undefined, continuationId));
  }, []);

  const signOut = useCallback(async () => {
    await signOutAuth();
    setSession(null);
    finalizedUserRef.current = null;
  }, []);

  const value = useMemo(
    (): AuthContextValue => ({
      enabled,
      loading,
      session,
      user: session?.user ?? null,
      signInEmail,
      signInGoogle,
      signOut,
    }),
    [enabled, loading, session, signInEmail, signInGoogle, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (v) return v;
  return {
    enabled: false,
    loading: false,
    session: null,
    user: null,
    signInEmail: async () => {
      throw new Error("Sign-in is not configured.");
    },
    signInGoogle: async () => {
      throw new Error("Sign-in is not configured.");
    },
    signOut: async () => {},
  };
}
