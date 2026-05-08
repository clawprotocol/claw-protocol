import { useState } from "react";
import type { RecipientClauseSuggestionCard } from "./recipientClauseSuggestionsFromText";
import {
  RECIPIENT_CLAUSE_SUGGESTIONS_CTA_PASTE,
  RECIPIENT_CLAUSE_SUGGESTIONS_CTA_APPLY,
  RECIPIENT_CLAUSE_SUGGESTIONS_CTA_SEND,
  RECIPIENT_CLAUSE_SUGGESTIONS_CTA_UPLOAD,
  RECIPIENT_CLAUSE_SUGGESTIONS_DOWNLOAD,
  RECIPIENT_CLAUSE_SUGGESTIONS_SUB,
  RECIPIENT_CLAUSE_SUGGESTIONS_TITLE,
  RECIPIENT_CLAUSE_SUGGESTION_STATUS_NEEDS_PLACEMENT,
  RECIPIENT_CLAUSE_SUGGESTION_STATUS_READY,
} from "./portableReviewCopy";

type Props = {
  items: RecipientClauseSuggestionCard[];
  rawText: string;
  onSendSuggestionsOnly: () => void;
  onApplySuggestionsToDraft: () => void;
  onUploadFullRevisedDraft: () => void;
  onPasteRevisedAgreement: () => void;
};

export function RecipientClauseSuggestionsSurface({
  items,
  rawText,
  onSendSuggestionsOnly,
  onApplySuggestionsToDraft,
  onUploadFullRevisedDraft,
  onPasteRevisedAgreement,
}: Props) {
  const [whyOpen, setWhyOpen] = useState<Record<string, boolean>>({});

  const downloadSuggestions = () => {
    const lines = items.map((c) => [`## ${c.title}`, c.meaning, ""].join("\n"));
    const body = [lines.join("\n"), "---", "", rawText.trim()].join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "suggested-protections.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-testid="recipient-clause-suggestions-surface"
      className="rounded-xl border border-sky-900/35 bg-gradient-to-b from-sky-950/25 to-slate-950/40 px-4 py-5 shadow-inner shadow-sky-950/10"
      role="region"
      aria-labelledby="recipient-clause-suggestions-title"
    >
      <h3 id="recipient-clause-suggestions-title" className="text-base font-semibold tracking-tight text-sky-50/95">
        {RECIPIENT_CLAUSE_SUGGESTIONS_TITLE}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{RECIPIENT_CLAUSE_SUGGESTIONS_SUB}</p>

      <ul className="mt-4 space-y-3" data-testid="recipient-clause-suggestion-cards">
        {items.map((c) => (
          <li
            key={c.id}
            className="rounded-lg border border-slate-700/55 bg-slate-950/45 px-3 py-3"
            data-testid={`recipient-clause-suggestion-card-${c.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[13px] font-semibold text-slate-100">{c.title}</p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  c.status === "ready"
                    ? "border-emerald-700/50 bg-emerald-950/35 text-emerald-100"
                    : "border-amber-700/50 bg-amber-950/35 text-amber-100"
                }`}
              >
                {c.status === "ready"
                  ? RECIPIENT_CLAUSE_SUGGESTION_STATUS_READY
                  : RECIPIENT_CLAUSE_SUGGESTION_STATUS_NEEDS_PLACEMENT}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{c.meaning}</p>
            <button
              type="button"
              className="mt-2 text-left text-[11px] font-medium text-sky-300/95 underline decoration-sky-700/50 underline-offset-2 hover:text-sky-200"
              aria-expanded={Boolean(whyOpen[c.id])}
              onClick={() => setWhyOpen((m) => ({ ...m, [c.id]: !m[c.id] }))}
            >
              Why this matters
            </button>
            {whyOpen[c.id] ? (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                The owner can place this in the right clause. Sending shares the intent without rewriting the whole
                agreement here.
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="recipient-clause-suggestions-send"
          className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500 sm:flex-1"
          onClick={onSendSuggestionsOnly}
        >
          {RECIPIENT_CLAUSE_SUGGESTIONS_CTA_SEND}
        </button>
        <button
          type="button"
          data-testid="recipient-clause-suggestions-apply-draft"
          className="min-h-[44px] rounded-xl border border-violet-800/50 bg-violet-950/30 px-4 py-2.5 text-center text-sm font-semibold text-violet-100 hover:bg-violet-950/45 sm:flex-1"
          onClick={onApplySuggestionsToDraft}
        >
          {RECIPIENT_CLAUSE_SUGGESTIONS_CTA_APPLY}
        </button>
        <button
          type="button"
          data-testid="recipient-clause-suggestions-download"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={downloadSuggestions}
        >
          {RECIPIENT_CLAUSE_SUGGESTIONS_DOWNLOAD}
        </button>
        <button
          type="button"
          data-testid="recipient-clause-suggestions-upload"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={onUploadFullRevisedDraft}
        >
          {RECIPIENT_CLAUSE_SUGGESTIONS_CTA_UPLOAD}
        </button>
        <button
          type="button"
          data-testid="recipient-clause-suggestions-paste"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={onPasteRevisedAgreement}
        >
          {RECIPIENT_CLAUSE_SUGGESTIONS_CTA_PASTE}
        </button>
      </div>
    </div>
  );
}
