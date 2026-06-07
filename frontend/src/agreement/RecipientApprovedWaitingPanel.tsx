import { useEffect } from "react";
import type { LawdogViewerContext } from "./lawdogViewerContext";
import {
  logRecipientApprovedWaitingVisible,
  type PostApprovalPanelActionKind,
  type RecipientPostApprovalPresentation,
} from "./recipientApprovedWaitingPresentation";

type Props = {
  agreementId: string;
  viewerContext: LawdogViewerContext;
  presentation: RecipientPostApprovalPresentation;
  loading: boolean;
  onAction: (kind: PostApprovalPanelActionKind) => void | Promise<void>;
};

export function RecipientApprovedWaitingPanel(props: Props) {
  const { agreementId, viewerContext, presentation, loading, onAction } = props;
  const copy = presentation.waitingPanel;

  useEffect(() => {
    logRecipientApprovedWaitingVisible({
      agreementId,
      viewerContext,
      audience: presentation.audience,
    });
  }, [agreementId, viewerContext, presentation.audience]);

  return (
    <div
      className="rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-slate-200"
      data-testid="recipient-signing-readiness-panel"
      data-recipient-post-approval-audience={presentation.audience}
    >
      <div className="text-sm font-semibold text-slate-100" data-testid="recipient-approved-waiting-header">
        {copy.header}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-400" data-testid="recipient-approved-waiting-body">
        {copy.body}
      </p>
      {copy.pollHint ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{copy.pollHint}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {copy.actions.map((action) => (
          <button
            key={`${action.kind}-${action.label}`}
            type="button"
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              action.emphasis === "primary"
                ? "bg-sky-700 text-white hover:bg-sky-600"
                : "border border-slate-600 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80"
            }`}
            data-testid={`recipient-post-approval-action-${action.kind}`}
            disabled={loading && action.kind === "prepare_signature_links"}
            onClick={() => void onAction(action.kind)}
          >
            {loading && action.kind === "prepare_signature_links"
              ? "Preparing signature links…"
              : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
