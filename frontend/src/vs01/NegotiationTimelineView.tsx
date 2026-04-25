import type { AgreementVersionRecord } from "../agreement/agreementVersionStore";
import type { NegotiationTimelineCurrentStatus, NegotiationTimelineEvent } from "./negotiationTimeline";

type Props = {
  versions: AgreementVersionRecord[];
  events: NegotiationTimelineEvent[];
  currentStatus: NegotiationTimelineCurrentStatus | null;
  onSelectVersion?: (versionId: string) => void;
  /** Tighter typography and spacing for recipient layout. */
  compact?: boolean;
  /** Subtitle under the section title (owner view). */
  showIntro?: boolean;
};

function versionOrdinal(versions: AgreementVersionRecord[], versionId: string): number | null {
  const i = versions.findIndex((v) => v.id === versionId);
  return i >= 0 ? i + 1 : null;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NegotiationTimelineView({
  versions,
  events,
  currentStatus,
  onSelectVersion,
  compact,
  showIntro = true,
}: Props) {
  if (versions.length === 0) return null;

  const textMain = compact ? "text-[11px]" : "text-xs";
  const textMuted = compact ? "text-[10px]" : "text-[11px]";
  const textMeta = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className="rounded-lg border border-slate-800/90 bg-slate-900/35 p-4">
      <div className={`${textMeta} font-semibold uppercase tracking-wide text-slate-400`}>Version history</div>
      {showIntro ? (
        <p className={`mt-1 ${textMuted} leading-snug text-slate-500`}>
          Each row is a saved version of the contract — who changed it, when, and what changed.
        </p>
      ) : null}

      {currentStatus ? (
        <div
          className={`mt-3 rounded-md border border-slate-700/80 bg-slate-950/40 px-3 py-2 ${textMain} text-slate-200`}
        >
          <div className="font-medium text-slate-100">{currentStatus.title}</div>
          {currentStatus.detail ? (
            <div className={`mt-0.5 ${textMuted} text-slate-400`}>{currentStatus.detail}</div>
          ) : null}
        </div>
      ) : null}

      <div className={`relative mt-4 space-y-0 pl-1 ${compact ? "max-h-[14rem] overflow-y-auto pr-1" : ""}`}>
        <div
          className="absolute top-2 bottom-2 left-[7px] w-px bg-slate-700/60"
          aria-hidden
        />
        <ul className="relative m-0 list-none space-y-3 p-0">
          {events.map((e) => {
            const vo = versionOrdinal(versions, e.versionId);
            const canClick =
              Boolean(onSelectVersion) &&
              e.eventType !== "finalized" &&
              e.eventType !== "negotiation_reopened";
            const fallbackOrdinal = vo != null ? `v${vo}` : "";
            return (
              <li key={e.id} className="relative flex gap-3 pl-4">
                <span
                  className={`absolute left-0 top-1.5 h-2 w-2 shrink-0 rounded-full border ${
                    e.eventType === "finalized"
                      ? "border-emerald-600/70 bg-emerald-600/40"
                      : e.eventType === "negotiation_reopened"
                        ? "border-amber-600/55 bg-amber-900/30"
                        : "border-slate-600 bg-slate-800"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!canClick}
                    onClick={() => canClick && onSelectVersion?.(e.versionId)}
                    className={`w-full text-left transition-colors ${
                      canClick ? "cursor-pointer hover:text-sky-200/95" : "cursor-default"
                    } disabled:cursor-default disabled:opacity-100`}
                  >
                    <div className={`${textMain} font-semibold leading-snug text-indigo-100/95`}>
                      {e.revisionLabel || fallbackOrdinal || "Revision"}
                    </div>
                    <div className={`mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${textMuted} text-slate-500`}>
                      <span>{formatTs(e.timestamp)}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">{e.actorLabel}</span>
                    </div>
                    {e.title && e.title !== e.revisionLabel ? (
                      <div className={`${textMain} mt-1 font-medium leading-snug text-slate-100`}>{e.title}</div>
                    ) : null}
                  </button>
                  {e.detail ? (
                    <div className={`${textMuted} mt-1 leading-snug text-slate-400`}>{e.detail}</div>
                  ) : null}
                  {e.posture || e.riskLabel || e.decision ? (
                    <div className={`mt-1.5 flex flex-wrap gap-1 ${textMeta}`}>
                      {e.posture ? (
                        <span className="rounded border border-slate-700/70 bg-slate-950/50 px-1.5 py-0.5 text-slate-400">
                          {e.posture}
                        </span>
                      ) : null}
                      {e.riskLabel ? (
                        <span className="rounded border border-slate-700/70 bg-slate-950/50 px-1.5 py-0.5 text-slate-400">
                          {e.riskLabel}
                        </span>
                      ) : null}
                      {e.decision ? (
                        <span className="rounded border border-slate-700/70 bg-slate-950/50 px-1.5 py-0.5 text-slate-400">
                          {e.decision}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
