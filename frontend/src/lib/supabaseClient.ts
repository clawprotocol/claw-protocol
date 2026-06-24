/**
 * Supabase browser client wrapper — Phase A dashboard persistence.
 * Uses anon key only; no auth rebuild until Phase B.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LawdogSupabaseTables = {
  organizations: {
    Row: {
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
    };
  };
  agreements: {
    Row: {
      id: string;
      organization_id: string;
      title: string;
      agreement_type: string | null;
      created_at: string;
      updated_at: string;
      workspace_archived_at: string | null;
      review_sent_at: string | null;
    };
  };
  agreement_parties: {
    Row: {
      id: string;
      agreement_id: string;
      party_id: string | null;
      display_name: string;
      role: string;
      email: string | null;
      phone: string | null;
      sort_order: number;
    };
  };
};

export function readSupabaseUrlEnv(): string {
  return String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

export function readSupabaseAnonKeyEnv(): string {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(readSupabaseUrlEnv() && readSupabaseAnonKeyEnv());
}

function supabaseAuthPersistSession(): boolean {
  try {
    return String(import.meta.env.VITE_CLAW_FEATURE_SUPABASE_AUTH || "").trim() === "1";
  } catch {
    return false;
  }
}

let cachedClient: SupabaseClient<LawdogSupabaseTables> | null = null;

/** Returns null when Supabase public env vars are missing (local/dev fallback). */
export function getSupabaseBrowserClient(): SupabaseClient<LawdogSupabaseTables> | null {
  if (!isSupabaseBrowserConfigured()) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient<LawdogSupabaseTables>(
    readSupabaseUrlEnv(),
    readSupabaseAnonKeyEnv(),
    {
      auth: {
        persistSession: supabaseAuthPersistSession(),
        autoRefreshToken: supabaseAuthPersistSession(),
        detectSessionInUrl: supabaseAuthPersistSession(),
      },
    },
  );
  return cachedClient;
}

export function resetSupabaseBrowserClientForTests(): void {
  cachedClient = null;
}
