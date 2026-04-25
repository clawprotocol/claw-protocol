import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { RecordsExportControlBar } from "../export/RecordsExportControlBar";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import { useLaunchNav } from "../launch/LaunchNavContext";
import {
  bundleForWorkspaceRow,
  normalizeLifecycleForOpen,
  type AgreementLifecycle,
} from "./agreementLifecycle";
import {
  CollapsibleDocumentSection,
  DOC_LIST_EMPTY,
  DOC_LIST_SECTION_ORDER,
  DOC_LIST_SECTION_TITLE,
  docListAgreementSection,
  docListPrimaryCtaForRowStatus,
  DocumentListEmpty,
  DocumentListRow,
  DocumentListSectionGroup,
  DocumentListStacks,
  DocumentListUnstyledUl,
  formatRelativeUpdated,
  type DocListFunnelSection,
} from "../documents/DocumentWorkspaceListUi";
import {
  fetchWorkspaceIndex,
  patchWorkspaceArchive,
  patchWorkspaceFolder,
  patchWorkspaceTags,
  type WorkspaceIndexAgreement,
} from "./agreementWorkspaceApi";
import { usePowerGatedNavigation } from "../monetization/usePowerGatedNavigation";
import { createProofFolder, fetchProofFolders, type ProofFolderRow } from "../workspace/workspaceFoldersApi";

const RECENT_DAYS = 30;

function partiesSubline(row: WorkspaceIndexAgreement): string {
  const n = row.party_count;
  const partyPart = !n ? "No parties yet" : `${n} ${n === 1 ? "party" : "parties"}`;
  const updated = formatRelativeUpdated(row.updated_at);
  return `${partyPart} · Updated ${updated}`;
}

function parseSearchParams(search: string): URLSearchParams {
  const raw = search.startsWith("?") ? search.slice(1) : search.replace(/^\?/, "");
  return new URLSearchParams(raw);
}

function agreementsListHref(opts: { view?: "all" | "recent" | "unfiled"; folder?: string | null }): string {
  const q = new URLSearchParams();
  if (opts.folder?.trim()) q.set("folder", opts.folder.trim());
  else if (opts.view && opts.view !== "all") q.set("view", opts.view);
  const qs = q.toString();
  return qs ? `/app/agreements?${qs}` : "/app/agreements";
}

function withinRecentDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 86_400_000;
}

