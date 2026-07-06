import type { PaidProStickyCtaPhase } from "./paidProStickyCta";

/** Post-freeze signer setup must not show generation/structuring loading on the sticky CTA. */
export function shouldSuppressPaidProStickyGeneratingLoading(args: {
  hasSourceOfTruth: boolean;
  acceptedPaidProAuthority: boolean;
  inlineSignerSetupLatched: boolean;
  canonicalReviewSignerSetupActive: boolean;
  stickyCtaShowBar?: boolean;
  stickyCtaPhase?: PaidProStickyCtaPhase;
}): boolean {
  if (
    args.hasSourceOfTruth &&
    args.acceptedPaidProAuthority &&
    (args.canonicalReviewSignerSetupActive || args.inlineSignerSetupLatched)
  ) {
    return true;
  }
  if (!args.stickyCtaShowBar) return false;
  return (
    args.stickyCtaPhase === "signer_details_required" ||
    args.stickyCtaPhase === "signer_details_complete"
  );
}

/** Block isGenerating fallthrough primary CTA once paid Pro is frozen and signer setup is active. */
export function shouldSuppressPaidProGeneratingPrimaryCta(args: {
  isGenerating: boolean;
  hasSourceOfTruth: boolean;
  acceptedPaidProAuthority: boolean;
  inlineSignerSetupLatched: boolean;
  canonicalReviewSignerSetupActive: boolean;
  signerSetupStickyCtaSurfaceActive: boolean;
}): boolean {
  if (!args.isGenerating) return false;
  if (args.signerSetupStickyCtaSurfaceActive) return true;
  if (
    args.hasSourceOfTruth &&
    args.acceptedPaidProAuthority &&
    (args.canonicalReviewSignerSetupActive || args.inlineSignerSetupLatched)
  ) {
    return true;
  }
  return false;
}
