import { resolveCurrentUser, readStoredDisplayName } from "./currentUser";

/** Pro list prices used for Genesis first-payment commission *display* examples. */
export const AFFILIATE_MONTHLY_PLAN_USD = 49;
export const AFFILIATE_ANNUAL_PLAN_USD = 490;
export const AFFILIATE_COMMISSION_RATE = 0.3;
/**
 * Illustrative commissions at standard Pro list prices (30% of eligible net).
 * Live ledger amounts are calculated from eligible net payment (after discounts, excluding tax)
 * — never hardcoded in payment handlers.
 */
export const AFFILIATE_FIRST_INVOICE_COMMISSION_USD =
  Math.round(AFFILIATE_MONTHLY_PLAN_USD * AFFILIATE_COMMISSION_RATE * 100) / 100;
export const AFFILIATE_FIRST_ANNUAL_COMMISSION_USD =
  Math.round(AFFILIATE_ANNUAL_PLAN_USD * AFFILIATE_COMMISSION_RATE * 100) / 100;
/** @deprecated Use AFFILIATE_FIRST_INVOICE_COMMISSION_USD — commission is not recurring monthly. */
export const AFFILIATE_MONTHLY_COMMISSION_USD = AFFILIATE_FIRST_INVOICE_COMMISSION_USD;

export const AFFILIATE_FIRST_PAYMENT_OFFER_COPY =
  "Earn 30% of the first eligible net LawDog Pro payment after discounts, excluding tax, payable after the refund window. At standard pricing, that is $14.70 for a monthly signup or $147.00 for an annual signup. Renewals do not earn another commission.";

export type AffiliateReferralRow = {
  id: string;
  label: string;
  status: "pending" | "active" | "churned";
  date: string;
};

export type AffiliateEarningsRow = {
  id: string;
  date: string;
  event: string;
  amountUsd: number;
};

export type AffiliateDashboardSnapshot = {
  referralLink: string;
  referrals: number;
  activeSubscribers: number;
  monthlyEarningsUsd: number;
  lifetimeEarningsUsd: number;
  referralRows: AffiliateReferralRow[];
  earningsRows: AffiliateEarningsRow[];
};

const SLUG_KEY = "claw_affiliate_user_slug";

export function slugifyAffiliateHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function resolveAffiliateUserSlug(): string {
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(SLUG_KEY)?.trim();
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  const display = readStoredDisplayName();
  const fromName = slugifyAffiliateHandle(display);
  if (fromName) return fromName;
  const user = resolveCurrentUser();
  const fromId = slugifyAffiliateHandle(user.id.replace(/^local-/, ""));
  return fromId || "partner";
}

export function writeAffiliateUserSlug(slug: string): void {
  if (typeof localStorage === "undefined") return;
  const normalized = slugifyAffiliateHandle(slug);
  if (!normalized) return;
  try {
    localStorage.setItem(SLUG_KEY, normalized);
  } catch {
    /* ignore */
  }
}

export function buildAffiliateReferralLink(slug: string, origin = ""): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://lawdog.ai");
  return `${base}/r/${encodeURIComponent(slugifyAffiliateHandle(slug) || "partner")}`;
}

export function affiliateShareEmailHref(referralLink: string): string {
  const subject = encodeURIComponent("Try LawDog for agreements");
  const body = encodeURIComponent(
    `I've been using LawDog for business agreements. Sign up with my link:\n\n${referralLink}`,
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

export function affiliateShareXHref(referralLink: string): string {
  const text = encodeURIComponent(`Business agreements made simple — ${referralLink}`);
  return `https://twitter.com/intent/tweet?text=${text}`;
}

/** MVP snapshot — local stub until affiliate API enrollment is wired on dashboard. */
export function resolveAffiliateDashboardSnapshot(): AffiliateDashboardSnapshot {
  const slug = resolveAffiliateUserSlug();
  const referralLink = buildAffiliateReferralLink(slug);
  return {
    referralLink,
    referrals: 0,
    activeSubscribers: 0,
    monthlyEarningsUsd: 0,
    lifetimeEarningsUsd: 0,
    referralRows: [],
    earningsRows: [],
  };
}

export function formatAffiliateUsd(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
