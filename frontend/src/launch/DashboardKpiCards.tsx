import type { LawdogDashboardKpis } from "./lawdogDashboardPresentation";
import { formatLawdogKpiCurrency } from "./lawdogDashboardPresentation";

type Props = {
  kpis: LawdogDashboardKpis;
};

const KPI_ITEMS: {
  key: keyof LawdogDashboardKpis;
  label: string;
  testId: string;
  format: (value: number) => string;
}[] = [
  {
    key: "agreementsCreated",
    label: "Agreements Created",
    testId: "dashboard-kpi-created",
    format: (v) => String(v),
  },
  {
    key: "agreementsSent",
    label: "Agreements Sent",
    testId: "dashboard-kpi-sent",
    format: (v) => String(v),
  },
  {
    key: "agreementsSigned",
    label: "Agreements Signed",
    testId: "dashboard-kpi-signed",
    format: (v) => String(v),
  },
  {
    key: "estimatedLegalFeesSavedUsd",
    label: "Estimated Legal Fees Saved",
    testId: "dashboard-kpi-fees-saved",
    format: formatLawdogKpiCurrency,
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
            {item.format(kpis[item.key])}
          </p>
        </div>
      ))}
    </div>
  );
}
