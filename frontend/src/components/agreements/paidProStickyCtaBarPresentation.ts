/**
 * Paid Pro review / signer-setup sticky bar — document-first utility chrome (visual only).
 */

/** Subtle top bar; agreement remains the hero. */
export const PAID_PRO_REVIEW_STICKY_BAR_SHELL_CLASS =
  "border-t border-stone-200/90 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_20px_-10px_rgba(28,25,23,0.14)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90";

export const PAID_PRO_REVIEW_STICKY_HELPER_CLASS =
  "mb-1 text-[10px] leading-snug text-stone-500 sm:text-[11px]";

/** Primary action stays clear; reduced height vs default simple-create sticky CTA. */
export const PAID_PRO_REVIEW_STICKY_PRIMARY_BUTTON_CLASS =
  "flex min-h-[2.75rem] w-full items-center justify-center rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold tracking-tight text-white shadow-sm shadow-stone-900/10 ring-1 ring-emerald-700/20 transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:pointer-events-none disabled:opacity-60 sm:text-[0.9375rem]";

export const PAID_PRO_REVIEW_STICKY_REVEAL_TRANSITION_CLASS =
  "motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none";

export const PAID_PRO_REVIEW_STICKY_HIDDEN_VISUAL_CLASS =
  "pointer-events-none opacity-0 motion-safe:translate-y-2 motion-reduce:translate-y-0";

export const PAID_PRO_REVIEW_STICKY_REVEALED_VISUAL_CLASS = "opacity-100 motion-safe:translate-y-0";

/** Keyboard users can surface the bar while visually minimized. */
export const PAID_PRO_REVIEW_STICKY_FOCUS_REVEAL_CLASS =
  "focus-within:pointer-events-auto focus-within:opacity-100 focus-within:motion-safe:translate-y-0 focus-within:border-stone-200/90 focus-within:bg-white/95 focus-within:shadow-[0_-4px_20px_-10px_rgba(28,25,23,0.14)]";
