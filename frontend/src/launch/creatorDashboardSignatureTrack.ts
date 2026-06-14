import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  type ResolvePaidProSignerDetailsGateArgs,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
} from "../components/agreements/signerSetupPartyIdentity";
import { isAgreementPacketPrepared } from "../vs01/vs01WorkspaceSigningStatus";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_TRACK_REVIEW_STATUS_LABEL,
  CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
} from "./creatorDashboardCopy";
import {
  creatorDashboardFocusAgreementPath,
  creatorDashboardCompletedProofPath,
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
export const CREATOR_OPEN_SIGNATURE_LINKS_LABEL = "Open signature links";
export const CREATOR_CONTINUE_SIGNING_LABEL = "Continue signing";
export const CREATOR_COMPLETE_SIGNER_DETAILS_LABEL = PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA;
export const CREATOR_REVIEW_SUGGESTED_CHANGES_LABEL = "Review suggested changes";

export type CreatorDashboardSignatureTrackActionKind =
  | "prepare_signature_links"
  | "open_signature_links"
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

export function buildPaidProSignerDetailsGateArgsFromDraft(
  draft: AgreementDraft | null | undefined,
): ResolvePaidProSignerDetailsGateArgs {
  const parties = draft?.parties ?? [];
  const names = parties.map((party) => (party.name ?? "").trim());
  return {
    partyCount: parties.length,
    draftPartyNames: names,
    partySignerNames: parties.map((party) =>
      String((party as { signer_name?: string }).signer_name ?? "").trim(),
    ),
    recipient1Name: names[0] ?? "",
    recipient2Name: names[1] ?? "",
    recipient1Email: String(parties[0]?.email ?? ""),
    recipient2Email: String(parties[1]?.email ?? ""),
    extraPartyReviewEmails: parties.slice(2).map((party) => String(party.email ?? "")),
  };
}

export function creatorDashboardSignerMetadataCompleteFromDraft(
  draft: AgreementDraft | null | undefined,
): boolean {
  if (!draft?.parties?.length) return false;
  return draft.parties.every((party) => (party.name || "").trim().length >= 2);
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
  },
): CreatorDashboardSignatureTrackAction {
  const id = encodeURIComponent(row.id);
  const manualReviewLinkPage = options?.manualReviewLinkPage ?? creatorDashboardUsesManualReviewLinkPage();
  const effectiveStatus = deriveCreatorDashboardEffectiveStatus(row, reviewGate);
  const signingLinksExist =
    row.has_server_signing_lock || isAgreementPacketPrepared(row.id) || effectiveStatus === "signing_in_progress";

  if (effectiveStatus === "completed") {
    return {
      kind: "navigate",
      label: CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
      path: creatorDashboardCompletedProofPath(row.id),
      emphasis: "primary",
    };
  }

  if (effectiveStatus === "signing_in_progress" || signingLinksExist) {
    return {
      kind: "open_signature_links",
      label: CREATOR_CONTINUE_SIGNING_LABEL,
      path: `/app/send/${id}`,
      emphasis: "primary",
    };
  }

  if (effectiveStatus === "ready_for_signing") {
    const signerMetadataComplete = creatorDashboardSignerMetadataCompleteFromDraft(options?.draft);
    if (!signerMetadataComplete) {
      return {
        kind: "complete_signer_details",
        label: CREATOR_COMPLETE_SIGNER_DETAILS_LABEL,
        path: `/app/send/${id}#claw-paid-pro-inline-signer-setup`,
        emphasis: "primary",
      };
    }
    return {
      kind: "prepare_signature_links",
      label: CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
      path: "/app",
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

  return {
    kind: "navigate",
    label: "Continue Editing",
    path: `/app/send/${id}`,
    emphasis: "secondary",
  };
}

/** What's Next hides non-functional pending-review CTAs; status/timeline carry the wait state. */
export function creatorDashboardWhatsNextShowPrimaryCta(
  reviewGate: CreatorDashboardReviewGate,
  action: CreatorDashboardSignatureTrackAction,
): boolean {
  if (reviewGate.hasOpenChangeRequests) return true;
  if (action.kind === "focus_review_status") return false;
  if (action.kind === "navigate" && action.label === "View Review Status") return false;
  return true;
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
  if (creatorDashboardWhatsNextShowPrimaryCta(reviewGate, action)) return false;
  return deriveCreatorDashboardEffectiveStatus(row, reviewGate) === "in_review";
}
