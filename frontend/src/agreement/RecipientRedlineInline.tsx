import type { RedlineResult } from "../vs01/agreementRedline";

type Props = {
  redline: RedlineResult;
  /** Preserve newlines inside each diff chunk (full-document compare). */
  paragraphBreaks?: boolean;
  /** Omit outer panel chrome (clause cards provide their own scroll/border). */
  embedded?: boolean;
};

function segmentClass(segType: "same" | "insert" | "delete"): string {
  if (segType === "same") return "text-slate-800";
  if (segType === "insert") {
    return "bg-emerald-100/95 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2";
  }
  return "bg-rose-100/90 text-rose-950 line-through decoration-rose-700/40 decoration-1";
}

/**
 * Inline insert/delete/same segments for recipient preview (track-changes style).
 */
export function RecipientRedlineInline({ redline, paragraphBreaks, embedded }: Props) {
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
          className={`${segmentClass("insert")} ${wrap}`.trim()}
        >
          {seg.text}
        </span>
      );
    }
    return (
      <span
        key={`rl_${idx}`}
        data-redline="delete"
        className={`${segmentClass("delete")} ${wrap}`.trim()}
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
