import { useLayoutEffect, useRef, useState } from "react";
import type { LivePreviewInlineField } from "./liveDraftHeuristics";
import { UNDERSTOOD_PROVENANCE_LABEL, type UnderstoodBullet } from "./intakeWhatWeUnderstood";

export function WhatWeUnderstoodBlock(props: {
  bullets: UnderstoodBullet[];
  onCommitInline: (field: LivePreviewInlineField, next: string) => void;
  onFocusMainInput: () => void;
  disabled?: boolean;
  /** Defaults to “What LawDog understood”. */
  title?: string;
  /** Primary edit control label */
  editDetailsLabel?: string;
}) {
  const {
    bullets,
    onCommitInline,
    onFocusMainInput,
    disabled,
    title = "What LawDog understood",
    editDetailsLabel = "Edit",
  } = props;
  const [editingKind, setEditingKind] = useState<UnderstoodBullet["kind"] | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!editingKind) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingKind]);

  const startEdit = (b: UnderstoodBullet) => {
    if (disabled || !b.inlineField) return;
    setDraft(b.commitValue);
    setEditingKind(b.kind);
  };

  const finish = (b: UnderstoodBullet, raw: string) => {
    const next = raw.trim();
    if (!next || !b.inlineField) {
      setEditingKind(null);
      return;
    }
    onCommitInline(b.inlineField, next);
    setEditingKind(null);
  };

  return (
    <div
      className="mt-3 rounded-lg border border-slate-700/50 bg-slate-950/55 px-3 py-2.5 shadow-inner shadow-black/15 sm:px-3.5"
      aria-live="polite"
    >
      <p className="text-[11px] font-semibold tracking-tight text-slate-300 sm:text-xs">{title}</p>
      <ul className="mt-1.5 list-none space-y-1.5 pl-0" role="list">
        {bullets.map((b) => (
          <li key={b.kind} className="flex gap-2 text-[13px] leading-snug sm:text-sm">
            <span className="mt-0.5 shrink-0 text-slate-500" aria-hidden>
              •
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-medium text-slate-400">{b.label}: </span>
              {editingKind === b.kind && b.inlineField ? (
                <input
                  key={editingKind}
                  ref={inputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck
                  className="mt-0.5 w-full rounded-md border border-emerald-500/35 bg-[#141d32] px-2 py-1 text-[13px] font-medium text-slate-100 outline-none ring-1 ring-emerald-500/30 sm:text-sm"
                  aria-label={`Edit ${b.label}`}
                  onBlur={() => finish(b, draft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      inputRef.current?.blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingKind(null);
                    }
                  }}
                />
              ) : b.inlineField ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="text-left text-[13px] font-medium text-slate-100 underline decoration-slate-600/60 underline-offset-2 transition enabled:hover:text-emerald-100/95 enabled:hover:decoration-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  onClick={() => startEdit(b)}
                >
                  {b.displayValue}
                </button>
              ) : (
                <span className="text-[13px] font-medium text-slate-100 sm:text-sm">{b.displayValue}</span>
              )}
              {b.provenance && b.provenance !== "confirmed" ? (
                <span className="ml-1.5 text-[11px] font-medium text-amber-200/90 sm:text-xs">
                  {UNDERSTOOD_PROVENANCE_LABEL[b.provenance]}
                </span>
              ) : b.needsConfirmation ? (
                <span className="ml-1.5 text-[11px] font-medium text-amber-200/90 sm:text-xs">
                  {UNDERSTOOD_PROVENANCE_LABEL.inferred}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end border-t border-slate-800/60 pt-2">
        <button
          type="button"
          className="text-[11px] font-semibold text-emerald-400/90 transition hover:text-emerald-300 sm:text-xs"
          onClick={onFocusMainInput}
        >
          {editDetailsLabel}
        </button>
      </div>
    </div>
  );
}
