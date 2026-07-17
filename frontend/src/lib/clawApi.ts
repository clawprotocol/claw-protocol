import {
  readRuntimeEnvDev,
  readRuntimeEnvMode,
  readRuntimeEnvProd,
  readRuntimeEnvironment,
  readRuntimeEnvString,
} from "../config/runtimeEnvironment";

const DEV_API_FALLBACK = "http://127.0.0.1:8000";

/** Injected at runtime (e.g. static hosting) when build-time VITE_* API URL is missing. Set before the app bundle runs. */
/** @public Injected on `window` before the app bundle (e.g. Railway static + separate API). */
export const CLAW_PUBLIC_API_BASE_WINDOW_KEY = "__CLAW_PUBLIC_API_BASE__" as const;

let loggedApiBaseOnce = false;
const loggedNormalizeKeys = new Set<string>();

function getRuntimePublicApiBase(): string {
  if (typeof window === "undefined") return "";
  try {
    const w = window as unknown as Record<string, string | undefined>;
    const a = String(w[CLAW_PUBLIC_API_BASE_WINDOW_KEY] ?? "").trim();
    if (a) return a.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  try {
    const el = document?.querySelector?.("meta[name=\"claw-api-base\"]") as HTMLMetaElement | null;
    const c = String(el?.content ?? "").trim();
    if (c) return c.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return "";
}

function logApiBaseResolvedOnce(resolved: string, source: "env" | "runtime_meta" | "dev_fallback" | "same_origin"): void {
  if (loggedApiBaseOnce) return;
  loggedApiBaseOnce = true;
  /** Vitest (`MODE === "test"`) and explicit suppress keep CI / Playwright / unit stdout quiet. */
  if (readRuntimeEnvMode() === "test") return;
  if (readRuntimeEnvString("VITE_CLAW_SUPPRESS_API_BASE_LOG") === "1") return;
  /** Production stays silent unless operators opt in (safe host-only payload). */
  if (readRuntimeEnvProd() && readRuntimeEnvString("VITE_CLAW_LOG_API_BASE") !== "1") return;
  try {
    if (readRuntimeEnvProd()) {
      let host = "same_origin";
      if (resolved) {
        try {
          host = new URL(resolved).host;
        } catch {
          host = "invalid";
        }
      }
      // eslint-disable-next-line no-console
      console.info("[CLAW] API base (once)", { source, apiHost: host });
      return;
    }
    if (readRuntimeEnvDev()) {
      // eslint-disable-next-line no-console
      console.info("[CLAW] API base (once)", { source, base: resolved || "(empty/same-origin)" });
    }
  } catch {
    /* ignore */
  }
}

function isLoopbackHost(h: string): boolean {
  const x = (h || "").toLowerCase();
  return x === "127.0.0.1" || x === "localhost" || x === "::1";
}

function isPrivateLanHost(h: string): boolean {
  const x = (h || "").toLowerCase();
  if (/^10\./.test(x)) return true;
  if (/^192\.168\./.test(x)) return true;
  const m = x.match(/^172\.(\d{1,2})\./);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 16 && n <= 31) return true;
  }
  return false;
}

export function isLocalBrowserOrigin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return isLoopbackHost(new URL(window.location.origin).hostname);
  } catch {
    return false;
  }
}

/**
 * When the SPA is opened on localhost / 127.0.0.1 (including `vite preview`),
 * rewrite LAN or 0.0.0.0 API hosts to loopback so the browser can reach the backend.
 */
