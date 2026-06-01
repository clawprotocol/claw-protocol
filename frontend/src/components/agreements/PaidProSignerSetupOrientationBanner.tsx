import {
  PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY,
  PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE,
  PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL,
} from "./paidProWorkflowGuidance";

export function PaidProSignerSetupOrientationBanner() {
  return (
    <section
      className="mb-4 rounded-md border border-amber-200/70 bg-amber-50/85 px-3 py-2.5 sm:px-3.5 sm:py-3"
      data-testid="paid-pro-signer-setup-orientation"
      aria-label="Signer setup guidance"
    >
      <p className="text-sm font-semibold text-amber-950">{PAID_PRO_SIGNER_SETUP_ORIENTATION_HEADLINE}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-950/90 sm:text-[13px]">
        {PAID_PRO_SIGNER_SETUP_ORIENTATION_BODY}
      </p>
      <p
        className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-900/75"
        data-testid="paid-pro-signer-setup-workflow-trail"
      >
        {PAID_PRO_SIGNER_SETUP_WORKFLOW_TRAIL}
      </p>
    </section>
  );
}
