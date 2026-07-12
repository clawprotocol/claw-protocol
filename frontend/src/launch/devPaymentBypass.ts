import { isLocalBrowserOrigin } from "../lib/clawApi";
import type { GenesisBetaPaymentBypassAuth } from "./genesisBetaPaymentBypassAuth";

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
  readonly betaAuth?: GenesisBetaPaymentBypassAuth;
  readonly gates?: {
    readonly envFlag: boolean;
    readonly originOrDeployment: boolean;
    readonly betaAuth: boolean;
  };
};

const QA_PAYMENT_BYPASS_ENABLED = "1";

/** Explicit parser — only `"1"` enables QA payment bypass (never generic truthiness). */
export function parseLawdogQaPaymentBypassEnabled(raw: string | undefined | null): boolean {
  return String(raw ?? "").trim() === QA_PAYMENT_BYPASS_ENABLED;
}
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
  if (isPublicProductionHostname(host)) return false;
  if (host.endsWith(".railway.app") || host.endsWith(".up.railway.app")) return true;
  return QA_ORIGIN_TOKEN.test(host);
}

export function isPublicProductionHostname(host: string): boolean {
  const h = (host || "").trim().toLowerCase();
  return (
    h === "lawdog.me" ||
    h === "www.lawdog.me" ||
    h === "lawdog.ai" ||
    h === "www.lawdog.ai" ||
    h === "app.lawdog.ai"
  );
}

function isPublicProductionOrigin(origin = readOrigin()): boolean {
  return isPublicProductionHostname(hostnameFromOrigin(origin));
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

export function resolveQaPaymentBypassState(
  env?: DevPaymentBypassEnv,
  betaAuth?: GenesisBetaPaymentBypassAuth | null,
): QaPaymentBypassState {
  const e = env ?? (import.meta.env as DevPaymentBypassEnv);
  const envValue = e.VITE_LAWDOG_QA_PAYMENT_BYPASS ?? "";
  const origin = readOrigin();
  const prod = Boolean(e.PROD);
  const deploymentEnv = resolveDeploymentEnv(e);
  const recognizedOrigin = isRecognizedQaPaymentBypassOrigin(origin);
  const explicitNonProductionEnv = isExplicitNonProductionEnv(deploymentEnv);
  const publicProduction = isPublicProductionOrigin(origin);
  const envFlag = parseLawdogQaPaymentBypassEnabled(envValue);
  const originOrDeployment = recognizedOrigin || explicitNonProductionEnv;

  const base = { origin, prod, envValue, deploymentEnv };

  if (!envFlag) {
    return {
      ...base,
      enabled: false,
      reason: "qa_env_flag_not_enabled",
      gates: { envFlag: false, originOrDeployment, betaAuth: false },
    };
  }
  if (recognizedOrigin) {
    return {
      ...base,
      enabled: true,
      reason: "recognized_qa_origin",
      gates: { envFlag: true, originOrDeployment: true, betaAuth: false },
    };
  }
  if (explicitNonProductionEnv) {
    return {
      ...base,
      enabled: true,
      reason: "explicit_non_production_env",
      gates: { envFlag: true, originOrDeployment: true, betaAuth: false },
    };
  }
  if (publicProduction) {
    if (betaAuth == null) {
      return {
        ...base,
        enabled: false,
        reason: "qa_auth_pending",
        gates: { envFlag: true, originOrDeployment: false, betaAuth: false },
      };
    }
    if (betaAuth.authorized) {
      return {
        ...base,
        enabled: true,
        reason: `qa_server_${betaAuth.reason}`,
        betaAuth,
        gates: { envFlag: true, originOrDeployment: false, betaAuth: true },
      };
    }
    return {
      ...base,
      enabled: false,
      reason: betaAuth.reason || "not_authorized",
      betaAuth,
      gates: { envFlag: true, originOrDeployment: false, betaAuth: false },
    };
  }
  return {
    ...base,
    enabled: false,
    reason: "qa_origin_or_env_required",
    gates: { envFlag: true, originOrDeployment: false, betaAuth: false },
  };
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

export function logQaPaymentBypassState(
  env?: DevPaymentBypassEnv,
  betaAuth?: GenesisBetaPaymentBypassAuth | null,
): QaPaymentBypassState {
  const state = resolveQaPaymentBypassState(env, betaAuth);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    return state;
  }
  console.info("[qa-payment-bypass-state]", {
    enabled: state.enabled,
    authorized: state.betaAuth?.authorized ?? false,
    reason: state.reason,
    deployment: state.deploymentEnv,
    host: state.origin,
  });
  return state;
}
