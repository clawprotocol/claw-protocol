import { useEffect } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { useLaunchNav } from "../launch/LaunchNavContext";

export type UpgradeToProModalProps = {
  open: boolean;
  onClose: () => void;
  /** Analytics surface, e.g. `simple_create` | `agreement_wizard_new`. */
  surface: string;
};

export function UpgradeToProModal({ open, onClose, surface }: UpgradeToProModalProps) {
  const { navigate } = useLaunchNav();

  useEffect(() => {
    if (!open) return;
    logProductEvent("paywall_viewed", { surface, variant: "upgrade_to_pro" });
  }, [open, surface]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        logProductEvent("paywall_dismissed", { surface, variant: "upgrade_to_pro", via: "escape" });
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, surface]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          logProductEvent("paywall_dismissed", { surface, variant: "upgrade_to_pro", via: "backdrop" });
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
      >
        <h2 id="upgrade-pro-title" className="text-lg font-semibold text-slate-50">
          Keep creating with LawDog
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          You&apos;ve already created a verified record. Upgrade to Pro to create and manage more agreements.
        </p>
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
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
            onClick={() => {
              logProductEvent("paywall_clicked_upgrade", { surface, variant: "upgrade_to_pro" });
              onClose();
              navigate("/app/billing");
            }}
          >
            Upgrade to Pro
          </button>
          <button
            type="button"
            className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            onClick={() => {
              logProductEvent("paywall_dismissed", { surface, variant: "upgrade_to_pro", via: "maybe_later" });
              onClose();
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
