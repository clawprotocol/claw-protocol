/**
 * Completed-agreement surface context — dashboard CTAs only on authenticated owner/workspace views.
 */

import { getCachedAccessToken } from "../auth/authAccessTokenCache";
import { getOrgId } from "./orgContext";

export type CompletedAgreementSurface =
  | "owner_workspace_view_signed"
  | "public_recipient_completed_link"
  | "signer_completion_public"
  | "pdf_download_trigger";

export type CompletedAgreementViewContext = {
  agreementId: string;
  pathname: string;
  surface: CompletedAgreementSurface;
  hasAuthSession: boolean;
  hasWorkspaceSession: boolean;
};

const WORKSPACE_SESSION_KEY = "claw_authenticated_workspace_session";

function normalizePath(pathname: string): string {
  return (pathname || "").replace(/\/$/, "") || "/";
}

export function markAuthenticatedWorkspaceSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(WORKSPACE_SESSION_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

export function clearAuthenticatedWorkspaceSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(WORKSPACE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function readAuthenticatedWorkspaceSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(WORKSPACE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * In-app workspace navigation marker plus a bound signed-in identity (user-* org or Supabase token).
 * Anonymous homepage → /app/create marks the session but must not satisfy this probe.
 */
export function readSignedInAuthenticatedWorkspaceSession(): boolean {
  if (!readAuthenticatedWorkspaceSession()) return false;
  const oid = getOrgId().trim();
  if (oid.startsWith("user-")) return true;
  return Boolean(getCachedAccessToken().trim());
}

/** Paths that imply an in-app workspace navigation (not a cold public deep link). */
export function shouldMarkWorkspaceSessionForPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p === "/app" || p === "/dashboard") return true;
  if (p === "/app/create" || p === "/app/quick") return true;
  if (p.startsWith("/app/agreements")) {
    if (/\/view-signed$/.test(p)) return false;
    return true;
  }
  if (p.startsWith("/app/signing-status/")) return true;
  if (p.startsWith("/app/send/") || p.startsWith("/app/done/") || p.startsWith("/app/ready/")) {
    return true;
  }
  if (p.startsWith("/app/review-changes/")) return true;
  if (p.startsWith("/app/billing") || p.startsWith("/app/settings") || p.startsWith("/app/signatures")) {
    return true;
  }
  if (p === "/founder" || p === "/admin" || p === "/app/founder" || p === "/app/admin") return true;
  if (/^\/app\/esign\//.test(p)) return false;
  return false;
}

export function extractAgreementIdFromViewSignedPath(pathname: string): string {
  const p = normalizePath(pathname);
  const m = /^\/app\/agreements\/([^/]+)\/view-signed$/.exec(p);
  return m ? decodeURIComponent(m[1]!) : "";
}

export function isOwnerSignedAgreementViewPath(pathname: string): boolean {
  return Boolean(extractAgreementIdFromViewSignedPath(pathname));
}

export function isRecipientSigningPublicSurface(pathname: string, search = ""): boolean {
  const p = normalizePath(pathname);
  if (!/^\/app\/esign\/[^/]+$/.test(p) || p === "/app/esign/new") return false;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("vs01_recipient_sign") === "1";
}

export function isAuthenticatedWorkspaceView(args: {
  hasAuthSession: boolean;
  hasWorkspaceSession: boolean;
}): boolean {
  if (args.hasAuthSession) return true;
  return args.hasWorkspaceSession;
}

export function resolveCompletedAgreementViewContext(args: {
  pathname: string;
  search?: string;
  hasAuthSession?: boolean;
  hasWorkspaceSession?: boolean;
  recipientSigningDone?: boolean;
  agreementId?: string;
}): CompletedAgreementViewContext {
  const pathname = normalizePath(args.pathname);
  const search = args.search ?? "";
  const hasAuthSession = args.hasAuthSession ?? false;
  const hasWorkspaceSession = args.hasWorkspaceSession ?? readAuthenticatedWorkspaceSession();
  const agreementId =
    (args.agreementId ?? "").trim() || extractAgreementIdFromViewSignedPath(pathname);

  let surface: CompletedAgreementSurface;
  if (args.recipientSigningDone || isRecipientSigningPublicSurface(pathname, search)) {
    surface = "signer_completion_public";
  } else if (isOwnerSignedAgreementViewPath(pathname)) {
    surface = isAuthenticatedWorkspaceView({ hasAuthSession, hasWorkspaceSession })
      ? "owner_workspace_view_signed"
      : "public_recipient_completed_link";
  } else {
    surface = "pdf_download_trigger";
  }

  return {
    agreementId,
    pathname,
    surface,
    hasAuthSession,
    hasWorkspaceSession,
  };
}

export function shouldShowBackToDashboard(ctx: CompletedAgreementViewContext): boolean {
  return (
    ctx.surface === "owner_workspace_view_signed" &&
    isAuthenticatedWorkspaceView({
      hasAuthSession: ctx.hasAuthSession,
      hasWorkspaceSession: ctx.hasWorkspaceSession,
    })
  );
}
