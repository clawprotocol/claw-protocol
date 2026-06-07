import { useEffect } from "react";
import type { LawdogViewerContext } from "./lawdogViewerContext";
import {
  logRecipientApprovedWaitingVisible,
  resolveRecipientApprovedWaitingPanelCopy,
} from "./recipientApprovedWaitingPresentation";

type Props = {
  agreementId: string;
  viewerContext: LawdogViewerContext;
  signingLinksExist: boolean;
  loading: boolean;
  pollIntervalMs: number;
  onRefresh: () => void;
};

export function RecipientApprovedWaitingPanel(props: Props) {
  const { agreementId, viewerContext, signingLinksExist, loading, pollIntervalMs, onRefresh } = props;
  const copy = resolveRecipientApprovedWaitingPanelCopy(signingLinksExist);

  useEffect(() => {
    logRecipientApprovedWaitingVisible({ agreementId, viewerContext });
  }, [agreementId, viewerContext]);

  return (
    <div
      className="rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-slate-200"
      data-testid="recipient-signing-readiness-panel"
    >
      <div className="text-sm font-semibold text-slate-100" data-testid="recipient-approved-waiting-header">
        {copy.header}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-400" data-testid="recipient-approved-waiting-body">
        {copy.body}
      </p>
      {copy.pollHint ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{copy.pollHint}</p>
      ) : signingLinksExist ? (
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          This page checks for updates automatically (about every {Math.round(pollIntervalMs / 1000)}s).
        </p>
      ) : null}
      <button
        type="button"
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="recipient-refresh-signing-status"
        disabled={loading}
        onClick={() => void onRefresh()}
      >
        {copy.buttonLabel}
      </button>
    </div>
  );
}
