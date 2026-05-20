/**
 * Genesis Referral Access — global ?ref= capture, visitor_id, localStorage + cookie.
 */

import { logProductEvent } from "../../lib/experimentation/productEvents";

const REFERRAL_CODE_KEY = "claw_genesis_referral_code";
const VISITOR_ID_KEY = "claw_genesis_visitor_id";
const REFERRAL_COOKIE = "claw_genesis_ref";
const VISITOR_COOKIE = "claw_genesis_vid";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

export function normalizeGenesisReferralCode(raw: string | null | undefined): string | null {
  const code = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 64);
  return code || null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((c) => c.trim());
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      try {
        return decodeURIComponent(p.slice(prefix.length));
      } catch {
        return p.slice(prefix.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

export function getOrCreateGenesisVisitorId(): string {
  if (typeof localStorage === "undefined") {
    return `vis_${Date.now().toString(36)}`;
  }
  try {
    const fromCookie = readCookie(VISITOR_COOKIE);
    if (fromCookie && fromCookie.length >= 8) {
      localStorage.setItem(VISITOR_ID_KEY, fromCookie);
      return fromCookie;
    }
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.length >= 8) {
      writeCookie(VISITOR_COOKIE, existing);
      return existing;
    }
    const id = `vis_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(VISITOR_ID_KEY, id);
    writeCookie(VISITOR_COOKIE, id);
    return id;
  } catch {
    return `vis_${Date.now().toString(36)}`;
  }
}

export function getGenesisReferralCode(): string | null {
  if (typeof localStorage !== "undefined") {
    try {
      const ls = normalizeGenesisReferralCode(localStorage.getItem(REFERRAL_CODE_KEY));
      if (ls) return ls;
    } catch {
      /* ignore */
    }
  }
  return normalizeGenesisReferralCode(readCookie(REFERRAL_COOKIE));
}

export function rememberGenesisReferralCode(codeRaw: string | null | undefined): string | null {
  const code = normalizeGenesisReferralCode(codeRaw);
  if (!code) return null;
  try {
    localStorage.setItem(REFERRAL_CODE_KEY, code);
  } catch {
    /* ignore */
  }
  writeCookie(REFERRAL_COOKIE, code);
  return code;
}

export function captureGenesisReferralFromSearch(search: string, sourcePath?: string): string | null {
  try {
    const q = new URLSearchParams(search || "");
    const ref = normalizeGenesisReferralCode(q.get("ref"));
    if (!ref) return null;
    const prev = getGenesisReferralCode();
    rememberGenesisReferralCode(ref);
    getOrCreateGenesisVisitorId();
    if (prev !== ref) {
      logProductEvent("referral_code_captured", {
        referral_code: ref,
        source_path: sourcePath ?? (typeof window !== "undefined" ? window.location.pathname : ""),
      });
    }
    return ref;
  } catch {
    return null;
  }
}

export type GenesisReferralCheckoutPayload = {
  referral_code: string | null;
  visitor_id: string;
};

export function getGenesisReferralCheckoutPayload(): GenesisReferralCheckoutPayload {
  return {
    referral_code: getGenesisReferralCode(),
    visitor_id: getOrCreateGenesisVisitorId(),
  };
}

export function buildGenesisReferralLink(code: string, origin?: string): string {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const c = normalizeGenesisReferralCode(code) || "CODE";
  return `${base}/app/create?ref=${encodeURIComponent(c)}`;
}
