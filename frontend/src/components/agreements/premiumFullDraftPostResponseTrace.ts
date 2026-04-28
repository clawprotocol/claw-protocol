/**
 * DEV-only trace lines for the LawDog Pro premium-full-draft → applySuccess path.
 * Greppable: [post-premium-full-draft-http] | [post-premium-full-draft-pipeline] | [post-premium-full-draft-applySuccess]
 */
export function logDevPostPremiumFullDraftHttp(args: {
  httpStatus: number;
  responseBodyLen: number;
  documentTextLen: number;
  generationOutcome?: string;
}): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[post-premium-full-draft-http]", { t: new Date().toISOString(), ...args });
}

export function logDevPostPremiumFullDraftPipelineReturn(args: {
  winningBodyLen: number;
  premiumRenderSource: string;
  validatePaidProOutputOk: boolean;
  validatePaidProReasons: string[];
  canShowPremiumSuccessState: string;
  /** When gate is not premium_success, first banner reasons (short). */
  successBannerReasons?: string[];
}): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[post-premium-full-draft-pipeline]", { t: new Date().toISOString(), ...args });
}

export function logDevPostPremiumFullDraftApplySuccess(args: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[post-premium-full-draft-applySuccess]", { t: new Date().toISOString(), ...args });
}
