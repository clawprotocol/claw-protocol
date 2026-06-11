import { useCallback, useEffect, useState } from "react";
import { PremiumAgreementReadonlyView } from "../../components/agreements/PremiumAgreementReadonlyView";
import { computeReviewApprovalStatus } from "../../components/agreements/draftRecipientReviewSignals";
import { displayCreatorAgreementTitle } from "../creatorDashboardPresentation";
import { useLaunchNav } from "../LaunchNavContext";
import { loadOwnerAgreementReadOnlyPreview } from "../ownerAgreementReadOnlyView";
import { AppShell } from "../AppShell";

type Props = {
  agreementId: string;
};

export function OwnerAgreementReadOnlyPage(props: Props) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("Agreement");
  const [previewHtml, setPreviewHtml] = useState("");
  const [usesPremiumDocument, setUsesPremiumDocument] = useState(false);
  const [progressLine, setProgressLine] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const loaded = await loadOwnerAgreementReadOnlyPreview(agreementId);
    if (!loaded) {
      setLoadError("Could not load this agreement.");
      setPreviewHtml("");
      setLoading(false);
      return;
    }
    setTitle(displayCreatorAgreementTitle(loaded.draft.title ?? ""));
    const agg = computeReviewApprovalStatus(loaded.draft);
    if (agg.requiredReviewerCount > 0) {
      setProgressLine(`${agg.approvedReviewerCount} of ${agg.requiredReviewerCount} approved`);
    } else {
      setProgressLine(null);
    }
    setPreviewHtml(loaded.html);
    setUsesPremiumDocument(loaded.usesPremiumDocument);
    setLoading(false);
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const goDashboard = useCallback(() => {
    navigate("/app");
  }, [navigate]);

  return (
    <AppShell
      title={title}
      subtitle="Read-only copy sent for review. Nothing changes until reviewers respond."
    >
      <div
        className="space-y-4"
        data-testid="owner-agreement-readonly-page"
        data-agreement-id={agreementId}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="inline-flex rounded-full bg-amber-900/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200"
            data-testid="owner-agreement-readonly-status"
          >
            Waiting for reviewer approval
          </span>
          {progressLine ? (
            <p className="text-sm text-slate-400" data-testid="owner-agreement-readonly-progress">
              Review progress: <span className="text-slate-200">{progressLine}</span>
            </p>
          ) : null}
        </div>

        {loadError ? (
          <div
            className="rounded-xl border border-amber-800/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            <p>{loadError}</p>
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3" onClick={goDashboard}>
              Back to dashboard
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400" data-testid="owner-agreement-readonly-loading">
            Loading agreement…
          </p>
        ) : (
          <section
            className="rounded-2xl border border-slate-800/70 bg-white px-4 py-6 text-slate-900 shadow-inner sm:px-8 sm:py-8"
            data-testid="owner-agreement-readonly-document"
            aria-label="Agreement document preview"
          >
            {previewHtml.trim() ? (
              usesPremiumDocument ? (
                <PremiumAgreementReadonlyView
                  html={previewHtml}
                  fullDocumentFlow
                  compactDocumentTopPadding
                />
              ) : (
                <div
                  className="mx-auto max-w-[48rem]"
                  data-testid="owner-agreement-readonly-fallback-html"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )
            ) : (
              <p className="text-sm text-slate-600">No agreement text is available yet.</p>
            )}
          </section>
        )}

        <div className="pt-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact"
            data-testid="owner-agreement-readonly-back"
            onClick={goDashboard}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </AppShell>
  );
}