export function normalizeLocalApiBase(raw: string, caller = "unknown"): string {
  const trimmed = String(raw ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;
  if (!isLocalBrowserOrigin()) return trimmed;
  try {
    const u = new URL(trimmed);
    const needsLoopback =
      isPrivateLanHost(u.hostname) || u.hostname === "0.0.0.0" || u.hostname === "[::]";
    if (!needsLoopback) return trimmed;
    const normalized = `${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ""}`;
    const logKey = `${trimmed}|${normalized}|${caller}`;
    if (!loggedNormalizeKeys.has(logKey)) {
      loggedNormalizeKeys.add(logKey);
      // eslint-disable-next-line no-console
      console.warn("[lawdog-api-base-raw-blocked]", {
        raw: trimmed,
        caller,
      });
      // eslint-disable-next-line no-console
      console.info("[lawdog-api-base-normalized]", {
        from: trimmed,
        to: normalized,
        origin: window.location.origin,
        caller,
      });
    }
    return normalized;
  } catch {
    return trimmed;
  }
}

/**
 * Explicit API origin from env (VITE_CLAW_API_BASE or VITE_API_BASE).
 * Empty string = same-origin requests (production API on the same host as the SPA).
 * @see getRuntimePublicApiBase — use getLawDogApiBase() in requests so runtime injection can apply.
 */
export function getApiBase(): string {
  return readRuntimeEnvironment().apiBaseUrl;
}

/**
 * Canonical resolved API origin for all LawDog frontend fetch() calls.
 */
export function getLawDogApiBase(): string {
  const rawEnv = getApiBase();
  const rawRuntime = getRuntimePublicApiBase();
  const explicit = rawEnv || rawRuntime;
  if (explicit) {
    const normalized = normalizeLocalApiBase(explicit, "getLawDogApiBase");
    logApiBaseResolvedOnce(normalized, rawEnv ? "env" : "runtime_meta");
    if (readRuntimeEnvProd() && !isLocalBrowserOrigin()) {
      const l = normalized.toLowerCase();
      if (l.includes("localhost") || l.includes("127.0.0.1")) {
        console.warn(
          "[LawDog operator] Production build uses a loopback API URL. Set the frontend build-time API origin to your hosted API.",
        );
      }
    }
    return normalized;
  }
  if (readRuntimeEnvProd() && !isLocalBrowserOrigin()) {
    logApiBaseResolvedOnce("", "same_origin");
    return "";
  }
  if (isLocalBrowserOrigin()) {
    logApiBaseResolvedOnce(DEV_API_FALLBACK, "dev_fallback");
    return DEV_API_FALLBACK;
  }
  if (readRuntimeEnvProd()) {
    logApiBaseResolvedOnce("", "same_origin");
    return "";
  }
  logApiBaseResolvedOnce(DEV_API_FALLBACK, "dev_fallback");
  return DEV_API_FALLBACK;
}

/** @deprecated Prefer {@link getLawDogApiBase}. */
export function resolveApiBase(): string {
  return getLawDogApiBase();
}

/** True when prod build has an explicit API base that still targets loopback (misconfiguration). */
export function isProductionApiMisconfigured(): boolean {
  if (!readRuntimeEnvProd()) return false;
  if (isLocalBrowserOrigin()) return false;
  const b = getApiBase();
  if (!b) return false;
  const l = b.toLowerCase();
  return l.includes("localhost") || l.includes("127.0.0.1");
}

/** True when explicit API base targets a different browser origin (split-origin deploy). */
export function isLawDogApiCrossOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const base = getLawDogApiBase().trim();
  if (!base) return false;
  try {
    return new URL(base).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** Absolute or root-relative URL for an API path (uses same resolution as `getLawDogApiBase`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getLawDogApiBase().replace(/\/$/, "");
  return base ? `${base}${p}` : p;
}

export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalid_json_response");
  }
}

/** Best-effort message for failed HTTP responses (no stack traces to UI). */
export async function errorMessageFromResponse(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const text = (await res.text()).trim();
    if (!text) return fallback;
    try {
      const j = JSON.parse(text) as { detail?: unknown; message?: unknown };
      if (typeof j.detail === "string") return j.detail;
      if (typeof j.detail === "object" && j.detail !== null && "message" in j.detail) {
        const m = (j.detail as { message?: unknown }).message;
        if (typeof m === "string" && m.trim()) return m;
      }
      if (Array.isArray(j.detail)) {
        const parts = j.detail.map((x) =>
          typeof x === "object" && x !== null && "msg" in x
            ? String((x as { msg: string }).msg)
            : String(x)
        );
        if (parts.length) return parts.join("; ");
      }
      if (typeof j.message === "string") return j.message;
    } catch {
      return text.length > 280 ? `${text.slice(0, 277)}…` : text;
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

export function logClawClientWarning(scope: string, detail: Record<string, unknown>): void {
  try {
    console.warn(`[CLAW] ${scope}`, detail);
  } catch {
    /* ignore */
  }
}
