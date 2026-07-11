/**
 * Supabase Auth — email magic link + Google OAuth (Phase B GTM).
 */

import type { Provider, Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseBrowserConfigured } from "../lib/supabaseClient";
import { readAuthContinuationContext } from "./authContinuationContext";
import { readContinuationId } from "./authContinuationApi";
import { resolveSafeRedirectPath } from "./safeRedirectResolver";

export function isSupabaseAuthEnabled(): boolean {
  try {
    if (!isSupabaseBrowserConfigured()) return false;
    return String(import.meta.env.VITE_CLAW_FEATURE_SUPABASE_AUTH || "").trim() === "1";
  } catch {
    return false;
  }
}

export function isGoogleAuthConfigured(): boolean {
  try {
    return isSupabaseAuthEnabled();
  } catch {
    return false;
  }
}

export function buildAuthCallbackUrl(continuationDestination?: string, continuationId?: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let dest = continuationDestination?.trim();
  if (!dest) {
    const ctx = readAuthContinuationContext();
    dest = ctx?.destinationPath;
  }
  if (!dest && typeof window !== "undefined") {
    dest = `${window.location.pathname}${window.location.search}`;
  }
  const safeDest = resolveSafeRedirectPath(dest, "/app");
  const q = new URLSearchParams({ next: safeDest });
  const cid = (continuationId ?? readContinuationId())?.trim();
  if (cid) q.set("continuation_id", cid);
  return `${origin}/app/auth/callback?${q.toString()}`;
}

export async function getAuthSession(): Promise<Session | null> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseAuthEnabled()) return null;
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function getAuthUser(): Promise<User | null> {
  const session = await getAuthSession();
  return session?.user ?? null;
}

export function onAuthStateChange(
  listener: (session: Session | null) => void,
): { unsubscribe: () => void } | null {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseAuthEnabled()) return null;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    listener(session);
  });
  return data.subscription;
}

export async function signInWithEmailMagicLink(
  email: string,
  redirectTo?: string,
): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseAuthEnabled()) {
    throw new Error("Sign-in is not configured yet.");
  }
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTo || buildAuthCallbackUrl(),
    },
  });
  if (error) throw error;
}

export async function signInWithOAuthProvider(args: {
  provider: Provider;
  redirectTo?: string;
}): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseAuthEnabled()) {
    throw new Error("Sign-in is not configured yet.");
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: args.provider,
    options: {
      redirectTo: args.redirectTo || buildAuthCallbackUrl(),
    },
  });
  if (error) throw error;
}

export async function signInWithGoogle(redirectTo?: string): Promise<void> {
  await signInWithOAuthProvider({ provider: "google", redirectTo });
}

export async function signOutAuth(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  await client.auth.signOut();
}
