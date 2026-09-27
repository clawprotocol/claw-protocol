/**
 * Router-aware post-auth destinations. Prefix matching is not authority.
 * Browser `next` is a fallback only after server continuation is absent or invalid.
 */

import { matchAppRoute } from "../launch/routes";
import {
  APPROVED_QUICK_ATTRIBUTION_KEYS,
  QUICK_PDF_RETURN_PATH,
} from "../launch/quickPdfReturnAuthority";
import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  sanitizeConversionCheckoutDest,
  sanitizeConversionCheckoutReturnTo,
} from "../launch/checkoutParams";
import type { AuthContinuationContextV1 } from "./authContinuationContext";
import {
  pinCheckoutPathToPreAuthAgreement,
  readKnownConversionAgreementId,
  rememberPreAuthCheckoutAgreementId,
} from "./preAuthCheckoutAgreement";

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

function quickPdfQueryIsApproved(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return false;
  }
  const starts = params.getAll("start").map((v) => v.trim().toLowerCase());
  if (starts.length === 0 || starts.some((v) => v !== "pdf")) return false;
  for (const [key, value] of params.entries()) {
    const k = key.trim().toLowerCase();
    if (k === "start") continue;
    if (
      !k ||
      FORBIDDEN_QUERY_KEYS.has(k) ||
      !(APPROVED_QUICK_ATTRIBUTION_KEYS as readonly string[]).includes(k)
    ) {
      return false;
    }
    if (CONTROL_CHARS.test(value) || value.includes("\\") || value.includes("://")) return false;
  }
  return true;
}

export function canonicalizeQuickPdfReturn(path: string): string {
  const parsed = parseInternalCandidate(path);
  if (!parsed) return QUICK_PDF_RETURN_PATH;
  const raw = parsed.search.startsWith("?") ? parsed.search.slice(1) : parsed.search;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return QUICK_PDF_RETURN_PATH;
  }
  const kept: string[] = ["start=pdf"];
  const seen = new Set<string>();
  for (const key of APPROVED_QUICK_ATTRIBUTION_KEYS) {
    const value = (params.get(key) || "").trim();
    if (!value || seen.has(key)) continue;
    if (CONTROL_CHARS.test(value) || value.includes("\\") || value.includes("://")) continue;
    seen.add(key);
    kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return kept.length === 1 ? QUICK_PDF_RETURN_PATH : `/app/quick?${kept.join("&")}`;
}

/** Server continuation may return here. Browser ``next`` must not. */
export function isApprovedServerQuickPdfReturn(path: string): boolean {
  const parsed = parseInternalCandidate(path);
  if (!parsed || parsed.pathname !== "/app/quick") return false;
  return quickPdfQueryIsApproved(parsed.search);
}

export function resolveServerAuthDestination(
  candidate: string | null | undefined,
  fallback = "/app",
): string {
  const c = (candidate || "").trim();
  if (c && isApprovedServerQuickPdfReturn(c)) return canonicalizeQuickPdfReturn(c);
  if (c && isAllowlistedInternalPath(c)) return canonicalizeInternalPath(c);
  return fallback;
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
  const server = resolveServerAuthDestination(args.serverDestination, "");
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

/** Real checkout agreement id — never the create-flow sentinel. */
export function extractAgreementIdFromCheckoutPath(path: string): string | null {
  const raw = (path || "").trim();
  const noQuery = raw.split("?")[0] || "";
  const prefix = "/app/checkout/";
  if (!noQuery.startsWith(prefix)) return null;
  let id = noQuery.slice(prefix.length).split("/")[0] || "";
  try {
    id = decodeURIComponent(id).trim();
  } catch {
    id = id.trim();
  }
  if (!id || id === CREATE_FLOW_CHECKOUT_AGREEMENT_ID) return null;
  return id;
}

export type SignInContinuationOpts = {
  returningSignIn: boolean;
  destinationPath: string;
  agreementId?: string;
};

/**
 * Homepage / dashboard sign-in stays returning.
 * Checkout continuation is a claim: keep the pre-auth agreement through Google.
 */
export function resolveSignInContinuationOpts(destinationPath: string): SignInContinuationOpts {
  const dest = (destinationPath || "/app").trim() || "/app";
  const checkout = isSecureCheckoutPath(dest);
  const fromPath = extractAgreementIdFromCheckoutPath(dest) ?? undefined;
  if (fromPath) rememberPreAuthCheckoutAgreementId(fromPath);
  const agreementId = checkout
    ? readKnownConversionAgreementId() || fromPath || undefined
    : fromPath;
  const pinned = agreementId ? pinCheckoutPathToPreAuthAgreement(dest, agreementId) : dest;
  const destinationPathOut = sanitizeConversionCheckoutDest({
    dest: pinned,
    persistAgreementId: agreementId,
  });
  return {
    returningSignIn: !checkout,
    destinationPath: destinationPathOut,
    ...(agreementId ? { agreementId } : {}),
  };
}

export function buildSignInContinuationPath(pathname: string, search = ""): string {
  const dest = `${(pathname || "").trim()}${(search || "").trim()}`;
  const persist = extractAgreementIdFromCheckoutPath(dest) ?? readKnownConversionAgreementId();
  const sanitized = sanitizeConversionCheckoutDest({
    dest,
    persistAgreementId: persist,
  });
  const safe = resolveSafeRedirectPath(sanitized, "/app");
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
  const aid = (ctx.agreementId || "").trim();
  if (aid && dest.startsWith("/app/create") && !dest.includes("agreementId=")) {
    const cleaned = sanitizeConversionCheckoutReturnTo({
      returnTo: dest,
      persistAgreementId: aid,
    });
    const sep = cleaned.includes("?") ? "&" : "?";
    return `${cleaned}${sep}agreementId=${encodeURIComponent(aid)}`;
  }
  if (aid && aid !== CREATE_FLOW_CHECKOUT_AGREEMENT_ID && dest.startsWith("/app/checkout/")) {
    rememberPreAuthCheckoutAgreementId(aid);
    return sanitizeConversionCheckoutDest({
      dest: pinCheckoutPathToPreAuthAgreement(dest, aid),
      persistAgreementId: aid,
    });
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

export function stripSensitiveAuthCallbackUrl(opts?: { keepContinuationId?: boolean }): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of SENSITIVE_CALLBACK_KEYS) {
      if (opts?.keepContinuationId && key === "continuation_id") continue;
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
