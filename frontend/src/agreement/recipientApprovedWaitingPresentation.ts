import type { AgreementDraft, AgreementParty } from "./agreementTypes";
import type { LawdogViewerContext } from "./lawdogViewerContext";
import { CREATOR_PREPARE_SIGNATURE_LINKS_LABEL } from "../launch/creatorDashboardCopy";
import {
  countOwnerReviewPartyApproved,
  deriveRequiredReviewerPartyStatusRows,
} from "../launch/simpleProduct/ownerReviewPartyStatusChecklist";

export const CREATOR_REVIEW_COMPLETE_HERO = "Your review is complete 🎉";

export const CREATOR_REVIEW_COMPLETE_BODY =
  "Your review is complete. We're waiting on the remaining reviewer(s) before signature links can be prepared.";

export function formatCreatorWaitingOnReviewersBody(pendingReviewerDisplayNames: readonly string[]): string {
  const names = pendingReviewerDisplayNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return CREATOR_REVIEW_COMPLETE_BODY;
  if (names.length === 1) {
    return `Waiting on ${names[0]} before signature links can be prepared.`;
  }
  if (names.length === 2) {
    return `Waiting on ${names[0]} and ${names[1]} before signature links can be prepared.`;
  }
  return `Waiting on ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} before signature links can be prepared.`;
}

export const CREATOR_EVERYONE_APPROVED_HERO = "Everyone approved 🎉";

export const CREATOR_EVERYONE_APPROVED_SUBTITLE =
  "All reviews are complete. You can now prepare signature links and start signing.";

export const PUBLIC_REVIEW_SUBMITTED_HERO = "Review submitted";

export const PUBLIC_REVIEW_SUBMITTED_BODY =
  "Your review has been recorded. You can close this page. The agreement owner will continue the signing process.";

export const PUBLIC_ALL_REVIEWS_COMPLETE_HERO = "All reviews complete 🎉";

export const PUBLIC_ALL_REVIEWS_COMPLETE_BODY =
  "Everyone has approved the agreement. The sender is now preparing signature links. You'll receive your signing link when signing begins.";

export const RECIPIENT_SIGNING_LINKS_READY_HEADER = "Signing links are ready";

export const RECIPIENT_SIGNING_LINKS_READY_BODY =
  "The sender prepared signature links. You can open your signing link when you're ready.";

export const POST_APPROVAL_RETURN_TO_DASHBOARD_LABEL = "Return to dashboard";

export const POST_APPROVAL_GO_TO_DASHBOARD_LABEL = "Go to dashboard";

export const POST_APPROVAL_DONE_LABEL = "Done";

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const RECIPIENT_PUBLIC_APPROVED_HEADER = PUBLIC_REVIEW_SUBMITTED_HERO;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const RECIPIENT_PUBLIC_APPROVED_BODY = PUBLIC_REVIEW_SUBMITTED_BODY;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const CREATOR_POST_APPROVAL_SHELL_TITLE = CREATOR_REVIEW_COMPLETE_HERO;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const CREATOR_POST_APPROVAL_SHELL_SUBTITLE = CREATOR_EVERYONE_APPROVED_SUBTITLE;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const CREATOR_POST_APPROVAL_WAITING_BODY = CREATOR_REVIEW_COMPLETE_BODY;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const CREATOR_POST_APPROVAL_ALL_REVIEWS_COMPLETE_BODY = CREATOR_EVERYONE_APPROVED_SUBTITLE;

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const RECIPIENT_APPROVED_WAITING_HEADER = "Approved — waiting for sender";

/** @deprecated Use role-aware resolver — retained for legacy imports/tests. */
export const RECIPIENT_APPROVED_WAITING_BODY =
  "You approved this draft. The sender will prepare signature links if they choose to move forward.";

export type PostApprovalPresentationAudience = "creator" | "public_recipient";

export type PostApprovalPanelActionKind = "return_dashboard" | "prepare_signature_links" | "done";

export type PostApprovalPanelAction = {
  kind: PostApprovalPanelActionKind;
  label: string;
  emphasis: "primary" | "secondary";
};

export type RecipientApprovedWaitingPanelCopy = {
  header: string;
  body: string;
  actions: PostApprovalPanelAction[];
  pollHint: string | null;
};

export type RecipientPostApprovalStatusBanner = {
  title: string;
  detail: string;
};

export type RecipientPostApprovalPresentation = {
  audience: PostApprovalPresentationAudience;
  shellHeroTitle: string;
  shellHeroSubtitle: string | null;
  statusBanner: RecipientPostApprovalStatusBanner | null;
  waitingPanel: RecipientApprovedWaitingPanelCopy;
};

export function resolveReviewerPartyIndex(
  parties: readonly AgreementParty[] | undefined,
  participantPartyId: string | null | undefined,
): number | null {
  const list = parties ?? [];
  if (!list.length) return null;
  const pid = (participantPartyId || "").trim();
  if (!pid) return null;
  const idx = list.findIndex((p) => String(p.id ?? "").trim() === pid);
  return idx >= 0 ? idx : null;
}

/** Party 1 creator-aware only when QA simulation has an explicit owner return path. */
export function resolvePostApprovalPresentationAudience(args: {
  viewerContext: LawdogViewerContext;
  qaOwnerReturnPath?: string | null;
  reviewerPartyIndex?: number | null;
}): PostApprovalPresentationAudience {
  if (args.viewerContext === "creator_owner") return "creator";
  if (
    args.viewerContext === "qa_recipient_simulation" &&
    args.qaOwnerReturnPath &&
    args.reviewerPartyIndex === 0
  ) {
    return "creator";
  }
  return "public_recipient";
}

