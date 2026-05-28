/**
 * Paid Pro final review → signer setup routing (no corpus mutation).
 */

export function paidProExplicitSignerSetupFromReview(args: {
  ctaAction: string;
  paidProAcceptedCorpusReady: boolean;
  paidProInlineSignersReady: boolean;
}): boolean {
  return (
    args.ctaAction === "premium_continue_to_signers" &&
    args.paidProAcceptedCorpusReady &&
    !args.paidProInlineSignersReady
  );
}

/** Sticky/inline CTA: entering signer email capture must not be blocked by guided review states. */
export function shouldBypassGuidedSendCtaBlockForPaidProSignerSetup(args: {
  ctaAction: string;
  paidProAcceptedCorpusReady: boolean;
  paidProInlineSignersReady: boolean;
}): boolean {
  return paidProExplicitSignerSetupFromReview(args);
}
