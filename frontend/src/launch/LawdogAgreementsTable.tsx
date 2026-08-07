import { useEffect, useRef, useState } from "react";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { downloadCompletedSignedAgreementPdf } from "../agreement/completedSignedAgreementPdfDownload";
import {
  creatorDashboardPrimaryAction,
  deriveCreatorDashboardStatus,
  displayCreatorAgreementTitle,
} from "./creatorDashboardPresentation";
import { CREATOR_MANAGE_RECIPIENTS_LABEL } from "./creatorDashboardCopy";
import { CREATOR_DOWNLOAD_PDF_LABEL } from "./creatorDashboardCopy";
import { buildOwnerAgreementReadOnlyPath } from "./ownerAgreementReadOnlyView";
import {
  deriveLawdogProductStatus,
  formatLawdogAgreementStatusLabel,
  formatLawdogDashboardDate,
  lawdogAgreementTypeLabel,
  resolveLawdogAgreementCreatedAt,
} from "./lawdogDashboardPresentation";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";
import { markPaidDashboardCreateContext } from "./paidDashboardCreateContext";

export type LawdogWorkspaceArchiveRequest = {
  agreementId: string;
  title: string;
  archived: boolean;
};

type Props = {
  rows: readonly WorkspaceIndexAgreement[];
  draftByAgreementId?: Readonly<Record<string, AgreementDraft | null>>;
  signingProgressByAgreementId?: Readonly<
    Record<string, import("./creatorDashboardSigningProgress").CreatorSigningProgressSnapshot>
  >;
  onNavigate: (path: string, meta?: { kind?: string; agreementId?: string }) => void;
  onFocusReviewStatus?: (agreementId: string) => void;
  /** Parent owns optimistic UI + PATCH + soft reload. */
  onWorkspaceArchive?: (request: LawdogWorkspaceArchiveRequest) => void;
  /** @deprecated Prefer onWorkspaceArchive. Kept for older call sites/tests. */
  onArchiveComplete?: () => void;
};

