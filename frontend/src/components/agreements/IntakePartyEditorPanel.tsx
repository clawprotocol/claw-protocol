import {
  INTAKE_ADD_CONTRACTING_PARTY_LABEL,
  INTAKE_PARTY_EDITOR_AT_CAP_COPY,
  INTAKE_PARTY_EDITOR_SCOPE_COPY,
  INTAKE_REMOVE_CONTRACTING_PARTY_LABEL,
  addIntakeContractingParty,
  canAddIntakeContractingParty,
  canRemoveIntakeContractingParty,
  removeIntakeContractingParty,
} from "./intakeContractingPartyEditor";

export function IntakeContractingPartyEditor(props: {
  rows: readonly string[];
  onChange: (rows: string[]) => void;
  disabled?: boolean;
}) {
  const { rows, onChange, disabled } = props;

  return (
    <div
      className="mt-3 rounded-lg border border-slate-700/50 bg-slate-950/55 px-3 py-2.5 sm:px-3.5"
      data-testid="intake-contracting-party-editor"
      role="region"
      aria-label="Contracting parties"
    >
      <p className="text-[11px] font-semibold tracking-tight text-slate-300 sm:text-xs">Contracting parties</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{INTAKE_PARTY_EDITOR_SCOPE_COPY}</p>
      <ul className="mt-2 space-y-2" role="list">
        {rows.map((name, idx) => (
          <li key={`intake-party-${idx}`} className="flex items-center gap-2">
            <label className="min-w-0 flex-1 text-[11px] font-medium text-slate-400">
              <span className="block">Party {idx + 1}</span>
              <input
                type="text"
                value={name}
                disabled={disabled}
                data-testid={`intake-party-${idx + 1}-name`}
                aria-label={`Party ${idx + 1} legal name`}
                placeholder={idx < 2 ? `Party ${idx + 1} legal name` : "Optional additional party"}
                className="mt-0.5 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-2.5 py-1.5 text-[13px] font-medium text-slate-100 outline-none focus:border-emerald-500/60 disabled:opacity-50 sm:text-sm"
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
              />
            </label>
            {canRemoveIntakeContractingParty(idx, rows.length) ? (
              <button
                type="button"
                disabled={disabled}
                className="mt-4 shrink-0 text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50"
                onClick={() => onChange(removeIntakeContractingParty(rows, idx))}
              >
                {INTAKE_REMOVE_CONTRACTING_PARTY_LABEL}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAddIntakeContractingParty(rows.length) ? (
        <button
          type="button"
          disabled={disabled}
          data-testid="intake-add-contracting-party"
          className="mt-2 text-[11px] font-semibold text-emerald-400/90 hover:text-emerald-300 disabled:opacity-50 sm:text-xs"
          onClick={() => onChange(addIntakeContractingParty(rows))}
        >
          {INTAKE_ADD_CONTRACTING_PARTY_LABEL}
        </button>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-slate-500">{INTAKE_PARTY_EDITOR_AT_CAP_COPY}</p>
      )}
    </div>
  );
}
