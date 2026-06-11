import type { AgreementDraft } from "../../agreement/agreementTypes";
import { isOwnerProposalReviewQaEnabled } from "../../agreement/ownerProposalReviewQa";
import { OwnerProposalReviewPanel } from "./OwnerProposalReviewPanel";

type Props = {
  agreementId: string;
  draft: AgreementDraft | null;
  onDraftUpdated?: (draft: AgreementDraft | null) => void;
  qaEnabled?: boolean;
  /** Owner Done page: show panel when open change requests exist even before ?qaReview=1. */
  forceVisible?: boolean;
};

/** Dev/QA wrapper — production owners use OwnerProposalReviewPage at /app/review-changes/{id}. */
export function OwnerProposalReviewQaPanel(props: Props) {
  const { agreementId, draft, onDraftUpdated, qaEnabled, forceVisible = false } = props;
  const qaFlagOn = qaEnabled ?? isOwnerProposalReviewQaEnabled();
  const visible = forceVisible || qaFlagOn;

  if (!visible) return null;

  return (
    <div data-testid="owner-proposal-review-qa-panel">
      <OwnerProposalReviewPanel
        agreementId={agreementId}
        draft={draft}
        onDraftUpdated={onDraftUpdated}
        showQaChrome
      />
    </div>
  );
}
