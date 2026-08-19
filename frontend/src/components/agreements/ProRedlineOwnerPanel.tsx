import { useCallback, useMemo, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  downloadExportDraftDocx,
  downloadExportDraftTxt,
  postProRedlineAcceptImport,
  postProRedlineImportText,
  postProRedlineRejectImport,
  postProRedlineSuggestionMarkApplied,
  postProRedlineSuggestionReject,
} from "../../agreement/proRedlineReviewApi";
import { executePremiumRefineUpdate } from "./premiumRefineLateFeeFallback";
import { pickAuthoritativeProCorpusForRefine, PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED } from "./premiumRefineAcceptance";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { SourceComparisonReviewPanel } from "./SourceComparisonReviewPanel";
import {
  extractRevisedDraftPlainText,
  REVISED_DRAFT_FILE_INPUT_ACCEPT,
} from "../../agreement/recipientRevisedDraftImportText";
import { logReviewMode } from "./agreementReviewMode";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { readUploadedSourceDocument, writeUploadedSourceDocument } from "./uploadedSourceDocumentStorage";

export type ProRedlineSuggestionRow = {
  id: string;
  created_at?: string;
  reviewer_label?: string;
  reviewer_email?: string;
  suggestion_text?: string;
  status?: string;
};

type ProRedlineVersionEvent = {
  version_number?: number;
  source?: string;
  actor_label?: string;
  actor_email?: string | null;
  created_at?: string;
  suggestion_id?: string;
  suggestion_text?: string | null;
  rejection_kind?: string;
  pending_revision_id?: string | null;
  note?: string;
};

type ProRedlineV1 = {
  version_counter?: number;
  version_events?: ProRedlineVersionEvent[];
  pending_import?: {
    id?: string;
    base_document_text?: string;
    imported_document_text?: string;
    imported_text?: string;
    diff_summary_json?: { changed_block_count?: number };
    imported_len?: number;
    base_len?: number;
  } | null;
  suggestions?: ProRedlineSuggestionRow[];
};

function readProRedline(d: AgreementDraft | null): ProRedlineV1 {
  const raw = (d as unknown as { pro_redline_v1?: ProRedlineV1 }).pro_redline_v1;
  return raw && typeof raw === "object" ? raw : {};
}

