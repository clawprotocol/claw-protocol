import type { AgreementReadySummaryDraftSource } from "./agreementReadySummaryModel";
import { buildAgreementReadySummaryModel } from "./agreementReadySummaryModel";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";

type Props = {
  draft: AgreementReadySummaryDraftSource;
};

function ReadOnlyField(props: { label: string; value: string | null | undefined }) {
  const text = (props.value || "").trim() || "—";
  return (
    <div className="rounded-lg border border-slate-800/90 bg-slate-900/35 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{props.label}</div>
      <div className="mt-2 text-sm leading-snug text-slate-100">{text}</div>
    </div>
  );
}

export function AgreementDetailsReadOnlyPanel(props: Props) {
  const { draft } = props;
  const model = buildAgreementReadySummaryModel(draft);
  const jurisdiction = (draft.jurisdiction || "").trim()
    ? normalizeJurisdictionDisplay(draft.jurisdiction || "")
    : "—";

  return (
    <div className="space-y-4" data-testid="agreement-details-readonly-panel">
      <div className="grid gap-3 md:grid-cols-3">
        <ReadOnlyField label="Title" value={draft.title} />
        <ReadOnlyField label="Governing law" value={jurisdiction} />
        <ReadOnlyField label="Effective date" value={draft.effective_date} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ReadOnlyField label="Purpose" value={draft.purpose} />
        <ReadOnlyField label="Payment terms" value={draft.payment_terms} />
        <ReadOnlyField label="Duration" value={draft.duration} />
      </div>
      <div className="rounded-lg border border-slate-800/90 bg-slate-900/35 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Who&apos;s in this agreement?</div>
        <div className="space-y-2">
          {model.parties.map((party) => (
            <div key={`${party.name}-${party.roleLabel}`} className="flex gap-2 text-sm text-slate-100">
              <span className="text-emerald-400" aria-hidden>
                ✓
              </span>
              <span>
                {party.name}
                {party.roleLabel ? <span className="text-slate-400">{` — ${party.roleLabel}`}</span> : null}
              </span>
            </div>
          ))}
          {(draft.parties || []).length === 0 ? (
            <p className="text-sm text-slate-500">No parties listed yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
