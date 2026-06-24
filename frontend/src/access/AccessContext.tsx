import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { allowedAiModelClassForTier, planDisplayName, tierEntitlements } from "./tierConfig";
import { canUseFeature, getUsageAllowanceSnapshot } from "./accessHelpers";
import { resolveAccess, type ResolvedAccess } from "./accessResolver";
import type { AccessFeature, AccessTier, AiModelClass, GateContext, GateResult, UsageKind } from "./types";
import { loadUsageTotals, peekUsageTotals, recordUsage as persistUsage } from "./usageMeter";
import { featureFlags } from "../config/featureFlags";
import { refreshSubscriptionEntitlement } from "./subscriptionEntitlementCache";
import { getOrgId } from "../launch/orgContext";

export type AccessContextValue = {
  tier: AccessTier;
  resolved: ResolvedAccess;
  planLabel: string;
  effectiveAiModelClass: AiModelClass;
  entitlements: ReturnType<typeof tierEntitlements>;
  usage: ReturnType<typeof peekUsageTotals>;
  refreshUsage: () => void;
  recordUsage: (kind: UsageKind, delta?: number) => void;
  check: (feature: AccessFeature, ctx?: GateContext) => GateResult;
  allowanceRows: ReturnType<typeof getUsageAllowanceSnapshot>;
  showDevTierSwitcher: boolean;
  setDevOverrideTier: (tier: AccessTier | null) => void;
};

const Ctx = createContext<AccessContextValue | null>(null);

function devToolsUnlocked(): boolean {
  try {
    return (
      Boolean(import.meta.env?.DEV) ||
      String(import.meta.env?.VITE_CLAW_ACCESS_DEV_TOOLS || "").trim() === "1"
    );
  } catch {
    return false;
  }
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);

  const refreshUsage = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!featureFlags.serverBilling) return;
    void refreshSubscriptionEntitlement(getOrgId()).then(() => setTick((n) => n + 1));
  }, []);

  const resolved = useMemo((): ResolvedAccess => {
    void tick;
    return resolveAccess();
  }, [tick]);

  const tier = resolved.tier;

  const usage = useMemo(() => {
      void tick;
      return loadUsageTotals();
    }, [tick]);

  const setDevOverrideTier = useCallback((next: AccessTier | null) => {
    if (typeof localStorage !== "undefined") {
      try {
        if (next) localStorage.setItem("claw_dev_access_tier", next);
        else localStorage.removeItem("claw_dev_access_tier");
      } catch {
        /* ignore */
      }
    }
    setTick((n) => n + 1);
  }, []);

  const recordUsage = useCallback((kind: UsageKind, delta = 1) => {
    persistUsage(kind, delta);
    setTick((n) => n + 1);
  }, []);

  const check = useCallback(
    (feature: AccessFeature, ctx?: GateContext) => canUseFeature(tier, usage, feature, ctx),
    [tier, usage]
  );

  const value = useMemo((): AccessContextValue => {
    const ent = tierEntitlements(tier);
    return {
      tier,
      resolved,
      planLabel: planDisplayName(tier),
      effectiveAiModelClass: allowedAiModelClassForTier(tier),
      entitlements: ent,
      usage,
      refreshUsage,
      recordUsage,
      check,
      allowanceRows: getUsageAllowanceSnapshot(tier, usage),
      showDevTierSwitcher: devToolsUnlocked(),
      setDevOverrideTier,
    };
  }, [tier, resolved, usage, refreshUsage, recordUsage, check, setDevOverrideTier]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Safe fallback when used outside provider (e.g. rare mounts) — treats as free tier. */
export function useAccess(): AccessContextValue {
  const v = useContext(Ctx);
  if (v) return v;
  const tier: AccessTier = "free";
  const usage = peekUsageTotals();
  const noop = () => {};
  return {
    tier,
    resolved: { tier, sourcesTried: [{ id: "default", tier: "free" }] },
    planLabel: planDisplayName(tier),
    effectiveAiModelClass: allowedAiModelClassForTier(tier),
    entitlements: tierEntitlements(tier),
    usage,
    refreshUsage: noop,
    recordUsage: noop,
    check: (feature, ctx) => canUseFeature(tier, usage, feature, ctx),
    allowanceRows: getUsageAllowanceSnapshot(tier, usage),
    showDevTierSwitcher: false,
    setDevOverrideTier: noop,
  };
}
