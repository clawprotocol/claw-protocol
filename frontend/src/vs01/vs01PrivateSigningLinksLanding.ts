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
 * #139 closed the in-wizard navigate. Remount / hard refresh of an already
 * packet-ready URL still boots the owner list — see
 * `FIRST_FAILING_PACKET_READY_REMOUNT_PREDICATE`.
 *
 * Last-good surface after Prepare: `/app/esign/{doc_*}`
 * (AppEsignDocumentShell / Vs01CanonicalSigningPage). `/app/create` plus
 * Retry Pro draft / intake quiz is not a packet-ready substitute.
 */

import { readCreateReviewAgreementResumeId, writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";
import { readAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH,
  paidProPacketReadyDashboardPath,
} from "./vs01PaidProPacketReadyNavigation";
import {
  readActivePaidProVs01PostSignHandoff,
  readLatestLocalPaidProVs01PostSignHandoff,
  readPaidProVs01PostSignHandoff,
} from "./vs01PaidProPostSignHandoff";

export const FIRST_FAILING_PREPARE_LANDING_PREDICATE =
  "completeBridgePreparePacket_navigates_vs01_packet_ready_dashboard" as const;

/** App boot of `/app?vs01_packet_ready=1` is still `matchAppPath` → owner dashboard list. */
export const FIRST_FAILING_PACKET_READY_REMOUNT_PREDICATE =
  "vs01_packet_ready_boot_lands_owner_dashboard" as const;

export const PRIVATE_SIGNING_LINKS_STAY_REASON = "stay_on_private_signing_links" as const;
export const PACKET_READY_MUST_NOT_WIN_REASON = "packet_ready_must_not_win_over_links_surface" as const;
export const PACKET_READY_MUST_OPEN_ESIGN_DOC_ROUTE =
  "packet_ready_must_open_esign_doc_route" as const;
export const RECIPIENT_ACCESS_TOKEN_409_STAY_REASON = "recipient_access_token_409_stay" as const;

export type PostPrepareBuyerSurface = {
  stayOnPrivateLinks: boolean;
  /** Null means remain on the current private-links / prepare-signatures route. */
  navigateTo: string | null;
  reason:
    | typeof PRIVATE_SIGNING_LINKS_STAY_REASON
    | typeof PACKET_READY_MUST_NOT_WIN_REASON
    | typeof PACKET_READY_MUST_OPEN_ESIGN_DOC_ROUTE
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

/** Packet-ready success is `/app/esign/doc_*` only — never `/app/create` or `/app/esign` without an id. */
export function isPacketReadyDocRoute(path: string): boolean {
  return /^\/app\/esign\/doc_[A-Za-z0-9._-]+$/.test(pathnameOf(path));
}

export function packetReadyDocRouteOrNull(documentId: string): string | null {
  const did = documentId.trim();
  if (!did.startsWith("doc_")) return null;
  return `/app/esign/${encodeURIComponent(did)}`;
}

/**
 * True when this landing claims packet-ready (has a `doc_*`) but does not open that route.
 * Tests must fail this predicate.
 */
export function packetReadyWithoutDocRoute(args: {
  documentId: string;
  currentPath: string;
  navigateTo: string | null;
}): boolean {
  const dest = packetReadyDocRouteOrNull(args.documentId);
  if (!dest) return false;
  const resolved = (args.navigateTo || "").trim() || args.currentPath;
  return !isPacketReadyDocRoute(resolved);
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
  void args.createReviewLinksSurfaceActive;
  const docRoute = packetReadyDocRouteOrNull(args.documentId);
  const alreadyOnThisDoc = Boolean(docRoute && pathnameOf(args.currentPath) === pathnameOf(docRoute));
  const onPrivateLinks = isPrivateSigningLinksRoute(args.currentPath);

  if (args.recipientAccessTokenStatus === 409) {
    if (alreadyOnThisDoc || (onPrivateLinks && !docRoute)) {
      return {
        stayOnPrivateLinks: true,
        navigateTo: null,
        reason: RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
        step: 3,
      };
    }
    return {
      stayOnPrivateLinks: true,
      navigateTo: docRoute,
      reason: RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
      step: 3,
    };
  }

  if (args.seedOk && docRoute) {
    if (alreadyOnThisDoc) {
      return {
        stayOnPrivateLinks: true,
        navigateTo: null,
        reason: args.packetReadyQuery
          ? PACKET_READY_MUST_NOT_WIN_REASON
          : PRIVATE_SIGNING_LINKS_STAY_REASON,
        step: 3,
      };
    }
    return {
      stayOnPrivateLinks: true,
      navigateTo: docRoute,
      reason: PACKET_READY_MUST_OPEN_ESIGN_DOC_ROUTE,
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

/** Boot / remount / hard refresh must never treat `vs01_packet_ready` as the list. */
export function shouldHonorPacketReadyAsDashboardLanding(): boolean {
  return false;
}

export const PAID_PRO_CREATE_REVIEW_PATH = "/app/create" as const;
export const PACKET_READY_REMOUNT_REWRITE_REASON = "rewrite_packet_ready_dashboard_to_create_review" as const;
export const PACKET_READY_REMOUNT_STAY_CREATE_REASON = "paid_return_create_stays_off_dashboard" as const;
export const PACKET_READY_REMOUNT_OPEN_ESIGN_DOC_REASON =
  "packet_ready_remount_opens_esign_doc_route" as const;

export type PacketReadyRemountLanding = {
  stayOffDashboard: true;
  /** Null means remain on the current create/review or esign route. */
  navigateTo: string | null;
  reason:
    | typeof PACKET_READY_REMOUNT_REWRITE_REASON
    | typeof PACKET_READY_REMOUNT_STAY_CREATE_REASON
    | typeof PACKET_READY_REMOUNT_OPEN_ESIGN_DOC_REASON
    | typeof PRIVATE_SIGNING_LINKS_STAY_REASON
    | typeof RECIPIENT_ACCESS_TOKEN_409_STAY_REASON;
};

export function isPaidProCreateReviewPath(path: string): boolean {
  const p = pathnameOf(path);
  return p === "/app/create" || p.startsWith("/app/create/");
}

export function packetReadyQueryFromSearch(search: string): boolean {
  try {
    const raw = (search || "").trim();
    const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    return q.get("vs01_packet_ready") === "1";
  } catch {
    return false;
  }
}

export type PacketReadyRemountContext = {
  agreementId: string;
  documentId: string;
};

/**
 * Active persist for a packet-ready remount. Session handoff, create-resume,
 * VS01 bridge, then newest local handoff. Read-only — no draft POST.
 */
export function resolveActivePacketReadyRemountContext(): PacketReadyRemountContext | null {
  const session = readActivePaidProVs01PostSignHandoff();
  if (session?.agreementId?.trim()) {
    return {
      agreementId: session.agreementId.trim(),
      documentId: (session.vs01DocumentId || "").trim(),
    };
  }
  const resumeId = (readCreateReviewAgreementResumeId() || "").trim();
  if (resumeId) {
    const handoff = readPaidProVs01PostSignHandoff(resumeId);
    if (handoff) {
      return {
        agreementId: resumeId,
        documentId: (handoff.vs01DocumentId || "").trim(),
      };
    }
    const bridge = readAgreementVs01BridgeSession();
    if (bridge?.agreementId === resumeId) {
      return {
        agreementId: resumeId,
        documentId: (bridge.vs01DocumentId || "").trim(),
      };
    }
    return { agreementId: resumeId, documentId: "" };
  }
  const bridge = readAgreementVs01BridgeSession();
  if (bridge?.agreementId?.trim()) {
    return {
      agreementId: bridge.agreementId.trim(),
      documentId: (bridge.vs01DocumentId || "").trim(),
    };
  }
  const local = readLatestLocalPaidProVs01PostSignHandoff();
  if (local?.agreementId?.trim()) {
    return {
      agreementId: local.agreementId.trim(),
      documentId: (local.vs01DocumentId || "").trim(),
    };
  }
  return null;
}

/** Bind this persist so `/app/create` remount hydrates Review, not a blank create. */
export function bindPacketReadyRemountResume(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  writeCreateReviewAgreementResumeId(id);
}

/**
 * Hard refresh / remount of a signer-finalized or packet-prepared persist.
 * Never land on `/app` or `/app?vs01_packet_ready=1`.
 * A `doc_*` packet opens `/app/esign/{doc_*}` — `/app/create` is not a substitute.
 * Without a `doc_*`, create/review stays so leftover esign is not invented.
 */
export function resolvePacketReadyRemountLanding(args: {
  currentPath: string;
  documentId?: string;
  packetPrepared?: boolean;
  recipientAccessTokenStatus?: number | null;
}): PacketReadyRemountLanding {
  void args.packetPrepared;
  const docRoute = packetReadyDocRouteOrNull(args.documentId ?? "");
  const alreadyOnThisDoc = Boolean(docRoute && pathnameOf(args.currentPath) === pathnameOf(docRoute));
  const onPrivateLinks = isPrivateSigningLinksRoute(args.currentPath);
  const onCreateReview =
    isCreateReviewLinksSurface(args.currentPath) || isPaidProCreateReviewPath(args.currentPath);

  if (args.recipientAccessTokenStatus === 409) {
    if (alreadyOnThisDoc || onPrivateLinks) {
      return {
        stayOffDashboard: true,
        navigateTo: null,
        reason: RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
      };
    }
    return {
      stayOffDashboard: true,
      navigateTo: docRoute ?? (onCreateReview ? null : PAID_PRO_CREATE_REVIEW_PATH),
      reason: RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
    };
  }

  if (alreadyOnThisDoc) {
    return {
      stayOffDashboard: true,
      navigateTo: null,
      reason: PRIVATE_SIGNING_LINKS_STAY_REASON,
    };
  }

  if (docRoute) {
    return {
      stayOffDashboard: true,
      navigateTo: docRoute,
      reason: PACKET_READY_REMOUNT_OPEN_ESIGN_DOC_REASON,
    };
  }

  if (onPrivateLinks) {
    return {
      stayOffDashboard: true,
      navigateTo: null,
      reason: PRIVATE_SIGNING_LINKS_STAY_REASON,
    };
  }

  if (onCreateReview) {
    return {
      stayOffDashboard: true,
      navigateTo: null,
      reason: PACKET_READY_REMOUNT_STAY_CREATE_REASON,
    };
  }

  return {
    stayOffDashboard: true,
    navigateTo: PAID_PRO_CREATE_REVIEW_PATH,
    reason: PACKET_READY_REMOUNT_REWRITE_REASON,
  };
}
