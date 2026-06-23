import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

/** Resolver chose server-backed readonly corpus — safe to trust for visible commit when tier validation disagrees. */
export function resolverTrustedForPremiumVisibleCommit(
  premiumRenderResolveSource: PremiumRenderResolveSource | string | null | undefined,
): boolean {
  return (
    premiumRenderResolveSource === "server_full_document_text" ||
    premiumRenderResolveSource === "server_repair_document_text"
  );
}

/**
 * Gate for synchronous authoritative visible surface commit after premium-full-draft success.
 * Modal soft/hard timeout flags must NOT affect this — recovery UI must clear once the corpus applies.
 */
export function shouldImmediateAuthoritativePremiumCommit(args: {
  usePaidAuthoritativeBody: boolean;
  snapshotPlainTrimLen: number;
  premiumPipelineSource: string;
  validatePaidProOutputOk: boolean;
  premiumRenderResolveSource: PremiumRenderResolveSource | string | null | undefined;
  frozenSourceOfTruthEstablished?: boolean;
}): boolean {
  if (args.frozenSourceOfTruthEstablished === false) return false;
  return (
    args.usePaidAuthoritativeBody &&
    args.snapshotPlainTrimLen >= 500 &&
    isAuthoritativePremiumPipelineRenderSource(args.premiumPipelineSource) &&
    (args.validatePaidProOutputOk || resolverTrustedForPremiumVisibleCommit(args.premiumRenderResolveSource))
  );
}
