import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  type ResolvePaidProSignerDetailsGateArgs,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  resolvePaidProSignerDetailsGate,
} from "../components/agreements/signerSetupPartyIdentity";
import { isAgreementPacketPrepared } from "../vs01/vs01WorkspaceSigningStatus";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_TRACK_REVIEW_STATUS_LABEL,
  CREATOR_VIEW_SIGNING_STATUS_LABEL,
  CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
} from "./creatorDashboardCopy";
import {
  creatorDashboardFocusAgreementPath,
  creatorDashboardSignedAgreementViewPath,
  creatorDashboardSigningStatusPath,
  creatorDashboardPrepareSignatureLinksPath,
  creatorDashboardSignerSetupPath,
  creatorDashboardUsesManualReviewLinkPage,
} from "./creatorDashboardReviewLinkRouting";
import { buildOwnerAgreementReadOnlyPath } from "./ownerAgreementReadOnlyView";
import { buildOwnerProposalReviewPath } from "./ownerProposalReviewRouting";
import {
  deriveCreatorDashboardStatus,
  type CreatorDashboardStatus,
} from "./creatorDashboardPresentation";
import {
  deriveCreatorDashboardEffectiveStatus as deriveEffectiveStatusFromGate,
  type CreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import type { CreatorSigningProgressSnapshot } from "./creatorDashboardSigningProgress";
export const CREATOR_OPEN_SIGNATURE_LINKS_LABEL = "Open signature links";
/** @deprecated Use CREATOR_VIEW_SIGNING_STATUS_LABEL */
export const CREATOR_CONTINUE_SIGNING_LABEL = "Continue signing";
export const CREATOR_COMPLETE_SIGNER_DETAILS_LABEL = PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA;
export const CREATOR_REVIEW_SUGGESTED_CHANGES_LABEL = "Review suggested changes";

export type CreatorDashboardSignatureTrackActionKind =
  | "prepare_signature_links"
  | "view_signing_status"
  | "complete_signer_details"
  | "review_suggested_changes"
  | "track_review_status"
  | "focus_review_status"
  | "navigate";

export type CreatorDashboardSignatureTrackAction = {
  kind: CreatorDashboardSignatureTrackActionKind;
  label: string;
  path: string;
  emphasis: "primary" | "secondary";
};

function draftPartySignerEmail(party: AgreementDraft["parties"][number] | undefined): string {
  if (!party) return "";
  return String(party.signerEmail ?? party.email ?? party.reviewEmail ?? "").trim();
}

function draftPartySignerName(party: AgreementDraft["parties"][number] | undefined): string {
  if (!party) return "";
  const camel = String(party.signerName ?? "").trim();
  if (camel) return camel;
  return String((party as { signer_name?: string }).signer_name ?? "").trim();
}

/** Build signer-setup gate args from persisted draft parties (same fields as live signer UI). */
export function buildPaidProSignerDetailsGateArgsFromDraft(
  draft: AgreementDraft | null | undefined,
): ResolvePaidProSignerDetailsGateArgs {
  const parties = draft?.parties ?? [];
  const names = parties.map((party) => (party.name ?? "").trim());
  return {
    partyCount: parties.length,
    draftPartyNames: names,
    partySignerNames: parties.map((party) => draftPartySignerName(party)),
    recipient1Name: names[0] ?? "",
    recipient2Name: names[1] ?? "",
    recipient1Email: draftPartySignerEmail(parties[0]),
    recipient2Email: draftPartySignerEmail(parties[1]),
    extraPartyReviewEmails: parties.slice(2).map((party) => draftPartySignerEmail(party)),
  };
}

/**
 * True when persisted draft parties satisfy the same signer-details gate as live signer setup
 * (legal entity + signer name + email per required slot). Legal entity names alone do not count.
 */
export function creatorDashboardSignerMetadataCompleteFromDraft(
  draft: AgreementDraft | null | undefined,
): boolean {
  if (!draft?.parties?.length) return false;
  return resolvePaidProSignerDetailsGate(buildPaidProSignerDetailsGateArgsFromDraft(draft)).complete;
}

/** Incomplete paid-Pro drafts must resume create + signer setup — never bare /app/send/:id. */
export function creatorDashboardIncompleteSignerSetupAction(
  agreementId: string,
): CreatorDashboardSignatureTrackAction {
  return {
    kind: "complete_signer_details",
    label: CREATOR_COMPLETE_SIGNER_DETAILS_LABEL,
    path: creatorDashboardSignerSetupPath(agreementId),
    emphasis: "primary",
  };
}

export function deriveCreatorDashboardEffectiveStatus(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): CreatorDashboardStatus {
  return deriveEffectiveStatusFromGate(row, reviewGate, deriveCreatorDashboardStatus(row));
}

export function creatorDashboardShouldPrepareSignatureLinksFromTrack(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  draft?: AgreementDraft | null,
): boolean {
  return (
    resolveCreatorDashboardSignatureTrackAction(row, reviewGate, { draft }).kind ===
    "prepare_signature_links"
  );
}

export function resolveCreatorDashboardSignatureTrackAction(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  options?: {
    draft?: AgreementDraft | null;
    manualReviewLinkPage?: boolean;
    signingProgress?: CreatorSigningProgressSnapshot | null;
  },
): CreatorDashboardSignatureTrackAction {
  const id = encodeURIComponent(row.id);
  const manualReviewLinkPage = options?.manualReviewLinkPage ?? creatorDashboardUsesManualReviewLinkPage();
  const effectiveStatus = deriveCreatorDashboardEffectiveStatus(row, reviewGate);
  const signingLinksExist =
    effectiveStatus !== "completed" &&
    (row.has_server_signing_lock || isAgreementPacketPrepared(row.id) || effectiveStatus === "signing_in_progress");

  if (effectiveStatus === "completed") {
    return {
      kind: "navigate",
      label: CREATOR_VIEW_SIGNED_AGREEMENT_LABEL,
      path: creatorDashboardSignedAgreementViewPath(row.id),
      emphasis: "primary",
    };
  }

  if (effectiveStatus === "signing_in_progress" || signingLinksExist) {
    return {
      kind: "view_signing_status",
      label: CREATOR_VIEW_SIGNING_STATUS_LABEL,
      path: creatorDashboardSigningStatusPath(row.id),
      emphasis: "primary",
    };
  }

  if (effectiveStatus === "ready_for_signing") {
    // Only divert when draft is loaded and incomplete — unknown draft stays prepare (hydration follows).
    if (
      options?.draft != null &&
      !creatorDashboardSignerMetadataCompleteFromDraft(options.draft)
    ) {
      return creatorDashboardIncompleteSignerSetupAction(row.id);
    }
    return {
      kind: "prepare_signature_links",
      label: CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
      path: creatorDashboardPrepareSignatureLinksPath(row.id),
      emphasis: "primary",
    };
  }

  if (effectiveStatus === "in_review") {
    if (reviewGate.hasOpenChangeRequests) {
      return {
        kind: "review_suggested_changes",
        label: CREATOR_REVIEW_SUGGESTED_CHANGES_LABEL,
        path: buildOwnerProposalReviewPath(row.id),
        emphasis: "primary",
      };
    }
    if (manualReviewLinkPage) {
      return {
        kind: "focus_review_status",
        label: CREATOR_TRACK_REVIEW_STATUS_LABEL,
        path: creatorDashboardFocusAgreementPath(row.id),
        emphasis: "primary",
      };
    }
    return {
      kind: "focus_review_status",
      label: CREATOR_TRACK_REVIEW_STATUS_LABEL,
      path: creatorDashboardFocusAgreementPath(row.id),
      emphasis: "primary",
    };
  }

  // Draft / default: incomplete signer metadata must open create signer setup, not /app/send.
  if (options?.draft && !creatorDashboardSignerMetadataCompleteFromDraft(options.draft)) {
    return creatorDashboardIncompleteSignerSetupAction(row.id);
  }

  return {
    kind: "navigate",
    label: "Continue Editing",
    path: `/app/send/${id}`,
    emphasis: "secondary",
  };
}

/** What's Next hides non-functional pending-review CTAs; completed agreements are informational only. */
export function creatorDashboardWhatsNextShowPrimaryCta(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  action: CreatorDashboardSignatureTrackAction,
): boolean {
  if (deriveCreatorDashboardEffectiveStatus(row, reviewGate) === "completed") return false;
  if (reviewGate.hasOpenChangeRequests) return true;
  if (action.kind === "focus_review_status") return false;
  if (action.kind === "navigate" && action.label === "View Review Status") return false;
  return true;
}

/** Low-emphasis link to scroll the All Agreements row after completion. */
export function creatorDashboardWhatsNextShowViewInAgreements(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): boolean {
  return deriveCreatorDashboardEffectiveStatus(row, reviewGate) === "completed";
}

/** Read-only owner agreement view — current review corpus without negotiate workspace chrome. */
export function resolveCreatorDashboardViewAgreementPath(agreementId: string): string {
  return buildOwnerAgreementReadOnlyPath(agreementId);
}

/** Owner can fix mistyped emails / resend while review is outstanding (including 0 approvals). */
export function creatorDashboardShowManageRecipients(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): boolean {
  if (reviewGate.allRequiredReviewPartiesApproved || row.all_reviewers_approved === true) {
    return false;
  }
  if (deriveCreatorDashboardEffectiveStatus(row, reviewGate) === "in_review") {
    return true;
  }
  if (
    Boolean((row.review_sent_at || "").trim()) &&
    deriveCreatorDashboardStatus(row) === "in_review"
  ) {
    return true;
  }
  return false;
}

/** Secondary action while waiting on reviewer approval (primary CTA intentionally hidden). */
export function creatorDashboardWhatsNextShowViewAgreement(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  action: CreatorDashboardSignatureTrackAction,
): boolean {
  if (!reviewGate.authoritative) return false;
  if (creatorDashboardWhatsNextShowPrimaryCta(row, reviewGate, action)) return false;
  return deriveCreatorDashboardEffectiveStatus(row, reviewGate) === "in_review";
}
