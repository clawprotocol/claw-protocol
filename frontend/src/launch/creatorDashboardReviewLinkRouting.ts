import { resolveAllReviewPartiesApproved } from "../agreement/recipientApprovedWaitingPresentation";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import {
  isReviewDeliveryModeExplicitlyManual,
  readReviewDeliveryMode,
  type ReviewDeliveryMode,
} from "./simpleProduct/reviewDeliveryConfig";

/** @deprecated Pre-signature review tracking uses dashboard focus; retained for env diagnostics only. */
export function creatorDashboardUsesManualReviewLinkPage(
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  void mode;
  return isReviewDeliveryModeExplicitlyManual();
}

/** Completed / signed agreement proof surface (legacy route). */
export function creatorDashboardCompletedProofPath(agreementId: string): string {
  return `/app/done/${encodeURIComponent(agreementId.trim())}`;
}

/** Owner read-only signed agreement + proof metadata (dashboard Open / completed view). */
export function creatorDashboardSignedAgreementViewPath(agreementId: string): string {
  return `/app/agreements/${encodeURIComponent(agreementId.trim())}/view-signed`;
}

/** Owner VS01 signing progress — per-signer status cards (not legacy /app/send). */
export function creatorDashboardSigningStatusPath(agreementId: string): string {
  return `/app/signing-status/${encodeURIComponent(agreementId.trim())}`;
}

/** @deprecated Use creatorDashboardCompletedProofPath for signed proof only. */
export function creatorDashboardReviewLinkReadyPath(agreementId: string): string {
  return creatorDashboardCompletedProofPath(agreementId);
}

/** In-app focus target for dashboard review status (scroll, no obsolete done page). */
export function creatorDashboardFocusAgreementPath(agreementId: string): string {
  return `/app?focus=${encodeURIComponent(agreementId.trim())}`;
}

/** Deep link for owner review-complete email and legacy /app/done bookmarks — same handoff as dashboard CTA. */
export function creatorDashboardPrepareSignatureLinksPath(agreementId: string): string {
  return `/app?prepare_signature_links=${encodeURIComponent(agreementId.trim())}`;
}

/**
 * Resume create + inline signer setup for incomplete signer metadata.
 * Prefer {@link prepareCreatorDashboardSignerSetupNavigation} before navigate so resume id + latch arm.
 */
export function creatorDashboardSignerSetupPath(agreementId: string): string {
  const id = encodeURIComponent(agreementId.trim());
  return `/app/create?resume_signer_setup=${id}`;
}

/** LaunchNav / paid-create context source — not a fresh dashboard create. */
export const DASHBOARD_SIGNER_SETUP_RESUME_SOURCE = "dashboard_signer_setup_resume" as const;

const DASHBOARD_RESUME_SIGNER_SETUP_SS_KEY = "claw_dashboard_resume_signer_setup_v1";

export function parseResumeSignerSetupAgreementIdFromSearch(
  search?: string | null,
): string {
  try {
    const raw = (search ?? (typeof window !== "undefined" ? window.location.search : "")).trim();
    const qs = raw.startsWith("?") ? raw.slice(1) : raw;
    return (new URLSearchParams(qs).get("resume_signer_setup") || "").trim();
  } catch {
    return "";
  }
}

export function parseResumeSignerSetupAgreementIdFromPath(path: string): string {
  try {
    return (new URL(path, "http://localhost").searchParams.get("resume_signer_setup") || "").trim();
  } catch {
    return "";
  }
}

/** True while dashboard Complete signer details resume is armed (URL and/or session). */
export function isCreatorDashboardSignerSetupResumeActive(search?: string | null): boolean {
  if (parseResumeSignerSetupAgreementIdFromSearch(search)) return true;
  return Boolean(peekCreatorDashboardSignerSetupResume());
}

/**
 * Render/recovery authority for dashboard signer-setup resume.
 * True while URL/session resume is armed, or while intake has latched signer_setup_required.
 */
