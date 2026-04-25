import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { AppShell } from "../AppShell";
import { useLaunchNav } from "../LaunchNavContext";
import { usePowerGatedNavigation } from "../../monetization/usePowerGatedNavigation";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import {
  type LayoutAnalysisResponse,
  type LayoutFieldCandidateEnriched,
  type ReviewAction,
  fetchLayoutAnalysis,
  postFieldReviewOpen,
  putReviewManifest,
} from "./documentLayoutApi";
import { apiUrl } from "../../lib/clawApi";
import { AI_ASSISTIVE_SHORT } from "../../compliance/disclosureCopy";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const FIELD_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "signature_line", label: "Signature" },
  { value: "printed_name_line", label: "Legal name" },
  { value: "date_line", label: "Date" },
  { value: "initials_line", label: "Initials" },
  { value: "text_field", label: "Text" },
  { value: "amount_blank", label: "Amount / number" },
  { value: "freeform_blank_line", label: "Blank line" },
];

const CRITICAL_FIELD_TYPES = new Set([
  "signature_line",
  "date_line",
  "printed_name_line",
  "initials_line",
]);

const SIGNER_ROLE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  { value: "unknown", label: "Party: not set", hint: "OK while drafting; set before multi-party send." },
  { value: "signer", label: "Signer — executes this field", hint: "Primary execution role for this line." },
  { value: "sender", label: "Sender / initiator", hint: "Your side of the agreement." },
  { value: "recipient", label: "Recipient / counter-signer", hint: "The other party’s line." },
  { value: "counterparty", label: "Counterparty (generic)", hint: "Use when party splits aren’t sender/recipient yet." },
];

function effectiveConfDisplay(c: LayoutFieldCandidateEnriched): number | undefined {
  if (typeof c.confidence_score === "number") return c.confidence_score;
  if (typeof c.effective_confidence === "number") return c.effective_confidence;
  return c.confidence;
}

function needsLowConfidenceAck(c: LayoutFieldCandidateEnriched, relabelType: string): boolean {
  if (!CRITICAL_FIELD_TYPES.has(relabelType)) return false;
  const ec = effectiveConfDisplay(c);
  const th = c.placement_threshold;
  if (ec == null || th == null) return false;
  return ec < th;
}

function confidenceLabel(c: number | undefined, opts?: { critical?: boolean }): string {
  if (c == null || Number.isNaN(c)) return "Estimate — please verify on the page";
  const pct = Math.round(Math.min(1, Math.max(0, c)) * 100);
  const crit = opts?.critical ? " For signature, date, name, and initials we stay conservative — " : " ";
  if (pct >= 72) return `Strong suggestion (${pct}%) — quick visual check recommended.`;
  if (pct >= 58) return `Possible match (${pct}%).${crit}Confirm the highlight lines up with the right line.`;
  return `Low confidence (${pct}%).${crit}Please verify or correct this box before sending.`;
}

function overlayClass(state: string, reviewCue?: boolean): string {
  switch (state) {
    case "confirmed":
      return "border-emerald-400/90 bg-emerald-500/15 ring-1 ring-emerald-400/50";
    case "corrected":
      return "border-sky-400/90 bg-sky-500/15 ring-1 ring-sky-400/50";
    case "rejected":
      return "border-slate-600 bg-slate-900/40 opacity-40 line-through decoration-slate-400";
    case "manually_added":
      return "border-violet-400/90 bg-violet-500/15 ring-1 ring-violet-400/40";
    default:
      return `border-amber-400/85 bg-amber-500/10 ring-1 ${reviewCue ? "ring-rose-400/55" : "ring-amber-400/40"}`;
  }
}

function bboxToStyle(b: { x: number; y: number; width: number; height: number }): CSSProperties {
  return {
    left: `${b.x * 100}%`,
    top: `${b.y * 100}%`,
    width: `${b.width * 100}%`,
    height: `${b.height * 100}%`,
  };
}

