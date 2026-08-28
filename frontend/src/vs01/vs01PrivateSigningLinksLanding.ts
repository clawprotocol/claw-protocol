/**
 * Remount Prepare → seed 200 must stay on the private signing-links surface.
 *
 * First failing predicate after #138 (empty-bar / rebuilt-corpus closed):
 * `completeBridgePreparePacket` treated packet-ready as
 * `paidProPacketReadyDashboardPath()` (`/app?vs01_packet_ready=1`).
 * Auto-continue after field placement then ejected the buyer to the dashboard
 * list ("Waiting for signatures"), including when `recipient-access-token`
 * returned 409 (`signing_not_finalized_server_side`).
 *
 * Last-good surface: `/app/esign/:documentId` StepSigningPacketStatus
 * (per-signer private links, nothing emailed).
 */

import {
  PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH,
  paidProPacketReadyDashboardPath,
} from "./vs01PaidProPacketReadyNavigation";

export const FIRST_FAILING_PREPARE_LANDING_PREDICATE =
  "completeBridgePreparePacket_navigates_vs01_packet_ready_dashboard" as const;

export const PRIVATE_SIGNING_LINKS_STAY_REASON = "stay_on_private_signing_links" as const;
export const PACKET_READY_MUST_NOT_WIN_REASON = "packet_ready_must_not_win_over_links_surface" as const;
export const RECIPIENT_ACCESS_TOKEN_409_STAY_REASON = "recipient_access_token_409_stay" as const;

export type PostPrepareBuyerSurface = {
  stayOnPrivateLinks: boolean;
  /** Null means remain on the current private-links / prepare-signatures route. */
  navigateTo: string | null;
  reason:
    | typeof PRIVATE_SIGNING_LINKS_STAY_REASON
    | typeof PACKET_READY_MUST_NOT_WIN_REASON
    | typeof RECIPIENT_ACCESS_TOKEN_409_STAY_REASON;
  step: 3;
};

function pathnameOf(path: string): string {
  const raw = (path || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, "https://lawdog.local").pathname;
  } catch {
    return raw.split("?")[0] || "";
  }
}

export function isPaidProPacketReadyDashboardPath(path: string): boolean {
  const raw = (path || "").trim();
  if (!raw) return false;
  if (raw === PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH) return true;
  if (raw === paidProPacketReadyDashboardPath()) return true;
  try {
    const u = new URL(raw, "https://lawdog.local");
    const onApp = u.pathname === "/app" || u.pathname === "/app/";
    return onApp && u.searchParams.get("vs01_packet_ready") === "1";
  } catch {
    return /(?:\?|&)vs01_packet_ready=1(?:&|$)/.test(raw) && pathnameOf(raw) === "/app";
  }
}

export function isPrivateSigningLinksRoute(path: string): boolean {
  return pathnameOf(path).includes("/app/esign/");
}

export function isCreateReviewLinksSurface(path: string, createReviewLinksSurfaceActive?: boolean): boolean {
  if (createReviewLinksSurfaceActive) return true;
  const p = pathnameOf(path);
  return p.startsWith("/app/create") || p.startsWith("/app/agreements/");
}

export function privateSigningLinksRoute(documentId: string): string {
  const did = documentId.trim();
  return did ? `/app/esign/${encodeURIComponent(did)}` : "/app/esign";
}

/**
 * After remount Prepare + vs01-signing-seed 200, never land on
 * `/app?vs01_packet_ready=1`. A 409 on recipient-access-token is not an eject.
 * `vs01_packet_ready` must not win over an already-open create/review or esign
 * links surface.
 */
export function resolvePostPrepareBuyerSurface(args: {
  seedOk: boolean;
  documentId: string;
  currentPath: string;
  packetReadyQuery?: boolean;
  recipientAccessTokenStatus?: number | null;
  createReviewLinksSurfaceActive?: boolean;
}): PostPrepareBuyerSurface {
  const onPrivateLinks = isPrivateSigningLinksRoute(args.currentPath);
  const onCreateReview = isCreateReviewLinksSurface(
    args.currentPath,
    args.createReviewLinksSurfaceActive,
  );
  const linksSurfaceActive = onPrivateLinks || onCreateReview;

  if (args.recipientAccessTokenStatus === 409) {
    return {
      stayOnPrivateLinks: true,
      navigateTo: onPrivateLinks || onCreateReview ? null : privateSigningLinksRoute(args.documentId),
      reason: RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
      step: 3,
    };
  }

  if (args.packetReadyQuery && linksSurfaceActive) {
    return {
      stayOnPrivateLinks: true,
      navigateTo: null,
      reason: PACKET_READY_MUST_NOT_WIN_REASON,
      step: 3,
    };
  }

  if (args.seedOk && !onPrivateLinks && !onCreateReview) {
    return {
      stayOnPrivateLinks: true,
      navigateTo: privateSigningLinksRoute(args.documentId),
      reason: PRIVATE_SIGNING_LINKS_STAY_REASON,
      step: 3,
    };
  }

  return {
    stayOnPrivateLinks: true,
    navigateTo: null,
    reason: PRIVATE_SIGNING_LINKS_STAY_REASON,
    step: 3,
  };
}

/** Auto-success after Prepare must never choose the dashboard list. */
export function shouldNavigateToPacketReadyDashboardAfterPrepare(): boolean {
  return false;
}