function parseTagsInput(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

type RowVm = {
  row: WorkspaceIndexAgreement;
  openLifecycle: AgreementLifecycle;
};

type TagFilter = "any" | "tagged" | "untagged";

function navPillClass(active: boolean): string {
  const base =
    "min-h-9 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors max-lg:shrink-0";
  return active
    ? `${base} border-teal-700/60 bg-teal-950/35 text-teal-50`
    : `${base} border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-600 hover:text-slate-100`;
}

export function MyAgreementsLanding(props: {
  onNewAgreement: () => void;
  onOpenAgreement: (row: WorkspaceIndexAgreement) => void;
  /** Workspace row list for access / capacity context (e.g. active agreement count). */
  onWorkspaceIndex?: (rows: WorkspaceIndexAgreement[]) => void;
}) {
  const { navigateToWorkProduct } = usePowerGatedNavigation();
  const { navigate, search } = useLaunchNav();
  const { onNewAgreement, onOpenAgreement, onWorkspaceIndex } = props;
  const [rows, setRows] = useState<WorkspaceIndexAgreement[]>([]);
  const [folders, setFolders] = useState<ProofFolderRow[]>([]);
  const [folderLoadError, setFolderLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportPick, setExportPick] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>("any");
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [tagEditId, setTagEditId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagSaving, setTagSaving] = useState(false);

  const params = useMemo(() => parseSearchParams(search), [search]);
  const folderId = params.get("folder");
  const listView = useMemo((): "all" | "recent" | "unfiled" => {
    if (folderId) return "all";
    const v = params.get("view");
    if (v === "recent" || v === "unfiled") return v;
    return "all";
  }, [folderId, params]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (folderId) {
      r = r.filter((x) => (x.workspace_folder_id || "").trim() === folderId);
    } else if (listView === "unfiled") {
      r = r.filter((x) => !(x.workspace_folder_id || "").trim());
    } else if (listView === "recent") {
      r = r.filter((x) => withinRecentDays(x.updated_at, RECENT_DAYS));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      r = r.filter((x) => {
        const title = (x.title || "").toLowerCase();
        const fn = (x.workspace_folder_name || "").toLowerCase();
        const tg = (x.workspace_tags || []).join(" ").toLowerCase();
        return title.includes(q) || fn.includes(q) || tg.includes(q);
      });
    }
    if (tagFilter === "tagged") r = r.filter((x) => (x.workspace_tags?.length ?? 0) > 0);
    if (tagFilter === "untagged") r = r.filter((x) => (x.workspace_tags?.length ?? 0) === 0);
    return r;
  }, [rows, folderId, listView, searchQuery, tagFilter]);

  const exportToolbarTarget = useMemo(
    () => exportPick ?? (filteredRows.length === 1 ? filteredRows[0].id : null),
    [exportPick, filteredRows],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [idx, flds] = await Promise.all([fetchWorkspaceIndex(), fetchProofFolders()]);
    setRows(idx.agreements);
    setLoadError(idx.error);
    if (flds.error) setFolderLoadError(flds.error);
    else {
      setFolderLoadError(null);
      setFolders(flds.folders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    onWorkspaceIndex?.(rows);
  }, [rows, onWorkspaceIndex]);

  const vms = useMemo((): RowVm[] => {
    return filteredRows.map((row) => {
      const bundle = bundleForWorkspaceRow(row.id);
      const openLifecycle = normalizeLifecycleForOpen(row, bundle);
      return { row, openLifecycle };
    });
  }, [filteredRows]);

  const bySection = useMemo(() => {
    const m = new Map<DocListFunnelSection, RowVm[]>();
    for (const s of DOC_LIST_SECTION_ORDER) m.set(s, []);
    for (const vm of vms) {
      const sec = docListAgreementSection(vm.openLifecycle);
      m.get(sec)!.push(vm);
    }
    return m;
  }, [vms]);

  const listEmptyReason = useMemo((): string | null => {
    if (loading || rows.length === 0) return null;
    if (filteredRows.length > 0) return null;
    if (folderId) return "No records in this folder.";
    if (listView === "unfiled") return "Nothing unfiled — every record is in a folder.";
    if (listView === "recent") return "No agreements updated in the last 30 days.";
    if (searchQuery.trim() || tagFilter !== "any") return "No matching records.";
    return null;
  }, [loading, rows.length, filteredRows.length, folderId, listView, searchQuery, tagFilter]);

  const onCreateFolder = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const nm = newFolderName.trim();
      if (!nm || folderCreating) return;
      setFolderCreating(true);
      const res = await createProofFolder(nm);
      setFolderCreating(false);
      if (!res.ok) {
        setFolderLoadError(res.error || "Could not create folder.");
        return;
      }
      setNewFolderName("");
      setFolderLoadError(null);
      if (res.folder?.folder_id) navigate(agreementsListHref({ folder: res.folder.folder_id }));
      void reload();
    },
    [folderCreating, navigate, newFolderName, reload],
  );

  const overflowForRow = useCallback(
    (row: WorkspaceIndexAgreement) => {
      const openLifecycle = normalizeLifecycleForOpen(row, bundleForWorkspaceRow(row.id));
      const base = [
        {
          id: "copy-agreement-id",
          label: "Copy agreement ID",
          onSelect: async () => {
            try {
              await navigator.clipboard.writeText(row.id);
            } catch {
              /* ignore */
            }
          },
        },
        {
          id: "select-export",
          label: "Select for export",
          onSelect: () => setExportPick(row.id),
        },
        {
          id: "edit-tags",
          label: "Edit tags",
          onSelect: () => {
            setTagEditId(row.id);
            setTagDraft((row.workspace_tags || []).join(", "));
          },
        },
      ];
      const moves = folders.map((f) => ({
        id: `folder-${f.folder_id}`,
        label: `Move to “${f.folder_name}”`,
        onSelect: async () => {
          const ok = await patchWorkspaceFolder(row.id, f.folder_id);
          if (ok) void reload();
        },
      }));
      const unfiled = {
        id: "unfile",
        label: "Move to Unfiled",
        onSelect: async () => {
          const ok = await patchWorkspaceFolder(row.id, null);
          if (ok) void reload();
        },
      };
      const archiveToggle =
        openLifecycle === "archived"
          ? {
              id: "unarchive",
              label: "Unarchive",
              onSelect: async () => {
                const ok = await patchWorkspaceArchive(row.id, false);
                if (ok) void reload();
              },
            }
          : {
              id: "archive",
              label: "Archive",
              onSelect: async () => {
                const ok = await patchWorkspaceArchive(row.id, true);
                if (ok) void reload();
              },
            };
      return [...base, unfiled, ...moves, archiveToggle];
    },
    [folders, reload],
  );

  return (
    <div className="vs01-my-agreements">
      <div className="vs01-my-agreements-header">
        <div>
          <p className="vs01-agreement-ws-eyebrow">Agreement workspace</p>
          <h2 className="vs01-card-title vs01-agreement-ws-step-title">My agreements</h2>
          <p className="vs01-card-help vs01-agreement-ws-step-sub">
            Open a saved agreement or start a new one. Documents are grouped by where they are in your process.
          </p>
          <p className="vs01-card-help mt-2 text-xs leading-relaxed text-slate-400">
            Need a stakeholder memo or issue write-up?{" "}
            <button
              type="button"
              className="font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
              onClick={() => navigateToWorkProduct("my_agreements_landing")}
            >
              Generate structured work product
            </button>{" "}
            <span className="text-slate-500">from this workspace (higher tiers). {NOT_LEGAL_ADVICE}</span>
          </p>
        </div>
        <div className="vs01-my-agreements-actions">
          <button type="button" className="vs01-btn vs01-btn--primary" onClick={onNewAgreement}>
            New agreement
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact"
            disabled={loading}
            onClick={() => void reload()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <aside className="shrink-0 lg:w-48" aria-label="Record collections">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Browse</p>
          <nav className="flex flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap" role="navigation">
            <button
              type="button"
              className={navPillClass(!folderId && listView === "all")}
              onClick={() => navigate(agreementsListHref({ view: "all", folder: null }))}
            >
              All records
            </button>
            <button
              type="button"
              className={navPillClass(!folderId && listView === "recent")}
              onClick={() => navigate(agreementsListHref({ view: "recent", folder: null }))}
            >
              Recent
            </button>
            <button
              type="button"
              className={navPillClass(!folderId && listView === "unfiled")}
              onClick={() => navigate(agreementsListHref({ view: "unfiled", folder: null }))}
            >
              Unfiled
            </button>
            {folders.map((f) => (
              <button
                key={f.folder_id}
                type="button"
                className={navPillClass(folderId === f.folder_id)}
                onClick={() => navigate(agreementsListHref({ folder: f.folder_id }))}
              >
                {f.folder_name}
              </button>
            ))}
          </nav>
          <form onSubmit={onCreateFolder} className="mt-4 flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">New folder</label>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                maxLength={120}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-slate-800/90 bg-slate-950/50 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={folderCreating || !newFolderName.trim()}
                className="min-h-9 rounded-md border border-slate-700/80 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>
          {folderLoadError ? (
            <p className="mt-2 text-sm text-amber-200" role="status">
              {folderLoadError}
            </p>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <RecordsExportControlBar
            className="mb-2"
            hasRecords={rows.length > 0}
            folderId={folderId}
            selectedAgreementId={exportToolbarTarget}
            workspaceRowsForAi={rows}
            onWorkspaceOrganizationApplied={() => void reload()}
          />
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            Your records stay easy to find and export.
          </p>

          <label className="sr-only" htmlFor="records-search">
            Search records
          </label>
          <input
            id="records-search"
            type="search"
            autoComplete="off"
            placeholder="Search records"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-800/90 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
          />

          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tag filters">
            <button
              type="button"
              className={navPillClass(tagFilter === "any")}
              onClick={() => setTagFilter("any")}
            >
              All tags
            </button>
            <button
              type="button"
              className={navPillClass(tagFilter === "tagged")}
              onClick={() => setTagFilter("tagged")}
            >
              Tagged
            </button>
            <button
              type="button"
              className={navPillClass(tagFilter === "untagged")}
              onClick={() => setTagFilter("untagged")}
            >
              Untagged
            </button>
          </div>

          {tagEditId ? (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-800/80 bg-slate-950/30 px-3 py-3 sm:flex-row sm:items-center sm:flex-wrap">
              <span className="text-sm text-slate-300">Tags (comma-separated)</span>
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-slate-800/90 bg-slate-950/50 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                aria-label="Edit tags"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={tagSaving}
                  className="min-h-9 rounded-md border border-teal-800/60 px-3 py-2 text-sm font-medium text-teal-200 hover:bg-teal-950/30 disabled:opacity-40"
                  onClick={async () => {
                    if (!tagEditId || tagSaving) return;
                    setTagSaving(true);
                    const ok = await patchWorkspaceTags(tagEditId, parseTagsInput(tagDraft));
                    setTagSaving(false);
                    if (ok) {
                      setTagEditId(null);
                      void reload();
                    }
                  }}
                >
                  Save tags
                </button>
                <button
                  type="button"
                  className="min-h-9 rounded-md border border-slate-700/80 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
                  onClick={() => setTagEditId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div
              className="mb-4 mt-4 rounded-lg border border-amber-800/50 bg-amber-950/25 px-3 py-2 text-sm text-amber-100"
              role="alert"
            >
              {loadError}
            </div>
          ) : null}

          {loading ? <p className="vs01-card-help mt-4">Loading…</p> : null}

          {!loading && rows.length === 0 && !loadError ? (
            <p className="mt-6 text-base leading-relaxed text-slate-300">No records yet.</p>
          ) : null}

          {!loading && listEmptyReason ? (
            <p className="mt-6 text-base leading-relaxed text-slate-300" role="status">
              {listEmptyReason}
            </p>
          ) : null}

          {!loading && rows.length > 0 && !listEmptyReason ? (
            <DocumentListStacks>
              {DOC_LIST_SECTION_ORDER.map((sec) => {
                const list = bySection.get(sec) ?? [];

                if (sec === "archive") {
                  return (
                    <CollapsibleDocumentSection
                      key={sec}
                      title={DOC_LIST_SECTION_TITLE.archive}
                      count={list.length}
                      defaultCollapsed
                    >
                      {list.length === 0 ? (
                        <DocumentListEmpty message={DOC_LIST_EMPTY.archive} />
                      ) : (
                        <DocumentListUnstyledUl>
                          {list.map(({ row, openLifecycle }) => (
                            <li key={row.id}>
                              <DocumentListRow
                                title={(row.title || "").trim() || "Untitled agreement"}
                                subline={partiesSubline(row)}
                                folderLabel={row.workspace_folder_name ?? null}
                                tags={row.workspace_tags || []}
                                status={openLifecycle}
                                primaryCta={docListPrimaryCtaForRowStatus(openLifecycle)}
                                onPrimaryClick={() => onOpenAgreement(row)}
                                overflowItems={overflowForRow(row)}
                              />
                            </li>
                          ))}
                        </DocumentListUnstyledUl>
                      )}
                    </CollapsibleDocumentSection>
                  );
                }

                return (
                  <DocumentListSectionGroup
                    key={sec}
                    headingId={`doc-sec-agreement-${sec}`}
                    title={DOC_LIST_SECTION_TITLE[sec]}
                  >
                    {list.length === 0 ? (
                      <DocumentListEmpty message={DOC_LIST_EMPTY[sec]} />
                    ) : (
                      <DocumentListUnstyledUl>
                        {list.map(({ row, openLifecycle }) => (
                          <li key={row.id}>
                            <DocumentListRow
                              title={(row.title || "").trim() || "Untitled agreement"}
                              subline={partiesSubline(row)}
                              folderLabel={row.workspace_folder_name ?? null}
                              tags={row.workspace_tags || []}
                              status={openLifecycle}
                              primaryCta={docListPrimaryCtaForRowStatus(openLifecycle)}
                              onPrimaryClick={() => onOpenAgreement(row)}
                              overflowItems={overflowForRow(row)}
                            />
                          </li>
                        ))}
                      </DocumentListUnstyledUl>
                    )}
                  </DocumentListSectionGroup>
                );
              })}
            </DocumentListStacks>
          ) : null}
        </div>
      </div>
    </div>
  );
}
