import { useEffect, useLayoutEffect, useRef } from "react";
import type { UpgradeTeaserResult } from "./upgradeTeaser";

export type BasicDraftContinueConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  /** Proceed with the same flow as the primary bar after confirmation. */
  onSendBasicDraft: () => void;
  /** Opens the existing full-draft upgrade / paywall path. */
  onUpgradeInstead: () => void | Promise<void>;
  /** Dynamic upgrade copy; when omitted, legacy confirmation copy is shown. */
  teaser?: UpgradeTeaserResult | null;
};

/**
 * In-app confirmation when continuing past an optional full-draft upgrade on review.
 * Replaces browser `confirm` for this path only.
 */
export function BasicDraftContinueConfirmModal({
  open,
  onClose,
  onSendBasicDraft,
  onUpgradeInstead,
  teaser,
}: BasicDraftContinueConfirmModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => primaryRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  /** When set (e.g. from create review), use starter-vs-complete copy instead of legacy “send basic” wording. */
  const useTeaser = teaser != null;

  return (
    <div
      className="fixed inset-0 z-[199] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="basic-draft-continue-title"
    >
      <div
        className="absolute inset-0"
        role="presentation"
        aria-hidden
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div className="relative z-[1] w-full max-w-md rounded-t-2xl border border-slate-700/90 bg-slate-950 px-5 py-6 shadow-2xl sm:rounded-2xl sm:px-7 sm:py-8">
        {useTeaser && teaser ? (
          <>
            <h2 id="basic-draft-continue-title" className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              Send starter draft?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              This version is fine for simple situations, but it may not include the stronger protections or tailored
              terms many signed agreements use.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                ref={primaryRef}
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
                onClick={() => {
                  void onUpgradeInstead();
                }}
              >
                Upgrade to complete agreement
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full text-slate-400"
                onClick={() => {
                  onSendBasicDraft();
                }}
              >
                Continue with basic draft
              </button>
              <button
                type="button"
                className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="basic-draft-continue-title" className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              Send basic draft?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              This version is okay for simple situations, but it may not include stronger protections or tailored terms.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                ref={primaryRef}
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
                onClick={() => {
                  onSendBasicDraft();
                }}
              >
                Send basic draft
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full"
                onClick={() => {
                  void onUpgradeInstead();
                }}
              >
                Upgrade instead
              </button>
              <button
                type="button"
                className="text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
