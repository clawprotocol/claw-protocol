/**
 * Shared dashboard-reopen / resume authority.
 *
 * A paid owner reopening an agreement recovers the exact durable ID and
 * verified server document. Module state, browser storage, a pinned local
 * corpus, or a pipeline session body cannot authorize resume paper.
 */

import {
  hasVerifiedCommercialDisplayCorpus,
  readVerifiedCommercialDisplayCorpus,
  canEnableCommercialPrepareFromServerSnapshot,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  isCreatorDashboardSignerSetupResumeActive,
  parseResumeSignerSetupAgreementIdFromSearch,
  peekCreatorDashboardSignerSetupResume,
} from "../../launch/creatorDashboardReviewLinkRouting";
import { readCreateReviewAgreementResumeId } from "./agreementIntakeStorage";
import { readOwnerDeliveryTrack, type OwnerDeliveryTrack } from "./paidProOwnerDeliveryTrack";

export type DashboardResumeAuthorityKind =
  | "verified_pending_snapshot"
  | "verified_accepted_snapshot"
  | "paid_retry"
  | "invalidated"
  | "none";

export type DashboardResumePaintResolution = {
  kind: DashboardResumeAuthorityKind;
  agreementId: string;
  plain: string;
  source: string;
  canPaintReview: boolean;
  canEnableCommercialActions: boolean;
};

function trimId(value?: string | null): string {
  return String(value || "").trim();
}

export function resolveDashboardResumeAgreementId(args?: {
  agreementId?: string | null;
  resumeAgreementId?: string | null;
  search?: string | null;
}): string {
  return (
    trimId(args?.agreementId) ||
    trimId(args?.resumeAgreementId) ||
    trimId(readCreateReviewAgreementResumeId()) ||
    trimId(isCreatorDashboardSignerSetupResumeActive(args?.search) ? readCreateReviewAgreementResumeId() : "")
  );
}

export function isDashboardResumeSurfaceActive(args?: {
  resumeActive?: boolean;
  search?: string | null;
  agreementId?: string | null;
}): boolean {
  if (args?.resumeActive) return true;
  const id = trimId(args?.agreementId);
  if (!id) return false;
  const resumeId =
    trimId(parseResumeSignerSetupAgreementIdFromSearch(args?.search)) ||
    trimId(peekCreatorDashboardSignerSetupResume()) ||
    trimId(readCreateReviewAgreementResumeId());
  return Boolean(resumeId && resumeId === id);
}

export function classifyDashboardResumeAuthority(args: {
  agreementId?: string | null;
  resumeAgreementId?: string | null;
  authenticatedOwner?: boolean;
  sessionOrgMatches?: boolean;
  logoutOrOrgSwitch?: boolean;
  resumeActive?: boolean;
  search?: string | null;
}): DashboardResumeAuthorityKind {
  if (args.logoutOrOrgSwitch) return "invalidated";
  if (args.authenticatedOwner === false) return "invalidated";
  if (args.sessionOrgMatches === false) return "invalidated";
  const id = resolveDashboardResumeAgreementId(args);
  const resumeId = trimId(args.resumeAgreementId) || trimId(readCreateReviewAgreementResumeId());
  if (id && resumeId && id !== resumeId) return "invalidated";
  if (!id) return isDashboardResumeSurfaceActive(args) ? "paid_retry" : "none";
  const verified = readVerifiedCommercialDisplayCorpus(id);
  if (!verified?.corpusPlain?.trim() || !hasVerifiedCommercialDisplayCorpus(id)) {
    return "paid_retry";
  }
  if (verified.status === "accepted" || canEnableCommercialPrepareFromServerSnapshot(id)) {
    return "verified_accepted_snapshot";
  }
  return "verified_pending_snapshot";
}

export function selectDashboardResumePaint(args: {
  agreementId?: string | null;
  resumeAgreementId?: string | null;
  authenticatedOwner?: boolean;
  sessionOrgMatches?: boolean;
  logoutOrOrgSwitch?: boolean;
  resumeActive?: boolean;
  search?: string | null;
}): DashboardResumePaintResolution {
  const agreementId = resolveDashboardResumeAgreementId(args);
  const kind = classifyDashboardResumeAuthority({ ...args, agreementId });
  if (kind === "invalidated") {
    return {
      kind,
      agreementId,
      plain: "",
      source: "dashboard_resume_invalidated",
      canPaintReview: false,
      canEnableCommercialActions: false,
    };
  }
  if (kind === "none") {
    return {
      kind,
      agreementId,
      plain: "",
      source: "none",
      canPaintReview: false,
      canEnableCommercialActions: false,
    };
  }
  if (kind === "paid_retry") {
    return {
      kind,
      agreementId,
      plain: "",
      source: "dashboard_resume_paid_retry",
      canPaintReview: false,
      canEnableCommercialActions: false,
    };
  }
  const verified = readVerifiedCommercialDisplayCorpus(agreementId);
  const plain = (verified?.corpusPlain || "").trim();
  return {
    kind,
    agreementId,
    plain,
    source:
      kind === "verified_accepted_snapshot"
        ? "verified_server_canonical_review_snapshot"
        : "verified_server_pending_review_snapshot",
    canPaintReview: plain.length >= 500,
    canEnableCommercialActions: kind === "verified_accepted_snapshot",
  };
}

export function canPaintDashboardResumePaper(args: Parameters<typeof selectDashboardResumePaint>[0]): boolean {
  return selectDashboardResumePaint(args).canPaintReview;
}

export function canEnableDashboardResumeCommercialActions(
  args: Parameters<typeof selectDashboardResumePaint>[0],
): boolean {
  return selectDashboardResumePaint(args).canEnableCommercialActions;
}

export function resolveDashboardResumeDeliveryTrack(agreementId?: string | null): OwnerDeliveryTrack | null {
  return readOwnerDeliveryTrack(agreementId);
}
