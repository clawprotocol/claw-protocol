import type { AccessTier } from "../../access/types";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";

/** Read-only / resolver tiers that indicate authoritative Pro paper on the draft when paired with a long body. */
export function draftPremiumRenderSourceIndicatesPro(rs: string | null | undefined): boolean {
  const s = String(rs || "").trim();
  return s === "server_full_document_text" || s === "server_repair_document_text" || s === "legacy_snapshot";
}

function authoritativePremiumBodyOnDraft(d: ParsedDraftShape | null | undefined): boolean {
  const t = (d?.premium_server_full_document_text || d?.premium_full_document_text || "").trim();
  return t.length >= 500;
}

/**
 * User should not be sent to Stripe / checkout for the same create-flow agreement when Pro is already
 * established (paid tier, session Pro flags, persisted premium snapshot, or authoritative full body on draft).
 */
export function isProEntitledForAgreement(args: {
  tier: AccessTier;
  draft: ParsedDraftShape | null | undefined;
  premiumSendPathUnlocked: boolean;
  premiumPersistedFlowActive: boolean;
  premiumCompletionSnapshot: PremiumCompletionSnapshot | null;
}): boolean {
  if (tierAllowsAdvancedFullDraftReveal(args.tier)) return true;
  if (args.premiumSendPathUnlocked || args.premiumPersistedFlowActive) return true;

  const snap = args.premiumCompletionSnapshot;
  if (
    snap?.premiumAccepted &&
    (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim().length >= 500
  ) {
    return true;
  }

  const d = args.draft;
  if (authoritativePremiumBodyOnDraft(d)) return true;

  const drs = (d as { premium_render_source?: string | null }).premium_render_source;
  if (draftPremiumRenderSourceIndicatesPro(drs) && authoritativePremiumBodyOnDraft(d)) return true;

  return false;
}
