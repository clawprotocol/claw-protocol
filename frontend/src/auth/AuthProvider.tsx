import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getAuthSession,
  isSupabaseAuthEnabled,
  onAuthStateChange,
  signInWithEmailMagicLink,
  signOutAuth,
} from "./supabaseAuthService";
import { bindAuthenticatedUserToWorkspace } from "./workspaceBindingApi";
import { writeCurrentUserDisplayName } from "../account/currentUser";
import { refreshSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";

export type AuthContextValue = {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = isSupabaseAuthEnabled();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);

  const bindUser = useCallback(async (user: User) => {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const display =
      typeof meta?.full_name === "string"
        ? meta.full_name
        : typeof meta?.name === "string"
          ? meta.name
          : user.email?.split("@")[0] ?? "";
    if (display.trim()) writeCurrentUserDisplayName(display.trim());
    await bindAuthenticatedUserToWorkspace({
      userId: user.id,
      email: user.email,
      displayName: display,
    });
    await refreshSubscriptionEntitlement();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let unsub: { unsubscribe: () => void } | null = null;
    void getAuthSession().then(async (s) => {
      setSession(s);
      if (s?.user) await bindUser(s.user);
      setLoading(false);
    });
    unsub = onAuthStateChange((s) => {
      setSession(s);
      if (s?.user) void bindUser(s.user);
    }) ?? null;
    return () => {
      unsub?.unsubscribe();
    };
  }, [enabled, bindUser]);

  const signInEmail = useCallback(async (email: string) => {
    await signInWithEmailMagicLink(email);
  }, []);

  const signOut = useCallback(async () => {
    await signOutAuth();
    setSession(null);
  }, []);

  const value = useMemo(
    (): AuthContextValue => ({
      enabled,
      loading,
      session,
      user: session?.user ?? null,
      signInEmail,
      signOut,
    }),
    [enabled, loading, session, signInEmail, signOut],
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
    signOut: async () => {},
  };
}
