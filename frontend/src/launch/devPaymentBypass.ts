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
  readonly MODE?: string;
  readonly VITE_ENABLE_DEV_PAYMENT_BYPASS?: string;
  readonly VITE_LAWDOG_QA_PAYMENT_BYPASS?: string;
  readonly VITE_LAWDOG_ENV?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_RAILWAY_ENVIRONMENT_NAME?: string;
};

export type DevPaymentBypassState = {
  readonly enabled: boolean;
  readonly reason: string;
  readonly origin: string;
  readonly prod: boolean;
  readonly envValue: string;
};

export type QaPaymentBypassState = {
  readonly enabled: boolean;
  readonly reason: string;
  readonly origin: string;
  readonly prod: boolean;
  readonly envValue: string;
  readonly deploymentEnv: string;
};

const QA_PAYMENT_BYPASS_ENABLED = "1";
const QA_ORIGIN_TOKEN = /(^|[.-])(qa|stage|staging|preview|review|railway)([.-]|$)/i;
const NON_PRODUCTION_ENV_NAMES = new Set([
  "dev",
  "development",
  "local",
  "qa",
  "test",
  "testing",
  "stage",
  "staging",
  "preview",
  "review",
  "railway",
]);

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

function readOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function hostnameFromOrigin(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isRecognizedQaPaymentBypassOrigin(origin = readOrigin()): boolean {
  const host = hostnameFromOrigin(origin);
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (host === "app.lawdog.ai" || host === "lawdog.ai" || host === "www.lawdog.ai") return false;
  if (host.endsWith(".railway.app") || host.endsWith(".up.railway.app")) return true;
  return QA_ORIGIN_TOKEN.test(host);
}

function resolveDeploymentEnv(e: DevPaymentBypassEnv): string {
  return String(
    e.VITE_LAWDOG_ENV ||
      e.VITE_APP_ENV ||
      e.VITE_RAILWAY_ENVIRONMENT_NAME ||
      e.MODE ||
      "",
  )
    .trim()
    .toLowerCase();
}

function isExplicitNonProductionEnv(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === "prod" || v === "production") return false;
  if (NON_PRODUCTION_ENV_NAMES.has(v)) return true;
  return /^pr[-_]\d+$/.test(v) || /^preview[-_]/.test(v) || /^review[-_]/.test(v);
}

export function resolveQaPaymentBypassState(env?: DevPaymentBypassEnv): QaPaymentBypassState {
  const e = env ?? (import.meta.env as DevPaymentBypassEnv);
  const envValue = e.VITE_LAWDOG_QA_PAYMENT_BYPASS ?? "";
  const origin = readOrigin();
  const prod = Boolean(e.PROD);
  const deploymentEnv = resolveDeploymentEnv(e);
  const recognizedOrigin = isRecognizedQaPaymentBypassOrigin(origin);
  const explicitNonProductionEnv = isExplicitNonProductionEnv(deploymentEnv);

  if (envValue !== QA_PAYMENT_BYPASS_ENABLED) {
    return { enabled: false, reason: "qa_env_flag_not_enabled", origin, prod, envValue, deploymentEnv };
  }
  if (recognizedOrigin) {
    return { enabled: true, reason: "recognized_qa_origin", origin, prod, envValue, deploymentEnv };
  }
  if (explicitNonProductionEnv) {
    return { enabled: true, reason: "explicit_non_production_env", origin, prod, envValue, deploymentEnv };
  }
  return { enabled: false, reason: "qa_origin_or_env_required", origin, prod, envValue, deploymentEnv };
}

export function isQaCreateFlowPaymentBypassEnabled(env?: DevPaymentBypassEnv): boolean {
  return resolveQaPaymentBypassState(env).enabled;
}

export function logDevPaymentBypassState(env?: DevPaymentBypassEnv): DevPaymentBypassState {
  const state = resolveDevPaymentBypassState(env);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    return state;
  }
  console.info("[dev-payment-bypass-state]", state);
  return state;
}

export function logQaPaymentBypassState(env?: DevPaymentBypassEnv): QaPaymentBypassState {
  const state = resolveQaPaymentBypassState(env);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    return state;
  }
  console.info("[qa-payment-bypass-state]", state);
  return state;
}