function formatProRedlineLocalTime(iso: string | undefined | null): string {
  const s = (iso || "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function versionEventLabel(ev: ProRedlineVersionEvent): string {
  const src = String(ev.source || "");
  if (src === "imported_revision") return "Imported revision (compare)";
  if (src === "owner_accepted_revision") {
    const n = ev.version_number;
    return typeof n === "number" && n > 0 ? `Accepted version ${n}` : "Accepted revision";
  }
  if (src === "owner_rejected_revision") {
    if (ev.rejection_kind === "import") return "Rejected imported draft";
    if (ev.rejection_kind === "suggestion") return "Rejected suggestion";
    return ev.suggestion_id ? "Rejected suggestion" : "Rejected imported draft";
  }
  if (src === "reviewer_suggestion") return "Reviewer suggestion";
  return src ? src.replace(/_/g, " ") : "Event";
}

export function ProRedlineOwnerPanel(props: {
  agreementId: string;
  draft: AgreementDraft | null;
  intakeTextFallback: string;
  onDraftReplaced: (next: AgreementDraft) => void;
}) {
  const { agreementId, draft, intakeTextFallback, onDraftReplaced } = props;
  const pr = useMemo(() => readProRedline(draft), [draft]);
  const pending = pr.pending_import ?? null;
  const suggestions = (pr.suggestions ?? []).filter((s) => (s.status || "pending") === "pending");
  const uploadedSource = useMemo(() => readUploadedSourceDocument(agreementId), [agreementId, draft]);
  const currentDraftText = useMemo(() => {
    const pick = pickAuthoritativePlainForSendHandoff(draft as unknown as ParsedDraftShape);
    return (pick?.text ?? "").trim();
  }, [draft]);
  const versionEvents = useMemo(() => {
    const ve = pr.version_events;
    if (!Array.isArray(ve)) return [];
    return ve.filter((x): x is ProRedlineVersionEvent => x != null && typeof x === "object");
  }, [pr.version_events]);

  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<null | "import" | "accept" | "reject" | "export" | "copy">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sBusy, setSBusy] = useState<string | null>(null);

  const draftAsParsed = draft as unknown as ParsedDraftShape | null;
  const exportCorpus = useMemo(
    () =>
      pickAuthoritativeProCorpusForRefine({
        draft: draftAsParsed,
        agreementDocumentText: "",
      }),
    [draftAsParsed],
  );

  const runImportText = useCallback(
    async (t: string) => {
      setMsg(null);
      setBusy("import");
      try {
        const r = await postProRedlineImportText(agreementId, t);
        if (!r.ok) {
          setMsg(r.error || "Import failed.");
          return;
        }
        const { fetchAgreementDraft } = await import("../../agreement/agreementWorkspaceApi");
        const fd = await fetchAgreementDraft(agreementId);
        if (fd.draft) onDraftReplaced(fd.draft);
        setPaste("");
        setMsg(r.no_changes || (r.changed_block_count ?? 0) === 0 ? "No changes detected." : "Changes detected");
      } finally {
        setBusy(null);
      }
    },
    [agreementId, onDraftReplaced],
  );

  const onPickFile = useCallback(
    async (f: File | null) => {
      if (!f) return;
      setMsg(null);
      setBusy("import");
      try {
        const extracted = await extractRevisedDraftPlainText(f);
        if (!extracted.ok) {
          setMsg(extracted.error || "Could not read file.");
          return;
        }
        writeUploadedSourceDocument(agreementId, {
          text: extracted.text,
          fileName: f.name,
          savedAt: Date.now(),
        });
        logReviewMode("source_comparison", "pro_redline_file_import");
        const r = await postProRedlineImportText(agreementId, extracted.text);
        if (!r.ok) {
          setMsg(r.error || "Import failed.");
          return;
        }
        const { fetchAgreementDraft } = await import("../../agreement/agreementWorkspaceApi");
        const fd = await fetchAgreementDraft(agreementId);
        if (fd.draft) onDraftReplaced(fd.draft);
        setMsg(r.no_changes || (r.changed_block_count ?? 0) === 0 ? "No changes detected." : "Changes detected");
      } finally {
        setBusy(null);
      }
    },
    [agreementId, onDraftReplaced],
  );

  const pendingSourceText = String(
    (pending as { base_document_text?: string } | null)?.base_document_text ?? "",
  ).trim();
  const pendingRevisedText = String(
    (pending as { imported_document_text?: string; imported_text?: string } | null)?.imported_document_text ??
      (pending as { imported_text?: string } | null)?.imported_text ??
      "",
  ).trim();

  return (
    <section
      className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-4 py-4 sm:px-5 sm:py-5"
      aria-labelledby="pro-redline-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pro-redline-heading" className="text-sm font-semibold tracking-tight text-slate-100">
          Review changes
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Redline comparison</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
        LawDog shows only what changed from your uploaded file or import. No AI legal review is applied.
      </p>

      <div className="mt-4 border-t border-slate-800/80 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Export draft</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800/90 disabled:opacity-50 sm:text-sm"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("export");
              setMsg(null);
              const r = await downloadExportDraftTxt(agreementId);
              setBusy(null);
              if (!r.ok) setMsg(r.error || "Export failed.");
            }}
          >
            Export draft (.txt)
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800/90 disabled:opacity-50 sm:text-sm"
            disabled={busy !== null || !exportCorpus.text.trim()}
            onClick={async () => {
              setBusy("copy");
              setMsg(null);
              try {
                await navigator.clipboard.writeText(exportCorpus.text);
                setMsg("Copied current agreement text to clipboard.");
              } catch {
                setMsg("Could not copy to clipboard.");
              } finally {
                setBusy(null);
              }
            }}
          >
            Copy text
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-700/80 px-3 py-2 text-[11px] font-semibold text-slate-400 hover:bg-slate-900/80 disabled:opacity-50"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("export");
              setMsg(null);
              const r = await downloadExportDraftDocx(agreementId);
              setBusy(null);
              if (!r.ok) setMsg(r.error || "Export failed.");
            }}
          >
            Also export .docx
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Import edited draft</p>
        <p className="text-[11px] text-slate-600">PDF, TXT, or Markdown — deterministic compare only (no AI review).</p>
        <label className="block text-xs text-slate-400">
          <span className="sr-only">Choose file</span>
          <input
            type="file"
            accept={REVISED_DRAFT_FILE_INPUT_ACCEPT}
            className="block w-full max-w-md text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-slate-100"
            disabled={busy !== null}
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="Or paste edited agreement text here…"
          className="mt-2 w-full max-w-2xl rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
          disabled={busy !== null}
        />
        <button
          type="button"
          className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-50 sm:text-sm"
          disabled={busy !== null || !paste.trim()}
          onClick={() => void runImportText(paste)}
        >
          Compare pasted text
        </button>
      </div>

      {pending ? (
        <div className="mt-5 border-t border-slate-800/80 pt-4">
          {pendingSourceText.length >= 200 && pendingRevisedText.length >= 200 ? (
            <SourceComparisonReviewPanel
              agreementId={agreementId}
              sourceText={pendingSourceText}
              revisedText={pendingRevisedText}
              extractionState={{ ok: true }}
              disabled={busy !== null}
            />
          ) : (
            <p className="text-xs text-amber-200/90">
              Import pending — compare snapshots are still loading. You can accept or reject the imported version now.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-50 sm:text-sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("accept");
                setMsg(null);
                try {
                  const r = await postProRedlineAcceptImport(agreementId);
                  if (!r.ok || !r.draft) setMsg(r.error || "Could not accept.");
                  else {
                    onDraftReplaced(r.draft);
                    const vn = r.version_number;
                    setMsg(
                      typeof vn === "number"
                        ? `Imported version accepted (version ${vn}).`
                        : "Imported version accepted.",
                    );
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              Accept imported version
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900 disabled:opacity-50 sm:text-sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("reject");
                setMsg(null);
                try {
                  const r = await postProRedlineRejectImport(agreementId);
                  if (!r.ok || !r.draft) setMsg(r.error || "Could not reject.");
                  else {
                    onDraftReplaced(r.draft);
                    setMsg("Import rejected — your current draft is unchanged.");
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              Reject imported version
            </button>
          </div>
        </div>
      ) : (uploadedSource?.text ?? "").trim().length >= 200 && currentDraftText.length >= 200 ? (
        <div className="mt-5 border-t border-slate-800/80 pt-4">
          <SourceComparisonReviewPanel
            agreementId={agreementId}
            sourceText={(uploadedSource?.text ?? "").trim()}
            revisedText={currentDraftText}
            extractionState={{ ok: true }}
            onEditWording={() => {
              const el = document.getElementById("simple-flow-revise");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            disabled={busy !== null}
          />
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-5 space-y-3 border-t border-slate-800/80 pt-4">
          <p className="text-sm font-semibold text-slate-100">Suggested changes</p>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-3">
                <p className="text-[11px] text-slate-500">
                  {(s.reviewer_label || "").trim() || "Reviewer"}
                  {(s.reviewer_email || "").trim() ? ` · ${(s.reviewer_email || "").trim()}` : ""}
                  {s.created_at ? ` · ${formatProRedlineLocalTime(s.created_at)}` : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{s.suggestion_text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-50"
                    disabled={sBusy !== null}
                    onClick={async () => {
                      setSBusy(s.id);
                      setMsg(null);
                      try {
                        const corpus = pickAuthoritativeProCorpusForRefine({
                          draft: draftAsParsed,
                          agreementDocumentText: "",
                        });
                        const instr = (s.suggestion_text || "").trim();
                        const resolved = await executePremiumRefineUpdate({
                          baselineText: corpus.text,
                          baselineLen: corpus.len,
                          intakeText: intakeTextFallback,
                          userInstruction: instr,
                        });
                        if (resolved.acceptance.decision !== "accepted" || !resolved.finalText.trim()) {
                          setMsg(
                            resolved.surgicalRejectedShortExhausted
                              ? PRO_REFINE_SURGICAL_REJECTED_SHORT_EXHAUSTED
                              : "LawDog Pro could not apply that suggestion safely. Try a narrower edit or Edit wording.",
                          );
                          return;
                        }
                        const applied = await postProRedlineSuggestionMarkApplied(agreementId, s.id, {
                          appliedDocumentText: resolved.finalText,
                        });
                        if (!applied.ok || !applied.draft) {
                          setMsg(applied.error || "Applied refine but could not mark suggestion.");
                          return;
                        }
                        onDraftReplaced(applied.draft);
                      } catch (e) {
                        setMsg(String(e));
                      } finally {
                        setSBusy(null);
                      }
                    }}
                  >
                    Apply with LawDog Pro
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900 disabled:opacity-50"
                    disabled={sBusy !== null}
                    onClick={async () => {
                      setSBusy(s.id);
                      setMsg(null);
                      try {
                        const r = await postProRedlineSuggestionReject(agreementId, s.id);
                        if (!r.ok || !r.draft) setMsg(r.error || "Reject failed.");
                        else onDraftReplaced(r.draft);
                      } finally {
                        setSBusy(null);
                      }
                    }}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-2 border-t border-slate-800/80 pt-4">
        <p className="text-sm font-semibold text-slate-100">Version history</p>
        <ul className="max-h-56 space-y-2 overflow-y-auto text-xs text-slate-400">
          {draft?.created_at ? (
            <li className="flex flex-col gap-0.5 rounded border border-slate-800/60 bg-slate-950/40 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-slate-300">Draft created</span>
              <span className="shrink-0 text-[11px] text-slate-500">{formatProRedlineLocalTime(draft.created_at)}</span>
            </li>
          ) : null}
          {versionEvents.map((ev, idx) => (
            <li
              key={`${ev.created_at || ""}-${idx}-${ev.suggestion_id || ev.pending_revision_id || ""}`}
              className="flex flex-col gap-0.5 rounded border border-slate-800/60 bg-slate-950/40 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-slate-300">{versionEventLabel(ev)}</span>
              <span className="shrink-0 text-[11px] text-slate-500">{formatProRedlineLocalTime(ev.created_at)}</span>
            </li>
          ))}
          {!draft?.created_at && versionEvents.length === 0 ? (
            <li className="text-[11px] text-slate-600">No history yet — export, import, or receive reviewer suggestions.</li>
          ) : null}
        </ul>
      </div>

      {msg ? (
        <p className="mt-3 text-xs text-slate-400" role="status">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
