/**
 * Client mirror of server commercial entitlement authority (Guest | Pro buyers).
 * Genesis is affiliate status only — never grant create from Genesis payloads.
 * Never grant create access from local flags alone — use fetchCommercialEntitlement.
 */

import { fetchAgreementUsageSummary, type AgreementUsageSummary } from "../agreement/agreementWorkspaceApi";

export type CommercialProductState = "guest" | "pending_genesis" | "genesis" | "pro" | "none";
export type CommercialGrantSource =
  | "admin"
  | "stripe"
  | "legacy_affiliate"
  | "legacy_migration"
  | "none";

/** Compat aliases still returned under commercial.entitlement. */
export type CommercialEntitlementClass =
  | "paid_pro"
  | "genesis_allowance"
  | "guest"
  | "none"
  | "free";

export type GenesisAllowanceSnapshot = {
  active: boolean;
  limit: number;
  used: number;
  remaining: number;
  period_start: string;
  period_end: string;
  allowed: boolean;
};

export type ProAllowanceSnapshot = {
  active: boolean;
  limit: number;
  used: number;
  remaining: number;
  period_start: string;
  period_end: string;
  allowed: boolean;
};

export type CommercialEntitlementDecision = {
  state: CommercialProductState;
  grantSource: CommercialGrantSource;
  agreementAllowance: number | null;
  agreementsUsed: number;
  agreementsRemaining: number | null;
  periodEndsAt: string | null;
  canCreatePersistedAgreement: boolean;
  canSaveGuestDraft: boolean;
  /** Compat class for older Create verdict branches. */
  entitlement: CommercialEntitlementClass;
  createAllowed: boolean;
  upgradeRequired: boolean;
  reason: string | null;
  genesisAllowance: GenesisAllowanceSnapshot | null;
  proAllowance: ProAllowanceSnapshot | null;
  freeAllowance: null;
  /** True when the probe failed auth/authorization — not free, not Genesis. */
  authFailure: boolean;
  /** True when the probe failed for non-auth reasons — fail closed. */
  probeFailure: boolean;
  /** Raw server tier for compatibility. */
  tier: string | null;
  raw: AgreementUsageSummary | null;
};

function parseAllowanceBlock(raw: unknown): GenesisAllowanceSnapshot | null {
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

function normalizeState(raw: unknown, entitlement: string, tier: string | null): CommercialProductState {
  const s = String(raw || "").trim();
  // Retired Genesis buyer states normalize to none (affiliate status is separate).
  if (s === "pending_genesis" || s === "genesis" || entitlement === "genesis_allowance" || tier === "genesis") {
    return "none";
  }
  if (s === "guest" || s === "pro" || s === "none") {
    return s;
  }
  if (entitlement === "paid_pro" || tier === "paid") return "pro";
  if (entitlement === "guest" || tier === "guest") return "guest";
  return "none";
}

function normalizeGrantSource(raw: unknown, state: CommercialProductState): CommercialGrantSource {
  const g = String(raw || "").trim();
  if (
    g === "admin" ||
    g === "stripe" ||
    g === "legacy_affiliate" ||
    g === "legacy_migration" ||
    g === "none"
  ) {
    return g;
  }
  if (state === "pro") return "stripe";
  if (state === "genesis") return "admin";
  return "none";
}

function entitlementAliasForState(state: CommercialProductState): CommercialEntitlementClass {
  if (state === "pro") return "paid_pro";
  if (state === "genesis") return "genesis_allowance";
  if (state === "guest") return "guest";
  return "none";
}

export function commercialDecisionFromUsageSummary(
  data: AgreementUsageSummary,
): Omit<CommercialEntitlementDecision, "authFailure" | "probeFailure" | "raw"> {
  const c = data.commercial;
  const entitlementRaw = String(c?.entitlement || data.tier || "none");
  const state = normalizeState(
    c?.state ?? data.state,
    entitlementRaw,
    data.tier ?? null,
  );
  const grantSource = normalizeGrantSource(c?.grant_source ?? data.grant_source, state);
  const agreementAllowance =
    typeof (c?.agreement_allowance ?? data.agreement_allowance) === "number"
      ? Number(c?.agreement_allowance ?? data.agreement_allowance)
      : null;
  const agreementsUsed = Number(c?.agreements_used ?? data.agreements_used ?? 0);
  const agreementsRemaining =
    typeof (c?.agreements_remaining ?? data.agreements_remaining) === "number"
      ? Number(c?.agreements_remaining ?? data.agreements_remaining)
      : null;
  const periodEndsAt = String(c?.period_ends_at ?? data.period_ends_at ?? "") || null;
  const canCreatePersistedAgreement = Boolean(
    c?.can_create_persisted_agreement ??
      data.can_create_persisted_agreement ??
      (state === "pro" ? Boolean(c?.create_allowed) : false),
  );
  const canSaveGuestDraft = Boolean(
    c?.can_save_guest_draft ?? data.can_save_guest_draft ?? (state === "guest" && c?.create_allowed),
  );
  const createAllowed =
    state === "guest" ? canSaveGuestDraft : canCreatePersistedAgreement;

  return {
    state,
    grantSource,
    agreementAllowance,
    agreementsUsed,
    agreementsRemaining,
    periodEndsAt,
    canCreatePersistedAgreement,
    canSaveGuestDraft,
    entitlement: entitlementAliasForState(state),
    createAllowed,
    upgradeRequired: Boolean(c?.upgrade_required ?? !createAllowed),
    reason: c?.reason ?? null,
    genesisAllowance: parseAllowanceBlock(c?.genesis_allowance),
    proAllowance: parseAllowanceBlock(c?.pro_allowance),
    freeAllowance: null,
    tier: data.tier ?? null,
  };
}

/**
 * Server-authoritative commercial create decision.
 * Auth and transport failures are surfaced — never silently mapped to guest/Genesis.
 */
export async function fetchCommercialEntitlement(): Promise<CommercialEntitlementDecision> {
  const res = await fetchAgreementUsageSummary();
  if (res.authFailure) {
    return {
      state: "none",
      grantSource: "none",
      agreementAllowance: null,
      agreementsUsed: 0,
      agreementsRemaining: null,
      periodEndsAt: null,
      canCreatePersistedAgreement: false,
      canSaveGuestDraft: false,
      entitlement: "none",
      createAllowed: false,
      upgradeRequired: false,
      reason: "auth_failure",
      genesisAllowance: null,
      proAllowance: null,
      freeAllowance: null,
      authFailure: true,
      probeFailure: false,
      tier: null,
      raw: null,
    };
  }
  if (!res.ok || !res.data) {
    return {
      state: "none",
      grantSource: "none",
      agreementAllowance: null,
      agreementsUsed: 0,
      agreementsRemaining: null,
      periodEndsAt: null,
      canCreatePersistedAgreement: false,
      canSaveGuestDraft: false,
      entitlement: "none",
      createAllowed: false,
      upgradeRequired: false,
      reason: "probe_failed",
      genesisAllowance: null,
      proAllowance: null,
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

export function formatPeriodEndsLabel(periodEndsAt: string | null | undefined): string {
  const raw = (periodEndsAt || "").trim();
  if (!raw) return "the next period";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
