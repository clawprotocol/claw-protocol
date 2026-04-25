/** UX helpers for affiliate USD → USDC payout timeline (no fraud score exposure). */

export type EarningTimelineRow = {
  id: string;
  amount_usd: number;
  status: string;
  earning_type?: string;
  created_at?: string;
  unlock_at?: string | null;
  paid_at?: string | null;
  risk_hold?: number;
  payout_tx_hash?: string | null;
};

export const TIMELINE_STEP_LABELS = ["Earned", "Pending", "Payable", "Paid"] as const;

/** Active step index 0–3 for horizontal progress (Earned → … → Paid). */
export function timelineActiveStepIndex(row: Pick<EarningTimelineRow, "status">): number {
  const s = (row.status || "").toLowerCase();
  if (s === "paid") return 3;
  if (s === "payable") return 2;
  if (s === "pending" || s === "recovery_due") return 1;
  return 1;
}

/** Friendly label for the status chip (matches the four-step story where possible). */
export function timelinePhaseLabel(row: Pick<EarningTimelineRow, "status" | "risk_hold">): string {
  const s = (row.status || "").toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "payable") return "Payable";
  if (s === "recovery_due") return "On hold";
  if ((row.risk_hold ?? 0) > 0) return "On hold";
  if (s === "pending") return "Pending";
  if (s === "cancelled") return "Ended";
  return "In progress";
}

export function formatUnlockDateDisplay(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const raw = iso.includes("T") ? iso : `${iso}T00:00:00Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortenTxHash(tx: string | null | undefined): string {
  const h = (tx || "").trim();
  if (!h) return "";
  if (h.length <= 18) return h;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export type EarningPayoutLabel = {
  /** Short badge: Clears in X days / Ready for next payout / etc. */
  headline: string;
  detail?: string;
};

function parseUnlockMs(unlockAt: string | null | undefined): number | null {
  if (!unlockAt?.trim()) return null;
  const t = Date.parse(unlockAt.includes("T") ? unlockAt : `${unlockAt}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

export function earningPayoutLabel(
  row: EarningTimelineRow,
  holdDays: number,
  nowMs: number = Date.now(),
): EarningPayoutLabel {
  const st = (row.status || "").toLowerCase();
  if (st === "paid") {
    return {
      headline: "Paid in USDC",
      detail: undefined,
    };
  }
  if (st === "payable") {
    return {
      headline: "Ready for next payout",
      detail: undefined,
    };
  }
  if (st === "recovery_due" || (row.risk_hold ?? 0) > 0) {
    return {
      headline: "Temporarily on hold",
      detail:
        st === "recovery_due"
          ? "We pause this amount while a payment issue is sorted out."
          : "Waiting on a quick review before this can move forward.",
    };
  }
  if (st === "pending") {
    const unlockMs = parseUnlockMs(row.unlock_at ?? null);
    if (unlockMs != null && unlockMs > nowMs) {
      const days = Math.max(1, Math.ceil((unlockMs - nowMs) / 86_400_000));
      return {
        headline: `Clears in ${days} day${days === 1 ? "" : "s"}`,
        detail: `Standard ${holdDays}-day wait while the payment fully settles.`,
      };
    }
    if (unlockMs != null && unlockMs <= nowMs) {
      return {
        headline: "Almost ready",
        detail: "The wait is over — this should move to payable on the next update.",
      };
    }
    return {
      headline: `Clears in about ${holdDays} days`,
      detail: `We use a ${holdDays}-day window so reversed payments do not affect your balance.`,
    };
  }
  return {
    headline: "In progress",
    detail: undefined,
  };
}
