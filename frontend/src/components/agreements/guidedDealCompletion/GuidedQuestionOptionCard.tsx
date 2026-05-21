type Props = {
  label: string;
  recommended?: boolean;
  why: string | null;
  lawDogWill: string;
  disabled?: boolean;
  onSelect: () => void;
};

export function GuidedQuestionOptionCard({
  label,
  recommended = false,
  why,
  lawDogWill,
  disabled = false,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${
        recommended
          ? "border-emerald-500/80 bg-emerald-50/90 shadow-sm ring-1 ring-emerald-400/30"
          : "border-stone-200 bg-white shadow-sm hover:border-stone-400 hover:bg-stone-50/80"
      }`}
      data-testid={recommended ? "guided-option-recommended" : "guided-option"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-semibold ${recommended ? "text-emerald-950" : "text-stone-900"}`}>
          {label}
        </span>
        {recommended ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Recommended
          </span>
        ) : null}
      </div>
      {why ? (
        <div className="mt-2 rounded-md border border-sky-100/90 bg-sky-50/80 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-900/80">Why</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-sky-950/90">{why}</p>
        </div>
      ) : null}
      <div className="mt-2 rounded-md border border-stone-200/90 bg-stone-50/90 px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">LawDog will</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-stone-800">{lawDogWill}</p>
      </div>
    </button>
  );
}
