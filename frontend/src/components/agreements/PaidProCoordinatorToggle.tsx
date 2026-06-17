import {
  PAID_PRO_COORDINATOR_TOGGLE_HELPER,
  PAID_PRO_COORDINATOR_TOGGLE_LABEL,
} from "./paidProNPartySignerSetup";

type PaidProCoordinatorToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function PaidProCoordinatorToggle({
  checked,
  onChange,
  disabled = false,
}: PaidProCoordinatorToggleProps) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/45 bg-slate-950/40 p-3"
      data-testid="paid-pro-coordinator-toggle"
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-[#141d32] text-emerald-500 focus:ring-emerald-500/40"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid="paid-pro-coordinator-toggle-input"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{PAID_PRO_COORDINATOR_TOGGLE_LABEL}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-400">{PAID_PRO_COORDINATOR_TOGGLE_HELPER}</span>
      </span>
    </label>
  );
}
