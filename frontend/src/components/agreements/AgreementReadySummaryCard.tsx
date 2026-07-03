import type { ReactNode } from "react";
import type { AgreementReadySummaryDraftSource } from "./agreementReadySummaryModel";
import { buildAgreementReadySummaryModel } from "./agreementReadySummaryModel";

type Props = {
  draft: AgreementReadySummaryDraftSource;
  onReviewAgreement: () => void;
  onEditDetails: () => void;
  advancedPanel?: ReactNode;
};

function SummaryRow(props: { label: string; value: string | null | undefined }) {
  const value = (props.value || "").trim();
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</dt>
      <dd className="text-sm leading-snug text-slate-100">{value}</dd>
    </div>
  );
}

export function AgreementReadySummaryCard(props: Props) {
  const model = buildAgreementReadySummaryModel(props.draft);

  return (
    <div
      className="rounded-xl border border-emerald-900/30 bg-gradient-to-b from-emerald-950/20 to-slate-950/40 p-5 sm:p-6"
      data-testid="agreement-ready-summary-card"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-base font-semibold text-emerald-300"
          aria-hidden
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">Draft ready</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
            Your {model.title} is ready
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            We structured your intake into agreement details. Review the summary below, then continue when you are ready.
          </p>
        </div>
      </div>

      <dl className="mt-6 space-y-3 rounded-lg border border-slate-800/70 bg-slate-950/35 px-4 py-4">
        {model.parties.length > 0 ? (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Parties</dt>
            <dd className="mt-2 space-y-1.5">
              {model.parties.map((party) => (
                <div key={`${party.name}-${party.roleLabel}`} className="flex gap-2 text-sm text-slate-100">
                  <span className="text-emerald-400" aria-hidden>
                    ✓
                  </span>
                  <span>
                    {party.name}
                    {party.roleLabel ? (
                      <span className="text-slate-400">{` — ${party.roleLabel}`}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </dd>
          </div>
        ) : null}
        <SummaryRow label="Term" value={model.term} />
        <SummaryRow label="Payment" value={model.payment} />
        <SummaryRow label="Governing law" value={model.governingLaw} />
        <SummaryRow label="Effective date" value={model.effectiveDate} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-emerald-800/45 bg-emerald-950/35 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
          {model.statusLabel}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary min-h-[2.75rem] px-6"
          onClick={props.onReviewAgreement}
        >
          Review agreement
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary min-h-[2.75rem] px-6"
          onClick={props.onEditDetails}
        >
          Edit details
        </button>
      </div>

      {props.advancedPanel ? (
        <details className="mt-5 rounded-lg border border-slate-800/60 bg-slate-950/25 px-3 py-2">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none [&::-webkit-details-marker]:hidden">
            Advanced options
          </summary>
          <div className="mt-3 space-y-3 border-t border-slate-800/50 pt-3">{props.advancedPanel}</div>
        </details>
      ) : null}
    </div>
  );
}
