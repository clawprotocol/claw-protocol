import { useEffect, useMemo, useState } from "react";
import { useAccess } from "../access/AccessContext";
import {
  canUseAdvancedWorkProduct,
  readLawDogUserMonetizationState,
} from "../monetization/lawDogMonetization";
import { usePowerPaywall } from "../monetization/PowerPaywallContext";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { getOrgId } from "./orgContext";
import { fetchWorkspaceIndex, type WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  AWP_REFINE_MODES,
  createAwpDraft,
  documentToMarkdown,
  fetchAwpMeta,
  patchAwpDraft,
  preflightAwp,
  refineAwpSection,
  type AwpDocument,
  type AwpMaterialAssessment,
  type AwpMetaResponse,
  type AwpSourceItem,
  type AwpTemplate,
} from "./advancedWorkProductApi";
import { AI_ASSISTIVE_SHORT } from "../compliance/disclosureCopy";

type Step = 1 | 2 | 3 | 4;

const STUDIO_SUBTITLE =
  "Structured drafting from your workspace materials. Outputs are assistive drafts for you to edit — not verifier proofs or signed records. " +
  AI_ASSISTIVE_SHORT;

const WIZARD_STEPS: { step: Step; label: string; sub: string }[] = [
  { step: 1, label: "Template", sub: "Output shape" },
  { step: 2, label: "Sources", sub: "Evidence set" },
  { step: 3, label: "Brief", sub: "Scope & thesis" },
  { step: 4, label: "Studio", sub: "Edit & export" },
];

function supportQualityStyles(q: string): string {
  switch (q) {
    case "high":
      return "border-emerald-700/50 bg-emerald-950/35 text-emerald-200/95";
    case "medium":
      return "border-sky-700/45 bg-sky-950/30 text-sky-200/90";
    case "low":
      return "border-amber-700/45 bg-amber-950/25 text-amber-200/85";
    case "minimal":
      return "border-rose-800/35 bg-rose-950/20 text-rose-200/85";
    default:
      return "border-slate-700/70 bg-slate-900/45 text-slate-400";
  }
}

