/**
 * Dedupes concurrent finalizeAuthenticatedSession calls from AuthCallbackPage (e.g. React StrictMode).
 * Server finalize-auth remains idempotent; this suppresses duplicate browser-initiated requests.
 */
import type { User } from "@supabase/supabase-js";
import { finalizeAuthenticatedSession, type PostAuthFinalizeResult } from "./postAuthFinalizer";

const inflightByKey = new Map<string, Promise<PostAuthFinalizeResult>>();

export function authCallbackFinalizeKey(args: {
  userId: string;
  continuationId?: string | null;
}): string {
  const uid = args.userId.trim();
  const cid = (args.continuationId ?? "").trim();
  return `${uid}:${cid || "__no_continuation__"}`;
}

/** One logical finalization per callback key until the in-flight promise settles. */
export function finalizeAuthenticatedSessionFromAuthCallback(args: {
  user: User;
  claimMethod: "magic_link" | "google" | "session_restore";
  continuationId?: string | null;
}): Promise<PostAuthFinalizeResult> {
  const key = authCallbackFinalizeKey({
    userId: args.user.id,
    continuationId: args.continuationId,
  });
  const existing = inflightByKey.get(key);
  if (existing) return existing;

  const promise = finalizeAuthenticatedSession(args).finally(() => {
    if (inflightByKey.get(key) === promise) {
      inflightByKey.delete(key);
    }
  });
  inflightByKey.set(key, promise);
  return promise;
}

/** Test-only: reset in-flight map between unit tests. */
export function resetAuthCallbackFinalizeDedupForTests(): void {
  inflightByKey.clear();
}
