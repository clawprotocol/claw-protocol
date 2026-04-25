import { useCallback, useEffect, useState } from "react";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  patchWorkspaceFolder,
  patchWorkspaceTags,
} from "../agreement/agreementWorkspaceApi";
import {
  buildOrganizeSuggestions,
  type OrganizeAiScope,
  type OrganizeSuggestionRow,
} from "./organizeWithAiSuggestions";
import { AI_ASSISTIVE_SHORT, AI_ORGANIZE_WORKSPACE_METADATA_SHORT } from "../compliance/disclosureCopy";
import { createProofFolder, fetchProofFolders, type ProofFolderRow } from "./workspaceFoldersApi";

export type OrganizeWithAiModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceRows: WorkspaceIndexAgreement[];
  folderId?: string | null;
  selectedAgreementId?: string | null;
  onApplied?: () => void;
};

type Step = 1 | 2 | 3 | 4;

type PreviewLine = {
  agreementId: string;
  title: string;
  folderName: string;
  tagsCsv: string;
  accepted: boolean;
  reason: string;
};

function suggestionToPreview(r: OrganizeSuggestionRow): PreviewLine {
  return {
    agreementId: r.agreementId,
    title: r.title,
    folderName: r.suggestedFolderName,
    tagsCsv: r.suggestedTags.join(", "),
    accepted: true,
    reason: r.reason,
  };
}