export function AdvancedWorkProductPage() {
  const { navigate } = useLaunchNav();
  const access = useAccess();
  const { openPowerPaywall } = usePowerPaywall();
  const awpAllowed = useMemo(
    () => canUseAdvancedWorkProduct(readLawDogUserMonetizationState(access.tier, access.usage)),
    [access.tier, access.usage]
  );
  const orgId = getOrgId();
  const [meta, setMeta] = useState<AwpMetaResponse | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [agreements, setAgreements] = useState<WorkspaceIndexAgreement[]>([]);
  const [step, setStep] = useState<Step>(1);
  const [outputType, setOutputType] = useState<string>("");
  const [selectedAgreementIds, setSelectedAgreementIds] = useState<Set<string>>(new Set());
  const [useWorkspaceContext, setUseWorkspaceContext] = useState(true);
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [weakMaterialGate, setWeakMaterialGate] = useState<AwpMaterialAssessment | null>(null);
  const [supportOpenFor, setSupportOpenFor] = useState<string | null>(null);
  const [refiningKey, setRefiningKey] = useState<string | null>(null);
  const [doc, setDoc] = useState<AwpDocument | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [flowError, setFlowError] = useState<string | null>(null);

  useEffect(() => {
    logProductEvent("advanced_work_product_opened", { org_id: orgId });
  }, [orgId]);

  useEffect(() => {
    if (!awpAllowed) {
      openPowerPaywall("advanced_work_product_page", "advanced_work_product");
    }
  }, [awpAllowed, openPowerPaywall]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const m = await fetchAwpMeta(orgId);
        if (cancel) return;
        setMeta(m);
        setMetaErr(null);
        if (m.entitlement_tier === "none") {
          logProductEvent("advanced_work_product_paywall_shown", { org_id: orgId });
        }
      } catch (e) {
        if (!cancel) {
          setMetaErr(
            e instanceof Error && e.message.trim()
              ? e.message
              : "We couldn't reach the LawDog service. Check your connection and try again.",
          );
        }
      }
    })();
    void (async () => {
      const { agreements: rows } = await fetchWorkspaceIndex();
      if (!cancel) setAgreements(rows);
    })();
    return () => {
      cancel = true;
    };
  }, [orgId]);

  const templatesById = useMemo(() => {
    const m = new Map<string, AwpTemplate>();
    meta?.templates.forEach((t) => m.set(t.id, t));
    return m;
  }, [meta]);

  const hasSourceMaterial = selectedAgreementIds.size > 0 || useWorkspaceContext;
  const attachedSourceCount = selectedAgreementIds.size + (useWorkspaceContext ? 1 : 0);

  const locked = meta?.entitlement_tier === "none";

  function toggleAgreement(id: string): void {
    setSelectedAgreementIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllAgreements(): void {
    setSelectedAgreementIds(new Set(agreements.map((a) => a.id)));
  }

  function clearAgreementSelection(): void {
    setSelectedAgreementIds(new Set());
  }

  function buildSources(): AwpSourceItem[] {
    const list: AwpSourceItem[] = [];
    for (const id of selectedAgreementIds) {
      const row = agreements.find((a) => a.id === id);
      list.push({
        id,
        kind: "agreement",
        label: row?.title || id,
        excerpt: row?.title ? `Workspace agreement: ${row.title}` : undefined,
      });
    }
    if (useWorkspaceContext) {
      list.push({
        id: `ctx_${orgId}`,
        kind: "workspace_context",
        label: "Current workspace context",
        excerpt: `Org ${orgId} — user indicated context from current workspace; attach more excerpts in future for tighter grounding.`,
      });
    }
    return list;
  }

  async function runCreate(): Promise<void> {
    if (!outputType || locked) return;
    setFlowError(null);
    setGenerating(true);
    setSaveState("idle");
    const sources = buildSources();
    logProductEvent("advanced_work_product_sources_selected", {
      count: sources.length,
      agreement_count: selectedAgreementIds.size,
      workspace_context: useWorkspaceContext,
    });
    try {
      const res = await createAwpDraft(orgId, {
        output_type: outputType,
        user_instructions: instructions.trim() || null,
        audience: audience.trim() || null,
        objective: objective.trim() || null,
        use_workspace_context: useWorkspaceContext,
        sources,
      });
      setDoc(res.document);
      setStep(4);
      logProductEvent("advanced_work_product_generated", {
        doc_id: res.document.id,
        output_type: res.document.output_type,
        used_llm: res.generation?.used_llm ?? false,
      });
    } catch (e) {
      setFlowError(
        e instanceof Error && e.message.trim()
          ? e.message
          : "We couldn't generate your document. Check your connection and try again.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function onGenerateClick(): Promise<void> {
    if (!outputType || locked) return;
    setFlowError(null);
    const sources = buildSources();
    try {
      const pf = await preflightAwp(orgId, { use_workspace_context: useWorkspaceContext, sources });
      const t = pf.material_assessment?.tier;
      if (t === "thin" || t === "sparse") {
        setWeakMaterialGate(pf.material_assessment);
        return;
      }
    } catch (e) {
      setFlowError(
        e instanceof Error && e.message.trim()
          ? e.message
          : "We couldn't check your sources. Please try again.",
      );
      return;
    }
    await runCreate();
  }

  async function generateDespiteWeakSources(): Promise<void> {
    setWeakMaterialGate(null);
    await runCreate();
  }

  async function onRefineSection(sectionKey: string, mode: string): Promise<void> {
    if (!doc) return;
    setFlowError(null);
    setRefiningKey(sectionKey);
    try {
      const res = await refineAwpSection(orgId, doc.id, { section_key: sectionKey, mode });
      setDoc(res.document);
      logProductEvent("advanced_work_product_refined", { doc_id: doc.id, mode });
    } catch (e) {
      setFlowError(
        e instanceof Error && e.message.trim()
          ? e.message
          : "That section couldn't be refined right now. Please try again.",
      );
    } finally {
      setRefiningKey(null);
    }
  }

  function sourceById(id: string): AwpSourceItem | undefined {
    return doc?.sources?.find((s) => s.id === id);
  }

  async function onSaveSections(): Promise<void> {
    if (!doc) return;
    setFlowError(null);
    setSaveState("saving");
    try {
      await patchAwpDraft(orgId, doc.id, { sections: doc.sections });
      setSaveState("saved");
      logProductEvent("advanced_work_product_refined", { doc_id: doc.id });
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
      setFlowError("Couldn't save your draft. Please try again.");
    }
  }

  function exportMarkdown(): void {
    if (!doc) return;
    const md = documentToMarkdown(doc);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `claw-work-product-${doc.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(u);
    logProductEvent("advanced_work_product_exported", { doc_id: doc.id, format: "markdown" });
  }

  const activeTemplate = outputType ? templatesById.get(outputType) : null;
  const sectionDefs =
    doc && step === 4
      ? activeTemplate?.sections ??
        Object.keys(doc.sections).map((k) => ({ key: k, label: k.replace(/_/g, " ") }))
      : activeTemplate?.sections ?? [];

  if (!awpAllowed) {
    return (
      <AppShell title="Work Product Studio" subtitle={STUDIO_SUBTITLE}>
        <div className="mb-4">
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            onClick={() => navigate("/app")}
          >
            ← Dashboard
          </button>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-5 py-6">
          <p className="text-sm font-medium text-slate-200">
            Advanced drafting and negotiation tools are on LawDog Power.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Upgrade to generate structured memos and briefs from your workspace materials.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              onClick={() => openPowerPaywall("advanced_work_product_page", "advanced_work_product")}
            >
              Upgrade to Power
            </button>
            <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => navigate("/app")}>
              Back to workspace
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Work Product Studio" subtitle={STUDIO_SUBTITLE}>
      <div className="mb-4">
        <button
          type="button"
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          onClick={() => navigate("/app")}
        >
          ← Dashboard
        </button>
      </div>
      {metaErr ? (
        <div className="mb-4 rounded-lg border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
          {metaErr}
        </div>
      ) : null}
      {flowError ? (
        <div
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-800/45 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <span>{flowError}</span>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-amber-200/90 underline-offset-2 hover:underline"
            onClick={() => setFlowError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!locked && !meta && !metaErr ? (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-8 py-16 text-center">
          <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-slate-800" />
          <p className="mt-4 text-sm font-medium text-slate-400">Loading studio templates…</p>
        </div>
      ) : null}

      {locked ? (
        <section className="rounded-xl border border-slate-700/80 bg-gradient-to-b from-slate-900/50 to-slate-950/80 px-5 py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">Premium</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Produce — memos and briefs from what you already have in LawDog
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            After create, send, remember, and reuse comes <span className="text-slate-200">structured output for stakeholders</span>
            — source-aware drafting from agreements and files you select. Not a proof record; always for professional review.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-500">
            <li>· Outcome: readable issue analyses, exec summaries, research memos, white papers — grounded in your pick list</li>
            <li>· LawDog Pro and Enterprise unlock the full studio</li>
            <li>· Thin sources get honest hedging — useful drafts without fake certainty</li>
          </ul>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary mt-6"
            onClick={() => navigate("/app/billing")}
          >
            View plans
          </button>
        </section>
      ) : (
        <>
          <nav
            className="mb-8 rounded-2xl border border-slate-800/90 bg-slate-950/50 px-4 py-4 sm:px-5"
            aria-label="Drafting workflow"
          >
            <ol className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
              {WIZARD_STEPS.map(({ step: sn, label, sub }, idx) => {
                const isCurrent = step === sn;
                const isDone = step > sn;
                return (
                  <li key={sn} className="flex min-w-0 flex-1 items-center gap-3 sm:flex-initial sm:gap-2">
                    {idx > 0 ? (
                      <span
                        className="hidden h-px w-6 shrink-0 bg-slate-800 sm:block"
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 sm:py-2 ${
                        isCurrent
                          ? "border-emerald-500/40 bg-emerald-950/25 ring-1 ring-emerald-500/20"
                          : isDone
                            ? "border-slate-700/70 bg-slate-900/30 opacity-95"
                            : "border-slate-800/80 bg-slate-950/40 opacity-80"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          isCurrent
                            ? "bg-emerald-500/20 text-emerald-200"
                            : isDone
                              ? "bg-slate-700/50 text-slate-300"
                              : "bg-slate-800/80 text-slate-500"
                        }`}
                      >
                        {isDone ? "✓" : sn}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                        <p className="truncate text-sm font-medium text-slate-200">{sub}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </nav>

          {step === 1 && meta ? (
            <section className="space-y-6">
              <header>
                <h2 className="text-lg font-semibold text-white">Choose document structure</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
                  Each template maps to fixed professional sections — like a structured brief or memo, not a blank chat.
                  Select the shape that fits your audience; you&apos;ll attach sources next.
                </p>
              </header>
              {meta.templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/40 px-8 py-12 text-center">
                  <p className="text-sm font-medium text-slate-300">No templates for this plan</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Upgrade to unlock additional output types, or contact support if you believe this is an error.
                  </p>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-6"
                    onClick={() => navigate("/app/billing")}
                  >
                    View plans
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  {meta.templates.map((t) => {
                    const selected = outputType === t.id;
                    const sectionCount = t.sections?.length ?? 0;
                    const previewSections = (t.sections ?? []).slice(0, 4).map((s) => s.label);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setOutputType(t.id);
                          logProductEvent("advanced_work_product_type_selected", { output_type: t.id });
                          setStep(2);
                        }}
                        className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                          selected
                            ? "border-emerald-500/45 bg-gradient-to-b from-emerald-950/30 to-slate-950/60 shadow-[0_0_32px_rgba(16,185,129,0.12)]"
                            : "border-slate-800/85 bg-slate-950/45 hover:border-slate-600 hover:bg-slate-900/40"
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-gradient-to-br from-emerald-500/5 to-transparent" />
                        <div className="relative p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold tracking-tight text-white">{t.label}</p>
                              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t.description}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-700/80 bg-slate-900/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              {sectionCount} sections
                            </span>
                          </div>
                          {previewSections.length > 0 ? (
                            <ul className="mt-4 space-y-1 border-t border-slate-800/80 pt-4">
                              {previewSections.map((lbl) => (
                                <li
                                  key={lbl}
                                  className="flex items-center gap-2 text-[11px] text-slate-500 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-emerald-500/50 before:content-['']"
                                >
                                  {lbl}
                                </li>
                              ))}
                              {sectionCount > previewSections.length ? (
                                <li className="text-[11px] text-slate-600">
                                  +{sectionCount - previewSections.length} more…
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                          <p className="mt-4 text-[11px] font-medium text-emerald-400/90">
                            Select → attach sources <span aria-hidden>→</span>
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {meta.templates.length > 0 && outputType && step === 1 ? (
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800/70 pt-6">
                  <p className="mr-auto text-sm text-slate-500">
                    Selected: <span className="font-medium text-slate-200">{templatesById.get(outputType)?.label}</span>
                  </p>
                  <button type="button" className="vs01-btn vs01-btn--primary" onClick={() => setStep(2)}>
                    Continue to sources
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={() => setStep(1)}
                >
                  ← Change template
                </button>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-slate-500">
                  Output: <span className="font-medium text-slate-300">{activeTemplate?.label ?? outputType}</span>
                </span>
              </div>

              <header>
                <h2 className="text-lg font-semibold text-white">Build your evidence set</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
                  The model grounds prose in what you attach here. Agreements add anchors; workspace context is a
                  labeled signal only — it does not replace real excerpts for high-stakes work.
                </p>
              </header>

              <div className="rounded-xl border border-slate-800/85 bg-slate-900/35 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Summary</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-700/80 bg-slate-950/50 px-3 py-1 text-xs font-medium text-slate-300">
                    {selectedAgreementIds.size} agreement{selectedAgreementIds.size === 1 ? "" : "s"}
                  </span>
                  {useWorkspaceContext ? (
                    <span className="rounded-full border border-violet-800/40 bg-violet-950/25 px-3 py-1 text-xs font-medium text-violet-200/90">
                      Workspace context
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-600">
                    {attachedSourceCount} source row{attachedSourceCount === 1 ? "" : "s"} in request
                  </span>
                </div>
                {!hasSourceMaterial ? (
                  <p className="mt-3 text-sm text-amber-200/90">
                    No sources selected — add at least one agreement or enable workspace context to generate.
                  </p>
                ) : attachedSourceCount === 1 && useWorkspaceContext && selectedAgreementIds.size === 0 ? (
                  <p className="mt-3 text-sm text-amber-200/85">
                    Workspace context only: prose will be intentionally thin. Select agreements when you can.
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-800/85 bg-slate-950/40 p-4">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-900/30 p-3 transition-colors hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={useWorkspaceContext}
                    onChange={(e) => setUseWorkspaceContext(e.target.checked)}
                    className="mt-1 rounded border-slate-600"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-200">Include workspace context</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                      Labels this session with your org/workspace — not a substitute for agreement text or uploads.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace agreements</p>
                  {agreements.length > 0 ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-medium text-teal-400/95 hover:underline"
                        onClick={selectAllAgreements}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-slate-500 hover:text-slate-300 hover:underline"
                        onClick={clearAgreementSelection}
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800/85 bg-slate-950/45">
                  {agreements.length === 0 ? (
                    <div className="px-6 py-10 text-center">
                      <p className="text-sm font-medium text-slate-300">No agreements in this workspace yet</p>
                      <p className="mt-2 text-sm text-slate-500">
                        Create or save an agreement first, or continue with workspace context only (thin grounding).
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--primary vs01-btn--compact"
                          onClick={() => navigate("/app/create")}
                        >
                          New agreement
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          onClick={() => navigate("/app")}
                        >
                          Dashboard
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-800/70">
                      {agreements.map((a) => (
                        <li key={a.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-900/40">
                            <input
                              type="checkbox"
                              checked={selectedAgreementIds.has(a.id)}
                              onChange={() => toggleAgreement(a.id)}
                              className="rounded border-slate-600"
                            />
                            <span className="min-w-0 flex-1 text-sm text-slate-200">{a.title || a.id}</span>
                            {a.completed_signed ? (
                              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-emerald-400/80">
                                Signed
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] text-slate-600">Draft</span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800/70 pt-6">
                <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary"
                  disabled={!hasSourceMaterial}
                  title={!hasSourceMaterial ? "Select sources or enable workspace context" : undefined}
                  onClick={() => setStep(3)}
                >
                  Continue to brief
                </button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                  onClick={() => setStep(2)}
                >
                  ← Sources
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/40 to-slate-950/70 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Session summary</p>
                  <p className="mt-2 text-xl font-semibold text-white">{activeTemplate?.label ?? outputType}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {activeTemplate?.sections?.length ?? 0} structured sections · {attachedSourceCount} attached source{" "}
                    {attachedSourceCount === 1 ? "row" : "rows"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedAgreementIds.size > 0 ? (
                      <span className="text-xs text-slate-400">
                        {selectedAgreementIds.size} agreement{selectedAgreementIds.size === 1 ? "" : "s"} selected
                      </span>
                    ) : null}
                    {useWorkspaceContext ? (
                      <span className="text-xs text-violet-300/85">Workspace context on</span>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/35 p-5">
                  <p className="text-sm font-medium text-slate-300">Before you generate</p>
                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-500">
                    <li className="flex gap-2">
                      <span className="text-emerald-500/80" aria-hidden>
                        ·
                      </span>
                      The model stays within the materials you attached — it will hedge when unknown.
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-500/80" aria-hidden>
                        ·
                      </span>
                      You&apos;ll edit in the studio with section-level refinements (not a chat thread).
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Scope &amp; instructions</h2>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Audience
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="e.g. General counsel, product council, exec sponsor"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Objective
                  <textarea
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600"
                    rows={2}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="What should this draft help the reader decide or understand?"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Instructions / thesis <span className="font-normal text-slate-600">(optional)</span>
                  <textarea
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600"
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Tone, emphasis, hypotheses — still bounded by your source set."
                  />
                </label>
              </div>

              {!hasSourceMaterial ? (
                <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">
                  <p className="font-medium">No sources in this session</p>
                  <p className="mt-1 text-xs text-rose-200/85">
                    Go back and select agreements or enable workspace context before generating.
                  </p>
                  <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3" onClick={() => setStep(2)}>
                    Edit sources
                  </button>
                </div>
              ) : null}

              {weakMaterialGate ? (
                <div className="rounded-xl border border-amber-700/45 bg-amber-950/25 px-4 py-4 text-sm text-amber-100/95">
                  <p className="font-semibold text-amber-50/95">Source set looks thin</p>
                  <p className="mt-2 text-xs leading-relaxed text-amber-200/85">
                    Material strength: <span className="font-medium capitalize">{weakMaterialGate.tier}</span>.
                    {weakMaterialGate.recommendation
                      ? ` ${weakMaterialGate.recommendation}`
                      : " Add agreements or richer excerpts before relying on this draft for high-stakes decisions."}{" "}
                    Generation still runs with conservative language and explicit grounding notes.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      onClick={() => {
                        setWeakMaterialGate(null);
                        setStep(2);
                      }}
                    >
                      Add sources
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--primary vs01-btn--compact"
                      disabled={generating}
                      onClick={() => void generateDespiteWeakSources()}
                    >
                      Generate anyway
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-6">
                <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary px-6"
                  disabled={generating || !outputType || !hasSourceMaterial}
                  title={
                    !hasSourceMaterial ? "Attach at least one source" : !outputType ? "Choose a template" : undefined
                  }
                  onClick={() => void onGenerateClick()}
                >
                  {generating ? "Generating in studio…" : "Generate draft in studio"}
                </button>
              </div>
            </section>
          ) : null}

          {step === 4 && doc ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900/50 to-slate-950/80 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-emerald-800/45 bg-emerald-950/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                      {doc.output_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Updated {doc.updated_at ? new Date(doc.updated_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {doc.title?.trim() || activeTemplate?.label || "Untitled draft"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {sectionDefs.length} section studio · {doc.sources.length} source
                    {doc.sources.length === 1 ? "" : "s"} in manifest
                  </p>
                </div>
                <div className="flex w-full flex-shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact text-xs"
                    onClick={() => {
                      setStep(1);
                      setDoc(null);
                      setWeakMaterialGate(null);
                      setSupportOpenFor(null);
                    }}
                  >
                    New document
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact text-xs"
                    onClick={() => void onSaveSections()}
                  >
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save edits"}
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--primary vs01-btn--compact text-xs"
                    onClick={exportMarkdown}
                  >
                    Export Markdown
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-800/35 bg-amber-950/15 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
                <span className="font-semibold text-amber-50/95">Assistive draft only.</span> Not a cryptographic proof,
                signed record, or verifier artifact. Review before external distribution — LawDog does not merge studio
                output into proof manifests. {AI_ASSISTIVE_SHORT}
              </div>
              {doc.caveats ? (
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/35 px-4 py-3 text-xs leading-relaxed text-slate-400">
                  <span className="font-semibold text-slate-300">Grounding &amp; limitations: </span>
                  {doc.caveats}
                </div>
              ) : null}

              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)]">
                <section className="min-w-0 space-y-6" aria-label="Draft sections">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Section editor</h3>
                    <p className="text-[11px] text-slate-600">Refinements apply per block — no chat history.</p>
                  </div>
                  {sectionDefs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700/80 px-6 py-12 text-center text-sm text-slate-500">
                      No sections in this document.
                    </div>
                  ) : null}
                  {sectionDefs.map((s, si) => {
                    const meta = doc.section_metadata?.[s.key];
                    const supportIds = meta?.source_ids_used?.length
                      ? meta.source_ids_used
                      : doc.section_grounding[s.key] ?? [];
                    const sq = meta?.support_quality ?? "minimal";
                    return (
                      <article
                        key={s.key}
                        className="overflow-hidden rounded-2xl border border-slate-800/85 bg-slate-950/40 shadow-sm shadow-black/20"
                      >
                        <div className="flex flex-col gap-3 border-b border-slate-800/80 bg-slate-900/30 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-mono text-slate-600" aria-hidden>
                                {String(si + 1).padStart(2, "0")}
                              </span>
                              <h4 className="text-sm font-semibold text-white">{s.label}</h4>
                              {meta ? (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${supportQualityStyles(sq)}`}
                                >
                                  {sq} support
                                </span>
                              ) : null}
                            </div>
                            {meta?.unsupported_or_inferred ? (
                              <p className="mt-2 text-[11px] text-amber-200/85">
                                Includes inference or thin grounding — review carefully.
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                              {supportIds.length > 0 ? (
                                <span className="text-violet-300/85">Linked: {supportIds.join(", ")}</span>
                              ) : (
                                <span className="text-slate-600">No sources linked for this block</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-1.5 text-[11px] font-medium text-teal-300/95 hover:border-slate-600"
                            onClick={() => setSupportOpenFor((prev) => (prev === s.key ? null : s.key))}
                          >
                            {supportOpenFor === s.key ? "Hide citation detail" : "View citation detail"}
                          </button>
                        </div>

                        {supportOpenFor === s.key ? (
                          <div className="space-y-3 border-b border-slate-800/80 bg-slate-900/25 px-4 py-4 text-xs text-slate-400">
                            {meta?.conflict_or_gap_notes ? (
                              <p>
                                <span className="font-semibold text-slate-300">Gaps / conflicts: </span>
                                {meta.conflict_or_gap_notes}
                              </p>
                            ) : (
                              <p className="text-slate-600">No gap or conflict notes for this block.</p>
                            )}
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Source excerpts</p>
                            <ul className="max-h-48 space-y-2 overflow-y-auto">
                              {(supportIds.length ? supportIds : doc.sources.map((x) => x.id)).map((sid) => {
                                const src = sourceById(sid);
                                if (!src) {
                                  return (
                                    <li
                                      key={sid}
                                      className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-slate-500"
                                    >
                                      <code className="text-[10px]">{sid}</code> — not in manifest
                                    </li>
                                  );
                                }
                                return (
                                  <li key={sid} className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
                                    <span className="font-medium text-slate-200">{src.label}</span>
                                    <span className="mt-0.5 block text-[10px] text-slate-600">
                                      {src.kind} · {src.id}
                                    </span>
                                    {src.excerpt ? (
                                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">
                                        {src.excerpt}
                                      </p>
                                    ) : (
                                      <p className="mt-2 text-[11px] text-slate-600">No excerpt stored for this source.</p>
                                    )}
                                    {src.kind === "agreement" ? (
                                      <button
                                        type="button"
                                        className="mt-2 text-[11px] font-medium text-teal-400/95 hover:underline"
                                        onClick={() => navigate(`/app/agreements/${encodeURIComponent(src.id)}`)}
                                      >
                                        Open in workspace
                                      </button>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}

                        <div className="px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Refine this section
                          </p>
                          {refiningKey === s.key ? (
                            <p className="mt-2 text-xs text-slate-500">Applying structured refinement…</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {AWP_REFINE_MODES.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                disabled={refiningKey !== null}
                                title={m.hint}
                                className="rounded-lg border border-slate-700/75 bg-slate-900/45 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-900/65 hover:text-white disabled:opacity-40"
                                onClick={() => void onRefineSection(s.key, m.id)}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600/50"
                            spellCheck
                            value={doc.sections[s.key] ?? ""}
                            onChange={(e) =>
                              setDoc({ ...doc, sections: { ...doc.sections, [s.key]: e.target.value } })
                            }
                          />
                        </div>
                      </article>
                    );
                  })}
                </section>

                <aside
                  className="space-y-4 rounded-2xl border border-emerald-900/25 bg-slate-950/55 p-5 lg:sticky lg:top-4 lg:self-start"
                  aria-label="Sources in this draft"
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sources manifest</p>
                    <p className="mt-1 text-lg font-semibold text-white">{doc.sources.length}</p>
                    <p className="text-xs text-slate-500">Attached for this generation — export includes this list.</p>
                  </div>
                  {doc.sources.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700/80 px-3 py-6 text-center text-xs text-slate-500">
                      No sources recorded on this draft.
                    </div>
                  ) : (
                    <ul className="max-h-[min(32rem,60vh)] space-y-3 overflow-y-auto pr-1">
                      {doc.sources.map((src) => (
                        <li
                          key={`${src.kind}_${src.id}`}
                          className="rounded-xl border border-slate-800/85 bg-slate-900/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 text-sm font-medium text-slate-100">{src.label}</span>
                            <span className="shrink-0 rounded border border-slate-700/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                              {src.kind.replace(/_/g, " ")}
                            </span>
                          </div>
                          <code className="mt-1 block truncate text-[10px] text-slate-600">{src.id}</code>
                          {src.excerpt ? (
                            <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-slate-500">{src.excerpt}</p>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-600">No excerpt on file.</p>
                          )}
                          {src.kind === "agreement" ? (
                            <button
                              type="button"
                              className="mt-2 text-[11px] font-medium text-teal-400/90 hover:underline"
                              onClick={() => navigate(`/app/agreements/${encodeURIComponent(src.id)}`)}
                            >
                              Open agreement
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] leading-relaxed text-slate-600">
                    Open actions use workspace agreement routes. Other kinds stay in the manifest for your audit.
                  </p>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--compact w-full text-[11px]"
                    onClick={exportMarkdown}
                  >
                    Download full draft (.md)
                  </button>
                </aside>
              </div>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