export function resolveAllReviewPartiesApproved(draft: AgreementDraft | null | undefined): boolean {
  const rows = deriveRequiredReviewerPartyStatusRows(draft);
  if (rows.length === 0) return false;
  return rows.every((row) => row.status === "approved");
}

export function resolveRecipientPostApprovalPresentation(args: {
  audience: PostApprovalPresentationAudience;
  signingLinksExist: boolean;
  allReviewsComplete: boolean;
  pendingReviewerDisplayNames?: readonly string[];
}): RecipientPostApprovalPresentation {
  const { audience, signingLinksExist, allReviewsComplete, pendingReviewerDisplayNames = [] } = args;

  if (audience === "creator") {
    if (signingLinksExist) {
      return {
        audience,
        shellHeroTitle: RECIPIENT_SIGNING_LINKS_READY_HEADER,
        shellHeroSubtitle: RECIPIENT_SIGNING_LINKS_READY_BODY,
        statusBanner: null,
        waitingPanel: {
          header: RECIPIENT_SIGNING_LINKS_READY_HEADER,
          body: RECIPIENT_SIGNING_LINKS_READY_BODY,
          actions: [
            {
              kind: "return_dashboard",
              label: POST_APPROVAL_RETURN_TO_DASHBOARD_LABEL,
              emphasis: "primary",
            },
          ],
          pollHint: null,
        },
      };
    }

    if (allReviewsComplete) {
      return {
        audience,
        shellHeroTitle: CREATOR_EVERYONE_APPROVED_HERO,
        shellHeroSubtitle: CREATOR_EVERYONE_APPROVED_SUBTITLE,
        statusBanner: null,
        waitingPanel: {
          header: CREATOR_EVERYONE_APPROVED_HERO,
          body: CREATOR_EVERYONE_APPROVED_SUBTITLE,
          actions: [
            {
              kind: "prepare_signature_links",
              label: CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
              emphasis: "primary",
            },
            {
              kind: "return_dashboard",
              label: POST_APPROVAL_RETURN_TO_DASHBOARD_LABEL,
              emphasis: "secondary",
            },
          ],
          pollHint: null,
        },
      };
    }

    return {
      audience,
      shellHeroTitle: CREATOR_REVIEW_COMPLETE_HERO,
      shellHeroSubtitle: null,
      statusBanner: null,
      waitingPanel: {
        header: CREATOR_REVIEW_COMPLETE_HERO,
        body: formatCreatorWaitingOnReviewersBody(pendingReviewerDisplayNames),
        actions: [
          {
            kind: "return_dashboard",
            label: POST_APPROVAL_GO_TO_DASHBOARD_LABEL,
            emphasis: "primary",
          },
        ],
        pollHint: null,
      },
    };
  }

  if (signingLinksExist) {
    return {
      audience,
      shellHeroTitle: RECIPIENT_SIGNING_LINKS_READY_HEADER,
      shellHeroSubtitle: RECIPIENT_SIGNING_LINKS_READY_BODY,
      statusBanner: null,
      waitingPanel: {
        header: RECIPIENT_SIGNING_LINKS_READY_HEADER,
        body: RECIPIENT_SIGNING_LINKS_READY_BODY,
        actions: [{ kind: "done", label: POST_APPROVAL_DONE_LABEL, emphasis: "primary" }],
        pollHint: null,
      },
    };
  }

  if (allReviewsComplete) {
    return {
      audience,
      shellHeroTitle: PUBLIC_ALL_REVIEWS_COMPLETE_HERO,
      shellHeroSubtitle: null,
      statusBanner: null,
      waitingPanel: {
        header: PUBLIC_ALL_REVIEWS_COMPLETE_HERO,
        body: PUBLIC_ALL_REVIEWS_COMPLETE_BODY,
        actions: [{ kind: "done", label: POST_APPROVAL_DONE_LABEL, emphasis: "primary" }],
        pollHint: null,
      },
    };
  }

  return {
    audience,
    shellHeroTitle: PUBLIC_REVIEW_SUBMITTED_HERO,
    shellHeroSubtitle: null,
    statusBanner: null,
    waitingPanel: {
      header: PUBLIC_REVIEW_SUBMITTED_HERO,
      body: PUBLIC_REVIEW_SUBMITTED_BODY,
      actions: [{ kind: "done", label: POST_APPROVAL_DONE_LABEL, emphasis: "primary" }],
      pollHint: null,
    },
  };
}

/** @deprecated Prefer resolveRecipientPostApprovalPresentation */
export function resolveRecipientApprovedWaitingPanelCopy(
  signingLinksExist: boolean,
): RecipientApprovedWaitingPanelCopy {
  return resolveRecipientPostApprovalPresentation({
    audience: "public_recipient",
    signingLinksExist,
    allReviewsComplete: false,
  }).waitingPanel;
}

export function countApprovedReviewParties(draft: AgreementDraft | null | undefined): number {
  return countOwnerReviewPartyApproved(deriveRequiredReviewerPartyStatusRows(draft));
}

let lastRecipientApprovedWaitingLogKey = "";

export function logRecipientApprovedWaitingVisible(payload: {
  agreementId: string;
  viewerContext: LawdogViewerContext;
  audience: PostApprovalPresentationAudience;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastRecipientApprovedWaitingLogKey) return;
  lastRecipientApprovedWaitingLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[recipient-approved-waiting-visible]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    viewerContext: payload.viewerContext,
    audience: payload.audience,
  });
}
