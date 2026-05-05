import type { RedlineResult } from "../vs01/agreementRedline";

type Props = {
  redline: RedlineResult;
};

/**
 * Inline insert/delete/same segments for recipient preview (track-changes style).
 */
export function RecipientRedlineInline({ redline }: Props) {
  return (
    <div
      className="max-h-[28rem] overflow-y-auto rounded-md border border-slate-700/80 bg-white p-4 text-[0.8125rem] leading-relaxed text-slate-900"
      data-testid="recipient-redline-inline"
    >
      {redline.segments.map((seg, idx) => {
        if (seg.type === "same") {
          return <span key={`rl_${idx}`}>{seg.text}</span>;
        }
        if (seg.type === "insert") {
          return (
            <span
              key={`rl_${idx}`}
              data-redline="insert"
              className="bg-emerald-100/95 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2"
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span
            key={`rl_${idx}`}
            data-redline="delete"
            className="bg-rose-100/90 text-rose-950 line-through decoration-rose-700/40 decoration-1"
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}
