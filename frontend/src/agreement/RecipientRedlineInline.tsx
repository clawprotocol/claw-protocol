import type { RedlineResult } from "../vs01/agreementRedline";

type Props = {
  redline: RedlineResult;
  /** Preserve newlines inside each diff chunk (full-document compare). */
  paragraphBreaks?: boolean;
  /** Omit outer panel chrome (clause cards provide their own scroll/border). */
  embedded?: boolean;
  /** Higher-contrast insert/delete for compact clause cards. */
  trackingStrong?: boolean;
};

function segmentClass(segType: "same" | "insert" | "delete", trackingStrong?: boolean): string {
  if (segType === "same") return trackingStrong ? "text-slate-700" : "text-slate-800";
  if (segType === "insert") {
    if (trackingStrong) {
      return "rounded-sm bg-emerald-400 px-0.5 py-px font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-700/25";
    }
    return "bg-emerald-100/95 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2";
  }
  if (trackingStrong) {
    return "rounded-sm bg-rose-300 px-0.5 py-px font-semibold text-rose-950 line-through decoration-rose-800 decoration-2";
  }
  return "bg-rose-100/90 text-rose-950 line-through decoration-rose-700/40 decoration-1";
}

/**
 * Inline insert/delete/same segments for recipient preview (track-changes style).
 */
export function RecipientRedlineInline({ redline, paragraphBreaks, embedded, trackingStrong }: Props) {
  const wrap = paragraphBreaks ? "mb-1 block whitespace-pre-wrap break-words" : "";
  const inner = redline.segments.map((seg, idx) => {
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
          className={`${segmentClass("insert", trackingStrong)} ${wrap}`.trim()}
        >
          {seg.text}
        </span>
      );
    }
    return (
      <span
        key={`rl_${idx}`}
        data-redline="delete"
        className={`${segmentClass("delete", trackingStrong)} ${wrap}`.trim()}
      >
        {seg.text}
      </span>
    );
  });

  if (embedded) {
    return <div className="text-[0.75rem] leading-relaxed text-slate-900">{inner}</div>;
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
