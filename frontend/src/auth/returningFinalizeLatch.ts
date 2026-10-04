/**
 * Remembers one completed auth transition in this tab.
 * Stores no access token, anonymous cookie, or session secret.
 */

const LATCH_KEY = "lawdog_auth_finalize_latch_v1";

export type CompletedAuthFinalize = {
  userId: string;
  continuationId: string;
  destinationPath: string;
  orgId: string;
};

function readRaw(): CompletedAuthFinalize | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CompletedAuthFinalize>;
    const userId = String(parsed.userId || "").trim();
    if (!userId) return null;
    return {
      userId,
      continuationId: String(parsed.continuationId || "").trim(),
      destinationPath: String(parsed.destinationPath || "/app").trim() || "/app",
      orgId: String(parsed.orgId || "").trim(),
    };
  } catch {
    return null;
  }
}

/** Completed when this user has no newer continuation than the one already finalized. */
export function readCompletedAuthFinalize(
  userId: string,
  continuationId: string | null | undefined,
): CompletedAuthFinalize | null {
  const stored = readRaw();
  const user = (userId || "").trim();
  if (!stored || !user || stored.userId !== user) return null;
  const pending = String(continuationId || "").trim();
  if (pending && pending !== stored.continuationId) return null;
  return stored;
}

export function recordCompletedAuthFinalize(entry: CompletedAuthFinalize): void {
  if (typeof sessionStorage === "undefined") return;
  const userId = entry.userId.trim();
  if (!userId) return;
  try {
    sessionStorage.setItem(
      LATCH_KEY,
      JSON.stringify({
        userId,
        continuationId: entry.continuationId.trim(),
        destinationPath: entry.destinationPath.trim() || "/app",
        orgId: entry.orgId.trim(),
      }),
    );
  } catch {
    /* Storage can be unavailable; the in-memory ref still covers this mount. */
  }
}

export function clearCompletedAuthFinalize(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(LATCH_KEY);
  } catch {
    /* ignore */
  }
}
