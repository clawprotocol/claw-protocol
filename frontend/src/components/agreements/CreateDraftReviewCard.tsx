import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { sanitizePartiesInput } from "./partyIntakeNormalize";
import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";
import { normalizePaymentTermsForDisplay, normalizeStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

function cell(s: string): string {
  const t = nz(s);
  return t ? t : "Not set yet";
}

function partiesBlock(draft: ParsedDraftShape): string {
  const ps = draft.parties || [];
  if (ps.length === 0) return "Not set yet";
  return ps.map((p) => (p.role && p.role !== "party" ? `${p.name} (${p.role})` : p.name)).join(" · ");
}

function termBlock(draft: ParsedDraftShape): string {
  const bits = [nz(draft.duration), nz(draft.effective_date), nz(draft.due_date)].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Not set yet";
}

function termEditSeed(draft: ParsedDraftShape): string {
  const bits = [nz(draft.duration), nz(draft.effective_date), nz(draft.due_date)].filter(Boolean);
  return bits.join(" · ");
}

function partiesEditSeed(draft: ParsedDraftShape): string {
  const ps = draft.parties || [];
  if (ps.length === 0) return "";
  return sanitizePartiesInput(ps.map((p) => p.name).join(", "));
}

export type ReviewInlineField =
  | "title"
  | "parties"
  | "purpose"
  | "payment_terms"
  | "duration"
  | "jurisdiction"
  | "termination_summary"
  | "additional_terms";

export type CreateDraftReviewCardHandle = {
  /** Opens inline party edit when `onInlineCommit` is set. */
  beginPartyInlineEdit: () => boolean;
  /** Opens inline edit for a structured row (title, parties, purpose, …). */
  beginInlineEditField: (field: ReviewInlineField) => boolean;
};

export type CreateDraftReviewCardProps = {
  draft: ParsedDraftShape;
  className?: string;
  /** All major rows: click to edit, commit on blur. */
  onInlineCommit?: (field: ReviewInlineField, value: string) => void | Promise<void>;
  /** Prefill the parent “Refine this agreement” box (optional helper). */
  onPrefillRefine?: (instruction: string) => void;
  /** When set, “Refine” jumps focus to the primary agreement document instead of prefilling AI. */
  onNavigateToAgreementDocument?: () => void;
  /** Increment to pulse-highlight the parties row (e.g. placeholder guard). */
  partyHighlightNonce?: number;
  /** Neutral chrome for prepare step (no emerald/amber emphasis in the card chrome). */
  prepareCompact?: boolean;
  /** When true, hide weak starter `payment_terms` fragments behind polished display copy. */
  sanitizeStarterPaymentTerms?: boolean;
};

export const CreateDraftReviewCard = forwardRef<CreateDraftReviewCardHandle, CreateDraftReviewCardProps>(
  function CreateDraftReviewCard(props, ref) {
    const {
      draft,
      className,
      onInlineCommit,
      onPrefillRefine,
      onNavigateToAgreementDocument,
      partyHighlightNonce = 0,
      prepareCompact = false,
      sanitizeStarterPaymentTerms = false,
    } = props;
    const [editing, setEditing] = useState<ReviewInlineField | null>(null);
    const [buf, setBuf] = useState("");

    useEffect(() => {
      console.debug("[review-card-source]", {
        source: "props.draft (canonical reviewDraft from parent)",
        title: nz(draft.title).slice(0, 80),
        parties: partiesBlock(draft).slice(0, 120),
        purposeLen: nz(draft.purpose).length,
      });
    }, [draft]);

    /** After programmatic `beginPartyInlineEdit`, move focus into the parties textarea. */
    useEffect(() => {
      if (editing !== "parties") return;
      const id = window.requestAnimationFrame(() => {
        const el = document.getElementById("claw-review-party-0-input");
        (el as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
        if (import.meta.env.DEV) {
          console.debug("[fix_review][card]", {
            afterEdit: "parties",
            focused: document.activeElement === el,
            targetId: "claw-review-party-0-input",
          });
        }
      });
      return () => window.cancelAnimationFrame(id);
    }, [editing]);

    useEffect(() => {
      if (editing === null || editing === "parties") return;
      const focusId: Partial<Record<ReviewInlineField, string>> = {
        title: "claw-review-title-input",
        purpose: "claw-review-purpose-input",
        payment_terms: "claw-review-payment-terms-input",
        duration: "claw-review-duration-input",
        jurisdiction: "claw-review-jurisdiction-input",
        termination_summary: "claw-review-termination-input",
        additional_terms: "claw-review-additional-terms-input",
      };
      const id = focusId[editing];
      if (!id) return;
      const raf = window.requestAnimationFrame(() => {
        document.getElementById(id)?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(raf);
    }, [editing]);

    const partyRowFlash = partyHighlightNonce > 0;
    const partiesPlaceholder = draftHasPlaceholderParties(draft);

    const startEdit = (field: ReviewInlineField) => {
      if (!onInlineCommit) return;
      if (field === "title") setBuf(nz(draft.title));
      else if (field === "parties") setBuf(partiesEditSeed(draft));
      else if (field === "purpose") setBuf(nz(draft.purpose));
      else if (field === "payment_terms") setBuf(nz(draft.payment_terms));
      else if (field === "jurisdiction") setBuf(nz(draft.jurisdiction));
      else if (field === "termination_summary") setBuf(nz(draft.termination_summary ?? ""));
      else if (field === "additional_terms") setBuf(nz(draft.additional_terms ?? ""));
      else setBuf(termEditSeed(draft));
      setEditing(field);
    };

    const commit = async () => {
      if (!editing || !onInlineCommit) return;
      const f = editing;
      setEditing(null);
      await onInlineCommit(f, buf.trim());
    };

    useImperativeHandle(
      ref,
      () => ({
        beginPartyInlineEdit: () => {
          if (!onInlineCommit) return false;
          if (editing === "parties") {
            window.requestAnimationFrame(() => {
              document.getElementById("claw-review-party-0-input")?.focus({ preventScroll: true });
            });
            return true;
          }
          if (editing !== null) return false;
          setBuf(partiesEditSeed(draft));
          setEditing("parties");
          return true;
        },
        beginInlineEditField: (field: ReviewInlineField) => {
          if (!onInlineCommit) return false;
          if (editing !== null) return false;
          if (field === "title") setBuf(nz(draft.title));
          else if (field === "parties") setBuf(partiesEditSeed(draft));
          else if (field === "purpose") setBuf(nz(draft.purpose));
          else if (field === "payment_terms") setBuf(nz(draft.payment_terms));
          else if (field === "jurisdiction") setBuf(nz(draft.jurisdiction));
          else if (field === "termination_summary") setBuf(nz(draft.termination_summary ?? ""));
          else if (field === "additional_terms") setBuf(nz(draft.additional_terms ?? ""));
          else setBuf(termEditSeed(draft));
          setEditing(field);
          return true;
        },
      }),
      [onInlineCommit, editing, draft],
    );

    const rowClass = onInlineCommit ? "cursor-pointer rounded-md px-1 py-0.5 transition hover:bg-slate-900/50" : "";

    const refineBtn = (instruction: string) =>
      onNavigateToAgreementDocument ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90 hover:bg-emerald-500/10 hover:text-emerald-300"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToAgreementDocument();
          }}
        >
          Refine
        </button>
      ) : onPrefillRefine ? (
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90 hover:bg-emerald-500/10 hover:text-emerald-300"
          onClick={(e) => {
            e.stopPropagation();
            onPrefillRefine(instruction);
          }}
        >
          Refine
        </button>
      ) : null;

    const placeholderRowClass = (active: boolean) =>
      `${rowClass} ${
        active
          ? prepareCompact
            ? "ring-2 ring-slate-500/55 ring-offset-2 ring-offset-slate-950/80 rounded-md"
            : "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-slate-950/80 rounded-md"
          : ""
      }`;

    return (
      <div
        className={
          className ??
          "rounded-xl border border-emerald-500/25 bg-slate-950/80 p-4 shadow-lg shadow-emerald-950/25 sm:p-5"
        }
        role="region"
        aria-label="Draft review"
      >
        <p
          className={
            prepareCompact
              ? "text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]"
              : "text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90 sm:text-[11px]"
          }
        >
          Draft preview
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">Review document</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
          {prepareCompact
            ? "Summary of key terms for this send."
            : "Summary of your draft — tap a value for quick fixes, or edit the full agreement in the preview below. Fix party names before adding recipients."}
        </p>
        <dl className="mt-4 space-y-3 border-t border-slate-800/80 pt-4 text-sm leading-relaxed text-slate-200 sm:text-[0.9375rem]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Title</dt>
              <dd
                className={rowClass}
                onClick={() => {
                  if (editing) return;
                  startEdit("title");
                }}
              >
                {editing === "title" ? (
                  <input
                    id="claw-review-title-input"
                    type="text"
                    className="mt-0.5 w-full rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                    value={buf}
                    onChange={(e) => setBuf(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={() => void commit()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="mt-0.5 block font-medium text-slate-100">{cell(draft.title)}</span>
                )}
              </dd>
            </div>
            {refineBtn(
              `Please update the agreement title. Current title: "${nz(draft.title) || "Not set yet"}". New title:`,
            )}
          </div>
          <section id="claw-review-parties-section" aria-label="Agreement parties">
            <div
              id="claw-review-parties-row"
              className={`flex items-start justify-between gap-2 motion-safe:transition-[box-shadow] motion-safe:duration-500 ${
                partyRowFlash ? "motion-safe:animate-pulse" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Parties</dt>
                <dd
                  className={placeholderRowClass(partiesPlaceholder)}
                  data-claw-party-edit-trigger={onInlineCommit ? "true" : undefined}
                  onClick={() => {
                    if (editing) return;
                    startEdit("parties");
                  }}
                >
                  {editing === "parties" ? (
                    <textarea
                      id="claw-review-party-0-input"
                      className="mt-0.5 w-full resize-y rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                      rows={3}
                      placeholder="Two names separated by a comma, e.g. Jane Smith, Acme LLC"
                      value={buf}
                      onChange={(e) => setBuf(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onBlur={() => void commit()}
                      autoFocus
                    />
                  ) : (
                    <span className="mt-0.5 block text-slate-100/95">{partiesBlock(draft)}</span>
                  )}
                </dd>
              </div>
              {refineBtn(
                `Please update the agreement parties. Current summary: "${partiesBlock(draft)}". Revise names and roles as needed:`,
              )}
            </div>
          </section>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Scope of Work</dt>
            <dd
              className={rowClass}
              onClick={() => {
                if (editing) return;
                startEdit("purpose");
              }}
            >
              {editing === "purpose" ? (
                <input
                  id="claw-review-purpose-input"
                  type="text"
                  className="mt-0.5 w-full rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                  value={buf}
                  onChange={(e) => setBuf(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => void commit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  autoFocus
                />
              ) : (
                <span className="mt-0.5 block text-slate-100/95">{cell(draft.purpose)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Payment Terms</dt>
            <dd
              className={rowClass}
              onClick={() => {
                if (editing) return;
                startEdit("payment_terms");
              }}
            >
              {editing === "payment_terms" ? (
                <input
                  id="claw-review-payment-terms-input"
                  type="text"
                  className="mt-0.5 w-full rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                  value={buf}
                  onChange={(e) => setBuf(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => void commit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  autoFocus
                />
              ) : (
                <span className="mt-0.5 block text-slate-100/95">
                  {cell(
                    sanitizeStarterPaymentTerms
                      ? normalizeStarterPaymentTermsForDisplay(draft.payment_terms)
                      : normalizePaymentTermsForDisplay(draft.payment_terms),
                  )}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Term / Start Date</dt>
            <dd
              className={rowClass}
              onClick={() => {
                if (editing) return;
                startEdit("duration");
              }}
            >
              {editing === "duration" ? (
                <input
                  id="claw-review-duration-input"
                  type="text"
                  className="mt-0.5 w-full rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                  value={buf}
                  onChange={(e) => setBuf(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => void commit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  autoFocus
                />
              ) : (
                <span className="mt-0.5 block text-slate-100/95">{termBlock(draft)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Governing Law</dt>
            <dd
              className={rowClass}
              onClick={() => {
                if (editing) return;
                startEdit("jurisdiction");
              }}
            >
              {editing === "jurisdiction" ? (
                <input
                  id="claw-review-jurisdiction-input"
                  type="text"
                  className="mt-0.5 w-full rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                  value={buf}
                  onChange={(e) => setBuf(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => void commit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  autoFocus
                />
              ) : (
                <span className="mt-0.5 block text-slate-100/95">{cell(draft.jurisdiction)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Termination</dt>
            <dd
              className={rowClass}
              onClick={() => {
                if (editing) return;
                startEdit("termination_summary");
              }}
            >
              {editing === "termination_summary" ? (
                <textarea
                  id="claw-review-termination-input"
                  className="mt-0.5 w-full resize-y rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                  rows={3}
                  value={buf}
                  onChange={(e) => setBuf(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={() => void commit()}
                  autoFocus
                />
              ) : (
                <span className="mt-0.5 block text-slate-100/95">
                  {nz(draft.termination_summary ?? "") ? cell(draft.termination_summary ?? "") : "Standard / not yet customized"}
                </span>
              )}
            </dd>
          </div>
          {nz(draft.additional_terms ?? "") || editing === "additional_terms" ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">Additional Terms</dt>
              <dd
                className={rowClass}
                onClick={() => {
                  if (editing) return;
                  startEdit("additional_terms");
                }}
              >
                {editing === "additional_terms" ? (
                  <textarea
                    id="claw-review-additional-terms-input"
                    className="mt-0.5 w-full resize-y rounded border border-emerald-500/40 bg-[#141d32] px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400/80"
                    rows={4}
                    value={buf}
                    onChange={(e) => setBuf(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={() => void commit()}
                    autoFocus
                  />
                ) : (
                  <span className="mt-0.5 block text-slate-100/95">{cell(draft.additional_terms ?? "")}</span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  },
);
