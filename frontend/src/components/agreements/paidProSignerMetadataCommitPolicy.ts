/**
 * Paid Pro signer metadata is staged in React state while typing; consumed authority and
 * corpus hydration run only after explicit finalize (signing snapshot / pin).
 */

import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

export function shouldStagePaidProSignerMetadataLocally(args: {
  signerMetadataSessionActive: boolean;
}): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  return args.signerMetadataSessionActive;
}
