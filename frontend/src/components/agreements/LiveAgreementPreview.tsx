import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HeroDictationPhase } from "../../launch/useHeroMediaDictation";
import { isLivePreviewInlineField, type LivePreviewModel } from "./liveDraftHeuristics";
import { splitTwoPartiesFromJoinedLine } from "./partyIntakeNormalize";
import type { IntakePartyRoleLabels } from "./partyRoleIntake";
import { PartyOptionalRolesBlock } from "./PartyOptionalRolesBlock";
import type { AgreementStrengthChecklistRow } from "./intakeConfidenceScore";

export type AgreementStrengthPanel = {
  nominalPercent: number;
  checklist: AgreementStrengthChecklistRow[];
};

export const LIVE_PREVIEW_EXPORT_REASSURANCE = "You can export and keep your records anytime.";

const PREVIEW_TITLE = "Your agreement";

/** Server-side create / hydrate — drives directional copy in the right pane during simple two-pane intake. */
export type IntakeFormationPhase = "structuring" | "persisting" | "opening";

export type LivePreviewSmartChip = { id: string; label: string; append: string };

const STRENGTH_ANIM_MS = 300;
const STRENGTH_NICE_FLASH_MS = 2200;
const STRENGTH_NICE_COPY = "Nice — stronger agreement";

function AgreementStrengthBlock(props: {
  panel: AgreementStrengthPanel;
  onAction?: (id: string, append: string) => void;
  disabled?: boolean;
}) {
  const { nominalPercent, checklist } = props.panel;
  const tier = nominalPercent > 80 ? "high" : nominalPercent >= 50 ? "mid" : "low";
  const fillClass =
    tier === "high"
      ? "bg-emerald-500/80"
      : tier === "mid"
        ? "bg-amber-500/75"
        : "bg-rose-600/78";

  const [displayedPercent, setDisplayedPercent] = useState(() => props.panel.nominalPercent);
  const committedRef = useRef(props.panel.nominalPercent);
  const displayedForAnimRef = useRef(props.panel.nominalPercent);
  const rafRef = useRef<number>(0);
  const [barPulse, setBarPulse] = useState(false);
  const [niceFlash, setNiceFlash] = useState(false);
  const niceTimerRef = useRef<number>(0);
  const pulseTimerRef = useRef<number>(0);
  const reduceMotionRef = useRef(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const prev = committedRef.current;

    if (nominalPercent < prev) {
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(pulseTimerRef.current);
      window.clearTimeout(niceTimerRef.current);
      setBarPulse(false);
      setNiceFlash(false);
      setDisplayedPercent(nominalPercent);
      committedRef.current = nominalPercent;
      displayedForAnimRef.current = nominalPercent;
      return;
    }

    if (nominalPercent === prev) return;

    const from = displayedForAnimRef.current;
    const to = nominalPercent;
    const reduced = reduceMotionRef.current;

    if (!reduced) {
      setBarPulse(true);
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setBarPulse(false), STRENGTH_ANIM_MS);
      setNiceFlash(true);
      window.clearTimeout(niceTimerRef.current);
      niceTimerRef.current = window.setTimeout(() => setNiceFlash(false), STRENGTH_NICE_FLASH_MS);
    }

    if (reduced) {
      setDisplayedPercent(to);
      committedRef.current = to;
      displayedForAnimRef.current = to;
      return;
    }

    const start = performance.now();
    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / STRENGTH_ANIM_MS);
      const eased = easeOutQuad(t);
      const v = Math.round(from + (to - from) * eased);
      displayedForAnimRef.current = v;
      setDisplayedPercent(v);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        setDisplayedPercent(to);
        displayedForAnimRef.current = to;
        committedRef.current = to;
      }
    };

    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      window.clearTimeout(pulseTimerRef.current);
      window.clearTimeout(niceTimerRef.current);
    };
  }, [nominalPercent]);

  const w = Math.min(100, Math.max(0, displayedPercent));

  return (
    <div
      className="border-b border-slate-800/70 pb-4"
      role="status"
      aria-label={`Agreement strength ${nominalPercent} percent`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-[11px] font-medium text-slate-400 sm:text-xs md:text-[0.8125rem]">
          Agreement strength:{" "}
          <span className="font-semibold tabular-nums text-slate-100">{displayedPercent}%</span>
        </p>
        {niceFlash ? (
          <p
            className="text-[10px] font-medium text-emerald-400/95 motion-safe:transition-opacity motion-safe:duration-200 sm:text-[11px]"
            aria-live="polite"
          >
            {STRENGTH_NICE_COPY}
          </p>
        ) : null}
      </div>
      <div
        className={`mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/85 ring-1 ring-slate-700/40 ${
          barPulse ? "motion-safe:animate-strength-bar-pulse" : ""
        }`}
      >
        <div
          className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out ${fillClass}`}
          style={{ width: `${w}%` }}
        />
      </div>
      <ul className="mt-3 list-none space-y-1.5 pl-0 text-[11px] leading-snug text-slate-300 sm:text-xs md:text-[0.8125rem] md:leading-relaxed">
        {checklist.map((row) => (
          <li key={row.id}>
            {row.satisfied && row.warningComplete ? (
              <div className="flex items-start gap-2 text-amber-200/90">
                <span className="shrink-0 select-none" aria-hidden>
                  ⚠️
                </span>
                <span>{row.completeLabel}</span>
              </div>
            ) : row.satisfied ? (
              <div className="flex items-start gap-2 text-slate-300/95">
                <span className="shrink-0 select-none text-emerald-400/95" aria-hidden>
                  ✔
                </span>
                <span>{row.completeLabel}</span>
              </div>
            ) : props.onAction && row.append ? (
              <button
                type="button"
                disabled={props.disabled}
                className="flex w-full items-start gap-2 rounded-md px-0 py-0.5 text-left text-amber-200/95 transition enabled:hover:bg-slate-900/50 enabled:hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => props.onAction?.(row.id, row.append!)}
              >
                <span className="shrink-0 select-none" aria-hidden>
                  ⚠
                </span>
                <span className="font-medium">{row.actionLabel}</span>
              </button>
            ) : (
              <div className="flex items-start gap-2 text-amber-200/85">
                <span className="shrink-0 select-none" aria-hidden>
                  ⚠
                </span>
                <span>{row.actionLabel}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonBlock(props: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-800/70 ${props.className ?? "h-3 w-full"}`}
      aria-hidden
    />
  );
}

