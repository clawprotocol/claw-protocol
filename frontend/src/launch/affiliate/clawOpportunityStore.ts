/**
 * Local stub for CLAW Opportunity (affiliate) network metrics — aligns with revenue / activity economics
 * until backend attribution lands. No fabricated “network-wide” totals: only browser-local signals.
 */

import type { PackTier } from "./opportunityTypes";
import { getMergedDynamicConfig } from "../../lib/runtimeConfig/runtimeConfigStore";

const REFERRAL_ID_KEY = "claw_opportunity_referral_id";
const INBOUND_REF_SESSION = "claw_inbound_ref_session";
const VISIT_SESSION_PREFIX = "claw_ref_visit_noted_";

type NetworkRow = {
  peopleJoined: number;
  agreementsCreated: number;
  keysUsed: number;
  revenueGeneratedUsd: number;
  payoutAccruedUsd: number;
  activity: Array<{ at: number; message: string }>;
};

type EarningsRow = {
  earnedUsd: number;
  pendingUsd: number;
  paidUsd: number;
};

function networkKey(ref: string): string {
  return `claw_oppo_net_${encodeURIComponent(ref)}`;
}

function earningsKey(ref: string): string {
  return `claw_oppo_earn_${encodeURIComponent(ref)}`;
}

export function sanitizeReferralToken(raw: string | null | undefined): string | null {
  const s = (raw || "").trim().slice(0, 64);
  if (!s || !/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

export function getOrCreateReferralId(): string {
  try {
    const existing = localStorage.getItem(REFERRAL_ID_KEY);
    const ok = sanitizeReferralToken(existing);
    if (ok) return ok;
    const created = `claw_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    localStorage.setItem(REFERRAL_ID_KEY, created);
    return created;
  } catch {
    return `claw_session_${Date.now().toString(36)}`;
  }
}

export function getReferralLandingUrl(): string {
  if (typeof window === "undefined") return "/";
  const ref = getOrCreateReferralId();
  const base = `${window.location.origin}/`;
  const u = new URL(base);
  u.searchParams.set("ref", ref);
  return u.toString();
}

export function getInboundRefFromSession(): string | null {
  try {
    return sanitizeReferralToken(sessionStorage.getItem(INBOUND_REF_SESSION));
  } catch {
    return null;
  }
}

/** Call on marketing home when ?ref= is present (once per session per ref). */
export function recordInboundRefLanding(refRaw: string | undefined | null): void {
  const ref = sanitizeReferralToken(refRaw || null);
  if (!ref) return;
  try {
    sessionStorage.setItem(INBOUND_REF_SESSION, ref);
    const gate = `${VISIT_SESSION_PREFIX}${encodeURIComponent(ref)}`;
    if (sessionStorage.getItem(gate)) return;
    sessionStorage.setItem(gate, "1");

    const row = readNetworkRow(ref);
    row.peopleJoined += 1;
    row.activity.unshift({
      at: Date.now(),
      message: "Someone landed from your link",
    });
    row.activity = row.activity.slice(0, 12);
    writeNetworkRow(ref, row);
  } catch {
    /* ignore */
  }
}

export function recordAgreementCreatedForInboundRef(agreementId: string): void {
  const ref = getInboundRefFromSession();
  if (!ref) return;
  try {
    const row = readNetworkRow(ref);
    row.agreementsCreated += 1;
    row.activity.unshift({
      at: Date.now(),
      message: `Agreement started · ${agreementId.slice(0, 8)}…`,
    });
    row.activity = row.activity.slice(0, 12);
    writeNetworkRow(ref, row);
  } catch {
    /* ignore */
  }
}

/** Stub: keys attributed to referrer when buyer had inbound ref at checkout (local demo). */
export function recordKeysConsumedForInboundRef(keys: number): void {
  const ref = getInboundRefFromSession();
  if (!ref || keys <= 0) return;
  try {
    const row = readNetworkRow(ref);
    row.keysUsed += Math.round(keys);
    row.activity.unshift({
      at: Date.now(),
      message: `Agreement activity flowed through CLAW (+${Math.round(keys)})`,
    });
    row.activity = row.activity.slice(0, 12);
    writeNetworkRow(ref, row);
  } catch {
    /* ignore */
  }
}

export type OpportunitySnapshot = {
  referralId: string;
  link: string;
  network: NetworkRow;
  earnings: EarningsRow;
  packLabel: string;
  packTagline: string;
};

function readNetworkRow(ref: string): NetworkRow {
  try {
    const raw = localStorage.getItem(networkKey(ref));
    if (!raw) {
      return {
        peopleJoined: 0,
        agreementsCreated: 0,
        keysUsed: 0,
        revenueGeneratedUsd: 0,
        payoutAccruedUsd: 0,
        activity: [],
      };
    }
    const j = JSON.parse(raw) as Partial<NetworkRow>;
    return {
      peopleJoined: typeof j.peopleJoined === "number" ? j.peopleJoined : 0,
      agreementsCreated: typeof j.agreementsCreated === "number" ? j.agreementsCreated : 0,
      keysUsed: typeof j.keysUsed === "number" ? j.keysUsed : 0,
      revenueGeneratedUsd: typeof j.revenueGeneratedUsd === "number" ? j.revenueGeneratedUsd : 0,
      payoutAccruedUsd: typeof j.payoutAccruedUsd === "number" ? j.payoutAccruedUsd : 0,
      activity: Array.isArray(j.activity) ? j.activity : [],
    };
  } catch {
    return {
      peopleJoined: 0,
      agreementsCreated: 0,
      keysUsed: 0,
      revenueGeneratedUsd: 0,
      payoutAccruedUsd: 0,
      activity: [],
    };
  }
}

function writeNetworkRow(ref: string, row: NetworkRow): void {
  localStorage.setItem(networkKey(ref), JSON.stringify(row));
}

function readEarningsRow(ref: string): EarningsRow {
  try {
    const raw = localStorage.getItem(earningsKey(ref));
    if (!raw) return { earnedUsd: 0, pendingUsd: 0, paidUsd: 0 };
    const j = JSON.parse(raw) as Partial<EarningsRow>;
    return {
      earnedUsd: typeof j.earnedUsd === "number" ? j.earnedUsd : 0,
      pendingUsd: typeof j.pendingUsd === "number" ? j.pendingUsd : 0,
      paidUsd: typeof j.paidUsd === "number" ? j.paidUsd : 0,
    };
  } catch {
    return { earnedUsd: 0, pendingUsd: 0, paidUsd: 0 };
  }
}

export function packScore(n: NetworkRow): number {
  return n.peopleJoined + n.agreementsCreated * 2 + Math.floor(n.keysUsed / 10);
}

export function packTierFromNetwork(n: NetworkRow): PackTier {
  const score = packScore(n);
  const { builderMinScore, connectorMinScore, alphaMinScore } = getMergedDynamicConfig().affiliate.packTierBreakpoints;
  if (score >= alphaMinScore) return "Alpha";
  if (score >= connectorMinScore) return "Connector";
  if (score >= builderMinScore) return "Builder";
  return "Pup";
}

export function packForStats(n: NetworkRow): { label: string; tagline: string; tier: PackTier } {
  const tier = packTierFromNetwork(n);
  const taglines = getMergedDynamicConfig().affiliate.packTaglines;
  return { label: tier, tagline: taglines[tier], tier };
}

export function getOpportunitySnapshot(): OpportunitySnapshot {
  const referralId = getOrCreateReferralId();
  const link = getReferralLandingUrl();
  const network = readNetworkRow(referralId);
  const earnings = readEarningsRow(referralId);
  const { label, tagline } = packForStats(network);
  return {
    referralId,
    link,
    network,
    earnings,
    packLabel: label,
    packTagline: tagline,
  };
}

export const DEFAULT_SHARE_MESSAGE_PREFIX =
  "Running real agreements on CLAW — if you want a cleaner send + sign + proof loop: ";

export function formatShareMessage(link: string): string {
  return `${DEFAULT_SHARE_MESSAGE_PREFIX}${link}`;
}
