const KEY = "lawdog_proof_activity_v1";
const MAX_DAY_KEYS = 120;

export type LawdogProofActivityV1 = {
  /** Agreement ids that reached “sent” in simple flow (idempotent). */
  sent_agreement_ids: string[];
  /** Agreement ids that reached fully signed / finalized (idempotent). */
  finalized_agreement_ids: string[];
  /** UTC YYYY-MM-DD → intensity weight 1..3 (capped). */
  day_weights?: Record<string, number>;
  /** UTC YYYY-MM-DD → short tooltip fragments (no agreement content). */
  day_labels?: Record<string, string[]>;
  updated_at_ms: number;
};

function defaultActivity(): LawdogProofActivityV1 {
  return { sent_agreement_ids: [], finalized_agreement_ids: [], updated_at_ms: Date.now() };
}

function utcYmdFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function pruneDayMaps(
  weights: Record<string, number>,
  labels: Record<string, string[]>,
): { weights: Record<string, number>; labels: Record<string, string[]> } {
  const cutoff = Date.now() - MAX_DAY_KEYS * 86_400_000;
  const minYmd = utcYmdFromMs(cutoff);
  const w: Record<string, number> = {};
  const l: Record<string, string[]> = {};
  for (const k of Object.keys(weights).sort()) {
    if (k >= minYmd) w[k] = weights[k];
  }
  for (const k of Object.keys(labels)) {
    if (k >= minYmd) l[k] = labels[k];
  }
  return { weights: w, labels: l };
}

function read(): LawdogProofActivityV1 {
  if (typeof window === "undefined") return defaultActivity();
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as LawdogProofActivityV1) : null;
    if (!p || typeof p !== "object") return defaultActivity();
    const day_weights =
      p.day_weights && typeof p.day_weights === "object"
        ? Object.fromEntries(
            Object.entries(p.day_weights).filter(
              ([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && v > 0,
            ),
          )
        : undefined;
    const day_labels =
      p.day_labels && typeof p.day_labels === "object"
        ? Object.fromEntries(
            Object.entries(p.day_labels).filter(
              ([k, v]) =>
                /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v) && v.every((x) => typeof x === "string"),
            ),
          )
        : undefined;
    return {
      sent_agreement_ids: Array.isArray(p.sent_agreement_ids)
        ? p.sent_agreement_ids.filter((x) => typeof x === "string" && x.trim())
        : [],
      finalized_agreement_ids: Array.isArray(p.finalized_agreement_ids)
        ? p.finalized_agreement_ids.filter((x) => typeof x === "string" && x.trim())
        : [],
      day_weights,
      day_labels,
      updated_at_ms: typeof p.updated_at_ms === "number" ? p.updated_at_ms : Date.now(),
    };
  } catch {
    return defaultActivity();
  }
}

function write(next: LawdogProofActivityV1): void {
  if (typeof window === "undefined") return;
  try {
    next.updated_at_ms = Date.now();
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("lawdog:proof-activity-day"));
  } catch {
    /* quota */
  }
}

/**
 * Record one proof-activity unit for the current UTC calendar day (private, local only).
 * Intensity builds 1→3 per day; labels power heat map tooltips.
 */
export function recordProofActivityDay(label: string): void {
  const text = (label || "").trim();
  if (!text) return;
  const ymd = utcYmdFromMs(Date.now());
  const st = read();
  const dw = { ...(st.day_weights || {}) };
  dw[ymd] = Math.min(3, (dw[ymd] ?? 0) + 1);
  const dl = { ...(st.day_labels || {}) };
  const prev = dl[ymd] ?? [];
  const merged = [...prev, text];
  const seen = new Set<string>();
  dl[ymd] = merged.filter((x) => {
    const t = x.trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  }).slice(-5);
  const pruned = pruneDayMaps(dw, dl);
  write({ ...st, day_weights: pruned.weights, day_labels: pruned.labels });
}

/** @returns whether this id was newly recorded */
export function noteProofAgreementSent(agreementId: string): boolean {
  const id = (agreementId || "").trim();
  if (!id) return false;
  const st = read();
  if (st.sent_agreement_ids.includes(id)) return false;
  const sent_agreement_ids = [...st.sent_agreement_ids, id].slice(-200);
  write({ ...st, sent_agreement_ids });
  return true;
}

/** @returns whether this id was newly recorded */
export function noteProofAgreementFinalized(agreementId: string): boolean {
  const id = (agreementId || "").trim();
  if (!id) return false;
  const st = read();
  if (st.finalized_agreement_ids.includes(id)) return false;
  const finalized_agreement_ids = [...st.finalized_agreement_ids, id].slice(-200);
  write({ ...st, finalized_agreement_ids });
  return true;
}

export function readProofActivity(): LawdogProofActivityV1 {
  return read();
}

export type ProofHeatmapCell = {
  dateYmd: string;
  level: 0 | 1 | 2 | 3;
  tooltip: string;
};

function formatHeatmapTooltip(dateYmd: string, parts: string[]): string {
  const [y, m, d] = dateYmd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return `${dateYmd} — No activity`;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const nice = dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  if (!parts.length) return `${nice} — No activity`;
  return `${nice} — ${parts.join(" · ")}`;
}

/** One cell per UTC day, oldest → newest (length `numDays`). */
export function getProofHeatmapCells(numDays = 84): ProofHeatmapCell[] {
  const st = read();
  const weights = st.day_weights || {};
  const labels = st.day_labels || {};
  const end = Date.now();
  const endUtcMidnight = Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth(), new Date(end).getUTCDate());
  const out: ProofHeatmapCell[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const t = endUtcMidnight - i * 86_400_000;
    const ymd = utcYmdFromMs(t);
    const w = weights[ymd] ?? 0;
    const level = (w <= 0 ? 0 : w >= 3 ? 3 : w) as 0 | 1 | 2 | 3;
    const parts = labels[ymd] ?? [];
    out.push({ dateYmd: ymd, level, tooltip: formatHeatmapTooltip(ymd, parts) });
  }
  return out;
}

/** @internal tests */
export function __resetProofActivityForTests(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

export function proofActivityCounts(activity: LawdogProofActivityV1): { sent: number; finalized: number } {
  return { sent: activity.sent_agreement_ids.length, finalized: activity.finalized_agreement_ids.length };
}
