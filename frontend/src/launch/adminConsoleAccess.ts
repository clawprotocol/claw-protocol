import { featureFlags } from "../config/featureFlags";
import { isLocalBrowserOrigin } from "../lib/clawApi";
import {
  isPublicProductionHostname,
  isRecognizedQaPaymentBypassOrigin,
  type DevPaymentBypassEnv,
} from "./devPaymentBypass";

const QA_OPERATOR_DEPLOYMENT_FLAG = "1";

function readEnv(env?: DevPaymentBypassEnv): DevPaymentBypassEnv {
  return env ?? (import.meta.env as DevPaymentBypassEnv);
}

/**
 * Operator deployments: explicit admin-console flag, internal QA bypass build, or public
 * production host (lawdog.me / lawdog.ai — still gated by server auth on those hosts).
 */
export function isAdminConsoleDeploymentEnabled(env?: DevPaymentBypassEnv): boolean {
  const e = readEnv(env);
  return (
    featureFlags.adminConsoleUi ||
    e.VITE_LAWDOG_QA_PAYMENT_BYPASS === QA_OPERATOR_DEPLOYMENT_FLAG ||
    isPublicProductionAdminConsoleHost()
  );
}

export function readPublicProductionAdminHost(): string {
  if (typeof window === "undefined") return "";
  try {
    return new URL(window.location.origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isPublicProductionAdminConsoleHost(): boolean {
  return isPublicProductionHostname(readPublicProductionAdminHost());
}

/** Staging, Railway preview, and local dev — no server auth gate for the admin route shell. */
export function canAccessAdminConsoleWithoutServerAuth(env?: DevPaymentBypassEnv): boolean {
  if (!isAdminConsoleDeploymentEnabled(env)) return false;
  if (isLocalBrowserOrigin()) return true;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin && isRecognizedQaPaymentBypassOrigin(origin)) return true;
  return !isPublicProductionAdminConsoleHost();
}

/** lawdog.me / lawdog.ai public production — require server authorization before rendering admin UI. */
export function requiresAdminConsoleServerAuth(env?: DevPaymentBypassEnv): boolean {
  return isAdminConsoleDeploymentEnabled(env) && isPublicProductionAdminConsoleHost();
}
