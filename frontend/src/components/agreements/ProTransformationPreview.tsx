import {
  PRO_TRANSFORMATION_PREVIEW_FOOTNOTE,
  PRO_TRANSFORMATION_PREVIEW_LABEL,
  PRO_TRANSFORMATION_PREVIEW_SAMPLE,
} from "../../launch/simpleProduct/proTransformationCopy";

type Props = {
  className?: string;
  /** Paper-styled variant sits inside the free draft document surface. */
  variant?: "dark" | "paper";
};

export function ProTransformationPreview({ className = "", variant = "dark" }: Props) {
  const shell =
    variant === "paper"
      ? "mt-6 rounded-lg border border-amber-300/50 bg-amber-50/90 px-3 py-3 sm:px-4"
      : "rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-3 sm:px-4";

  const labelClass =
    variant === "paper"
      ? "text-[11px] font-medium text-amber-900/80"
      : "text-[11px] font-medium text-amber-200/85";

  const sampleClass =
    variant === "paper"
      ? "mt-1.5 font-serif text-sm leading-relaxed text-stone-800"
      : "mt-1.5 font-serif text-sm leading-relaxed text-slate-200/95";

  const footnoteClass =
    variant === "paper" ? "mt-2 text-[11px] leading-snug text-stone-600" : "mt-2 text-[11px] leading-snug text-slate-500";

  return (
    <aside
      className={[shell, className].filter(Boolean).join(" ")}
      data-testid="pro-transformation-preview"
      aria-label={PRO_TRANSFORMATION_PREVIEW_LABEL}
    >
      <p className={labelClass}>{PRO_TRANSFORMATION_PREVIEW_LABEL}</p>
      <p className={sampleClass}>{PRO_TRANSFORMATION_PREVIEW_SAMPLE}</p>
      <p className={footnoteClass}>{PRO_TRANSFORMATION_PREVIEW_FOOTNOTE}</p>
    </aside>
  );
}
