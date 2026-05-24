import { isLocalBrowserOrigin } from "../lib/clawApi";

/**
 * DEV / local smoke: one-click “payment success” for create-flow checkout (premium post-return testing).
 *
 * Enabled when:
 * - Browser origin is localhost / 127.0.0.1 (includes `npm run preview` on loopback), unless
 *   `VITE_ENABLE_DEV_PAYMENT_BYPASS=0`, or
 * - Vite dev server (`import.meta.env.DEV`), unless opted out with `=0`.
 *
 * Shipped production on a public origin: always off unless explicitly testing with env (still off on remote).
 */
export type DevPaymentBypassEnv = {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly VITE_ENABLE_DEV_PAYMENT_BYPASS?: string;
};

export type DevPaymentBypassState = {
  readonly enabled: boolean;
  readonly reason: string;
  readonly origin: string;
  readonly prod: boolean;
  readonly envValue: string;
};

export function resolveDevPaymentBypassState(env?: DevPaymentBypassEnv): DevPaymentBypassState {
  const e = env ?? (import.meta.env as DevPaymentBypassEnv);
  const envValue = e.VITE_ENABLE_DEV_PAYMENT_BYPASS ?? "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const prod = Boolean(e.PROD);

  if (envValue === "0") {
    return { enabled: false, reason: "env_explicitly_disabled", origin, prod, envValue };
  }
  if (isLocalBrowserOrigin()) {
    return { enabled: true, reason: "local_browser_origin", origin, prod, envValue };
  }
  if (!e.PROD && e.DEV) {
    return { enabled: true, reason: "vite_dev_server", origin, prod, envValue };
  }
  return {
    enabled: false,
    reason: prod ? "production_build_non_local_origin" : "not_dev_or_local",
    origin,
    prod,
    envValue,
  };
}

export function isDevCreateFlowPaymentBypassEnabled(env?: DevPaymentBypassEnv): boolean {
  return resolveDevPaymentBypassState(env).enabled;
}

export function logDevPaymentBypassState(env?: DevPaymentBypassEnv): DevPaymentBypassState {
  const state = resolveDevPaymentBypassState(env);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    return state;
  }
  console.info("[dev-payment-bypass-state]", state);
  return state;
}
