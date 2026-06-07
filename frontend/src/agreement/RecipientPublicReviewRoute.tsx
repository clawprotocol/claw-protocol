import { useState, type ReactNode } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { Vs01Layout } from "../vs01/Vs01Layout";
import {
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
} from "./recipientReviewTrustCopy";
import { resolveRecipientReviewHeaderAside } from "./recipientPublicReviewChrome";
import type { RecipientLinkRole } from "./AgreementRecipientReview";
import type { LawdogViewerContext } from "./lawdogViewerContext";
import {
  resolveRecipientLogoHomeHref,
  resolveRecipientProductNavAction,
} from "./lawdogViewerContext";
import type { RecipientPostApprovalPresentation } from "./recipientApprovedWaitingPresentation";

const RECIPIENT_REVIEW_HERO = {
  title: RECIPIENT_PUBLIC_HERO_TITLE,
  subtitle: RECIPIENT_PUBLIC_HERO_SUBTITLE,
};

const LAWDOG_FOOTER_EVIDENCE_SENTENCE =
  "LawDog produces verifiable evidence records; verification is cryptographic and file-based.";

type Props = {
  agreementId: string;
  viewerContext: LawdogViewerContext;
  ownerReturnPath?: string | null;
  token?: string;
  recipientLinkRole?: RecipientLinkRole;
  participantPartyId?: string;
  onClose: () => void;
  reviewGate: (args: {
    agreementId: string;
    token?: string;
    recipientLinkRole?: import("./AgreementRecipientReview").RecipientLinkRole;
    participantPartyId?: string;
    viewerContext: LawdogViewerContext;
    qaOwnerReturnPath?: string | null;
    onClose: () => void;
    onRecipientPostApprovalPresentationChange: (
      presentation: RecipientPostApprovalPresentation | null,
    ) => void;
  }) => ReactNode;
};

export function RecipientPublicReviewRoute(props: Props) {
  const { navigate } = useLaunchNav();
  const [postApprovalPresentation, setPostApprovalPresentation] =
    useState<RecipientPostApprovalPresentation | null>(null);
  const productNavAction = resolveRecipientProductNavAction(
    props.viewerContext,
    props.ownerReturnPath ?? null,
  );
  const hero = postApprovalPresentation
    ? {
        title: postApprovalPresentation.shellHeroTitle,
        subtitle: postApprovalPresentation.shellHeroSubtitle ?? "",
      }
    : RECIPIENT_REVIEW_HERO;

  return (
    <Vs01Layout
      hero={hero}
      headerAside={resolveRecipientReviewHeaderAside(props.viewerContext)}
      logoHomeHref={resolveRecipientLogoHomeHref(props.viewerContext)}
      productNav={{
        label: productNavAction.label,
        onClick: () => navigate(productNavAction.path),
      }}
      footerEvidenceSentence={LAWDOG_FOOTER_EVIDENCE_SENTENCE}
      recipientPublicFooter
    >
      <div
        className="vs01-card vs01-card--envelope"
        data-testid="recipient-public-review-route"
        data-lawdog-viewer-context={props.viewerContext}
        data-recipient-post-approval-audience={postApprovalPresentation?.audience ?? ""}
      >
        {props.reviewGate({
          agreementId: props.agreementId,
          token: props.token,
          recipientLinkRole: props.recipientLinkRole,
          participantPartyId: props.participantPartyId,
          viewerContext: props.viewerContext,
          qaOwnerReturnPath: props.ownerReturnPath ?? null,
          onClose: props.onClose,
          onRecipientPostApprovalPresentationChange: setPostApprovalPresentation,
        })}
      </div>
    </Vs01Layout>
  );
}
