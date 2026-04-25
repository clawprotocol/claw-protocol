import { useEffect } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { useLaunchNav } from "../launch/LaunchNavContext";

export type UpgradeToPowerModalProps = {
  open: boolean;
  onClose: () => void;
  /** Analytics surface (e.g. `app_shell_reuse`). */
  surface: string;
  /** Feature key (e.g. `reuse_templates`, `advanced_work_product`, `full_timeline`). */
  feature: string;
};

export function UpgradeToPowerModal({ open, onClose, surface, feature }: UpgradeToPowerModalProps) {
  const { navigate } = useLaunchNav();

  useEffect(() => {
    if (!open) return;
    logProductEvent("power_paywall_viewed", { surface, feature });
  }, [open, surface, feature]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        logProductEvent("power_paywall_dismissed", { surface, feature, via: "escape" });
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, surface, feature]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[86] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          logProductEvent("power_paywall_dismissed", { surface, feature, via: "backdrop" });
          onClose();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-power-title"
        className="relative z-[1] w-full max-w-md rounded-2xl border border-violet-800/50 bg-slate-950 px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
      >
        <h2 id="upgrade-power-title" className="text-lg font-semibold text-slate-50">
          Unlock more power with LawDog
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          You&apos;re using LawDog like a pro. Power unlocks advanced tools to move faster.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          <li className="flex gap-2">
            <span className="text-violet-400/90" aria-hidden>
              ✓
            </span>
            <span>Reuse agreements as templates</span>
          </li>
          <li className="flex gap-2">
            <span className="text-violet-400/90" aria-hidden>
              ✓
            </span>
            <span>Advanced drafting and negotiation tools</span>
          </li>
          <li className="flex gap-2">
            <span className="text-violet-400/90" aria-hidden>
              ✓
            </span>
            <span>Full record tracking</span>
          </li>
        </ul>
        <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
          Future: team workspaces, API access, and deeper integrations — not included yet.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
            onClick={() => {
              logProductEvent("power_paywall_clicked_upgrade", { surface, feature });
              onClose();
              navigate("/app/billing");
            }}
          >
            Upgrade to Power
          </button>
          <button
            type="button"
            className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            onClick={() => {
              logProductEvent("power_paywall_dismissed", { surface, feature, via: "maybe_later" });
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
