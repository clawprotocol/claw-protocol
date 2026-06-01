import {
  PAID_PRO_STICKY_CTA_DIRECTION_ARIA,
  PAID_PRO_STICKY_CTA_DIRECTION_LABEL,
  PAID_PRO_STICKY_CTA_DIRECTION_SUBLABEL,
} from "./paidProWorkflowGuidance";

type Props = {
  showFirstVisitPulse?: boolean;
};

export function PaidProStickyCtaDirectionCue({ showFirstVisitPulse = false }: Props) {
  return (
    <p
      className={`mb-1.5 flex items-center justify-center gap-1.5 text-center text-[10px] font-medium leading-snug text-stone-500 sm:text-[11px] ${
        showFirstVisitPulse ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""
      }`}
      data-testid="paid-pro-sticky-cta-direction-cue"
      role="note"
      aria-label={PAID_PRO_STICKY_CTA_DIRECTION_ARIA}
    >
      <span className="text-stone-400" aria-hidden>
        ↓
      </span>
      <span className="text-stone-600">{PAID_PRO_STICKY_CTA_DIRECTION_LABEL}</span>
      <span className="text-stone-400" aria-hidden>
        ·
      </span>
      <span>{PAID_PRO_STICKY_CTA_DIRECTION_SUBLABEL}</span>
    </p>
  );
}
