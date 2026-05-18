type Props = {
  partyNames: readonly string[];
  className?: string;
  /** Visual variant for paper vs dark surfaces. */
  variant?: "paper" | "slate";
};

export function AgreementSignaturePlaceholderGrid(props: Props) {
  const { partyNames, className = "", variant = "paper" } = props;
  const names = partyNames.length > 0 ? partyNames : ["Party A", "Party B"];

  const cardClass =
    variant === "paper"
      ? "rounded-lg border border-stone-200/90 bg-white/60 px-4 py-3"
      : "rounded-lg border border-slate-600/60 bg-slate-900/50 px-4 py-3";

  const nameClass = variant === "paper" ? "text-xs font-medium text-stone-500" : "text-xs font-medium text-slate-300";
  const lineClass = variant === "paper" ? "border-stone-400/70" : "border-slate-500/70";
  const metaClass = variant === "paper" ? "text-[11px] text-stone-400" : "text-[11px] text-slate-500";

  return (
    <div className={className}>
      <p
        className={
          variant === "paper"
            ? "text-xs font-semibold uppercase tracking-wide text-stone-500"
            : "text-xs font-semibold uppercase tracking-wide text-slate-400"
        }
      >
        Signatures
      </p>
      <div
        className={`mt-4 grid gap-4 sm:gap-6 ${
          names.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        {names.map((label) => (
          <div key={label} className={cardClass}>
            <p className={nameClass}>{label}</p>
            <div className={`mt-6 border-b ${lineClass}`} aria-hidden />
            <p className={`mt-2 ${metaClass}`}>Name · Title · Date</p>
          </div>
        ))}
      </div>
    </div>
  );
}
