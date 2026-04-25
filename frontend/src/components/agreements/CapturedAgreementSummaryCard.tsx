import type { LivePreviewModel } from "./liveDraftHeuristics";
import { getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";

export type CapturedSummaryLine = { label: string; value: string };

function buildLines(raw: string, model: LivePreviewModel): CapturedSummaryLine[] {
  const canon = getCanonicalAgreementTypeForCreate(raw, model);
  const lines: CapturedSummaryLine[] = [];
  lines.push({
    label: canon.isSuggested ? "Suggested type" : "Type",
    value: canon.isSuggested ? `Suggested type: ${canon.headline}` : canon.headline,
  });
  const parties = model.partiesStructured
    ? `${model.partiesStructured.party_1} / ${model.partiesStructured.party_2}`
    : (model.partiesLine || "").trim();
  if (parties) lines.push({ label: "Parties", value: parties });
  const pay = (model.compensationLine || model.scheduleLine || "").trim();
  if (pay) lines.push({ label: "Payment", value: pay });
  const scope = (model.scopeLine || model.servicesLine || "").trim();
  if (scope) lines.push({ label: "Scope", value: scope });
  const term = (model.termLine || "").trim();
  if (term) lines.push({ label: "Term", value: term });
  return lines;
}

export function CapturedAgreementSummaryCard(props: {
  rawIntake: string;
  model: LivePreviewModel;
  onEdit: () => void;
  isGenerating?: boolean;
}) {
  const { rawIntake, model, onEdit, isGenerating } = props;
  const lines = buildLines(rawIntake.trim(), model);

  return (
    <div
      className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-4 py-4 sm:px-5 sm:py-5"
      role="region"
      aria-label="Your agreement summary"
    >
      <h2 className="text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">Your agreement</h2>
      {isGenerating ? (
        <p className="mt-3 text-sm text-emerald-200/90" role="status">
          Structuring your draft…
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-200/95 sm:text-[0.9375rem]">
          {lines.map((row) => (
            <li key={row.label}>
              <span className="font-medium text-slate-400">{row.label}: </span>
              <span className="text-slate-100">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end border-t border-slate-800/70 pt-4">
        <button
          type="button"
          className="text-sm font-semibold text-emerald-400/95 transition hover:text-emerald-300"
          onClick={onEdit}
          disabled={Boolean(isGenerating)}
        >
          Edit
        </button>
      </div>
    </div>
  );
}
