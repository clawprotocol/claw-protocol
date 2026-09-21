import { useCallback, useEffect, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fetchAgreementDraft } from "../../agreement/agreementWorkspaceApi";
import { getCachedAccessToken, setCachedAccessToken } from "../../auth/authAccessTokenCache";
import { useAuth } from "../../auth/AuthProvider";
import { OwnerProposalReviewPanel } from "../../components/agreements/OwnerProposalReviewPanel";
import { AppShell } from "../AppShell";
import { useLaunchNav } from "../LaunchNavContext";

type Props = {
  agreementId: string;
};

export function OwnerProposalReviewPage(props: Props) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const { loading: authLoading, session } = useAuth();
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    setLoadError(null);
    setLoadErrorCode(null);
    const res = await fetchAgreementDraft(agreementId);
    if (res.ok && res.draft) {
      setDraft(res.draft as AgreementDraft);
      return;
    }
    setDraft(null);
    setLoadError("Could not load this agreement.");
    setLoadErrorCode(res.error || "unknown");
  }, [agreementId]);

  useEffect(() => {
    const token = String(session?.access_token || getCachedAccessToken() || "").trim();
    if (token) {
      setCachedAccessToken(token);
      void loadDraft();
      return;
    }
    if (authLoading) return;
    setDraft(null);
    setLoadError("Could not load this agreement.");
    setLoadErrorCode("http_401");
  }, [authLoading, session?.access_token, loadDraft]);

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
          data-testid="owner-proposal-review-load-error"
          data-error-code={loadErrorCode || "unknown"}
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
