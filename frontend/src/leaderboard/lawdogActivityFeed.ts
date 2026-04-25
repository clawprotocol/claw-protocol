import type { LawdogActivityFeedEntry } from "./lawdogLeaderboardTypes";
import { isPublicLeaderboardVisibility, readLawdogLeaderboardPrefs } from "./lawdogLeaderboardPrefs";

const KEY = "lawdog_activity_feed_v1";
const MAX = 24;

function readRaw(): LawdogActivityFeedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as LawdogActivityFeedEntry[]) : null;
    if (!Array.isArray(p)) return [];
    return p
      .filter((e) => e && typeof e.headline === "string" && typeof e.at_ms === "number")
      .slice(-MAX);
  } catch {
    return [];
  }
}

function writeRaw(rows: LawdogActivityFeedEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX)));
  } catch {
    /* quota */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Append a private activity line. Copy must stay generic (no agreement text, parties, or doc metadata).
 * `eligible_for_public_snapshot` mirrors current opt-in — future sync only.
 */
export function appendLawdogActivityFeed(headline: string): void {
  const prefs = readLawdogLeaderboardPrefs();
  const row: LawdogActivityFeedEntry = {
    id: newId(),
    at_ms: Date.now(),
    headline: headline.slice(0, 200),
    eligible_for_public_snapshot: isPublicLeaderboardVisibility(prefs),
  };
  writeRaw([...readRaw(), row]);
}

export function readLawdogActivityFeed(): LawdogActivityFeedEntry[] {
  return [...readRaw()].sort((a, b) => b.at_ms - a.at_ms);
}

/** Test helper */
export function __resetLawdogActivityFeedForTests(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
