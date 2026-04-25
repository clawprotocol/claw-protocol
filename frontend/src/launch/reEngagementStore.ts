/**
 * Lightweight local re-engagement state (localStorage + session dismissals).
 * Bumped from product events for future automation; no server persistence.
 */

const LS = {
  /** Meaningful product signals only — not page peeks (used for win-back idle). */
  lastSignalMs: "lawdog_reengage_last_signal_ms",
  lastDraftId: "lawdog_reengage_last_draft_id",
  lastDraftAt: "lawdog_reengage_last_draft_at",
  sentPrefix: "lawdog_agreement_sent_",
  pricingViewedAt: "lawdog_reengage_pricing_viewed_at",
  checkoutAt: "lawdog_reengage_checkout_completed_at",
  winBackShownAt: "lawdog_reengage_winback_shown_at",
  abandonLoggedPrefix: "lawdog_reengage_abandon_logged_",
  firstWorkflowDone: "lawdog_reengage_first_workflow_reinforcement_done",
} as const;

const INACTIVE_MS = 7 * 86400000;
const WINBACK_COOLDOWN_MS = 14 * 86400000;
const REHAB_MAX_AGE_MS = 21 * 86400000;

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function bumpSignal(): void {
  writeLs(LS.lastSignalMs, String(Date.now()));
}

export function hasAgreementSentPersistent(agreementId: string): boolean {
  const k = `${LS.sentPrefix}${encodeURIComponent(agreementId)}`;
  return readLs(k) === "1";
}

export function markAgreementSentPersistent(agreementId: string): void {
  const k = `${LS.sentPrefix}${encodeURIComponent(agreementId)}`;
  writeLs(k, "1");
  bumpSignal();
}

/** Call after user follows a re-engagement CTA so idle timers reset. */
export function acknowledgeReEngagementTouch(): void {
  bumpSignal();
}

export function markFirstWorkflowReinforcementDone(): void {
  writeLs(LS.firstWorkflowDone, "1");
}

export function shouldShowFirstWorkflowReinforcement(): boolean {
  return readLs(LS.firstWorkflowDone) !== "1";
}

function lastPricingViewedAt(): number {
  const t = parseInt(readLs(LS.pricingViewedAt) || "0", 10);
  return Number.isFinite(t) ? t : 0;
}

function lastCheckoutAt(): number {
  const t = parseInt(readLs(LS.checkoutAt) || "0", 10);
  return Number.isFinite(t) ? t : 0;
}

export function getLastOpenDraftId(): string | null {
  const id = readLs(LS.lastDraftId);
  return id && id.trim() ? id.trim() : null;
}

function rehabEligible(): boolean {
  const pv = lastPricingViewedAt();
  if (!pv) return false;
  if (Date.now() - pv > REHAB_MAX_AGE_MS) return false;
  const co = lastCheckoutAt();
  return co === 0 || pv > co;
}

function hadAnySentAgreement(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS.sentPrefix) && localStorage.getItem(key) === "1") return true;
    }
  } catch {
    return false;
  }
  return false;
}

function winBackEligible(): boolean {
  const last = parseInt(readLs(LS.lastSignalMs) || "0", 10);
  if (!last || !Number.isFinite(last)) return false;
  const idle = Date.now() - last;
  if (idle < INACTIVE_MS) return false;
  const draft = getLastOpenDraftId();
  const hadDraft = Boolean(draft);
  return hadDraft || hadAnySentAgreement();
}

function winBackCooldownOk(): boolean {
  const shown = parseInt(readLs(LS.winBackShownAt) || "0", 10);
  if (!shown) return true;
  return Date.now() - shown > WINBACK_COOLDOWN_MS;
}

export function markWinBackShown(): void {
  writeLs(LS.winBackShownAt, String(Date.now()));
}

export type ReEngagementSurface = "create" | "home" | "workspace";

export type CreateOrHomeBanner =
  | { kind: "abandoned"; agreementId: string }
  | { kind: "rehab" }
  | { kind: "winback" }
  | null;

const sessionDismiss = new Set<string>();

function sessionKey(surface: ReEngagementSurface, kind: string): string {
  return `${surface}:${kind}`;
}

export function dismissReEngagementBanner(surface: ReEngagementSurface, kind: string): void {
  sessionDismiss.add(sessionKey(surface, kind));
}

function isDismissed(surface: ReEngagementSurface, kind: string): boolean {
  return sessionDismiss.has(sessionKey(surface, kind));
}

/** One nudge per visit; abandoned > rehab > win-back. */
export function peekCreateOrHomeBanner(surface: ReEngagementSurface): CreateOrHomeBanner {
  if (typeof window === "undefined") return null;

  const draftId = getLastOpenDraftId();
  if (draftId && !hasAgreementSentPersistent(draftId) && !isDismissed(surface, "abandoned")) {
    return { kind: "abandoned", agreementId: draftId };
  }
  if (rehabEligible() && !isDismissed(surface, "rehab")) {
    return { kind: "rehab" };
  }
  if (winBackEligible() && winBackCooldownOk() && !isDismissed(surface, "winback")) {
    return { kind: "winback" };
  }
  return null;
}

export function peekWorkspaceWinBack(): boolean {
  if (typeof window === "undefined") return false;
  if (!winBackEligible() || !winBackCooldownOk()) return false;
  if (isDismissed("workspace", "winback")) return false;
  return true;
}

/** Log draft_abandoned at most once per agreement id (local marker). */
export function shouldLogDraftAbandoned(agreementId: string): boolean {
  const k = `${LS.abandonLoggedPrefix}${encodeURIComponent(agreementId)}`;
  if (readLs(k) === "1") return false;
  writeLs(k, "1");
  return true;
}

export type ProductEventTap = { name: string; payload?: Record<string, unknown> };

const SIGNAL_EVENTS = new Set([
  "agreement_created",
  "draft_created",
  "send_completed",
  "checkout_completed",
  "pricing_viewed",
  "conversion_completed",
  "paywall_triggered",
  "send_clicked",
  "paywall_revenue_attributed",
]);

export function applyProductEventToReEngagement(row: ProductEventTap): void {
  const { name, payload } = row;
  if (SIGNAL_EVENTS.has(name)) {
    bumpSignal();
  }
  if (name === "pricing_viewed") {
    writeLs(LS.pricingViewedAt, String(Date.now()));
  }
  if (name === "checkout_completed") {
    writeLs(LS.checkoutAt, String(Date.now()));
  }
  if (name === "agreement_sent") {
    const id = typeof payload?.agreementId === "string" ? payload.agreementId : null;
    if (id) markAgreementSentPersistent(id);
  }
  if (name === "agreement_created" || name === "draft_created") {
    const id = typeof payload?.agreementId === "string" ? payload.agreementId : null;
    if (id) {
      writeLs(LS.lastDraftId, id);
      writeLs(LS.lastDraftAt, String(Date.now()));
    }
  }
}

export function __resetReEngagementForTests(): void {
  sessionDismiss.clear();
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith(LS.sentPrefix) ||
        k.startsWith(LS.abandonLoggedPrefix) ||
        k === LS.lastSignalMs ||
        k === LS.lastDraftId ||
        k === LS.lastDraftAt ||
        k === LS.pricingViewedAt ||
        k === LS.checkoutAt ||
        k === LS.winBackShownAt ||
        k === LS.firstWorkflowDone
      ) {
        keys.push(k);
      }
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
