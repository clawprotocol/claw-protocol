/**
 * Client mirror of server commercial entitlement authority.
 * Never grant create access from local flags alone — use fetchCommercialEntitlement.
 */

import { fetchAgreementUsageSummary, type AgreementUsageSummary } from "../agreement/agreementWorkspaceApi";

export type CommercialEntitlementClass = "paid_pro" | "genesis_allowance" | "free";

export type GenesisAllowanceSnapshot = {
  active: boolean;
  limit: number;
  used: number;
  remaining: number;
  period_start: string;
  period_end: string;
  allowed: boolean;
};

export type FreeAllowanceSnapshot = {
  limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
};

export type CommercialEntitlementDecision = {
  entitlement: CommercialEntitlementClass;
  createAllowed: boolean;
  upgradeRequired: boolean;
  reason: string | null;
  genesisAllowance: GenesisAllowanceSnapshot | null;
  freeAllowance: FreeAllowanceSnapshot | null;
  /** True when the probe failed auth/authorization — not free, not Genesis. */
  authFailure: boolean;
  /** True when the probe failed for non-auth reasons — fail closed; not a free plan. */
  probeFailure: boolean;
  /** Raw server tier for compatibility (`paid` | `genesis` | `free`). */
  tier: string | null;
  raw: AgreementUsageSummary | null;
};

function parseGenesisAllowance(raw: unknown): GenesisAllowanceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    active: Boolean(o.active),
    limit: Number(o.limit ?? 0),
    used: Number(o.used ?? 0),
    remaining: Number(o.remaining ?? 0),
    period_start: String(o.period_start ?? ""),
    period_end: String(o.period_end ?? ""),
    allowed: Boolean(o.allowed),
  };
}

function parseFreeAllowance(raw: unknown): FreeAllowanceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    limit: Number(o.limit ?? 0),
    used: Number(o.used ?? 0),
    remaining: Number(o.remaining ?? 0),
    allowed: Boolean(o.allowed),
  };
}

export function commercialDecisionFromUsageSummary(
  data: AgreementUsageSummary,
): Omit<CommercialEntitlementDecision, "authFailure" | "probeFailure" | "raw"> {
  const c = data.commercial;
  if (c && typeof c.entitlement === "string") {
    const entitlement = c.entitlement as CommercialEntitlementClass;
    return {
      entitlement:
        entitlement === "paid_pro" || entitlement === "genesis_allowance" || entitlement === "free"
          ? entitlement
          : data.tier === "paid"
            ? "paid_pro"
            : data.tier === "genesis"
              ? "genesis_allowance"
              : "free",
      createAllowed: Boolean(c.create_allowed),
      upgradeRequired: Boolean(c.upgrade_required),
      reason: c.reason ?? null,
      genesisAllowance: parseGenesisAllowance(c.genesis_allowance),
      freeAllowance: parseFreeAllowance(c.free_allowance),
      tier: data.tier ?? null,
    };
  }
  // Legacy summary without commercial block.
  if (data.tier === "paid") {
    return {
      entitlement: "paid_pro",
      createAllowed: true,
      upgradeRequired: false,
      reason: null,
      genesisAllowance: null,
      freeAllowance: null,
      tier: "paid",
    };
  }
  // Honor agreements_remaining when present so first-free users are not blocked by legacy payloads.
  const remaining =
    typeof data.agreements_remaining === "number" ? data.agreements_remaining : 0;
  const allowed = remaining > 0;
  return {
    entitlement: "free",
    createAllowed: allowed,
    upgradeRequired: !allowed,
    reason: allowed ? null : "completed_agreement_limit",
    genesisAllowance: null,
    freeAllowance: {
      limit: Math.max(remaining, Number(data.agreements_completed ?? 0) + remaining),
      used: Number(data.agreements_completed ?? 0),
      remaining,
      allowed,
    },
    tier: data.tier ?? "free",
  };
}

/**
 * Server-authoritative commercial create decision.
 * Auth and transport failures are surfaced — never silently mapped to free or Genesis.
 */
export async function fetchCommercialEntitlement(): Promise<CommercialEntitlementDecision> {
  const res = await fetchAgreementUsageSummary();
  if (res.authFailure) {
    return {
      entitlement: "free",
      createAllowed: false,
      upgradeRequired: false,
      reason: "auth_failure",
      genesisAllowance: null,
      freeAllowance: null,
      authFailure: true,
      probeFailure: false,
      tier: null,
      raw: null,
    };
  }
  if (!res.ok || !res.data) {
    return {
      // Placeholder class only — probeFailure must drive Create UI (not free upgrade copy).
      entitlement: "free",
      createAllowed: false,
      upgradeRequired: false,
      reason: "probe_failed",
      genesisAllowance: null,
      freeAllowance: null,
      authFailure: false,
      probeFailure: true,
      tier: null,
      raw: null,
    };
  }
  const parsed = commercialDecisionFromUsageSummary(res.data);
  return { ...parsed, authFailure: false, probeFailure: false, raw: res.data };
}