export function isDashboardSignerSetupResumeUiActive(args: {
  openSignerSetupOnResume?: boolean;
  createFlowPhase?: string | null;
  paidProInlineSignerSetupLatched?: boolean;
  search?: string | null;
}): boolean {
  if (args.openSignerSetupOnResume) return true;
  if (isCreatorDashboardSignerSetupResumeActive(args.search)) return true;
  return (
    args.createFlowPhase === "signer_setup_required" &&
    Boolean(args.paidProInlineSignerSetupLatched)
  );
}

/** Write create-resume id and arm one-shot inline signer-setup latch for `/app/create`. */
export function prepareCreatorDashboardSignerSetupNavigation(agreementId: string): string {
  const id = agreementId.trim();
  if (!id) return "/app/create";
  writeCreateReviewAgreementResumeId(id);
  armCreatorDashboardSignerSetupResume(id);
  return creatorDashboardSignerSetupPath(id);
}

/** Consume one-shot dashboard → create signer-setup arm (null if not armed). */
export function consumeCreatorDashboardSignerSetupResume(): string | null {
  try {
    const id = (sessionStorage.getItem(DASHBOARD_RESUME_SIGNER_SETUP_SS_KEY) || "").trim();
    sessionStorage.removeItem(DASHBOARD_RESUME_SIGNER_SETUP_SS_KEY);
    return id || null;
  } catch {
    return null;
  }
}

/** Peek without consuming — used when URL `resume_signer_setup` also arms the latch. */
export function peekCreatorDashboardSignerSetupResume(): string | null {
  try {
    return (sessionStorage.getItem(DASHBOARD_RESUME_SIGNER_SETUP_SS_KEY) || "").trim() || null;
  } catch {
    return null;
  }
}

export function armCreatorDashboardSignerSetupResume(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(DASHBOARD_RESUME_SIGNER_SETUP_SS_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Strip resume_signer_setup only after signer setup has been armed on create. */
export function stripResumeSignerSetupQueryFromCreateUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    if (!url.pathname.replace(/\/$/, "").endsWith("/app/create")) return null;
    if (!url.searchParams.has("resume_signer_setup")) return null;
    url.searchParams.delete("resume_signer_setup");
    const qs = url.searchParams.toString();
    const next = qs ? `${url.pathname}?${qs}` : url.pathname;
    window.history.replaceState(window.history.state, "", next);
    return next;
  } catch {
    return null;
  }
}

export function normalizeAppDashboardPathname(pathname?: string | null): string {
  const raw = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  return raw.replace(/\/$/, "") || "/";
}

export function isAppDashboardPathname(pathname?: string | null): boolean {
  return normalizeAppDashboardPathname(pathname) === "/app";
}

/**
 * Strip prepare_signature_links only while the browser is still on /app.
 * Call before VS01 bridge navigation — never after a successful /app/esign handoff.
 */
export function stripPrepareSignatureLinksQueryFromDashboardUrl(): string | null {
  if (typeof window === "undefined") return null;
  if (!isAppDashboardPathname()) return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("prepare_signature_links")) return null;
  params.delete("prepare_signature_links");
  const nextSearch = params.toString();
  const cleanPath = nextSearch ? `/app?${nextSearch}` : "/app";
  window.history.replaceState(window.history.state, "", cleanPath);
  return cleanPath;
}

/** Legacy /app/done/:id bookmark — all reviews approved, unsigned → canonical signature-prep handoff. */
export function shouldRedirectLegacyDoneToPrepareSignatureLinks(args: {
  signed: boolean | null;
  draft: AgreementDraft | null | undefined;
  confirmedSend?: boolean;
  mode?: ReviewDeliveryMode;
}): boolean {
  void args.confirmedSend;
  void args.mode;
  if (args.signed === true) return false;
  if (!args.draft) return false;
  return resolveAllReviewPartiesApproved(args.draft);
}
