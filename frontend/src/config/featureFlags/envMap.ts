import type { FeatureGateKey } from "./keys";

/** Optional env overrides: VITE_CLAW_GATE_<SNAKE_UPPER> = "0" | "1" */
export const FEATURE_GATE_ENV_KEYS: Partial<Record<FeatureGateKey, string>> = {
  affiliate_opportunity_enabled: "VITE_CLAW_GATE_AFFILIATE_OPPORTUNITY",
  affiliate_leaderboard_enabled: "VITE_CLAW_GATE_AFFILIATE_LEADERBOARD",
  affiliate_challenges_enabled: "VITE_CLAW_GATE_AFFILIATE_CHALLENGES",
  proof_share_bridge_enabled: "VITE_CLAW_GATE_PROOF_SHARE_BRIDGE",
  annual_default_enabled: "VITE_CLAW_GATE_ANNUAL_DEFAULT",
  crypto_checkout_enabled: "VITE_CLAW_GATE_CRYPTO_CHECKOUT",
};

export function readBooleanEnv(envKey: string | undefined, defaultOn: boolean): boolean {
  if (!envKey) return defaultOn;
  try {
    const raw = (import.meta.env as Record<string, string | undefined>)[envKey];
    if (raw === undefined || raw === "") return defaultOn;
    return raw.trim() !== "0" && raw.toLowerCase() !== "false" && raw.toLowerCase() !== "no";
  } catch {
    return defaultOn;
  }
}
