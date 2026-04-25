import type { PersistedProductEvent } from "./growthEventPersistence";

const DAY_MS = 86_400_000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Stable session key for funnel / operator views (matches persisted payload). */
export function sessionId(ev: PersistedProductEvent): string {
  const p = ev.payload ?? {};
  const sid =
    typeof p.session_id === "string"
      ? p.session_id
      : typeof p.lawdog_session_id === "string"
        ? p.lawdog_session_id
        : "";
  return sid || `anon_${Math.floor(ev.ts / DAY_MS)}`;
}

export function filterEventsForDay(events: PersistedProductEvent[], dateIsoDay: string): PersistedProductEvent[] {
  return events.filter((e) => dayKey(e.ts) === dateIsoDay);
}

export type FunnelStepStats = {
  step: number;
  /** Sessions that emitted step_completed with this step_number (best-effort). */
  completed: number;
  /** Approximate conversion from previous step: completed / prevCompleted */
  conversionFromPrevious: number | null;
};

export function computeStepFunnel(events: PersistedProductEvent[]): FunnelStepStats[] {
  const byStep = new Map<number, Set<string>>();
  for (const ev of events) {
    if (ev.name !== "step_completed") continue;
    const n = ev.payload?.step_number;
    if (typeof n !== "number" || n < 1) continue;
    const sid = sessionId(ev);
    if (!byStep.has(n)) byStep.set(n, new Set());
    byStep.get(n)!.add(sid);
  }
  const steps = [...byStep.keys()].sort((a, b) => a - b);
  const out: FunnelStepStats[] = [];
  let prev = 0;
  for (const step of steps) {
    const completed = byStep.get(step)?.size ?? 0;
    const conversionFromPrevious = prev > 0 ? completed / prev : null;
    out.push({ step, completed, conversionFromPrevious });
    prev = completed;
  }
  return out;
}

export type DropOffInsight = {
  fromStep: number;
  toStep: number;
  lossRate: number;
  label: string;
};

/** Biggest relative drop between consecutive step_completed counts (by unique session). */
export function computeBiggestStepDropOff(events: PersistedProductEvent[]): DropOffInsight | null {
  const stats = computeStepFunnel(events);
  if (stats.length < 2) return null;
  let worst: DropOffInsight | null = null;
  for (let i = 1; i < stats.length; i++) {
    const prev = stats[i - 1];
    const cur = stats[i];
    if (prev.completed <= 0) continue;
    const lossRate = 1 - cur.completed / prev.completed;
    if (!Number.isFinite(lossRate)) continue;
    if (!worst || lossRate > worst.lossRate) {
      worst = {
        fromStep: prev.step,
        toStep: cur.step,
        lossRate,
        label: `Step ${cur.step} (${Math.round(lossRate * 100)}% loss vs prior step)`,
      };
    }
  }
  return worst;
}

export function formatDailySnapshotLine(events: PersistedProductEvent[], fieldLabels: Record<number, string>): string {
  const drop = computeBiggestStepDropOff(events);
  if (!drop) return "Not enough step data yet — keep shipping.";
  const label = fieldLabels[drop.toStep] ?? `step ${drop.toStep}`;
  return `Biggest drop-off: ${label} — ${Math.round(drop.lossRate * 100)}% loss`;
}

export type TimeToReadyStats = {
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
};

export function computeTimeToReady(events: PersistedProductEvent[]): TimeToReadyStats {
  const bySession = new Map<string, { start?: number; ready?: number }>();
  for (const ev of events) {
    const sid = sessionId(ev);
    const row = bySession.get(sid) ?? {};
    if (ev.name === "landing_view") {
      row.start = row.start ?? ev.ts;
    }
    if (ev.name === "ready_state_reached") {
      row.ready = ev.ts;
    }
    bySession.set(sid, row);
  }
  const deltas: number[] = [];
  for (const [, v] of bySession) {
    if (v.start != null && v.ready != null && v.ready >= v.start) {
      deltas.push(v.ready - v.start);
    }
  }
  deltas.sort((a, b) => a - b);
  if (deltas.length === 0) return { count: 0, medianMs: null, p90Ms: null };
  const mid = Math.floor(deltas.length / 2);
  const medianMs = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  const p90Idx = Math.min(deltas.length - 1, Math.ceil(deltas.length * 0.9) - 1);
  return { count: deltas.length, medianMs, p90Ms: deltas[p90Idx] };
}

export type InputModeSplit = {
  voiceSessions: number;
  typingSessions: number;
  bothSessions: number;
};

export function computeInputModeSplit(events: PersistedProductEvent[]): InputModeSplit {
  const voice = new Set<string>();
  const typing = new Set<string>();
  for (const ev of events) {
    const sid = sessionId(ev);
    if (ev.name === "mic_used" && ev.payload?.surface === "agreement_intake_create") voice.add(sid);
    if (ev.name === "intake_typing_started" && ev.payload?.surface === "agreement_intake_create") typing.add(sid);
  }
  let both = 0;
  for (const s of voice) {
    if (typing.has(s)) both++;
  }
  return {
    voiceSessions: voice.size,
    typingSessions: typing.size,
    bothSessions: both,
  };
}

export type ExperimentExposureSummary = Record<string, { variant: string; count: number }[]>;

