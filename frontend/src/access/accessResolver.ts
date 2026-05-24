import type { AccessTier, EntitlementSource } from "./types";
import { TIER_CONFIG } from "./tierConfig";

const VALID_TIERS = new Set(Object.keys(TIER_CONFIG) as AccessTier[]);

export function normalizeAccessTier(raw: string | null | undefined): AccessTier | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "dev" || s === "internal") return "admin";
  if (VALID_TIERS.has(s as AccessTier)) return s as AccessTier;
  return null;
}

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

function readQueryTier(): AccessTier | null {
  if (typeof window === "undefined" || !devToolsUnlocked()) return null;
  try {
    const q = new URLSearchParams(window.location.search).get("claw_plan");
    return normalizeAccessTier(q);
  } catch {
    return null;
  }
}

function readLocalDevTier(): AccessTier | null {
  if (typeof localStorage === "undefined" || !devToolsUnlocked()) return null;
  try {
    return normalizeAccessTier(localStorage.getItem("claw_dev_access_tier"));
  } catch {
    return null;
  }
}

function readEnvTier(): AccessTier | null {
  if (!devToolsUnlocked()) return null;
  try {
    return normalizeAccessTier(String(import.meta.env?.VITE_CLAW_ACCESS_TIER || "").trim());
  } catch {
    return null;
  }
}

export type ResolvedAccess = {
  tier: AccessTier;
  sourcesTried: EntitlementSource[];
};

/**
 * Ordered resolver: dev query → dev localStorage → build env → default free.
 * Later: prepend backend session, subscription, wallet, credits (return first hit).
 */
export function resolveAccess(): ResolvedAccess {
  const sourcesTried: EntitlementSource[] = [
    { id: "future_backend", tier: null },
    { id: "future_subscription", tier: null },
    { id: "future_wallet", tier: null },
  ];

  const q = readQueryTier();
  if (q) {
    sourcesTried.unshift({ id: "dev_query", tier: q });
    return { tier: q, sourcesTried };
  }

  const loc = readLocalDevTier();
  if (loc) {
    sourcesTried.unshift({ id: "dev_local_storage", tier: loc });
    return { tier: loc, sourcesTried };
  }

  const env = readEnvTier();
  if (env) {
    sourcesTried.unshift({ id: "env", tier: env });
    return { tier: env, sourcesTried };
  }

  sourcesTried.unshift({ id: "default", tier: "free" });
  return { tier: "free", sourcesTried };
}
