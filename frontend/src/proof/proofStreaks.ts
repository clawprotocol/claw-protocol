/** Streak math from local proof-activity day weights (UTC YYYY-MM-DD). */

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

function ymdFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function activeDates(weights: Record<string, number>): Set<string> {
  const s = new Set<string>();
  for (const [k, v] of Object.entries(weights)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v > 0) s.add(k);
  }
  return s;
}

/** Consecutive UTC days with activity ending at `endYmd` (inclusive). */
function streakEndingAt(active: Set<string>, endYmd: string): number {
  if (!active.has(endYmd)) return 0;
  let n = 0;
  let ms = parseYmd(endYmd);
  if (Number.isNaN(ms)) return 0;
  while (active.has(ymdFromUtcMs(ms))) {
    n += 1;
    ms -= 86_400_000;
  }
  return n;
}

export function computeProofDayStreaks(dayWeights: Record<string, number>): {
  current_streak_days: number;
  longest_streak_days: number;
} {
  const active = activeDates(dayWeights);
  if (active.size === 0) {
    return { current_streak_days: 0, longest_streak_days: 0 };
  }
  const today = ymdFromUtcMs(Date.now());
  const current = streakEndingAt(active, today);

  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let prevMs: number | null = null;
  for (const ymd of sorted) {
    const ms = parseYmd(ymd);
    if (Number.isNaN(ms)) continue;
    if (prevMs !== null && ms === prevMs + 86_400_000) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prevMs = ms;
  }
  return { current_streak_days: current, longest_streak_days: longest };
}
