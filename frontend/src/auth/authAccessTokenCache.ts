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
