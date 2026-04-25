import type { LawdogLeaderboardPrefsV1, LeaderboardVisibility } from "./lawdogLeaderboardTypes";

const KEY = "lawdog_leaderboard_prefs_v1";

function defaultPrefs(): LawdogLeaderboardPrefsV1 {
  return {
    visibility: "private",
    public_display_handle: "",
    completion_opt_in_dismissed: false,
    doginal_verified_badge: false,
    updated_at_ms: Date.now(),
  };
}

function sanitizeHandle(raw: string): string {
  const s = (raw || "").trim().replace(/[^\w\-.\s@]+/g, "").replace(/\s+/g, " ").slice(0, 40);
  return s.trim();
}

export function readLawdogLeaderboardPrefs(): LawdogLeaderboardPrefsV1 {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as LawdogLeaderboardPrefsV1) : null;
    if (!p || typeof p !== "object") return defaultPrefs();
    const vis: LeaderboardVisibility =
      p.visibility === "alias_public" || p.visibility === "full_public" ? p.visibility : "private";
    return {
      visibility: vis,
      public_display_handle: sanitizeHandle(typeof p.public_display_handle === "string" ? p.public_display_handle : ""),
      completion_opt_in_dismissed: Boolean(p.completion_opt_in_dismissed),
      doginal_verified_badge: Boolean(p.doginal_verified_badge),
      updated_at_ms: typeof p.updated_at_ms === "number" ? p.updated_at_ms : Date.now(),
    };
  } catch {
    return defaultPrefs();
  }
}

export function writeLawdogLeaderboardPrefs(next: LawdogLeaderboardPrefsV1): void {
  if (typeof window === "undefined") return;
  try {
    const clean: LawdogLeaderboardPrefsV1 = {
      ...next,
      public_display_handle: sanitizeHandle(next.public_display_handle),
      updated_at_ms: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* quota */
  }
}

export function dismissCompletionLeaderboardOptIn(): void {
  const p = readLawdogLeaderboardPrefs();
  writeLawdogLeaderboardPrefs({ ...p, completion_opt_in_dismissed: true });
}

export function setLeaderboardVisibility(
  visibility: LeaderboardVisibility,
  opts?: { public_display_handle?: string; doginal_verified_badge?: boolean }
): LawdogLeaderboardPrefsV1 {
  const p = readLawdogLeaderboardPrefs();
  const handle =
    visibility === "private"
      ? p.public_display_handle
      : sanitizeHandle(opts?.public_display_handle ?? p.public_display_handle) ||
        (visibility === "alias_public" ? "Anonymous creator" : "LawDog creator");
  const next: LawdogLeaderboardPrefsV1 = {
    ...p,
    visibility,
    public_display_handle: visibility === "private" ? p.public_display_handle : handle,
    doginal_verified_badge:
      visibility === "full_public" ? Boolean(opts?.doginal_verified_badge) : false,
  };
  writeLawdogLeaderboardPrefs(next);
  return readLawdogLeaderboardPrefs();
}

export function revertLeaderboardToPrivate(): void {
  const p = readLawdogLeaderboardPrefs();
  writeLawdogLeaderboardPrefs({
    ...p,
    visibility: "private",
    doginal_verified_badge: false,
  });
}

export function isPublicLeaderboardVisibility(prefs: LawdogLeaderboardPrefsV1): boolean {
  return prefs.visibility === "alias_public" || prefs.visibility === "full_public";
}

/** Test helper */
export function __resetLawdogLeaderboardPrefsForTests(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