export function OrganizeWithAiModal(props: OrganizeWithAiModalProps) {
  const { open, onClose, workspaceRows, folderId, selectedAgreementId, onApplied } = props;
  const [step, setStep] = useState<Step>(1);
  const [scope, setScope] = useState<OrganizeAiScope>("all");
  const [folders, setFolders] = useState<ProofFolderRow[]>([]);
  const [folderErr, setFolderErr] = useState<string | null>(null);
  const [weak, setWeak] = useState<"add_more" | "no_strong" | null>(null);
  const [preview, setPreview] = useState<PreviewLine[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setScope("all");
    setWeak(null);
    setPreview([]);
    setApplyErr(null);
    setApplying(false);
    void (async () => {
      const res = await fetchProofFolders();
      if (res.error) setFolderErr(res.error);
      else {
        setFolderErr(null);
        setFolders(res.folders);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const runGenerate = useCallback(() => {
    const res = buildOrganizeSuggestions(workspaceRows, scope, { selectedId: selectedAgreementId, folderId }, folders);
    setWeak(res.weak ?? null);
    setPreview((res.rows || []).map(suggestionToPreview));
    setStep(3);
  }, [workspaceRows, scope, selectedAgreementId, folderId, folders]);

  const applyAccepted = useCallback(async () => {
    const lines = preview.filter((p) => p.accepted);
    if (lines.length === 0) return;
    setApplying(true);
    setApplyErr(null);
    const nameToId = new Map<string, string>();
    for (const f of folders) {
      nameToId.set(f.folder_name.trim().toLowerCase(), f.folder_id);
    }
    try {
      for (const line of lines) {
        const nm = line.folderName.trim();
        if (nm) {
          let fid = nameToId.get(nm.toLowerCase());
          if (!fid) {
            const created = await createProofFolder(nm);
            if (created.ok && created.folder?.folder_id) {
              fid = created.folder.folder_id;
              nameToId.set(nm.toLowerCase(), fid);
            }
          }
          if (fid) {
            const okF = await patchWorkspaceFolder(line.agreementId, fid);
            if (!okF) {
              setApplyErr("Some folder updates could not be saved. Try again.");
              setApplying(false);
              return;
            }
          }
        }
        const tags = line.tagsCsv
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12);
        const okT = await patchWorkspaceTags(line.agreementId, tags);
        if (!okT) {
          setApplyErr("Some tag updates could not be saved. Try again.");
          setApplying(false);
          return;
        }
      }
      setStep(4);
      onApplied?.();
    } catch {
      setApplyErr("Something went wrong. Try again.");
    }
    setApplying(false);
  }, [preview, folders, onApplied]);

  if (!open) return null;

  const scopeSelectedOk = Boolean((selectedAgreementId || "").trim());
  const scopeFolderOk = Boolean((folderId || "").trim());
  const canContinueStep2 =
    scope === "all" || (scope === "selected" && scopeSelectedOk) || (scope === "folder" && scopeFolderOk);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col rounded-t-xl border border-slate-800/90 bg-slate-950 shadow-xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organize-ai-title"
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3">
          <h2 id="organize-ai-title" className="text-base font-semibold text-slate-100">
            {step === 4 ? "Done" : "Organize with AI"}
          </h2>
          <button
            type="button"
            className="min-h-9 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === 1 ? (
            <div className="space-y-3 text-sm leading-relaxed text-slate-300">
              <p className="text-slate-300">
                We suggest folders, tags, and light groupings from titles and workspace metadata. Nothing applies until you
                review, edit, and confirm.
              </p>
              <p className="text-sm leading-relaxed text-slate-400">
                {AI_ORGANIZE_WORKSPACE_METADATA_SHORT} {AI_ASSISTIVE_SHORT}
              </p>
              <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-400">
                <li>Suggested folders</li>
                <li>Suggested tags</li>
                <li>Grouping related records (by topic cues in titles)</li>
              </ul>
              <p className="text-xs leading-relaxed text-slate-400">
                Faster folders, tags, and grouping suggestions. You can edit folders and tags anytime afterward.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-300">Choose which records to include for suggestions.</p>
              <fieldset className="space-y-2">
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2.5">
                  <input
                    type="radio"
                    name="ai-scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200">All records</span>
                    <span className="mt-0.5 block text-xs text-slate-400">Full workspace list</span>
                  </span>
                </label>
                <label
                  className={`flex min-h-12 items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    scopeSelectedOk
                      ? "cursor-pointer border-slate-800/80 bg-slate-950/40"
                      : "cursor-not-allowed border-slate-800/40 opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-scope"
                    disabled={!scopeSelectedOk}
                    checked={scope === "selected"}
                    onChange={() => setScope("selected")}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200">Selected record</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {scopeSelectedOk ? "From your export selection" : "Select a record for export first"}
                    </span>
                  </span>
                </label>
                <label
                  className={`flex min-h-12 items-start gap-3 rounded-lg border px-3 py-2.5 ${
                    scopeFolderOk
                      ? "cursor-pointer border-slate-800/80 bg-slate-950/40"
                      : "cursor-not-allowed border-slate-800/40 opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-scope"
                    disabled={!scopeFolderOk}
                    checked={scope === "folder"}
                    onChange={() => setScope("folder")}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200">Current folder</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {scopeFolderOk ? "Only records in this folder view" : "Open a folder to use this scope"}
                    </span>
                  </span>
                </label>
              </fieldset>
              {folderErr ? <p className="text-sm text-amber-200">{folderErr}</p> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-100">Review AI suggestions</h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Edit suggestions before applying. Only checked rows update folder/tag metadata (not proof).{" "}
                {AI_ASSISTIVE_SHORT}
              </p>
              {weak === "add_more" ? (
                <p className="text-sm leading-relaxed text-slate-300">Add more records to use AI organization.</p>
              ) : null}
              {weak === "no_strong" ? (
                <p className="text-sm leading-relaxed text-slate-300">No strong organization suggestions found.</p>
              ) : null}
              {!weak && preview.length === 0 ? (
                <p className="text-sm leading-relaxed text-slate-300">No suggestions for this scope.</p>
              ) : null}
              {!weak && preview.length > 0 ? (
                <ul className="space-y-3">
                  {preview.map((line, idx) => (
                    <li
                      key={line.agreementId}
                      className="rounded-lg border border-slate-800/80 bg-slate-950/35 px-3 py-2.5"
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={line.accepted}
                          onChange={(e) => {
                            const next = [...preview];
                            next[idx] = { ...line, accepted: e.target.checked };
                            setPreview(next);
                          }}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-100">{line.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-400">{line.reason}</span>
                          <label className="mt-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                            Folder
                            <input
                              type="text"
                              value={line.folderName}
                              disabled={!line.accepted}
                              onChange={(e) => {
                                const next = [...preview];
                                next[idx] = { ...line, folderName: e.target.value };
                                setPreview(next);
                              }}
                              className="mt-0.5 w-full rounded border border-slate-800/90 bg-slate-950/60 px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-40"
                              placeholder="Suggested folder"
                            />
                          </label>
                          <label className="mt-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
                            Tags (comma-separated)
                            <input
                              type="text"
                              value={line.tagsCsv}
                              disabled={!line.accepted}
                              onChange={(e) => {
                                const next = [...preview];
                                next[idx] = { ...line, tagsCsv: e.target.value };
                                setPreview(next);
                              }}
                              className="mt-0.5 w-full rounded border border-slate-800/90 bg-slate-950/60 px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-40"
                            />
                          </label>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              {applyErr ? <p className="text-sm text-rose-200">{applyErr}</p> : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2 text-sm leading-relaxed text-slate-300">
              <p className="font-medium text-slate-100">Organization updated.</p>
              <p className="text-xs text-slate-400">You can edit folders and tags anytime.</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 px-4 py-3">
          {step === 1 ? (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900"
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          ) : null}
          {step === 2 ? (
            <>
              <button
                type="button"
                className="min-h-10 rounded-lg border border-slate-800/80 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!canContinueStep2}
                className="min-h-10 rounded-lg border border-teal-800/60 bg-teal-950/30 px-4 py-2 text-sm font-medium text-teal-100 hover:bg-teal-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => runGenerate()}
              >
                Generate suggestions
              </button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <button
                type="button"
                className="min-h-10 rounded-lg border border-slate-800/80 px-4 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                onClick={() => {
                  setStep(2);
                  setWeak(null);
                  setPreview([]);
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={applying || !preview.some((p) => p.accepted) || weak !== null || preview.length === 0}
                className="min-h-10 rounded-lg border border-teal-800/60 bg-teal-950/30 px-4 py-2 text-sm font-medium text-teal-100 hover:bg-teal-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void applyAccepted()}
              >
                {applying ? "Applying…" : "Apply accepted"}
              </button>
            </>
          ) : null}
          {step === 4 ? (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900"
              onClick={onClose}
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
