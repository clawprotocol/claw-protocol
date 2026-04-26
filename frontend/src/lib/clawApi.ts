const DEV_API_FALLBACK = "http://127.0.0.1:8000";

/** Injected at runtime (e.g. static hosting) when build-time VITE_* API URL is missing. Set before the app bundle runs. */
/** @public Injected on `window` before the app bundle (e.g. Railway static + separate API). */
export const CLAW_PUBLIC_API_BASE_WINDOW_KEY = "__CLAW_PUBLIC_API_BASE__" as const;

let loggedApiBaseOnce = false;

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
  try {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[CLAW] API base (once)", { source, base: resolved || "(empty/same-origin)" });
      return;
    }
    if (import.meta.env.PROD) {
      let host = "same_origin";
      if (resolved) {
        try {
          host = new URL(resolved).host;
        } catch {
          host = "invalid";
        }
      }
      // Safe: no tokens, no path/query
      // eslint-disable-next-line no-console
      console.info("[CLAW] API base (once)", { source, apiHost: host });
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

/**
 * Explicit API origin from env (VITE_CLAW_API_BASE or VITE_API_BASE).
 * Empty string = same-origin requests (production API on the same host as the SPA).
 * @see getRuntimePublicApiBase — use resolveApiBase() in requests so runtime injection can apply.
 */
export function getApiBase(): string {
  const a = String((import.meta.env.VITE_CLAW_API_BASE as string | undefined) ?? "").trim();
  const b = String((import.meta.env.VITE_API_BASE as string | undefined) ?? "").trim();
  return (a || b).replace(/\/$/, "");
}

/**
 * Resolved base URL for fetch() to the LawDog API.
 * - Production: uses explicit env only, or "" for same-origin (no silent localhost).
 * - Dev: falls back to 127.0.0.1:8000 when unset (local backend).
 */
export function resolveApiBase(): string {
  const explicit = getApiBase() || getRuntimePublicApiBase();
  if (explicit) {
    logApiBaseResolvedOnce(explicit, getApiBase() ? "env" : "runtime_meta");
    if (!import.meta.env.PROD && typeof window !== "undefined") {
      try {
        const originHost = new URL(window.location.origin).hostname;
        const u = new URL(explicit);
        if (isLoopbackHost(originHost) && isPrivateLanHost(u.hostname)) {
          const normalized = `${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ""}`;
          console.warn("[LawDog dev] normalized API base to loopback for local browser origin", {
            from: explicit,
            to: normalized,
            origin: window.location.origin,
          });
          return normalized;
        }
      } catch {
        /* ignore normalization and keep explicit */
      }
    }
    if (import.meta.env.PROD) {
      const l = explicit.toLowerCase();
      if (l.includes("localhost") || l.includes("127.0.0.1")) {
        console.warn(
          "[LawDog operator] Production build uses a loopback API URL. Set the frontend build-time API origin to your hosted API.",
        );
      }
    }
    return explicit;
  }
  if (import.meta.env.PROD) {
    logApiBaseResolvedOnce("", "same_origin");
    return "";
  }
  logApiBaseResolvedOnce(DEV_API_FALLBACK, "dev_fallback");
  return DEV_API_FALLBACK;
}

/** True when prod build has an explicit API base that still targets loopback (misconfiguration). */
export function isProductionApiMisconfigured(): boolean {
  if (!import.meta.env.PROD) return false;
  const b = getApiBase();
  if (!b) return false;
  const l = b.toLowerCase();
  return l.includes("localhost") || l.includes("127.0.0.1");
}

/** Absolute or root-relative URL for an API path (uses same resolution as `resolveApiBase`). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = resolveApiBase().replace(/\/$/, "");
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