export function LawdogAgreementsTable(props: Props) {
  const {
    rows,
    draftByAgreementId = {},
    signingProgressByAgreementId = {},
    onNavigate,
    onFocusReviewStatus,
    onWorkspaceArchive,
    onArchiveComplete,
  } = props;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pdfDownloadBusyId, setPdfDownloadBusyId] = useState<string | null>(null);
  const [pdfErrorById, setPdfErrorById] = useState<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setOpenMenuId(null);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

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
            const rowProgress = signingProgressByAgreementId[row.id] ?? null;
            const internalStatus = deriveCreatorDashboardStatus(row);
            const productStatus = deriveLawdogProductStatus(row, rowProgress);
            const rowDraft = draftByAgreementId[row.id] ?? null;
            const openAction = creatorDashboardPrimaryAction(row, { draft: rowDraft });
            const contentUnavailable = row.content_unavailable === true;
            const canDownload = internalStatus === "completed" && !contentUnavailable;
            const downloadBusy = pdfDownloadBusyId === row.id;
            const isArchived = Boolean(row.workspace_archived_at);
            const menuOpen = openMenuId === row.id;
            const title = displayCreatorAgreementTitle(row.title);
            const pdfError = pdfErrorById[row.id] ?? null;

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
                  {title}
                  {contentUnavailable ? (
                    <p
                      className="mt-1 text-xs font-normal text-amber-200/90"
                      data-testid={`lawdog-agreement-content-unavailable-${row.id}`}
                    >
                      Agreement content unavailable — metadata only.
                    </p>
                  ) : null}
                  {pdfError ? (
                    <p
                      className="mt-1 text-xs font-normal text-amber-200/90"
                      data-testid={`lawdog-action-download-error-${row.id}`}
                    >
                      {pdfError}
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
                    {formatLawdogAgreementStatusLabel(row, rowProgress)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div
                    className="relative flex flex-wrap items-center gap-1.5"
                    ref={menuOpen ? menuRef : undefined}
                  >
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-open-${row.id}`}
                      disabled={contentUnavailable}
                      onClick={() => {
                        if (contentUnavailable) return;
                        if (openAction.kind === "focus_review_status") {
                          onFocusReviewStatus?.(row.id);
                          return;
                        }
                        if (openAction.kind === "manage_recipients") {
                          onNavigate(`${buildOwnerAgreementReadOnlyPath(row.id)}?recipients=1`, {
                            agreementId: row.id,
                          });
                          return;
                        }
                        onNavigate(openAction.path, {
                          kind: openAction.kind,
                          agreementId: row.id,
                        });
                      }}
                    >
                      Open
                    </button>
                    {internalStatus === "in_review" ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                        data-testid={`lawdog-action-manage-recipients-${row.id}`}
                        disabled={contentUnavailable}
                        onClick={() => {
                          if (contentUnavailable) return;
                          onNavigate(`${buildOwnerAgreementReadOnlyPath(row.id)}?recipients=1`);
                        }}
                      >
                        {CREATOR_MANAGE_RECIPIENTS_LABEL}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--compact vs01-btn--secondary !mt-0"
                      data-testid={`lawdog-action-more-${row.id}`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      disabled={contentUnavailable}
                      onClick={() => {
                        if (contentUnavailable) return;
                        setOpenMenuId((prev) => (prev === row.id ? null : row.id));
                      }}
                    >
                      More
                    </button>
                    {menuOpen ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-slate-700 bg-slate-950 py-1 shadow-lg"
                        data-testid={`lawdog-action-menu-${row.id}`}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900"
                          data-testid={`lawdog-action-duplicate-${row.id}`}
                          onClick={() => {
                            setOpenMenuId(null);
                            initializeNewAgreementSession({ priorAgreementId: row.id });
                            markPaidDashboardCreateContext("dashboard_duplicate");
                            onNavigate("/app/create");
                          }}
                        >
                          Duplicate
                        </button>
                        {canDownload ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50"
                            data-testid={`lawdog-action-download-${row.id}`}
                            disabled={downloadBusy}
                            onClick={() => {
                              if (downloadBusy) return;
                              void (async () => {
                                setPdfDownloadBusyId(row.id);
                                setPdfErrorById((prev) => {
                                  const next = { ...prev };
                                  delete next[row.id];
                                  return next;
                                });
                                try {
                                  await downloadCompletedSignedAgreementPdf({
                                    agreementId: row.id,
                                    title: row.title,
                                  });
                                  setOpenMenuId(null);
                                } catch {
                                  setPdfErrorById((prev) => ({
                                    ...prev,
                                    [row.id]: "PDF download failed. Try again from the signed view.",
                                  }));
                                } finally {
                                  setPdfDownloadBusyId(null);
                                }
                              })();
                            }}
                          >
                            {downloadBusy ? "Preparing PDF…" : CREATOR_DOWNLOAD_PDF_LABEL}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900"
                          data-testid={
                            isArchived
                              ? `lawdog-action-unarchive-${row.id}`
                              : `lawdog-action-archive-${row.id}`
                          }
                          onClick={() => {
                            setOpenMenuId(null);
                            const request: LawdogWorkspaceArchiveRequest = {
                              agreementId: row.id,
                              title,
                              archived: !isArchived,
                            };
                            if (onWorkspaceArchive) {
                              onWorkspaceArchive(request);
                              return;
                            }
                            // Legacy path used by older tests/call sites.
                            void (async () => {
                              const { patchWorkspaceArchive } = await import(
                                "../agreement/agreementWorkspaceApi"
                              );
                              const ok = await patchWorkspaceArchive(row.id, !isArchived);
                              if (ok) onArchiveComplete?.();
                            })();
                          }}
                        >
                          {isArchived ? "Unarchive" : "Archive"}
                        </button>
                      </div>
                    ) : null}
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
