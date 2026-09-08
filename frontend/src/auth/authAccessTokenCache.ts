/** Cached Supabase access token for synchronous agreement API headers. */

let cachedAccessToken = "";

export function setCachedAccessToken(token: string): void {
  cachedAccessToken = (token || "").trim();
}

export function getCachedAccessToken(): string {
  return cachedAccessToken;
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = "";
}

/** Hydrate token cache from Supabase session (call on app boot and auth state changes). */
export async function refreshCachedAccessToken(): Promise<string> {
  try {
    const { getAuthSession } = await import("./supabaseAuthService");
    const session = await getAuthSession();
    const token = session?.access_token?.trim() ?? "";
    if (token) {
      setCachedAccessToken(token);
      return token;
    }
    return getCachedAccessToken();
  } catch {
    return getCachedAccessToken();
  }
}

/**
 * Token-on-request guarantee after storage clear / cold auth.
 * First `getSession()` can be empty while AuthProvider is still hydrating;
 * retry once so entitled pfd does not preflight without a Bearer.
 */
export async function ensureCachedAccessToken(): Promise<string> {
  const first = (await refreshCachedAccessToken()).trim();
  if (first) return first;
  const second = (await refreshCachedAccessToken()).trim();
  return second || getCachedAccessToken().trim();
}
