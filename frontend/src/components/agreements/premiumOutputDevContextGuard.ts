/**
 * P0: reject LLM regurgitation of local dev / repo / env markers before any premium
 * body is persisted, rendered, or sent to users.
 */
/** When stripping would leave nothing or still match leaks, use this for model retry only (never show as final agreement). */
export const NEUTRAL_PREMIUM_MODEL_INTAKE_FALLBACK =
  "Commercial agreement between the named parties. Key obligations, payment, term, and law as implied by the structured context fields (supplemental raw text omitted).";

const LEAK_SPEC: { id: string; re: RegExp }[] = [
  { id: "localhost", re: /localhost/i },
  { id: "127.0.0.1", re: /127\.0\.0\.1/ },
  { id: "VITE_", re: /VITE_/ },
  { id: "npm run", re: /npm\s+run/i },
  { id: "cd /", re: /cd\s*\/\s*/i },
  { id: "Users/", re: /Users\// },
  { id: "Desktop/", re: /Desktop\//i },
  { id: "frontend", re: /(?<![A-Za-z])frontend(?![A-Za-z])/i },
  { id: "backend", re: /(?<![A-Za-z])backend(?![A-Za-z])/i },
  { id: ".env", re: /\.env\b/i },
  { id: "API_BASE", re: /API_BASE/ },
];

export type DevContextLeakScan = { ok: true } | { ok: false; labels: string[] };

/**
 * If any pattern matches, output must not be shown or stored as premium deliverable.
 */
export function scanPremiumOutputForDevContextLeak(text: string | null | undefined): DevContextLeakScan {
  const t = text == null ? "" : String(text);
  const labels: string[] = [];
  for (const { id, re } of LEAK_SPEC) {
    if (re.test(t)) labels.push(id);
  }
  if (labels.length) return { ok: false, labels: [...new Set(labels)] };
  return { ok: true };
}

/** For API retry: drop lines that touch leak patterns, then apply substring stripping. */
export function stripDevContextMarkersForModelRetry(s: string): string {
  const raw = (s || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const kept = lines.filter((line) => scanPremiumOutputForDevContextLeak(line).ok);
  let t = kept.join("\n");
  t = t.replace(/localhost/gi, "");
  t = t.replace(/127\.0\.0\.1/g, "");
  t = t.replace(/VITE_/g, "");
  t = t.replace(/npm\s+run/gi, " ");
  t = t.replace(/cd\s*\/\s*/gi, "");
  t = t.replace(/Users\//g, "");
  t = t.replace(/Desktop\//gi, "");
  t = t.replace(/(?<![A-Za-z])frontend(?![A-Za-z])/gi, "[term]");
  t = t.replace(/(?<![A-Za-z])backend(?![A-Za-z])/gi, "[term]");
  t = t.replace(/\.env\b/gi, "");
  t = t.replace(/API_BASE/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  if (t.length < 8) return NEUTRAL_PREMIUM_MODEL_INTAKE_FALLBACK;
  if (!scanPremiumOutputForDevContextLeak(t).ok) return NEUTRAL_PREMIUM_MODEL_INTAKE_FALLBACK;
  return t;
}

/**
 * `validatePaidProOutput` / server gate: reject with stable reason tokens.
 */
export function rejectDevContextLeakInPremiumBody(text: string | null | undefined): { ok: false; reasons: string[] } | { ok: true } {
  const s = scanPremiumOutputForDevContextLeak(text);
  if (s.ok) return { ok: true };
  return { ok: false, reasons: s.labels.map((id) => `dev_context_leak:${id}`) };
}

export function logDevContextLeak(
  where: string,
  labels: string[],
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("[dev_context_leak]", { where, labels, event: "dev_context_leak", ...extra });
  } else {
    // eslint-disable-next-line no-console
    console.error("[dev_context_leak]", { where, count: labels.length, ...extra });
  }
}
