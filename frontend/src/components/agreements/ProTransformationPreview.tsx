import {
  PRO_CAN_TIGHTEN_BULLETS,
  PRO_CAN_TIGHTEN_FOOTNOTE,
  PRO_CAN_TIGHTEN_HEADING,
} from "../../launch/simpleProduct/proTransformationCopy";

type Props = {
  className?: string;
};

/**
 * Compact Pro value block near the upgrade CTA — not document-like; no fake contract sample.
 */
export function ProTransformationPreview({ className = "" }: Props) {
  return (
    <aside
      className={[
        "pro-upgrade-value-block rounded-lg border border-amber-500/25 bg-gradient-to-b from-slate-900/80 to-slate-950/90 px-3 py-3 font-sans sm:px-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="pro-upgrade-value-block"
      aria-labelledby="pro-upgrade-value-heading"
    >
      <p id="pro-upgrade-value-heading" className="text-sm font-semibold text-slate-100">
        {PRO_CAN_TIGHTEN_HEADING}
      </p>
      <ul className="mt-2.5 space-y-1.5 text-sm leading-snug text-slate-400">
        {PRO_CAN_TIGHTEN_BULLETS.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-400/90" aria-hidden>
              ✓
            </span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-slate-500 sm:text-xs">{PRO_CAN_TIGHTEN_FOOTNOTE}</p>
    </aside>
  );
}
