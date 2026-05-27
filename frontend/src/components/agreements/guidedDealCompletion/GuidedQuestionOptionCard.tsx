import { useState } from "react";

type Props = {
  label: string;
  recommended?: boolean;
  selected?: boolean;
  why: string | null;
  lawDogWill: string;
  whyFull?: string | null;
  lawDogWillFull?: string;
  disabled?: boolean;
  /** Mobile-first: hide Why / LawDog will for tap-once flow. */
  compact?: boolean;
  onSelect: () => void;
};

export function GuidedQuestionOptionCard({
  label,
  recommended = false,
  selected = false,
  why,
  lawDogWill,
  whyFull,
  lawDogWillFull,
  disabled = false,
  compact = false,
  onSelect,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const showMore =
    Boolean(whyFull && whyFull !== why) || Boolean(lawDogWillFull && lawDogWillFull !== lawDogWill);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full rounded-xl border px-3 py-2.5 text-left shadow-sm transition active:scale-[0.995] disabled:opacity-40 ${
        selected
          ? "border-emerald-600 bg-emerald-50/95 ring-2 ring-emerald-500/35 shadow-emerald-900/10"
          : recommended
            ? "border-emerald-400/70 bg-emerald-50/75 hover:border-emerald-500"
            : "border-stone-200/90 bg-white hover:border-stone-350 hover:bg-stone-50/90"
      }`}
      data-testid={recommended ? "guided-option-recommended" : "guided-option"}
      data-selected={selected ? "true" : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className={`min-w-0 flex-1 text-[13px] font-semibold leading-snug ${
            recommended || selected ? "text-emerald-950" : "text-stone-900"
          }`}
        >
          {label}
        </span>
        {recommended ? (
          <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Rec
          </span>
        ) : null}
      </div>
      {!compact && why ? (
        <p className="mt-1 text-[11px] leading-snug text-stone-600">
          <span className="font-semibold text-stone-700">Why: </span>
          {expanded && whyFull ? whyFull : why}
        </p>
      ) : null}
      {!compact ? (
        <p className="mt-0.5 text-[11px] leading-snug text-stone-700">
          <span className="font-semibold text-stone-800">Updates: </span>
          {expanded && lawDogWillFull ? lawDogWillFull : lawDogWill}
        </p>
      ) : null}
      {showMore ? (
        <span
          role="presentation"
          className="mt-1 inline-block text-[10px] font-medium text-stone-500 underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Less" : "More details"}
        </span>
      ) : null}
    </button>
  );
}
