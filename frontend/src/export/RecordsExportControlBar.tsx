import { useCallback, useState } from "react";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { useAccess } from "../access/AccessContext";
import { AI_ASSISTIVE_SHORT } from "../compliance/disclosureCopy";
import { OrganizeWithAiModal } from "../workspace/OrganizeWithAiModal";
import { runWorkspaceExportFlow } from "./dataExportApi";

export type RecordsExportControlBarProps = {
  /** At least one agreement/record exists (for hiding primary export actions). */
  hasRecords: boolean;
  /** When set (e.g. from ?folder=), show "Export folder". */
  folderId?: string | null;
  /** Agreement id chosen for toolbar "Export" (e.g. row → Select for export). */
  selectedAgreementId?: string | null;
  /** Workspace rows for premium AI organization flow (titles + folder/tag metadata). */
  workspaceRowsForAi?: WorkspaceIndexAgreement[];
  /** Refresh list after AI apply (e.g. reload workspace index). */
  onWorkspaceOrganizationApplied?: () => void;
  className?: string;
};

/**
 * Lightweight export + optional AI organize controls (dashboard / agreements list).
 */
export function RecordsExportControlBar(props: RecordsExportControlBarProps) {
  const {
    hasRecords,
    folderId,
    selectedAgreementId,
    workspaceRowsForAi = [],
    onWorkspaceOrganizationApplied,
    className = "",
  } = props;
  const access = useAccess();
  const canOrganizeAi = access.tier === "premium" || access.tier === "admin";

  const [line, setLine] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const run = useCallback(
    async (kind: "record" | "folder" | "user_all", ref?: string | null) => {
      setErr(null);
      setLine("Preparing export…");
      setBusy(true);
      const res = await runWorkspaceExportFlow(kind, ref ?? null, { maxWaitMs: 60_000 });
      setBusy(false);
      if (!res.ok) {
        setLine(null);
        setErr(res.error || "Export failed. Try again.");
        return;
      }
      setLine("Download ready");
      window.setTimeout(() => setLine(null), 4000);
    },
    [],
  );

  const onExportSingle = useCallback(() => {
    if (!selectedAgreementId?.trim()) return;
    void run("record", selectedAgreementId.trim());
  }, [run, selectedAgreementId]);

  const onExportFolder = useCallback(() => {
    if (!folderId?.trim()) return;
    void run("folder", folderId.trim());
  }, [folderId, run]);

  const onExportAll = useCallback(() => {
    void run("user_all", null);
  }, [run]);

  const showFolder = Boolean(folderId?.trim());
  const exportSingleEnabled = hasRecords && Boolean(selectedAgreementId?.trim()) && !busy;

  if (!hasRecords) {
    return (
      <div className={`rounded-lg border border-slate-800/70 bg-slate-950/25 px-3 py-2.5 ${className}`.trim()}>
        <p className="text-xs leading-relaxed text-slate-400">
          Your records remain available to export, including on free plans.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`rounded-lg border border-slate-800/70 bg-slate-950/25 px-3 py-2.5 ${className}`.trim()}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className="min-h-9 rounded-md px-1 py-1.5 text-sm font-medium text-teal-400/95 underline-offset-2 hover:bg-slate-900/40 hover:text-teal-300 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              disabled={!exportSingleEnabled}
              onClick={onExportSingle}
            >
              Export
            </button>
            {showFolder ? (
              <button
                type="button"
                className="min-h-9 rounded-md px-1 py-1.5 text-sm font-medium text-teal-400/95 underline-offset-2 hover:bg-slate-900/40 hover:text-teal-300 hover:underline disabled:opacity-40"
                disabled={busy}
                onClick={onExportFolder}
              >
                Export folder
              </button>
            ) : null}
            <button
              type="button"
              className="min-h-9 rounded-md px-1 py-1.5 text-sm font-semibold text-teal-300 underline-offset-2 hover:bg-slate-900/40 hover:text-teal-200 hover:underline disabled:opacity-40"
              disabled={busy}
              onClick={onExportAll}
            >
              Export all
            </button>
          </div>
          <div className="min-w-0 border-t border-slate-800/50 pt-2 sm:border-t-0 sm:border-l sm:border-slate-800/50 sm:pl-4 sm:pt-0">
            {canOrganizeAi ? (
              <button
                type="button"
                className="block min-h-8 w-fit rounded-md py-1 text-left text-xs font-normal text-slate-500 underline-offset-2 hover:bg-slate-900/30 hover:text-slate-400 hover:underline"
                onClick={() => setAiOpen(true)}
              >
                Organize with AI
              </button>
            ) : (
              <span className="block text-xs text-slate-500">Organize with AI — Available on Pro</span>
            )}
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              Folders &amp; tags only — {AI_ASSISTIVE_SHORT}
            </span>
          </div>
        </div>
        {line ? <p className="mt-2 text-sm text-slate-300">{line}</p> : null}
        {err ? <p className="mt-2 text-sm text-rose-200">{err}</p> : null}
        {!line && !err ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Your records remain available to export, including on free plans.
          </p>
        ) : null}
      </div>
      {canOrganizeAi ? (
        <OrganizeWithAiModal
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          workspaceRows={workspaceRowsForAi}
          folderId={folderId}
          selectedAgreementId={selectedAgreementId}
          onApplied={onWorkspaceOrganizationApplied}
        />
      ) : null}
    </>
  );
}
