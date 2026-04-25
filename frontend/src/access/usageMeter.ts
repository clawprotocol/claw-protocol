import type { UsageKind, UsageTotals } from "./types";

const STORAGE_KEY = "claw_usage_meter_v1";

export type StoredUsage = {
  period: string;
  counts: UsageTotals;
};

const ZERO: UsageTotals = {
  agreements_created: 0,
  revision_previews: 0,
  recipient_invitations: 0,
  signature_requests: 0,
  verification_packets: 0,
};

export function currentBillingPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function readRaw(): StoredUsage {
  if (typeof localStorage === "undefined") {
    return { period: currentBillingPeriod(), counts: { ...ZERO } };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { period: currentBillingPeriod(), counts: { ...ZERO } };
    const parsed = JSON.parse(raw) as Partial<StoredUsage>;
    const period = typeof parsed.period === "string" ? parsed.period : currentBillingPeriod();
    const c = parsed.counts && typeof parsed.counts === "object" ? parsed.counts : {};
    const counts: UsageTotals = { ...ZERO };
    (Object.keys(ZERO) as UsageKind[]).forEach((k) => {
      const n = Number((c as Record<string, unknown>)[k]);
      counts[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    });
    return { period, counts };
  } catch {
    return { period: currentBillingPeriod(), counts: { ...ZERO } };
  }
}

function writeRaw(data: StoredUsage): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

/** Normalize period rollover. */
export function loadUsageTotals(): UsageTotals {
  const raw = readRaw();
  const p = currentBillingPeriod();
  if (raw.period !== p) {
    const fresh: StoredUsage = { period: p, counts: { ...ZERO } };
    writeRaw(fresh);
    return fresh.counts;
  }
  return raw.counts;
}

export function recordUsage(kind: UsageKind, delta = 1): UsageTotals {
  const p = currentBillingPeriod();
  let raw = readRaw();
  if (raw.period !== p) {
    raw = { period: p, counts: { ...ZERO } };
  }
  const next = { ...raw.counts, [kind]: Math.max(0, raw.counts[kind] + delta) };
  const stored: StoredUsage = { period: p, counts: next };
  writeRaw(stored);
  return next;
}

export function peekUsageTotals(): UsageTotals {
  return loadUsageTotals();
}

/** Dev localhost: zero agreements_created while preserving other tallies (repeatable flow tests). */
export function resetAgreementsCreatedForLocalDev(): void {
  if (typeof localStorage === "undefined") return;
  const p = currentBillingPeriod();
  let raw = readRaw();
  if (raw.period !== p) {
    raw = { period: p, counts: { ...ZERO } };
  } else {
    raw = { period: raw.period, counts: { ...raw.counts, agreements_created: 0 } };
  }
  writeRaw(raw);
}
