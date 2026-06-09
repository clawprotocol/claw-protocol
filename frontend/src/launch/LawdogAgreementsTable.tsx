import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { patchWorkspaceArchive } from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorDashboardStatus,
  displayCreatorAgreementTitle,
} from "./creatorDashboardPresentation";
import {
  deriveLawdogProductStatus,
  formatLawdogDashboardDate,
  lawdogAgreementTypeLabel,
  LAWDOG_PRODUCT_STATUS_LABEL,
  resolveLawdogAgreementCreatedAt,
} from "./lawdogDashboardPresentation";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";

type Props = {
  rows: readonly WorkspaceIndexAgreement[];
  onNavigate: (path: string) => void;
  onArchiveComplete?: () => void;
};

export function LawdogAgreementsTable(props: Props) {
  const { rows, onNavigate, onArchiveComplete } = props;

  if (rows.length === 0) return null;

  return (
    <div
      className="overflow-x-auto rounded-xl border border-slate-800/70 bg-slate-950/20"
      data-testid="lawdog-agreements-table"
    >
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800/80 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">Agreement Name</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Created</th>
            <th className="px-4 py-3 font-semibold">Last Updated</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const internalStatus = deriveCreatorDashboardStatus(row);
            const productStatus = deriveLawdogProductStatus(row);
            const donePath = `/app/done/${encodeURIComponent(row.id)}`;
            const canDownload = internalStatus === "completed";
            const contentUnavailable = row.content_unavailable === true;

            return (
              <tr
                key={row.id}
                className="border-b border-slate-800/50 last:border-b-0"
                data-testid={`lawdog-agreement-row-${row.id}`}
                data-lawdog-product-status={productStatus}
                data-lawdog-dashboard-source={row.dashboard_source ?? "draft"}
                data-lawdog-content-unavailable={contentUnavailable ? "true" : "false"}
              >
                <td className="px-4 py-3 font-medium text-slate-100">
                  {displayCreatorAgreementTitle(row.title)}
                  {contentUnavailable ? (
                    <p
                      className="mt-1 text-xs font-normal text-amber-200/90"
                      data-testid={`lawdog-agreement-content-unavailable-${row.id}`}
                    >
                      Agreement content unavailable — metadata only.
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-400">{lawdogAgreementTypeLabel(row)}</td>
                <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                  {formatLawdogDashboardDate(resolveLawdogAgreementCreatedAt(row))}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {formatLawdogDashboardDate(row.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300"
                    data-testid={`lawdog-agreement-status-${row.id}`}
                  >
                    {LAWDOG_PRODUCT_STATUS_LABEL[productStatus]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-open-${row.id}`}
                      disabled={contentUnavailable}
                      onClick={() => {
                        if (!contentUnavailable) onNavigate(donePath);
                      }}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-duplicate-${row.id}`}
                      disabled={contentUnavailable}
                      onClick={() => {
                        if (contentUnavailable) return;
                        initializeNewAgreementSession({ priorAgreementId: row.id });
                        onNavigate("/app/create");
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-download-${row.id}`}
                      disabled={!canDownload}
                      onClick={() => {
                        if (canDownload) onNavigate(donePath);
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-archive-${row.id}`}
                      disabled={Boolean(row.workspace_archived_at) || contentUnavailable}
                      onClick={() => {
                        if (contentUnavailable) return;
                        void (async () => {
                          const ok = await patchWorkspaceArchive(row.id, true);
                          if (ok) onArchiveComplete?.();
                        })();
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
