import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { LawdogDashboardLayout } from "./LawdogProductNav";
import { fetchWorkspaceIndex, type WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { dedupeWorkspaceIndexAgreements } from "./workspaceIndexDedupe";
import { deriveCreatorDashboardStatus, displayCreatorAgreementTitle } from "./creatorDashboardPresentation";
import { creatorDashboardCompletedProofPath } from "./creatorDashboardReviewLinkRouting";
import {
  deriveLawdogProductStatus,
  formatLawdogDashboardDate,
  LAWDOG_PRODUCT_STATUS_LABEL,
} from "./lawdogDashboardPresentation";
import { useLaunchNav } from "./LaunchNavContext";

export function LawdogSignaturesPage() {
  const { navigate } = useLaunchNav();
  const [rows, setRows] = useState<WorkspaceIndexAgreement[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { agreements } = await fetchWorkspaceIndex();
    setRows(dedupeWorkspaceIndexAgreements(agreements));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const signatureRows = useMemo(
    () =>
      rows.filter((row) => {
        const status = deriveCreatorDashboardStatus(row);
        return status === "signing_in_progress" || status === "completed";
      }),
    [rows],
  );

  return (
    <AppShell
      title="Signatures"
      subtitle="Agreements with signature links prepared or completed."
    >
      <LawdogDashboardLayout activeId="signatures">
        {loading ? (
          <p className="text-sm text-slate-400">Loading signature status…</p>
        ) : signatureRows.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="signatures-empty">
            No agreements in signing yet. Prepare signature links from the dashboard when review is complete.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="signatures-list">
            {signatureRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/25 px-4 py-3"
                data-testid={`signatures-row-${row.id}`}
              >
                <div>
                  <p className="font-medium text-slate-100">{displayCreatorAgreementTitle(row.title)}</p>
                  <p className="text-xs text-slate-500">
                    {LAWDOG_PRODUCT_STATUS_LABEL[deriveLawdogProductStatus(row)]} · Updated{" "}
                    {formatLawdogDashboardDate(row.updated_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                  onClick={() => {
                    const status = deriveCreatorDashboardStatus(row);
                    if (status === "completed") {
                      navigate(creatorDashboardCompletedProofPath(row.id));
                      return;
                    }
                    navigate(`/app/send/${encodeURIComponent(row.id)}`);
                  }}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </LawdogDashboardLayout>
    </AppShell>
  );
}
