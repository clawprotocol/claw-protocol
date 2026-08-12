import {
  CREATE_ACCESS_CHOICE_BODY,
  CREATE_ACCESS_CHOICE_HEADING,
} from "./createEntitlementUi";

export type CreateAccessChoicePanelProps = {
  /** @deprecated Genesis buyer request retired — ignored. */
  onRequestGenesis?: () => void;
  onChoosePro: () => void;
  onBackToDashboard: () => void;
  /** Only when the backend confirms an accessible persisted agreement. */
  hasAccessibleAgreement?: boolean;
  onViewAgreement?: () => void;
  /** @deprecated Ignored — Genesis is not a buyer plan. */
  pendingGenesis?: boolean;
  /** @deprecated Ignored. */
  requestBusy?: boolean;
  /** When false, omit the heading (page shell already shows it). Default true. */
  showHeading?: boolean;
};

export function CreateAccessChoicePanel({
  onChoosePro,
  onBackToDashboard,
  hasAccessibleAgreement = false,
  onViewAgreement,
  showHeading = true,
}: CreateAccessChoicePanelProps) {
  return (
    <div
      className="mx-auto w-full max-w-lg rounded-2xl border border-slate-700/90 bg-slate-950/80 px-6 py-8 shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
      data-testid="create-access-choice"
      role="region"
      aria-label={CREATE_ACCESS_CHOICE_HEADING}
    >
      {showHeading ? (
        <h2 className="text-xl font-semibold text-slate-50">{CREATE_ACCESS_CHOICE_HEADING}</h2>
      ) : null}
      <p className={`text-sm leading-relaxed text-slate-400 ${showHeading ? "mt-3" : ""}`}>
        {CREATE_ACCESS_CHOICE_BODY}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
          onClick={onChoosePro}
          data-testid="create-access-choice-choose-pro"
        >
          Choose Pro
        </button>
        {hasAccessibleAgreement && onViewAgreement ? (
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full"
            onClick={onViewAgreement}
            data-testid="create-access-choice-view-agreement"
          >
            View your agreement
          </button>
        ) : null}
        <button
          type="button"
          className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          onClick={onBackToDashboard}
          data-testid="create-access-choice-back"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
