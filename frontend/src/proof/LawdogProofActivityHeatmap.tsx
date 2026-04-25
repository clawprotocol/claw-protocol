import { useEffect, useMemo, useState } from "react";
import {
  getProofHeatmapCells,
  readProofActivity,
  type ProofHeatmapCell,
} from "../leaderboard/proofActivityStore";
import { computeProofDayStreaks } from "./proofStreaks";

const LEVEL_CLASS: Record<ProofHeatmapCell["level"], string> = {
  0: "bg-slate-800/80 border-slate-700/50",
  1: "bg-emerald-900/50 border-emerald-700/40",
  2: "bg-emerald-700/55 border-emerald-600/45",
  3: "bg-emerald-500/70 border-emerald-400/50",
};

/** 7 rows × W columns: column = one week (Sun→Sat top to bottom). */
function chunkIntoWeekColumns(cells: ProofHeatmapCell[]): ProofHeatmapCell[][] {
  const weeks: ProofHeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function LawdogProofActivityHeatmap(props: { className?: string }) {
  const { className } = props;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((x) => x + 1);
    window.addEventListener("lawdog:proof-activity-day", fn);
    return () => window.removeEventListener("lawdog:proof-activity-day", fn);
  }, []);

  const { columns, streaks } = useMemo(() => {
    const cells = getProofHeatmapCells(84);
    const activity = readProofActivity();
    const streaksOut = computeProofDayStreaks(activity.day_weights || {});
    const weeks = chunkIntoWeekColumns(cells);
    return { columns: weeks, streaks: streaksOut };
  }, [tick]);

  return (
    <div className={className ?? ""}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proof activity</p>
          <p className="mt-0.5 text-[10px] text-slate-600">Private on this device · last ~12 weeks (UTC)</p>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          <p>
            Current streak:{" "}
            <span className="font-semibold tabular-nums text-emerald-200/90">{streaks.current_streak_days}d</span>
          </p>
          <p>
            Longest:{" "}
            <span className="font-semibold tabular-nums text-slate-400">{streaks.longest_streak_days}d</span>
          </p>
        </div>
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {columns.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {col.map((c) => (
              <div
                key={c.dateYmd}
                title={c.tooltip}
                className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${LEVEL_CLASS[c.level]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
