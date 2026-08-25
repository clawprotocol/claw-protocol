import { useEffect } from "react";
import { formatPeriodEndsLabel } from "../access/commercialEntitlement";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { useLaunchNav } from "../launch/LaunchNavContext";

export type UpgradeToProModalVariant =
  | "upgrade_to_pro"
  | "genesis_allowance_exhausted"
  | "guest_ready"
  | "entitlement_required";

export type UpgradeToProModalProps = {
  open: boolean;
  onClose: () => void;
  /** Analytics surface, e.g. `simple_create` | `agreement_wizard_new`. */
  surface: string;
  /** Default upgrade copy vs Genesis monthly allowance exhausted vs guest ready. */
  variant?: UpgradeToProModalVariant;
  /**
   * Optional path to the user's existing agreement(s).
   * Only used when {@link showViewExistingAgreement} is true.
   */
  viewExistingPath?: string | null;
  /**
   * Show “View your agreement” only when the backend confirms an accessible persisted agreement.
   */
  showViewExistingAgreement?: boolean;
  /** True when intake/draft text is preserved locally and can be resumed later. */
  draftPreserved?: boolean;
  /** Server-authoritative allowance fields — do not hard-code client defaults. */
  agreementAllowance?: number | null;
  agreementsRemaining?: number | null;
  periodEndsAt?: string | null;
  onRequestGenesis?: () => void;
  onStartNewGuestDraft?: () => void;
  /**
   * Painted free dump / create conversion — open existing TEST checkout.
   * When omitted, Choose Pro goes to /app/billing.
   */
  onChoosePro?: () => void;
};

export function UpgradeToProModal({
  open,
  onClose,
  surface,
  variant = "upgrade_to_pro",
  viewExistingPath = "/app/agreements",
  showViewExistingAgreement = false,
  draftPreserved = false,
  agreementAllowance = null,
  agreementsRemaining = null,
  periodEndsAt = null,
  onRequestGenesis,
  onStartNewGuestDraft,
  onChoosePro,
}: UpgradeToProModalProps) {
  const { navigate } = useLaunchNav();
  const analyticsVariant = variant;
  const renewLabel = formatPeriodEndsLabel(periodEndsAt);
  const allowanceLabel =
    typeof agreementAllowance === "number" && agreementAllowance > 0
      ? String(agreementAllowance)
      : null;
  const remainingLabel =
    typeof agreementsRemaining === "number" ? String(agreementsRemaining) : null;

  useEffect(() => {
    if (!open) return;
    logProductEvent("paywall_viewed", { surface, variant: analyticsVariant });
  }, [open, surface, analyticsVariant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        logProductEvent("paywall_dismissed", { surface, variant: analyticsVariant, via: "escape" });
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, surface, analyticsVariant]);

  if (!open) return null;

  const isGenesisExhausted = variant === "genesis_allowance_exhausted";
  const isGuestReady = variant === "guest_ready";
  const existingPath = (viewExistingPath || "/app/agreements").trim() || "/app/agreements";

  const title = isGenesisExhausted
    ? "Genesis monthly allowance used"
    : isGuestReady
      ? "Your draft is ready"
      : "Save and continue with LawDog";

  const body = isGenesisExhausted
    ? `You've used this month's Genesis Dog agreements. Your allowance renews on ${renewLabel}. Upgrade to Pro for more capacity.`
    : isGuestReady
      ? "Your draft is ready. Request Genesis access or choose Pro to save it, invite review, prepare signatures, and keep a proof record."
      : "Request Genesis access or choose Pro to save agreements, invite review, prepare signatures, and keep a proof record.";

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          logProductEvent("paywall_dismissed", { surface, variant: analyticsVariant, via: "backdrop" });
          onClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-pro-title"
        className="relative z-[1] w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-950 px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
        data-testid="upgrade-to-pro-modal"
      >
        <h2 id="upgrade-pro-title" className="text-lg font-semibold text-slate-50">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
        {!isGenesisExhausted && allowanceLabel && remainingLabel && !isGuestReady ? (
          <p className="mt-2 text-xs text-slate-500">
            Genesis Dog access includes {allowanceLabel} new agreements each month. {remainingLabel} of{" "}
            {allowanceLabel} remaining. Resets {renewLabel}.
          </p>
        ) : null}
        {draftPreserved && !isGenesisExhausted ? (
          <p className="mt-4 text-xs leading-relaxed text-slate-500" data-testid="upgrade-draft-preserved">
            Your draft text is saved in this browser. You can return to it after upgrading, or keep it while
            you review your existing agreement.
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
            onClick={() => {
              logProductEvent("paywall_clicked_upgrade", { surface, variant: analyticsVariant });
              onClose();
              if (onChoosePro) {
                onChoosePro();
                return;
              }
              navigate("/app/billing");
            }}
          >
            Choose Pro
          </button>
          {(isGuestReady || variant === "entitlement_required" || variant === "upgrade_to_pro") &&
          onRequestGenesis ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full"
              onClick={() => {
                logProductEvent("paywall_clicked_upgrade", {
                  surface,
                  variant: analyticsVariant,
                  cta: "request_genesis",
                });
                onRequestGenesis();
              }}
            >
              Request Genesis access
            </button>
          ) : null}
          {isGuestReady && onStartNewGuestDraft ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full"
              onClick={() => {
                onStartNewGuestDraft();
                onClose();
              }}
            >
              Start a new guest draft
            </button>
          ) : null}
          {showViewExistingAgreement && !isGenesisExhausted && !isGuestReady ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full"
              onClick={() => {
                logProductEvent("paywall_clicked_view_existing", {
                  surface,
                  variant: analyticsVariant,
                });
                onClose();
                navigate(existingPath);
              }}
            >
              View your agreement
            </button>
          ) : null}
          <button
            type="button"
            className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            onClick={() => {
              const keepDraft = draftPreserved && !isGenesisExhausted;
              logProductEvent("paywall_dismissed", {
                surface,
                variant: analyticsVariant,
                via: keepDraft ? "keep_draft" : "return_dashboard",
              });
              onClose();
              if (!keepDraft) navigate("/app");
            }}
          >
            {draftPreserved && !isGenesisExhausted ? "Keep this draft" : "Back to dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
