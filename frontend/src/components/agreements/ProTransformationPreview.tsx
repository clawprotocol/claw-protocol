import {
  PRO_CAN_IMPROVE_HEADING,
  PRO_TRANSFORMATION_PREVIEW_FOOTNOTE,
  PRO_TRANSFORMATION_PREVIEW_LABEL,
  PRO_TRANSFORMATION_PREVIEW_SAMPLE,
} from "../../launch/simpleProduct/proTransformationCopy";

type Props = {
  className?: string;
};

/**
 * Upgrade teaser — separate from the free draft document (not contract paper styling).
 */
export function ProTransformationPreview({ className = "" }: Props) {
  return (
    <aside
      className={[
        "pro-upgrade-teaser-preview rounded-lg border border-slate-700/70 bg-slate-900/55 px-3 py-3 font-sans sm:px-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="pro-upgrade-teaser-preview"
      aria-labelledby="pro-upgrade-teaser-heading"
    >
      <p id="pro-upgrade-teaser-heading" className="text-xs font-medium text-slate-300 sm:text-[13px]">
        {PRO_CAN_IMPROVE_HEADING}
      </p>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-200/75">
        {PRO_TRANSFORMATION_PREVIEW_LABEL}
      </p>
      <p className="mt-1.5 text-sm leading-snug text-slate-400">{PRO_TRANSFORMATION_PREVIEW_SAMPLE}</p>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">{PRO_TRANSFORMATION_PREVIEW_FOOTNOTE}</p>
    </aside>
  );
}
