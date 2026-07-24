/**
 * Client cache + hook for active Genesis Dog access (server-authoritative).
 * Used to hide Affiliate nav and gate dashboard routes — never the sole authority.
 */

import { useEffect, useState } from "react";
import { fetchGenesisAffiliateAccess } from "./genesisReferralApi";

export type GenesisAccessState = "loading" | "allowed" | "denied";

let cached: { allowed: boolean; at: number } | null = null;
const CACHE_TTL_MS = 30_000;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function clearGenesisAffiliateAccessCache(): void {
  cached = null;
  notify();
}

export function peekGenesisAffiliateAccessAllowed(): boolean | null {
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_TTL_MS) return null;
  return cached.allowed;
}

export async function resolveGenesisAffiliateAccess(force = false): Promise<boolean> {
  if (!force && cached && Date.now() - cached.at <= CACHE_TTL_MS) {
    return cached.allowed;
  }
  const res = await fetchGenesisAffiliateAccess();
  cached = { allowed: Boolean(res.allowed), at: Date.now() };
  notify();
  return cached.allowed;
}

export function useActiveGenesisAffiliateAccess(): {
  state: GenesisAccessState;
  allowed: boolean;
  refresh: () => void;
} {
  const [state, setState] = useState<GenesisAccessState>(() => {
    const peek = peekGenesisAffiliateAccessAllowed();
    if (peek === true) return "allowed";
    if (peek === false) return "denied";
    return "loading";
  });

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      const peek = peekGenesisAffiliateAccessAllowed();
      if (peek === true) setState("allowed");
      else if (peek === false) setState("denied");
    };
    listeners.add(sync);
    void resolveGenesisAffiliateAccess().then((allowed) => {
      if (!cancelled) setState(allowed ? "allowed" : "denied");
    });
    return () => {
      cancelled = true;
      listeners.delete(sync);
    };
  }, []);

  return {
    state,
    allowed: state === "allowed",
    refresh: () => {
      clearGenesisAffiliateAccessCache();
      setState("loading");
      void resolveGenesisAffiliateAccess(true).then((allowed) => {
        setState(allowed ? "allowed" : "denied");
      });
    },
  };
}
