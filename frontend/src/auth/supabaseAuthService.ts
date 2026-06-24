/**
 * Supabase Auth — email magic link (Phase B GTM).
 */

import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseBrowserConfigured } from "../lib/supabaseClient";

export function isSupabaseAuthEnabled(): boolean {
  try {
    if (!isSupabaseBrowserConfigured()) return false;
    return String(import.meta.env.VITE_CLAW_FEATURE_SUPABASE_AUTH || "").trim() === "1";
  } catch {
    return false;
  }
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

export async function signInWithEmailMagicLink(email: string, redirectTo?: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client || !isSupabaseAuthEnabled()) {
    throw new Error("Sign-in is not configured yet.");
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: redirectTo || `${origin}/app`,
    },
  });
  if (error) throw error;
}

export async function signOutAuth(): Promise<void> {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  await client.auth.signOut();
}