export function computeExperimentExposure(events: PersistedProductEvent[]): ExperimentExposureSummary {
  const out: ExperimentExposureSummary = {};
  for (const ev of events) {
    if (ev.name !== "experiment_exposure") continue;
    const id = typeof ev.payload?.experiment_id === "string" ? ev.payload.experiment_id : "";
    const variant = typeof ev.payload?.variant === "string" ? ev.payload.variant : "";
    if (!id || !variant) continue;
    if (!out[id]) out[id] = [];
    const row = out[id]!.find((r) => r.variant === variant);
    if (row) row.count++;
    else out[id]!.push({ variant, count: 1 });
  }
  return out;
}

export type ShareReferralCounts = {
  share_clicked: number;
  link_copied: number;
  referral_signup: number;
};

export function computeShareReferralCounts(events: PersistedProductEvent[]): ShareReferralCounts {
  let share_clicked = 0;
  let link_copied = 0;
  let referral_signup = 0;
  for (const ev of events) {
    if (ev.name === "share_clicked") share_clicked++;
    if (ev.name === "link_copied") link_copied++;
    if (ev.name === "referral_signup") referral_signup++;
  }
  return { share_clicked, link_copied, referral_signup };
}

/** Stable session key for growth rows (matches funnel aggregation). */
export function getGrowthEventSessionId(ev: PersistedProductEvent): string {
  return sessionId(ev);
}

export type LiveFunnelCounts = {
  /** Unique sessions with landing_view */
  landing: number;
  /** Unique sessions with step_completed step_number === 1 */
  step1: number;
  step2: number;
  /** Unique sessions with ready_state_reached */
  ready: number;
  /** Unique sessions with agreement_generated or generate_clicked */
  generate: number;
};

export function computeLiveFunnelCounts(events: PersistedProductEvent[]): LiveFunnelCounts {
  const landing = new Set<string>();
  const step1 = new Set<string>();
  const step2 = new Set<string>();
  const ready = new Set<string>();
  const generate = new Set<string>();
  for (const ev of events) {
    const sid = sessionId(ev);
    if (ev.name === "landing_view") landing.add(sid);
    if (ev.name === "step_completed") {
      const n = ev.payload?.step_number;
      const stepNum = typeof n === "number" ? n : typeof n === "string" ? Number.parseInt(n, 10) : NaN;
      if (stepNum === 1) step1.add(sid);
      if (stepNum === 2) step2.add(sid);
    }
    if (ev.name === "ready_state_reached") ready.add(sid);
    if (ev.name === "agreement_generated" || ev.name === "generate_clicked") generate.add(sid);
  }
  return {
    landing: landing.size,
    step1: step1.size,
    step2: step2.size,
    ready: ready.size,
    generate: generate.size,
  };
}

export type PaywallSummary = {
  paywall_shown: number;
  upgrade_clicked: number;
  unlock_clicked: number;
  unlock_completed: number;
  /** Distinct sessions that emitted paywall_shown (rate denominator). */
  paywall_sessions: number;
  /** Share of paywall_sessions that also emitted upgrade_clicked (subscription intent). */
  subscription_session_rate_pct: number | null;
  /** Share of paywall_sessions that emitted unlock_completed (one-time completion). */
  one_time_session_rate_pct: number | null;
};

export function computePaywallSummary(events: PersistedProductEvent[]): PaywallSummary {
  let paywall_shown = 0;
  let upgrade_clicked = 0;
  let unlock_clicked = 0;
  let unlock_completed = 0;
  const paywallSessions = new Set<string>();
  const upgradeSessions = new Set<string>();
  const unlockDoneSessions = new Set<string>();
  for (const ev of events) {
    const sid = sessionId(ev);
    if (ev.name === "paywall_shown") {
      paywall_shown++;
      paywallSessions.add(sid);
    }
    if (ev.name === "upgrade_clicked") {
      upgrade_clicked++;
      upgradeSessions.add(sid);
    }
    if (ev.name === "unlock_clicked") {
      unlock_clicked++;
    }
    if (ev.name === "unlock_completed") {
      unlock_completed++;
      unlockDoneSessions.add(sid);
    }
  }
  const ps = paywallSessions.size;
  const subscriptionSessions = [...paywallSessions].filter((s) => upgradeSessions.has(s)).length;
  const oneTimeSessions = [...paywallSessions].filter((s) => unlockDoneSessions.has(s)).length;
  const subscription_session_rate_pct =
    ps > 0 ? Math.round((subscriptionSessions / ps) * 1000) / 10 : null;
  const one_time_session_rate_pct =
    ps > 0 ? Math.round((oneTimeSessions / ps) * 1000) / 10 : null;
  return {
    paywall_shown,
    upgrade_clicked,
    unlock_clicked,
    unlock_completed,
    paywall_sessions: ps,
    subscription_session_rate_pct,
    one_time_session_rate_pct,
  };
}

export function countDistinctSessions(events: PersistedProductEvent[]): number {
  return new Set(events.map((e) => sessionId(e))).size;
}

export type SessionFlowTrace = {
  sessionId: string;
  /** Events for this session on the same calendar day, ascending time. */
  timeline: PersistedProductEvent[];
};

/**
 * Session that produced the chronologically latest event in the list,
 * with its same-day ordered timeline (for operator debugging).
 */
export function computeLatestSessionTrace(events: PersistedProductEvent[]): SessionFlowTrace | null {
  if (events.length === 0) return null;
  const last = [...events].reduce((a, b) => (a.ts >= b.ts ? a : b));
  const sid = sessionId(last);
  const timeline = events.filter((e) => sessionId(e) === sid).sort((a, b) => a.ts - b.ts);
  return { sessionId: sid, timeline };
}