function PreviewRow(props: { label: string; value: string; uncertain?: boolean }) {
  return (
    <div className="border-b border-slate-800/70 py-4 last:border-b-0">
      <div className={`border-l-2 pl-3 ${props.uncertain ? "border-amber-500/35" : "border-emerald-500/25"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:tracking-[0.1em] lg:text-slate-300">
          {props.label}
        </p>
        <p
          className={`mt-2 text-sm font-medium leading-relaxed sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] ${
            props.uncertain ? "italic text-slate-300/95" : "text-slate-100"
          }`}
        >
          {props.value}
        </p>
      </div>
    </div>
  );
}

function InlinePreviewFieldRow(props: {
  label: string;
  value: string;
  uncertain?: boolean;
  onCommit: (next: string) => void;
}) {
  const { label, value, uncertain } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const borderAccent = uncertain ? "border-amber-500/35" : "border-emerald-500/25";
  const valueTone = uncertain ? "italic text-slate-300/95" : "text-slate-100";

  const finish = (raw: string) => {
    const next = raw.trim();
    if (!next) {
      setDraft(value);
      setEditing(false);
      return;
    }
    props.onCommit(next);
    setEditing(false);
  };

  return (
    <div className="border-b border-slate-800/70 py-4 last:border-b-0">
      <div className={`border-l-2 pl-3 ${borderAccent}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:tracking-[0.1em] lg:text-slate-300">
          {label}
        </p>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
            className="mt-2 w-full rounded-md border border-emerald-500/40 bg-slate-950/90 px-2.5 py-2 text-sm font-medium leading-relaxed text-slate-100 outline-none ring-2 ring-emerald-500/45 ring-offset-2 ring-offset-slate-950 transition-[box-shadow] sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55]"
            aria-label={`Edit ${label}`}
            onBlur={(e) => finish(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`group mt-2 w-full rounded-md border border-transparent px-2 py-1.5 text-left -mx-2 text-sm font-medium leading-relaxed transition-[border-color,box-shadow] sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] ${valueTone} hover:border-emerald-500/30 hover:bg-slate-900/40 hover:shadow-[0_0_20px_-8px_rgba(52,211,153,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/55`}
            aria-label={`Edit ${label}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {value}
          </button>
        )}
      </div>
    </div>
  );
}

function PartyEditBullet(props: {
  index: 1 | 2;
  value: string;
  valueTone: string;
  editable: boolean;
  onPartyCommit?: (index: 1 | 2, value: string) => void;
}) {
  const { index, value, valueTone, editable, onPartyCommit } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const finish = (raw: string) => {
    const next = raw.trim();
    if (!next) {
      setDraft(value);
      setEditing(false);
      return;
    }
    onPartyCommit?.(index, next);
    setEditing(false);
  };

  const canEdit = Boolean(editable && onPartyCommit);

  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden>
        •
      </span>
      <div className="min-w-0 flex-1">
        {canEdit && editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
            className="w-full rounded-md border border-emerald-500/40 bg-slate-950/90 px-2 py-1 text-sm font-medium text-slate-100 outline-none ring-2 ring-emerald-500/45 ring-offset-2 ring-offset-slate-950 sm:text-[0.9375rem]"
            aria-label={index === 1 ? "Edit first party" : "Edit second party"}
            onBlur={(e) => finish(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        ) : canEdit ? (
          <button
            type="button"
            className={`w-full rounded-md border border-transparent px-1.5 py-0.5 text-left text-sm font-medium leading-relaxed transition-[border-color,box-shadow] sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] ${valueTone} hover:border-emerald-500/30 hover:bg-slate-900/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/55`}
            aria-label={index === 1 ? "Edit first party" : "Edit second party"}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {value}
          </button>
        ) : (
          <span className={`text-sm font-medium leading-relaxed sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55] ${valueTone}`}>
            {value}
          </span>
        )}
      </div>
    </li>
  );
}

function InlinePartiesStructuredRow(props: {
  party_1: string;
  party_2: string;
  uncertain?: boolean;
  editable: boolean;
  onPartyCommit?: (index: 1 | 2, value: string) => void;
  partyRoleIntake?: {
    value: IntakePartyRoleLabels;
    onChange: (next: IntakePartyRoleLabels) => void;
    corpus: string;
    disabled?: boolean;
  };
}) {
  const { party_1, party_2, uncertain, editable, onPartyCommit, partyRoleIntake } = props;
  const borderAccent = uncertain ? "border-amber-500/35" : "border-emerald-500/25";
  const valueTone = uncertain ? "italic text-slate-300/95" : "text-slate-100";

  return (
    <div className="border-b border-slate-800/70 py-4 last:border-b-0">
      <div className={`border-l-2 pl-3 ${borderAccent}`}>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-slate-300 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:tracking-[0.08em]">
          Parties:
        </p>
        <ul className="mt-2 list-none space-y-1.5 pl-0" role="list" aria-label="Parties">
          <PartyEditBullet index={1} value={party_1} valueTone={valueTone} editable={editable} onPartyCommit={onPartyCommit} />
          <PartyEditBullet index={2} value={party_2} valueTone={valueTone} editable={editable} onPartyCommit={onPartyCommit} />
        </ul>
        {partyRoleIntake ? (
          <PartyOptionalRolesBlock
            party1={party_1}
            party2={party_2}
            value={partyRoleIntake.value}
            onChange={partyRoleIntake.onChange}
            corpus={partyRoleIntake.corpus}
            disabled={partyRoleIntake.disabled}
          />
        ) : null}
      </div>
    </div>
  );
}

export function LiveAgreementPreview(props: {
  model: LivePreviewModel;
  intakeLen: number;
  dictationPhase?: HeroDictationPhase;
  /** Full parse + persist in progress */
  workspaceWorking?: boolean;
  /** When set with workspaceWorking, replaces generic title with phase-specific “draft forming” copy. */
  formationPhase?: IntakeFormationPhase | null;
  compact?: boolean;
  /** Inline edit: commit pushes a labeled line into the main intake (simple flow). */
  inlineEditable?: boolean;
  onInlineFieldCommit?: (fieldLabel: string, nextValue: string) => void;
  /** When set with two parsed parties, edits one side and rewrites `Parties: …` in intake. */
  onStructuredPartyCommit?: (partyIndex: 1 | 2, nextValue: string) => void;
  smartChips?: LivePreviewSmartChip[];
  onSmartChip?: (append: string) => void;
  showExportReassurance?: boolean;
  /** Before first draft: keep preview feeling structured while intake is still short. */
  firstSessionPreview?: boolean;
  /** Compact summary above structured rows (guided create flow). */
  draftSoFarSummary?: { label: string; value: string }[];
  /** Simple create: drafting → ready (after Draft now) → sending — drives eyebrow + cues (no “ready to send” before ready). */
  intakeUiPhase?: "drafting" | "ready" | "sending" | null;
  /** User committed Draft now — headline + confirmation, entrance animation. */
  draftCommitted?: boolean;
  /** Shift attention to fixed action bar (slight fade on preview). */
  deemphasize?: boolean;
  /** Simple create: strength meter + checklist in panel header. */
  agreementStrength?: AgreementStrengthPanel | null;
  /** When strength panel first appears after the first-agreement gate, run a short entrance animation. */
  agreementStrengthFadeIn?: boolean;
  /** Append clause when user clicks a ⚠ checklist row. */
  onAgreementStrengthAction?: (id: string, append: string) => void;
  /** Simple create: optional party relationship labels (never required). */
  partyRoleIntake?: {
    value: IntakePartyRoleLabels;
    onChange: (next: IntakePartyRoleLabels) => void;
    corpus: string;
    disabled?: boolean;
  };
}) {
  const {
    model,
    intakeLen,
    dictationPhase = "idle",
    workspaceWorking = false,
    formationPhase = null,
    compact,
    inlineEditable = false,
    onInlineFieldCommit,
    onStructuredPartyCommit,
    smartChips = [],
    onSmartChip,
    showExportReassurance = false,
    firstSessionPreview = false,
    draftSoFarSummary,
    intakeUiPhase = null,
    draftCommitted = false,
    deemphasize = false,
    agreementStrength = null,
    agreementStrengthFadeIn = false,
    onAgreementStrengthAction,
    partyRoleIntake,
  } = props;
  const [draftReadyCelebrate, setDraftReadyCelebrate] = useState(false);
  useEffect(() => {
    if (!draftCommitted) {
      setDraftReadyCelebrate(false);
      return;
    }
    setDraftReadyCelebrate(true);
    const endCelebrate = window.setTimeout(() => setDraftReadyCelebrate(false), 720);
    return () => window.clearTimeout(endCelebrate);
  }, [draftCommitted]);
  const transcribing = dictationPhase === "processing";
  const idlePreview = intakeLen === 0 && !transcribing && !workspaceWorking;
  const forming = Boolean(workspaceWorking && formationPhase);
  const phase = intakeUiPhase ?? "drafting";
  const readySurface = Boolean(
    phase === "ready" && !workspaceWorking && !forming && !transcribing,
  );
  const committedSurface = Boolean(draftCommitted && !workspaceWorking && !forming && !transcribing);
  const firstDraftScaffoldActive =
    Boolean(firstSessionPreview) &&
    intakeLen < 40 &&
    !workspaceWorking &&
    !transcribing &&
    !forming;
  const formationEyebrow =
    phase === "sending" || (workspaceWorking && forming)
      ? "Sending"
      : phase === "ready"
        ? "Ready"
        : "";
  const formationTitle =
    formationPhase === "structuring"
      ? "Structuring your agreement…"
      : formationPhase === "persisting"
        ? "Saving your agreement"
        : formationPhase === "opening"
          ? "Opening review"
          : null;
  const formationBadge =
    formationPhase === "structuring"
      ? "Structuring your agreement…"
      : formationPhase === "persisting"
        ? "Saving…"
        : formationPhase === "opening"
          ? "Opening…"
          : "Working…";

  function row(label: string, value: string | null | undefined, uncertain = false) {
    if (!value?.trim()) return null;
    const v = value.trim();
    const canInline = Boolean(inlineEditable && onInlineFieldCommit && isLivePreviewInlineField(label));
    if (canInline && onInlineFieldCommit) {
      return (
        <InlinePreviewFieldRow key={label} label={label} value={v} uncertain={uncertain} onCommit={(n) => onInlineFieldCommit(label, n)} />
      );
    }
    return <PreviewRow key={`${label}-${v}`} label={label} value={v} uncertain={uncertain} />;
  }

  function renderPartiesSection(opts: { line: string | null | undefined; uncertain: boolean }) {
    const pl = opts.line?.trim();
    if (!pl) return null;
    if (pl.startsWith("Party detected")) {
      return (
        <>
          {row("Parties", pl, opts.uncertain)}
        </>
      );
    }
    const structured = model.partiesStructured ?? splitTwoPartiesFromJoinedLine(pl);
    if (structured) {
      return (
        <>
          <InlinePartiesStructuredRow
            party_1={structured.party_1}
            party_2={structured.party_2}
            uncertain={opts.uncertain}
            editable={Boolean(inlineEditable && onInlineFieldCommit && onStructuredPartyCommit)}
            onPartyCommit={onStructuredPartyCommit}
            partyRoleIntake={partyRoleIntake}
          />
        </>
      );
    }
    return (
      <>
        {row("Parties", pl, opts.uncertain)}
      </>
    );
  }

  const paymentRowVisible = Boolean(model.scheduleLine?.trim());
  const termRowVisible = Boolean(model.termLine?.trim());

  const structuredRowsPresent =
    Boolean(model.partiesLine) ||
    Boolean(model.signerPlaceholdersLine) ||
    paymentRowVisible ||
    termRowVisible;

  const partiesScaffold =
    model.partiesLine?.trim() ||
    model.signerPlaceholdersLine?.trim() ||
    "You and [Other party]";

  const firstSessionShortIntakeBlock =
    firstDraftScaffoldActive && intakeLen > 0 ? (
      <div className="mt-3 rounded-lg border border-slate-800/60 bg-slate-900/30 px-1 sm:px-2">
        {renderPartiesSection({ line: partiesScaffold, uncertain: false })}
        {paymentRowVisible ? <>{row("Payment", model.scheduleLine)}</> : null}
        {termRowVisible ? <>{row("Term", model.termLine)}</> : null}
      </div>
    ) : null;

  const structuredBlock =
    model.hasStructuredSignal && structuredRowsPresent ? (
      <div className="mt-3 rounded-lg border border-slate-800/60 bg-slate-900/30 px-1 sm:px-2">
        {model.partiesLine ? (
          renderPartiesSection({ line: model.partiesLine, uncertain: Boolean(model.partiesUncertain) })
        ) : model.signerPlaceholdersLine ? (
          <>{row("Parties", model.signerPlaceholdersLine)}</>
        ) : null}
        {paymentRowVisible ? <>{row("Payment", model.scheduleLine)}</> : null}
        {termRowVisible ? <>{row("Term", model.termLine)}</> : null}
        {model.payment && !model.payment.valid ? (
          <p className="px-2 py-2 text-xs leading-snug text-slate-400 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] lg:leading-[1.45] lg:text-slate-400">
            If payment applies, add an amount or say &quot;no payment&quot; — you can still continue and edit in review.
          </p>
        ) : null}
      </div>
    ) : null;

  const titleMain =
    forming && formationTitle
      ? formationTitle
      : committedSurface
        ? "Your agreement is ready"
        : model.docTitle !== "Agreement" && model.docTitle?.trim()
          ? model.docTitle
          : PREVIEW_TITLE;

  const draftReadyShellMotion =
    committedSurface && !workspaceWorking && draftReadyCelebrate
      ? "motion-safe:animate-draft-ready-shell"
      : "";

  return (
    <div
      className={`flex h-full min-h-[12rem] flex-col rounded-xl border border-slate-700/90 bg-slate-950/85 shadow-inner transition-[box-shadow,border-color] duration-300 ${
        compact ? "p-4" : "p-5 sm:p-6"
      } ${
        workspaceWorking
          ? "border-emerald-500/40 bg-slate-950/90 shadow-lg shadow-emerald-950/25 ring-1 ring-emerald-500/35 [box-shadow:0_0_36px_-14px_rgba(52,211,153,0.18)]"
          : ""
      } ${deemphasize ? "opacity-[0.82] motion-safe:scale-[0.99]" : ""} ${draftReadyShellMotion}`}
    >
      {agreementStrength ? (
        <div
          className={agreementStrengthFadeIn ? "motion-safe:animate-strength-reveal" : undefined}
        >
          <AgreementStrengthBlock
            panel={agreementStrength}
            onAction={!workspaceWorking ? onAgreementStrengthAction : undefined}
            disabled={Boolean(workspaceWorking)}
          />
        </div>
      ) : null}
      <div
        className={`flex items-start justify-between gap-2 border-b border-slate-800/70 pb-4 ${agreementStrength ? "pt-4" : ""}`}
        role={workspaceWorking ? "status" : undefined}
        aria-live={workspaceWorking ? "polite" : undefined}
      >
        <div className="min-w-0 flex-1">
          {formationEyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-400/90 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:tracking-[0.1em]">
              {formationEyebrow}
            </p>
          ) : null}
          <h3
            className={`text-base font-semibold leading-tight text-slate-50 sm:text-lg md:text-xl lg:text-[1.25rem] lg:leading-snug ${
              formationEyebrow ? "mt-1.5" : "mt-0"
            } ${committedSurface ? "motion-safe:animate-ready-title-fade" : ""}`}
          >
            {titleMain}
          </h3>
        </div>
        {workspaceWorking ? (
          <span className="flex max-w-[min(100%,18rem)] shrink-0 items-center gap-1.5 motion-safe:animate-pulse rounded-md border border-sky-700/55 bg-sky-950/45 px-2 py-1 text-[11px] font-medium text-sky-100 sm:max-w-none sm:text-xs md:text-sm lg:px-2.5 lg:py-1.5 lg:text-[0.9375rem]">
            {formationPhase === "structuring" ? (
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-400/35 border-t-sky-100"
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 leading-tight">{formationPhase ? formationBadge : "Working…"}</span>
          </span>
        ) : transcribing ? (
          <span className="shrink-0 rounded-md border border-emerald-800/50 bg-emerald-950/40 px-2 py-1 text-[11px] font-medium text-emerald-200/90 sm:text-xs md:text-sm lg:px-2.5 lg:py-1.5 lg:text-[0.9375rem]">
            Transcribing…
          </span>
        ) : null}
      </div>

      {idlePreview ? (
        <div className="flex flex-1 flex-col py-4">
          {firstDraftScaffoldActive ? (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-1 py-2 sm:px-2">
              {row("Parties", partiesScaffold)}
              {model.scheduleLine?.trim() ? row("Payment", model.scheduleLine) : null}
              {model.termLine?.trim() ? row("Term", model.termLine) : null}
            </div>
          ) : (
            <div
              className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-4"
              aria-hidden
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:text-slate-400">
                Parties
              </p>
              <SkeletonBlock className="mt-2 h-3 w-[85%]" />
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:text-slate-400">
                Payment
              </p>
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
            </div>
          )}
        </div>
      ) : (
        <div className="relative mt-1 flex-1 overflow-y-auto py-2">
          {workspaceWorking ? (
            <div
              className="pointer-events-none absolute inset-0 z-[1] rounded-lg bg-slate-950/45 backdrop-blur-[1px]"
              aria-hidden
            />
          ) : null}
          {draftSoFarSummary && draftSoFarSummary.length > 0 && !readySurface ? (
            <div className="mb-3 rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2.5 sm:px-3.5">
              <ul className="space-y-1.5 text-xs leading-snug text-slate-300 sm:text-sm">
                {draftSoFarSummary.map((row) => (
                  <li key={`${row.label}-${row.value.slice(0, 24)}`}>
                    <span className="font-medium text-slate-500">{row.label}:</span> {row.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {firstSessionShortIntakeBlock || structuredBlock}
          {smartChips.length > 0 && onSmartChip && !workspaceWorking ? (
            <div className="mt-4 border-t border-slate-800/70 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-xs md:text-[0.8125rem] lg:text-[0.875rem] lg:text-slate-400">
                Suggestions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {smartChips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="rounded-full border border-slate-600/90 bg-slate-900/60 px-3 py-1.5 text-left text-xs font-medium leading-snug text-slate-200 transition hover:border-emerald-500/45 hover:bg-slate-900 sm:text-[0.8125rem] md:text-sm lg:px-3.5 lg:py-2 lg:text-[0.9375rem]"
                    onClick={() => onSmartChip(c.append)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {showExportReassurance ? (
            <p className="mt-4 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] lg:leading-[1.5] lg:text-slate-400">
              {LIVE_PREVIEW_EXPORT_REASSURANCE}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
