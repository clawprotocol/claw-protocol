/**
 * Org id active when Pro checkout completed — used to repair subscription binding after bind-user-org.
 */

import { getOrgId } from "./orgContext";

const KEY = "claw_paid_checkout_org_id_v1";

export function writePaidCheckoutOrgId(orgId?: string): void {
  if (typeof localStorage === "undefined") return;
  const oid = (orgId ?? getOrgId()).trim();
  if (!oid) return;
  try {
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
