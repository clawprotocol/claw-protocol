import { PRO_IMPROVED_BULLETS, PRO_IMPROVED_HEADING } from "../../launch/simpleProduct/proTransformationCopy";

type Props = {
  className?: string;
};

/** Compact “what changed” list — subtle confidence, not a feature matrix. */
export function ProImprovedSummary({ className = "" }: Props) {
  return (
    <div className={["min-w-0", className].filter(Boolean).join(" ")} data-testid="pro-improved-summary">
      <p className="text-xs font-medium text-slate-300 sm:text-[13px]">{PRO_IMPROVED_HEADING}</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug text-slate-400">
        {PRO_IMPROVED_BULLETS.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-400/90" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
