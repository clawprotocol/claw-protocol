import { useState } from "react";
import type { ReactNode } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { Vs01Layout } from "../vs01/Vs01Layout";
import {
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
} from "./recipientReviewTrustCopy";
import { resolveRecipientReviewHeaderAside } from "./recipientPublicReviewChrome";
import type { RecipientLinkRole } from "./AgreementRecipientReview";

const RECIPIENT_REVIEW_HERO = {
  title: RECIPIENT_PUBLIC_HERO_TITLE,
  subtitle: RECIPIENT_PUBLIC_HERO_SUBTITLE,
};

const LAWDOG_FOOTER_EVIDENCE_SENTENCE =
  "LawDog produces verifiable evidence records; verification is cryptographic and file-based.";

type Props = {
  agreementId: string;
  token?: string;
  recipientLinkRole?: RecipientLinkRole;
  participantPartyId?: string;
  onClose: () => void;
  reviewGate: (args: {
    agreementId: string;
    token?: string;
    recipientLinkRole?: RecipientLinkRole;
    participantPartyId?: string;
    onClose: () => void;
    onRecipientApprovedWaitingChange: (active: boolean) => void;
  }) => ReactNode;
};

export function RecipientPublicReviewRoute(props: Props) {
  const { navigate } = useLaunchNav();
  const [approvedWaiting, setApprovedWaiting] = useState(false);
  return (
    <Vs01Layout
      hero={RECIPIENT_REVIEW_HERO}
      headerAside={resolveRecipientReviewHeaderAside(approvedWaiting)}
      productNav={{ label: "← Home", onClick: () => navigate("/") }}
      footerEvidenceSentence={LAWDOG_FOOTER_EVIDENCE_SENTENCE}
      recipientPublicFooter
    >
      <div className="vs01-card vs01-card--envelope" data-testid="recipient-public-review-route">
        {props.reviewGate({
          agreementId: props.agreementId,
          token: props.token,
          recipientLinkRole: props.recipientLinkRole,
          participantPartyId: props.participantPartyId,
          onClose: props.onClose,
          onRecipientApprovedWaitingChange: setApprovedWaiting,
        })}
      </div>
    </Vs01Layout>
  );
}
