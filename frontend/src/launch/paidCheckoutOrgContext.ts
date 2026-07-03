/**
 * Org id active when Pro checkout completed — used to repair subscription binding after bind-user-org.
 */

import { getOrgId } from "./orgContext";
import { hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

const KEY = "claw_paid_checkout_org_id_v1";
const DEFAULT_ANONYMOUS_CHECKOUT_ORG = "local-org";

export function writePaidCheckoutOrgId(orgId?: string): void {
  if (typeof localStorage === "undefined") return;
  const oid = (orgId ?? getOrgId()).trim();
  if (!oid) return;
  try {
    const existing = localStorage.getItem(KEY)?.trim();
    if (existing === DEFAULT_ANONYMOUS_CHECKOUT_ORG && oid.startsWith("user-")) {
      return;
    }
    localStorage.setItem(KEY, oid);
  } catch {
    /* ignore */
  }
}

export function readPaidCheckoutOrgId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function clearPaidCheckoutOrgId(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Org ids that may still hold a Pro subscription for an already-bound user workspace. */
export function resolveEntitlementRepairOrgCandidates(): string[] {
  const out: string[] = [];
  const boundOrg = getOrgId().trim();
  const push = (raw: string | null | undefined) => {
    const oid = String(raw || "")
      .trim()
      .replace(/^org:/i, "");
    if (!oid || oid === boundOrg || out.includes(oid)) return;
    out.push(oid);
  };
  if (hasPaidPremiumCompletionSession()) {
    push(DEFAULT_ANONYMOUS_CHECKOUT_ORG);
  }
  push(readPaidCheckoutOrgId());
  return out;
}

/** Primary repair org sent on agreement API calls (first candidate). */
export function resolvePrimaryEntitlementRepairOrg(): string | null {
  const candidates = resolveEntitlementRepairOrgCandidates();
  return candidates[0] ?? null;
}
