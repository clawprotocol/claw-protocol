import { useEffect } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { useLaunchNav } from "../launch/LaunchNavContext";

export type UpgradeToProModalVariant = "upgrade_to_pro" | "genesis_allowance_exhausted";

export type UpgradeToProModalProps = {
  open: boolean;
  onClose: () => void;
  /** Analytics surface, e.g. `simple_create` | `agreement_wizard_new`. */
  surface: string;
  /** Default free-path upgrade copy vs Genesis monthly allowance exhausted. */
  variant?: UpgradeToProModalVariant;
  /**
   * When the free allowance is exhausted, optional path to the user's existing agreement(s).
   * Defaults to the agreements list when omitted.
   */
  viewExistingPath?: string | null;
  /** True when intake/draft text is preserved locally and can be resumed later. */
  draftPreserved?: boolean;
};

export function UpgradeToProModal({
  open,
  onClose,
  surface,
  variant = "upgrade_to_pro",
  viewExistingPath = "/app/agreements",
  draftPreserved = false,
}: UpgradeToProModalProps) {
  const { navigate } = useLaunchNav();
  const analyticsVariant = variant;

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
  const existingPath = (viewExistingPath || "/app/agreements").trim() || "/app/agreements";

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
          {isGenesisExhausted ? "Genesis monthly allowance used" : "You've used your free agreement"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {isGenesisExhausted
            ? "You're still an active Genesis Dog. You've used this month's complimentary agreement allowance. Upgrade to Pro for unlimited creations, or wait until next month when the allowance resets."
            : "Your free agreement is complete. Upgrade to Pro to create another agreement, keep reusable drafts, and unlock full history."}
        </p>
        {!isGenesisExhausted ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="text-emerald-400/90" aria-hidden>
                ✓
              </span>
              <span>Unlimited agreements</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400/90" aria-hidden>
                ✓
              </span>
              <span>Full history</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400/90" aria-hidden>
                ✓
              </span>
              <span>Reuse and edit anytime</span>
            </li>
          </ul>
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
              navigate("/app/billing");
            }}
          >
            Upgrade to Pro
          </button>
          {!isGenesisExhausted ? (
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
              // Keep draft: dismiss only — intake storage already holds the text.
              if (!keepDraft) {
                navigate("/app");
              }
            }}
          >
            {draftPreserved && !isGenesisExhausted ? "Keep this draft" : "Back to dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
