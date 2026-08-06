/**
 * Admin Console — human-readable LawDog access type for Users tab.
 * Derived from /v1/admin/users commercial_* fields (no agreement bodies).
 */

export type AdminConsoleAccessType =
  | "genesis_dog"
  | "paid_pro"
  | "pending_genesis"
  | "guest"
  | "free"
  | "unknown";

export type AdminConsoleAccessPresentation = {
  accessType: AdminConsoleAccessType;
  /** Short badge label shown to operators. */
  badgeLabel: string;
  /** One-line explanation under the badge. */
  detailLine: string;
  /** Tailwind-ish tone for badge styling. */
  tone: "genesis" | "pro" | "pending" | "neutral" | "muted";
};

export function resolveAdminConsoleAccessType(raw: {
  accessType?: string | null;
  commercialState?: string | null;
  premiumActive?: boolean;
  planType?: string | null;
}): AdminConsoleAccessType {
  const explicit = String(raw.accessType || "").trim().toLowerCase();
  if (
    explicit === "genesis_dog" ||
    explicit === "paid_pro" ||
    explicit === "pending_genesis" ||
    explicit === "guest" ||
    explicit === "free"
  ) {
    return explicit;
  }
  const state = String(raw.commercialState || "").trim().toLowerCase();
  if (state === "genesis") return "genesis_dog";
  if (state === "pro") return "paid_pro";
  if (state === "pending_genesis") return "pending_genesis";
  if (state === "guest") return "guest";
  if (raw.premiumActive || String(raw.planType || "").toLowerCase() === "pro") return "paid_pro";
  if (state === "none" || state === "free") return "free";
  return "unknown";
}

function formatPeriodEnds(iso: string | null | undefined): string {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function presentAdminConsoleAccess(args: {
  accessType?: string | null;
  commercialState?: string | null;
  premiumActive?: boolean;
  planType?: string | null;
  agreementAllowance?: number | null;
  agreementsUsed?: number | null;
  agreementsRemaining?: number | null;
  periodEndsAt?: string | null;
  agreementCount?: number | null;
}): AdminConsoleAccessPresentation {
  const accessType = resolveAdminConsoleAccessType(args);
  const allowance = Number(args.agreementAllowance ?? 0);
  const used = Number(
    args.agreementsUsed != null ? args.agreementsUsed : args.agreementCount ?? 0,
  );
  const remaining =
    args.agreementsRemaining != null
      ? Number(args.agreementsRemaining)
      : Math.max(0, allowance - used);
  const resets = formatPeriodEnds(args.periodEndsAt);

  if (accessType === "genesis_dog") {
    const quota =
      allowance > 0
        ? `${remaining} of ${allowance} new agreements remaining this month${
            resets ? ` · Resets ${resets}` : ""
          }`
        : "Genesis Dog monthly allowance active";
    return {
      accessType,
      badgeLabel: "Genesis Dog",
      detailLine: quota,
      tone: "genesis",
    };
  }
  if (accessType === "paid_pro") {
    const quota =
      allowance > 0
        ? `${remaining} of ${allowance} new agreements remaining this billing period${
            resets ? ` · Renews ${resets}` : ""
          }`
        : "Paid Pro subscription active";
    return {
      accessType,
      badgeLabel: "Paid LawDog Pro",
      detailLine: quota,
      tone: "pro",
    };
  }
  if (accessType === "pending_genesis") {
    return {
      accessType,
      badgeLabel: "Genesis pending",
      detailLine: "Access request open — not yet entitled to create persisted agreements.",
      tone: "pending",
    };
  }
  if (accessType === "guest") {
    return {
      accessType,
      badgeLabel: "Guest",
      detailLine: "Temporary drafts only — no Genesis or Pro entitlement.",
      tone: "muted",
    };
  }
  return {
    accessType: accessType === "free" ? "free" : "unknown",
    badgeLabel: "Free (no paid access)",
    detailLine: "Not a Genesis Dog or Paid Pro account. Grant Genesis or complete Pro checkout.",
    tone: "neutral",
  };
}
