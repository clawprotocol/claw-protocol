import type { RedlineSegmentVM } from "./recipientPreviewDiffModel";

type Props = {
  /** Prefer passing canonical segments from {@link buildRecipientRedlineViewModel}. */
  segments?: RedlineSegmentVM[];
  /** @deprecated Wrap segments in a minimal object — prefer {@link segments}. */
  redline?: { hasChanges: boolean; segments: RedlineSegmentVM[] };
  /** Preserve newlines inside each diff chunk (full-document compare). */
  paragraphBreaks?: boolean;
  /** Omit outer panel chrome (clause cards provide their own scroll/border). */
  embedded?: boolean;
  /** @deprecated Use {@link contrast} — kept for call sites. */
  trackingStrong?: boolean;
  /** High-contrast insert/delete (recipient review default). */
  contrast?: "standard" | "high";
};

function segmentClass(
  segType: "same" | "delete" | "insert",
  highContrast: boolean,
): string {
  if (segType === "same") {
    return highContrast ? "text-slate-800" : "text-slate-800";
  }
  if (segType === "insert") {
    if (highContrast) {
      return "rounded px-1 py-0.5 font-semibold bg-emerald-500 text-emerald-950 shadow-sm ring-1 ring-emerald-800/40 underline decoration-emerald-900/50 decoration-2 underline-offset-2";
    }
    return "rounded px-1 py-0.5 bg-emerald-100 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2";
  }
  if (highContrast) {
    return "rounded px-1 py-0.5 font-semibold bg-rose-400 text-rose-950 line-through decoration-rose-950 decoration-2 ring-1 ring-rose-800/45";
  }
  return "rounded px-1 py-0.5 bg-rose-100 text-rose-950 line-through decoration-rose-700/40 decoration-1";
}

/**
 * Presentational tracked changes: renders supplied segments only (no diffing).
 * Whole-document reader layout lives in `RecipientLegalRedlineDocument`.
 */
export function RecipientRedlineInline({
  segments: segmentsProp,
  redline,
  paragraphBreaks,
  embedded,
  trackingStrong,
  contrast,
}: Props) {
  const segments = segmentsProp ?? redline?.segments ?? [];
  const highContrast = contrast !== "standard" || Boolean(trackingStrong);
  const wrap = paragraphBreaks ? "mb-1 block whitespace-pre-wrap break-words" : "";
  const inner = segments.map((seg, idx) => {
    if (seg.type === "same") {
      return (
        <span key={`rl_${idx}`} className={wrap || undefined} data-redline="same">
          {seg.text}
        </span>
      );
    }
    if (seg.type === "insert") {
      return (
        <span
          key={`rl_${idx}`}
          data-redline="insert"
          className={`${segmentClass("insert", highContrast)} ${wrap}`.trim()}
        >
          {seg.text}
        </span>
      );
    }
    return (
      <span
        key={`rl_${idx}`}
        data-redline="delete"
        className={`${segmentClass("delete", highContrast)} ${wrap}`.trim()}
      >
        {seg.text}
      </span>
    );
  });

  if (embedded) {
    return <div className="text-[0.8125rem] leading-relaxed text-slate-900">{inner}</div>;
  }

  return (
    <div
      className="max-h-[28rem] overflow-y-auto rounded-md border border-slate-700/80 bg-white p-4 text-[0.8125rem] leading-relaxed text-slate-900"
      data-testid="recipient-redline-inline"
    >
      {inner}
    </div>
  );
}
