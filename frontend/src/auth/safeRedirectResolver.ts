/**
 * Router-aware post-auth destinations. Prefix matching is not authority.
 * Browser `next` is a fallback only after server continuation is absent or invalid.
 */

import { matchAppRoute } from "../launch/routes";
import type { AuthContinuationContextV1 } from "./authContinuationContext";

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const ALLOWED_POST_AUTH_ROUTE_IDS = new Set([
  "dashboard",
  "simple-create",
  "simple-checkout",
  "simple-send",
  "simple-done",
  "settings",
  "billing",
]);

const FORBIDDEN_QUERY_KEYS = new Set([
  "t",
  "token",
  "recipient_token",
  "code",
  "continuation_id",
  "access_token",
  "refresh_token",
]);

const ALLOWED_QUERY_KEYS = new Set([
  "agreementid",
  "ref",
  "join",
  "tier",
  "cadence",
  "returnto",
  "premiumcompletion",
  "checkout_session_id",
  "restore",
  "phase",
]);

function decodePathname(raw: string): string | null {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) break;
    current = next;
  }
  if (CONTROL_CHARS.test(current) || current.includes("\\")) return null;
  return current;
}

function collapsePathname(pathname: string): string | null {
  const parts = pathname.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join("/")}`;
}

function looksLikeExternalOrScript(raw: string): boolean {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (!t.startsWith("/")) return true;
  if (t.startsWith("//")) return true;
  if (t.includes("://")) return true;
  if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("vbscript:")) return true;
  if (t.includes("\\")) return true;
  if (CONTROL_CHARS.test(t)) return true;
  return false;
}

function parseInternalCandidate(path: string): { pathname: string; search: string } | null {
  const trimmed = (path || "").trim();
  if (!trimmed || looksLikeExternalOrScript(trimmed)) return null;
  const noHash = trimmed.split("#")[0] ?? "";
  const queryIndex = noHash.indexOf("?");
  const rawPath = queryIndex >= 0 ? noHash.slice(0, queryIndex) : noHash;
  const search = queryIndex >= 0 ? noHash.slice(queryIndex) : "";
  const decoded = decodePathname(rawPath);
  if (!decoded || looksLikeExternalOrScript(decoded)) return null;
  const collapsed = collapsePathname(decoded.replace(/\/+$/, "") || "/");
  if (!collapsed || looksLikeExternalOrScript(collapsed)) return null;
  return { pathname: collapsed, search };
}

function queryIsSafe(search: string, depth = 0): boolean {
  if (!search) return true;
  if (depth > 2) return false;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return true;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return false;
  }
  for (const [key, value] of params.entries()) {
    const k = key.trim().toLowerCase();
    if (!k || FORBIDDEN_QUERY_KEYS.has(k) || !ALLOWED_QUERY_KEYS.has(k)) return false;
    if (CONTROL_CHARS.test(value) || value.includes("\\") || value.includes("://")) return false;
    if (k === "returnto" && !isAllowlistedInternalPath(value, depth + 1)) return false;
  }
  return true;
}

export function isAllowlistedInternalPath(path: string, depth = 0): boolean {
  if (depth > 2) return false;
  const parsed = parseInternalCandidate(path);
  if (!parsed) return false;
  if (!queryIsSafe(parsed.search, depth)) return false;
  if (parsed.pathname === "/app/checkout") return true;
  const match = matchAppRoute(parsed.pathname, parsed.search);
  if (!match) return false;
  if (!ALLOWED_POST_AUTH_ROUTE_IDS.has(match.routeId)) return false;
  if (
    match.access === "recipient_token" ||
    match.access === "admin" ||
    match.access === "guest_workflow"
  ) {
    return false;
  }
  return true;
}

function canonicalizeInternalPath(path: string): string {
  const parsed = parseInternalCandidate(path);
  if (!parsed) return path;
  if (parsed.pathname === "/dashboard") return `/app${parsed.search}`;
  return path;
}

export function resolveSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/app",
): string {
  const c = (candidate || "").trim();
  if (c && isAllowlistedInternalPath(c)) return canonicalizeInternalPath(c);
  return fallback;
}

export function resolveAuthCallbackDestination(args: {
  serverDestination?: string | null;
  usedContinuation: boolean;
  callerNext?: string | null;
}): string {
  const server = resolveSafeRedirectPath(args.serverDestination, "");
  if (server) return server;
  if (args.usedContinuation) return "/app";
  return resolveSafeRedirectPath(args.callerNext, "/app");
}

export const CHECKOUT_SIGN_IN_HEADING = "Sign in to continue to secure checkout";
export const CHECKOUT_SIGN_IN_BODY =
  "Your draft is saved. After signing in, you'll return here to choose your plan and complete payment.";
export const CHECKOUT_SIGN_IN_CTA = "Sign in and continue";

export function isSecureCheckoutPath(path: string): boolean {
  const parsed = parseInternalCandidate(path);
  if (!parsed) return false;
  return parsed.pathname === "/app/checkout" || parsed.pathname.startsWith("/app/checkout/");
}

export function buildSignInContinuationPath(pathname: string, search = ""): string {
  const dest = `${(pathname || "").trim()}${(search || "").trim()}`;
  const safe = resolveSafeRedirectPath(dest, "/app");
  return `/app/sign-in?next=${encodeURIComponent(safe)}`;
}

export function resolveSignInContinuationDestination(search: string, fallback = "/app"): string {
  try {
    const q = new URLSearchParams(search || "");
    const next = (q.get("next") || "").trim();
    if (!next) return fallback;
    return resolveSafeRedirectPath(next, fallback);
  } catch {
    return fallback;
  }
}

export function resolvePostAuthDestination(ctx: AuthContinuationContextV1 | null): string {
  if (!ctx) return "/app";
  const dest = resolveSafeRedirectPath(ctx.destinationPath, "/app");
  if (ctx.agreementId && dest.startsWith("/app/create") && !dest.includes("agreementId=")) {
    const sep = dest.includes("?") ? "&" : "?";
    return `${dest}${sep}agreementId=${encodeURIComponent(ctx.agreementId)}`;
  }
  return dest;
}

const SENSITIVE_CALLBACK_KEYS = ["code", "continuation_id", "access_token", "refresh_token", "token", "t"] as const;

export function sanitizeVisibleSignInUrl(): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  try {
    const url = new URL(window.location.href);
    if (url.pathname.replace(/\/$/, "") !== "/app/sign-in") return;
    const next = (url.searchParams.get("next") || "").trim();
    if (!next) return;
    if (isAllowlistedInternalPath(next)) return;
    url.searchParams.delete("next");
    const nextSearch = url.searchParams.toString();
    window.history.replaceState(window.history.state, "", `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

export function stripSensitiveAuthCallbackUrl(): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of SENSITIVE_CALLBACK_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    const next = (url.searchParams.get("next") || "").trim();
    if (next && !isAllowlistedInternalPath(next)) {
      url.searchParams.delete("next");
      changed = true;
    }
    if (!changed) return;
    const nextSearch = url.searchParams.toString();
    const clean = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState(window.history.state, "", clean);
  } catch {
    /* ignore */
  }
}
