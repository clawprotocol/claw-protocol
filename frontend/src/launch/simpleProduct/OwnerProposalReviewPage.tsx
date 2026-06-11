import { useCallback, useEffect, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fetchAgreementDraft } from "../../agreement/agreementWorkspaceApi";
import { OwnerProposalReviewPanel } from "../../components/agreements/OwnerProposalReviewPanel";
import { AppShell } from "../AppShell";
import { useLaunchNav } from "../LaunchNavContext";

type Props = {
  agreementId: string;
};

export function OwnerProposalReviewPage(props: Props) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    setLoadError(null);
    const res = await fetchAgreementDraft(agreementId);
    if (res.ok && res.draft) {
      setDraft(res.draft as AgreementDraft);
      return;
    }
    setDraft(null);
    setLoadError("Could not load this agreement.");
  }, [agreementId]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const goDashboard = useCallback(() => {
    navigate("/app");
  }, [navigate]);

  return (
    <AppShell
      title="Review suggested changes"
      subtitle="Compare proposed wording against your current draft before accepting or declining."
    >
      {loadError ? (
        <div
          className="mb-4 rounded-xl border border-amber-800/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p>{loadError}</p>
          <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3" onClick={goDashboard}>
            Back to dashboard
          </button>
        </div>
      ) : null}
      <OwnerProposalReviewPanel
        agreementId={agreementId}
        draft={draft}
        onDraftUpdated={setDraft}
        onBack={goDashboard}
      />
    </AppShell>
  );
}
