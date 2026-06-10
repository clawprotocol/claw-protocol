import type { LawdogDashboardKpis } from "./lawdogDashboardPresentation";

type Props = {
  kpis: LawdogDashboardKpis;
};

const KPI_ITEMS: {
  key: keyof LawdogDashboardKpis;
  label: string;
  testId: string;
}[] = [
  {
    key: "activeAgreements",
    label: "Active Agreements",
    testId: "dashboard-kpi-active",
  },
  {
    key: "awaitingReview",
    label: "Awaiting Review",
    testId: "dashboard-kpi-awaiting-review",
  },
  {
    key: "readyForSignature",
    label: "Ready for Signature",
    testId: "dashboard-kpi-ready-signature",
  },
  {
    key: "completedAgreements",
    label: "Completed Agreements",
    testId: "dashboard-kpi-completed",
  },
];

export function DashboardKpiCards(props: Props) {
  const { kpis } = props;
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="dashboard-kpi-cards"
      aria-label="Dashboard key metrics"
    >
      {KPI_ITEMS.map((item) => (
        <div
          key={item.key}
          className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-4 py-3"
          data-testid={item.testId}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
            {String(kpis[item.key])}
          </p>
        </div>
      ))}
    </div>
  );
}
