/**
 * Single runtime environment abstraction for browser (Vite) and Node (Vitest / Playwright).
 *
 * Browser/Vite code may read `import.meta.env` only inside this module.
 * Node/E2E runners resolve the same fields from `process.env` or injected config.
 */

export type RuntimeEnvironment = {
  apiBaseUrl: string;
  appBaseUrl: string;
  isDevelopment: boolean;
  isTest: boolean;
  paymentBypassEnabled: boolean;
};

type EnvBag = Record<string, string | boolean | undefined>;

function readViteEnvBag(): EnvBag | null {
  try {
    if (typeof import.meta === "undefined") return null;
    const env = (import.meta as ImportMeta & { env?: EnvBag }).env;
    if (!env || typeof env !== "object") return null;
    return env;
  } catch {
    return null;
  }
}

function readNodeEnvBag(): EnvBag {
  if (typeof process === "undefined" || !process.env) return {};
  return process.env as EnvBag;
}

function envString(vite: EnvBag | null, node: EnvBag, ...keys: string[]): string {
  for (const key of keys) {
    const fromVite = vite?.[key];
    if (fromVite != null && String(fromVite).trim() !== "") return String(fromVite).trim();
    const fromNode = node[key];
    if (fromNode != null && String(fromNode).trim() !== "") return String(fromNode).trim();
  }
  return "";
}

function envBool(vite: EnvBag | null, node: EnvBag, key: string): boolean {
  const raw = envString(vite, node, key);
  return raw === "1" || raw.toLowerCase() === "true";
}

let cached: RuntimeEnvironment | null = null;

/** Resolved runtime environment (memoized per module load). */
export function readRuntimeEnvironment(): RuntimeEnvironment {
  if (cached) return cached;
  const vite = readViteEnvBag();
  const node = readNodeEnvBag();

  const mode = envString(vite, node, "MODE") || String(node.NODE_ENV ?? "production");
  const isTest = mode === "test";
  const isDevFlag = vite?.DEV === true || node.NODE_ENV === "development";
  const isProdFlag = vite?.PROD === true || node.NODE_ENV === "production";
  const isDevelopment = isDevFlag || (!isProdFlag && !isTest && mode === "development");

  const apiBaseUrl = envString(vite, node, "VITE_CLAW_API_BASE", "VITE_API_BASE").replace(/\/$/, "");
  const appBaseUrl = (
    envString(vite, node, "VITE_APP_BASE_URL") ||
    envString(vite, node, "PLAYWRIGHT_BASE_URL") ||
    "http://127.0.0.1:4173"
  ).replace(/\/$/, "");

  const paymentBypassEnabled =
    envBool(vite, node, "VITE_ENABLE_DEV_PAYMENT_BYPASS") ||
    envBool(vite, node, "VITE_LAWDOG_QA_PAYMENT_BYPASS");

  cached = { apiBaseUrl, appBaseUrl, isDevelopment, isTest, paymentBypassEnabled };
  return cached;
}

/** Read a single string env key from Vite or Node. */
export function readRuntimeEnvString(key: string): string {
  const vite = readViteEnvBag();
  const node = readNodeEnvBag();
  return envString(vite, node, key);
}

export function readRuntimeEnvMode(): string {
  const vite = readViteEnvBag();
  const node = readNodeEnvBag();
  return envString(vite, node, "MODE") || String(node.NODE_ENV ?? "production");
}

export function readRuntimeEnvProd(): boolean {
  const vite = readViteEnvBag();
  const node = readNodeEnvBag();
  return vite?.PROD === true || node.NODE_ENV === "production";
}

export function readRuntimeEnvDev(): boolean {
  const vite = readViteEnvBag();
  const node = readNodeEnvBag();
  return vite?.DEV === true || node.NODE_ENV === "development";
}

/** Test-only: reset memoized environment between cases. */
export function resetRuntimeEnvironmentCacheForTests(): void {
  cached = null;
}
