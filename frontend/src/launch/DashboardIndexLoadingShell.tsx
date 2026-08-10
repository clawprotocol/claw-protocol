/**
 * Instant /app chrome while workspace-index is in flight.
 * Replaces the text-only “Loading agreements…” wait.
 */

import { DashboardKpiCards } from "./DashboardKpiCards";

const EMPTY_KPIS = {
  activeAgreements: 0,
  awaitingReview: 0,
  readyForSignature: 0,
  completedAgreements: 0,
};

function PulseCard({ index }: { index: number }) {
  return (
    <li
      className="rounded-2xl border border-slate-800/70 bg-slate-950/25 px-4 py-4 sm:px-5 sm:py-5"
      data-testid={`dashboard-index-loading-card-${index}`}
      aria-hidden={index > 0}
    >
      <div className="animate-pulse space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="h-5 w-40 rounded bg-slate-800/80" />
          <div className="h-5 w-28 rounded-full bg-slate-800/60" />
        </div>
        <div className="h-4 w-24 rounded bg-slate-800/50" />
        <div className="space-y-2 pt-1">
          <div className="h-4 w-56 rounded bg-slate-800/40" />
          <div className="h-4 w-44 rounded bg-slate-800/40" />
        </div>
      </div>
    </li>
  );
}

type Props = {
  onCreateAgreement: () => void;
  /** Placeholder card count under What’s next / All agreements. */
  cardCount?: number;
};

export function DashboardIndexLoadingShell(props: Props) {
  const count = Math.max(1, props.cardCount ?? 3);
  return (
    <div data-testid="dashboard-index-loading-shell" aria-busy="true" aria-live="polite">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400" data-testid="dashboard-agreement-count-loading">
          Loading agreements…
        </p>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--compact"
          data-testid="dashboard-create-new-agreement"
          onClick={props.onCreateAgreement}
        >
          Create new agreement
        </button>
      </div>
      <div className="opacity-60" data-testid="dashboard-kpi-loading">
        <DashboardKpiCards kpis={EMPTY_KPIS} />
      </div>
      <div className="mt-8 space-y-8">
        <section aria-label="Loading what’s next">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            What&apos;s next
          </h2>
          <ul className="space-y-3">
            <PulseCard index={0} />
          </ul>
        </section>
        <section aria-label="Loading agreements">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            All agreements
          </h2>
          <ul className="mt-4 space-y-3" data-testid="dashboard-index-loading-list">
            {Array.from({ length: count }, (_, i) => (
              <PulseCard key={i} index={i} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
