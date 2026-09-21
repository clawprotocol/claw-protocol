/**
 * Compatibility aliases ``/app/esign`` and ``/app/esign/new`` only.
 * Do not canonicalize ``/app/esign/:documentId`` (Phase 4B.4 dual-mode).
 */
import {
  APPROVED_QUICK_ATTRIBUTION_KEYS,
  QUICK_PDF_RETURN_PATH,
} from "./quickPdfReturnAuthority";

const ALIAS_PATHS = new Set(["/app/esign", "/app/esign/new"]);

export function isEsignNewAliasPath(pathname: string): boolean {
  const p = (pathname || "").replace(/\/+$/, "") || "/";
  return ALIAS_PATHS.has(p);
}

export function canonicalizeEsignNewAliasSearch(search: string): string {
  const raw = (search || "").startsWith("?") ? search.slice(1) : search || "";
  const incoming = new URLSearchParams(raw);
  const out = new URLSearchParams();
  out.set("start", "pdf");
  for (const key of APPROVED_QUICK_ATTRIBUTION_KEYS) {
    const value = (incoming.get(key) || "").trim();
    if (!value) continue;
    if (/[\u0000-\u001F\u007F]/.test(value) || value.includes("://") || value.includes("\\")) {
      continue;
    }
    out.set(key, value);
  }
  return `?${out.toString()}`;
}

export function canonicalizeEsignNewAliasPath(pathname: string, search = ""): string | null {
  if (!isEsignNewAliasPath(pathname)) return null;
  const qs = canonicalizeEsignNewAliasSearch(search);
  return qs === "?start=pdf" ? QUICK_PDF_RETURN_PATH : `/app/quick${qs}`;
}