type AddMode = string | null;

export function FieldReviewPage(props: { analysisId: string }) {
  const { analysisId } = props;
  const { navigate, search } = useLaunchNav();
  const { navigateToWorkProduct } = usePowerGatedNavigation();
  const docIdParam = new URLSearchParams(search).get("documentId")?.trim() || "";

  const [model, setModel] = useState<LayoutAnalysisResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [correctType, setCorrectType] = useState<string>("signature_line");
  const [correctLabel, setCorrectLabel] = useState("");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [lowConfAck, setLowConfAck] = useState(false);
  const [signerRole, setSignerRole] = useState("unknown");
  const [pdfPages, setPdfPages] = useState<number | null>(null);
  const [documentContentType, setDocumentContentType] = useState<string | null>(null);
  const drawRef = useRef<{
    page: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  const effectiveDocId = docIdParam || String(model?.document_id_ref || "").trim() || null;
  const docUrl = effectiveDocId ? apiUrl(`/v1/documents/${encodeURIComponent(effectiveDocId)}/content`) : null;

  const reload = useCallback(async () => {
    setLoadErr(null);
    const data = await fetchLayoutAnalysis(analysisId);
    setModel(data);
  }, [analysisId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        await postFieldReviewOpen(analysisId);
        logProductEvent("field_review_opened", { analysisId });
        const data = await fetchLayoutAnalysis(analysisId);
        if (!cancel) setModel(data);
      } catch (e) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : "Could not load analysis.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [analysisId]);

  useEffect(() => {
    if (!effectiveDocId) {
      setDocumentContentType(null);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/v1/documents/${encodeURIComponent(effectiveDocId)}`));
        const j = (await res.json()) as { document?: { content_type?: string } };
        const ct = String(j?.document?.content_type || "");
        if (!cancel) setDocumentContentType(ct || "application/pdf");
      } catch {
        if (!cancel) setDocumentContentType("application/pdf");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [effectiveDocId]);

  const isImageDoc = (documentContentType || "").startsWith("image/");

  const runActions = useCallback(
    async (actions: ReviewAction[]) => {
      setBusy(true);
      setLoadErr(null);
      try {
        const next = await putReviewManifest(analysisId, actions);
        setModel(next);
        for (const a of actions) {
          if (a.action === "confirm") logProductEvent("field_candidate_confirmed", { analysisId });
          if (a.action === "correct") logProductEvent("field_candidate_corrected", { analysisId });
          if (a.action === "reject") logProductEvent("field_candidate_rejected", { analysisId });
          if (a.action === "add_manual") logProductEvent("field_candidate_added_manually", { analysisId });
        }
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Save failed.");
      } finally {
        setBusy(false);
      }
    },
    [analysisId],
  );

  const candidates = model?.field_candidates_enriched ?? [];
  const manual = model?.manual_fields ?? [];

  const nextReviewCandidateKey = useMemo(() => {
    const c = candidates.find((x) => x.review_state === "suggested" && Boolean(x.review_required));
    return c ? `c:${c.candidate_id}` : null;
  }, [candidates]);

  const selectedCandidate = candidates.find((c) => `c:${c.candidate_id}` === selectedKey) ?? null;
  const selectedManual = manual.find((m) => `m:${m.manual_field_id}` === selectedKey) ?? null;

  useEffect(() => {
    if (selectedCandidate) {
      setCorrectType(selectedCandidate.user_field_type || selectedCandidate.field_type_guess || "signature_line");
      setCorrectLabel(String(selectedCandidate.user_label ?? selectedCandidate.label_text ?? ""));
      setSignerRole(
        String(selectedCandidate.signer_role || "unknown")
          .toLowerCase()
          .trim() || "unknown",
      );
    } else if (selectedManual) {
      setSignerRole(
        String(selectedManual.signer_role || "unknown")
          .toLowerCase()
          .trim() || "unknown",
      );
    } else {
      setSignerRole("unknown");
    }
  }, [selectedCandidate, selectedManual]);

  useEffect(() => {
    setLowConfAck(false);
  }, [selectedKey, correctType]);

  const pagesToShow = isImageDoc ? 1 : pdfPages || 0;

  const onOverlayPointerDown = (pageNum: number, e: React.PointerEvent) => {
    if (!addMode || !e.currentTarget) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    drawRef.current = { page: pageNum, x, y, active: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onOverlayPointerUp = (pageNum: number, e: React.PointerEvent) => {
    if (!addMode || !drawRef.current?.active) {
      drawRef.current = null;
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x2 = (e.clientX - r.left) / r.width;
    const y2 = (e.clientY - r.top) / r.height;
    const { x: x1, y: y1 } = drawRef.current;
    drawRef.current = null;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    if (w < 0.012 || h < 0.008) {
      setLoadErr("Drag a slightly larger box so we can place the field.");
      return;
    }
    void runActions([
      {
        action: "add_manual",
        page_number: pageNum,
        field_type: addMode,
        signer_role: signerRole !== "unknown" ? signerRole : undefined,
        bbox_normalized: {
          x: Math.max(0, Math.min(1 - w, x)),
          y: Math.max(0, Math.min(1 - h, y)),
          width: Math.min(1, w),
          height: Math.min(1, h),
          space: "normalized_page",
        },
        label: "",
      },
    ]);
    setAddMode(null);
  };

  return (
    <AppShell
      title="Review detected fields"
      subtitle="Lock in signature, date, and name lines on letters and forms — then carry the same placements into CLAW’s signing prep without re-marking the PDF."
    >
      <div className="space-y-6">
        {loadErr ? (
          <div className="rounded-lg border border-rose-800/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
            {loadErr}
          </div>
        ) : null}

        {model ? (
          <p className="text-[11px] leading-relaxed text-slate-600">
            After layout review, you can summarize or analyze across materials:{" "}
            <button
              type="button"
              className="font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
              onClick={() => navigateToWorkProduct("field_review_page")}
            >
              Build white paper or issue analysis from source set
            </button>
            <span className="text-slate-600">
              {" "}
              — Pro / eligible plans. {AI_ASSISTIVE_SHORT}
            </span>
          </p>
        ) : null}

        {model?.signing_readiness ? (
          <section
            className={`rounded-xl border px-4 py-4 sm:px-5 ${
              model.signing_readiness.signing_ready
                ? "border-emerald-800/45 bg-gradient-to-b from-emerald-950/25 to-slate-950/40"
                : "border-amber-800/50 bg-gradient-to-b from-amber-950/30 to-slate-950/40"
            }`}
            role="status"
            aria-labelledby="signing-prep-status"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  id="signing-prep-status"
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                >
                  Signing prep handoff
                </p>
                <p className="mt-1 text-base font-semibold text-white">{model.signing_readiness.headline}</p>
                {model.signing_readiness.handoff_line ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300/95">
                    {model.signing_readiness.handoff_line}
                  </p>
                ) : null}
              </div>
              {model.signing_readiness.signing_ready ? (
                <span className="shrink-0 rounded-full border border-emerald-500/35 bg-emerald-950/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100/95">
                  One step away
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-950/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100/95">
                  Review first
                </span>
              )}
            </div>

            {!model.signing_readiness.signing_ready &&
            (model.signing_readiness.blocking_prompts?.length ||
              model.signing_readiness.critical_types_unconfirmed?.length) ? (
              <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/85">
                  Before signing prep
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-[12px] leading-snug text-amber-50/95">
                  {(model.signing_readiness.blocking_prompts?.length
                    ? model.signing_readiness.blocking_prompts
                    : (model.signing_readiness.summary_messages ?? []).slice(1)
                  ).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                {nextReviewCandidateKey ? (
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-semibold text-amber-200/95 underline-offset-2 hover:text-amber-100 hover:underline"
                    onClick={() => setSelectedKey(nextReviewCandidateKey)}
                  >
                    Jump to next required field
                  </button>
                ) : null}
              </div>
            ) : null}

            {model.signing_readiness.signing_ready &&
            (model.signing_readiness.readiness_highlights?.length ?? 0) > 0 ? (
              <div className="mt-3 rounded-lg border border-emerald-800/35 bg-emerald-950/15 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">
                  Readiness summary
                </p>
                <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-emerald-50/95">
                  {model.signing_readiness.readiness_highlights!.map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-emerald-400/90" aria-hidden>
                        ✓
                      </span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {model.signing_readiness.role_clarity_note ? (
              <p className="mt-3 rounded-lg border border-sky-800/40 bg-sky-950/20 px-3 py-2 text-[12px] leading-snug text-sky-100/90">
                <span className="font-semibold text-sky-200/95">Roles · </span>
                {model.signing_readiness.role_clarity_note}
              </p>
            ) : null}

            {model.signing_readiness.blockers?.length ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Technical: {model.signing_readiness.blockers.join(" · ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            {!docUrl ? (
              <p className="text-sm text-slate-500">
                Add <span className="text-slate-400">?documentId=…</span> to the URL (same id as in document store) to
                show the page preview with overlays. You can still use detection data from the analysis record.
              </p>
            ) : null}

            {docUrl && documentContentType && isImageDoc ? (
              <div className="relative mx-auto max-w-3xl overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950">
                <img src={docUrl} alt="" className="block w-full" />
                <div
                  className={`absolute inset-0 ${addMode ? "cursor-crosshair" : "cursor-default"}`}
                  onPointerDown={(e) => onOverlayPointerDown(1, e)}
                  onPointerUp={(e) => onOverlayPointerUp(1, e)}
                >
                  {candidates
                    .filter((c) => c.page_number === 1)
                    .map((c) => (
                      <button
                        key={c.candidate_id}
                        type="button"
                        className={`absolute box-border rounded-sm ${overlayClass(
                          c.review_state,
                          c.review_state === "suggested" && Boolean(c.review_required),
                        )}`}
                        style={bboxToStyle(c.bbox_normalized)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (addMode) return;
                          setSelectedKey(`c:${c.candidate_id}`);
                        }}
                      >
                        <span className="sr-only">{c.field_type_guess}</span>
                      </button>
                    ))}
                  {manual
                    .filter((m) => m.page_number === 1 && m.review_state !== "rejected")
                    .map((m) => (
                      <button
                        key={m.manual_field_id}
                        type="button"
                        className={`absolute box-border rounded-sm ${overlayClass(m.review_state)}`}
                        style={bboxToStyle(m.bbox_normalized)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (addMode) return;
                          setSelectedKey(`m:${m.manual_field_id}`);
                        }}
                      >
                        <span className="sr-only">{m.field_type}</span>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            {docUrl && !documentContentType ? (
              <p className="text-sm text-slate-500">Loading document preview…</p>
            ) : null}

            {docUrl && documentContentType && !isImageDoc ? (
              <Document
                file={docUrl}
                loading={<p className="text-sm text-slate-500">Loading document…</p>}
                error={<p className="text-sm text-rose-300">Could not load PDF preview.</p>}
                onLoadSuccess={(d) => setPdfPages(d.numPages)}
                className="space-y-6"
              >
                {pagesToShow > 0
                    ? Array.from({ length: pagesToShow }, (_, i) => i + 1).map((pn) => (
                      <div
                        key={pn}
                        className="relative mx-auto inline-block max-w-full overflow-hidden rounded-lg border border-slate-800/80"
                      >
                        <Page
                          pageNumber={pn}
                          width={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 48 : 720)}
                          renderAnnotationLayer={false}
                          renderTextLayer
                        />
                        <div
                          className={`absolute inset-0 ${addMode ? "cursor-crosshair" : "cursor-default"}`}
                          onPointerDown={(e) => onOverlayPointerDown(pn, e)}
                          onPointerUp={(e) => onOverlayPointerUp(pn, e)}
                        >
                          {candidates
                            .filter((c) => c.page_number === pn)
                            .map((c) => (
                              <button
                                key={c.candidate_id}
                                type="button"
                                className={`absolute box-border rounded-sm ${overlayClass(
                                  c.review_state,
                                  c.review_state === "suggested" && Boolean(c.review_required),
                                )}`}
                                style={bboxToStyle(c.bbox_normalized)}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (addMode) return;
                                  setSelectedKey(`c:${c.candidate_id}`);
                                }}
                              >
                                <span className="pointer-events-none absolute -top-6 left-0 max-w-[12rem] truncate text-[10px] font-medium text-slate-200">
                                  {c.label_text || c.field_type_guess}
                                </span>
                              </button>
                            ))}
                          {manual
                            .filter((m) => m.page_number === pn && m.review_state !== "rejected")
                            .map((m) => (
                              <button
                                key={m.manual_field_id}
                                type="button"
                                className={`absolute box-border rounded-sm ${overlayClass(m.review_state)}`}
                                style={bboxToStyle(m.bbox_normalized)}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (addMode) return;
                                  setSelectedKey(`m:${m.manual_field_id}`);
                                }}
                              >
                                <span className="pointer-events-none absolute -top-6 left-0 text-[10px] font-medium text-violet-200">
                                  {m.label || m.field_type}
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))
                  : null}
              </Document>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-slate-800/60 pt-4">
              <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Add a field if something was missed — drag on the page
              </span>
              {FIELD_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`vs01-btn vs01-btn--compact text-[11px] ${addMode === opt.value ? "vs01-btn--primary" : "vs01-btn--secondary"}`}
                  onClick={() => setAddMode((m) => (m === opt.value ? null : opt.value))}
                >
                  + {opt.label}
                </button>
              ))}
              {addMode ? (
                <>
                  <span className="text-[11px] text-amber-200/90">
                    Drag a rectangle on the page to place the{" "}
                    {FIELD_TYPE_OPTIONS.find((o) => o.value === addMode)?.label}.
                  </span>
                  <label className="flex w-full max-w-md flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="shrink-0">Signer role (optional)</span>
                    <select
                      className="vs01-input flex-1 min-w-[10rem] py-1 text-[11px]"
                      value={signerRole}
                      onChange={(e) => setSignerRole(e.target.value)}
                    >
                      {SIGNER_ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <aside className="w-full shrink-0 space-y-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 lg:w-80">
            <h2 className="text-sm font-semibold text-slate-100">Field details</h2>
            {!selectedCandidate && !selectedManual ? (
              <p className="text-xs leading-relaxed text-slate-500">
                Select a highlighted region, or add one with the buttons above. Amber boxes are automatic suggestions;
                rose-trim boxes need a closer look. Signatures, dates, names, and initials always deserve a quick
                on-page check.
              </p>
            ) : null}

            {selectedCandidate ? (
              <div className="space-y-3 text-xs">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Detected suggestion</p>
                {selectedCandidate.ux_label ? (
                  <p className="rounded border border-slate-700/80 bg-slate-900/60 px-2 py-1.5 text-[11px] font-medium leading-snug text-slate-100">
                    {selectedCandidate.ux_label}
                  </p>
                ) : null}
                {selectedCandidate.confidence_band ? (
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    Confidence band:{" "}
                    <span className="text-slate-300">{selectedCandidate.confidence_band}</span>
                    {selectedCandidate.auto_usable ? (
                      <span className="text-emerald-300/80"> · OK for automation (non-critical)</span>
                    ) : null}
                    {selectedCandidate.critical_field ? (
                      <span className="text-amber-200/80"> · Critical field — extra care</span>
                    ) : null}
                  </p>
                ) : null}
                {selectedCandidate.safety_reason ? (
                  <p className="text-[11px] leading-snug text-amber-200/90">{selectedCandidate.safety_reason}</p>
                ) : null}
                <p className="text-slate-200">
                  <span className="text-slate-500">Type guess: </span>
                  {selectedCandidate.field_type_guess.replace(/_/g, " ")}
                </p>
                <p className="text-slate-400">
                  {confidenceLabel(effectiveConfDisplay(selectedCandidate), {
                    critical: Boolean(selectedCandidate.critical_field),
                  })}
                </p>
                {typeof selectedCandidate.placement_threshold === "number" ? (
                  <p className="text-[11px] text-slate-500">
                    Trust threshold for this field type:{" "}
                    <span className="text-slate-400">
                      {(selectedCandidate.placement_threshold * 100).toFixed(0)}%
                    </span>{" "}
                    · effective score:{" "}
                    <span className="text-slate-400">
                      {((effectiveConfDisplay(selectedCandidate) ?? 0) * 100).toFixed(0)}%
                    </span>
                  </p>
                ) : null}
                {selectedCandidate.confidence_user_guidance ? (
                  <div className="rounded border border-slate-800/80 bg-slate-900/55 p-2 text-[11px] leading-snug text-slate-300">
                    {selectedCandidate.confidence_user_guidance}
                  </div>
                ) : null}
                {selectedCandidate.label_text ? (
                  <p className="text-slate-300">
                    <span className="text-slate-500">Label: </span>
                    {selectedCandidate.label_text}
                  </p>
                ) : null}
                {selectedCandidate.nearby_text_context ? (
                  <div className="rounded border border-slate-800/60 bg-slate-900/40 p-2 text-[11px] leading-snug text-slate-400">
                    <span className="font-medium text-slate-500">Nearby text: </span>
                    {selectedCandidate.nearby_text_context}
                  </div>
                ) : null}
                <div className="space-y-2 border-t border-slate-800/50 pt-3">
                  <label className="block text-[11px] text-slate-500" htmlFor="correct-type">
                    Relabel if wrong
                  </label>
                  <select
                    id="correct-type"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
                    value={correctType}
                    onChange={(e) => setCorrectType(e.target.value)}
                    disabled={busy || selectedCandidate.review_state === "rejected"}
                  >
                    {FIELD_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
                    placeholder="Optional label"
                    value={correctLabel}
                    onChange={(e) => setCorrectLabel(e.target.value)}
                    disabled={busy || selectedCandidate.review_state === "rejected"}
                  />
                  <label className="block text-[11px] text-slate-500" htmlFor="signer-role">
                    Who completes this field?
                  </label>
                  <select
                    id="signer-role"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-100"
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value)}
                    disabled={busy || selectedCandidate.review_state === "rejected"}
                  >
                    {SIGNER_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {SIGNER_ROLE_OPTIONS.find((o) => o.value === signerRole)?.hint ? (
                    <p className="text-[10px] leading-snug text-slate-500">
                      {SIGNER_ROLE_OPTIONS.find((o) => o.value === signerRole)?.hint}
                    </p>
                  ) : null}
                  {Boolean(selectedCandidate.critical_field) && signerRole === "unknown" ? (
                    <p className="rounded border border-amber-800/45 bg-amber-950/20 p-2 text-[11px] leading-snug text-amber-100/90">
                      For signature, date, name, and initials, assign a party when you can — it keeps routing obvious in
                      the next step.
                    </p>
                  ) : null}
                </div>
                {needsLowConfidenceAck(selectedCandidate, correctType) ? (
                  <label className="flex cursor-pointer items-start gap-2 rounded border border-amber-800/50 bg-amber-950/20 p-2 text-[11px] leading-snug text-amber-100/95">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={lowConfAck}
                      onChange={(e) => setLowConfAck(e.target.checked)}
                      disabled={busy || selectedCandidate.review_state === "rejected"}
                    />
                    <span>
                      I verified on the document that this highlight matches the correct{" "}
                      {correctType.replace(/_/g, " ")} location (detection was below our cautious bar).
                    </span>
                  </label>
                ) : null}
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--primary vs01-btn--compact text-xs"
                    disabled={
                      busy ||
                      selectedCandidate.review_state === "rejected" ||
                      (needsLowConfidenceAck(selectedCandidate, correctType) && !lowConfAck)
                    }
                    onClick={() =>
                      void runActions([
                        {
                          action: "confirm",
                          candidate_id: selectedCandidate.candidate_id,
                          field_type: correctType,
                          label: correctLabel.trim() || undefined,
                          signer_role: signerRole !== "unknown" ? signerRole : undefined,
                          acknowledge_low_confidence: needsLowConfidenceAck(selectedCandidate, correctType)
                            ? true
                            : undefined,
                        },
                      ])
                    }
                  >
                    Confirm placement
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact text-xs"
                    disabled={
                      busy ||
                      selectedCandidate.review_state === "rejected" ||
                      (needsLowConfidenceAck(selectedCandidate, correctType) && !lowConfAck)
                    }
                    onClick={() =>
                      void runActions([
                        {
                          action: "correct",
                          candidate_id: selectedCandidate.candidate_id,
                          field_type: correctType,
                          label: correctLabel.trim() || undefined,
                          signer_role: signerRole !== "unknown" ? signerRole : undefined,
                          acknowledge_low_confidence: needsLowConfidenceAck(selectedCandidate, correctType)
                            ? true
                            : undefined,
                        },
                      ])
                    }
                  >
                    Save as corrected type
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-rose-300/90 underline-offset-2 hover:underline"
                    disabled={busy}
                    onClick={() => {
                      void runActions([{ action: "reject", candidate_id: selectedCandidate.candidate_id }]);
                      setSelectedKey(null);
                    }}
                  >
                    Reject — not a field
                  </button>
                </div>
              </div>
            ) : null}

            {selectedManual ? (
              <div className="space-y-2 text-xs">
                <p className="text-slate-200">Manual {selectedManual.field_type.replace(/_/g, " ")}</p>
                <button
                  type="button"
                  className="text-xs font-medium text-rose-300/90 underline-offset-2 hover:underline"
                  disabled={busy}
                  onClick={() => {
                    void runActions([{ action: "reject_manual", manual_field_id: selectedManual.manual_field_id }]);
                    setSelectedKey(null);
                  }}
                >
                  Remove manual field
                </button>
              </div>
            ) : null}

            <div className="border-t border-slate-800/50 pt-3 text-[11px] text-slate-500">
              {model?.layout_confidence_summary ? (
                <p className="mb-2 leading-snug text-slate-400">
                  Policy: {model.layout_confidence_summary.low_confidence_count ?? 0} low ·{" "}
                  {model.layout_confidence_summary.critical_review_required_count ?? 0} critical need review ·{" "}
                  {model.layout_confidence_summary.auto_usable_count ?? 0} auto-usable (non-critical)
                </p>
              ) : null}
              <p>
                Prepared fields:{" "}
                <span className="font-medium text-slate-300">
                  {model?.downstream_field_manifest?.field_count ?? 0}
                </span>
                {typeof model?.downstream_field_manifest?.blocked_by_confidence_previously === "number" &&
                (model?.downstream_field_manifest?.blocked_by_confidence_previously ?? 0) > 0 ? (
                  <span className="text-amber-200/85">
                    {" "}
                    · {model.downstream_field_manifest!.blocked_by_confidence_previously} held back (confidence)
                  </span>
                ) : null}
              </p>
              <p className="mt-2 leading-snug">{model?.downstream_field_manifest?.disclaimer}</p>
            </div>

            <button type="button" className="vs01-btn vs01-btn--secondary w-full text-xs" onClick={() => void reload()}>
              Refresh from server
            </button>
            <button type="button" className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline" onClick={() => navigate("/app")}>
              Back to dashboard
            </button>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
