import type { AccessTier } from "../../access/types";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import {
  hasPaidPremiumCompletionSession,
  peekPremiumCompletionDoneInLocalStorage,
} from "./premiumCompletionStorage";
import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";

/** Minimum plain length to treat premium/server fields as authoritative Pro (aligns with send handoff). */
export const PAID_PRO_AUTHORITY_MIN_LEN = 500;

/** Draft-like shape for authority checks (parsed draft or API agreement row). */
export type PaidProAgreementAuthorityDraft = Partial<ParsedDraftShape> & {
  premium_render_source?: string | null;
  server_full_document_text?: string | null;
  premium_full_document_text?: string | null;
  premium_server_full_document_text?: string | null;
};

export type PaidProAgreementAuthorityInput = {
  draft?: PaidProAgreementAuthorityDraft | null;
  agreementId?: string | null;
  tier?: AccessTier;
  premiumCompletionSnapshot?: PremiumCompletionSnapshot | null | undefined;
  premiumSendPathUnlocked?: boolean;
  premiumPersistedFlowActive?: boolean;
  /** Default true: include `claw_premium_completed` localStorage marker. */
  includeLocalCompletionMarker?: boolean;
};

/** Resolver tiers that indicate Pro / paid pipeline (includes legacy snapshot for older rows). */
export function draftPremiumRenderSourceIndicatesPro(rs: string | null | undefined): boolean {
  const s = String(rs || "").trim();
  return s === "server_full_document_text" || s === "server_repair_document_text" || s === "legacy_snapshot";
}

function strictServerRenderSource(rs: string): boolean {
  return rs === "server_full_document_text" || rs === "server_repair_document_text";
}

function longAuthoritativeCorpus(d: PaidProAgreementAuthorityDraft | null | undefined): boolean {
  if (!d) return false;
  const a = String(d.server_full_document_text ?? "").trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
  const b = String(d.premium_full_document_text ?? "").trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
  const c = String(d.premium_server_full_document_text ?? "").trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
  return a || b || c;
}

function snapshotAcceptedLong(snap: PremiumCompletionSnapshot | null | undefined): boolean {
  if (!snap?.premiumAccepted) return false;
  return (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
}

export type PaidProAuthorityMeta = {
  authoritative: boolean;
  reason: string;
  corpusLen: number;
  premium_render_source: string | null;
};

/**
 * Same decision as {@link isPaidProAgreementAuthoritative} plus a stable `reason` for logging / QA.
 */
export function resolvePaidProAgreementAuthoritative(input: PaidProAgreementAuthorityInput): PaidProAuthorityMeta {
  const d = input.draft ?? null;
  const corpusLen = d
    ? Math.max(
        String(d.server_full_document_text ?? "").trim().length,
        String(d.premium_full_document_text ?? "").trim().length,
        String(d.premium_server_full_document_text ?? "").trim().length,
      )
    : 0;
  const rsRaw = d ? String(d.premium_render_source ?? "").trim() : "";
  const premium_render_source = rsRaw || null;

  if (hasPaidPremiumCompletionSession()) {
    return { authoritative: true, reason: "paid_premium_completion_session", corpusLen, premium_render_source };
  }
  if (input.premiumSendPathUnlocked) {
    return { authoritative: true, reason: "premium_send_path_unlocked", corpusLen, premium_render_source };
  }
  if (input.premiumPersistedFlowActive) {
    return { authoritative: true, reason: "premium_persisted_flow_active", corpusLen, premium_render_source };
  }
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) {
    return { authoritative: true, reason: "tier_allows_advanced_full_draft", corpusLen, premium_render_source };
  }
  if (input.includeLocalCompletionMarker !== false && typeof window !== "undefined" && peekPremiumCompletionDoneInLocalStorage()) {
    return { authoritative: true, reason: "local_storage_premium_completed_marker", corpusLen, premium_render_source };
  }
  if (snapshotAcceptedLong(input.premiumCompletionSnapshot ?? null)) {
    return { authoritative: true, reason: "premium_snapshot_accepted_long_corpus", corpusLen, premium_render_source };
  }
  if (!d) {
    return { authoritative: false, reason: "no_draft", corpusLen, premium_render_source };
  }
  if (strictServerRenderSource(rsRaw)) {
    return { authoritative: true, reason: "strict_server_render_source", corpusLen, premium_render_source };
  }
  if (longAuthoritativeCorpus(d)) {
    return { authoritative: true, reason: "long_authoritative_corpus", corpusLen, premium_render_source };
  }
  if (draftPremiumRenderSourceIndicatesPro(rsRaw) && longAuthoritativeCorpus(d)) {
    return { authoritative: true, reason: "legacy_render_source_with_long_corpus", corpusLen, premium_render_source };
  }
  return { authoritative: false, reason: "none", corpusLen, premium_render_source };
}

/**
 * Single source of truth: this agreement/session carries paid / authoritative Pro paper and must not be
 * routed through free starter upsells, intake reset, or professional-send paywall.
 */
export function isPaidProAgreementAuthoritative(input: PaidProAgreementAuthorityInput): boolean {
  return resolvePaidProAgreementAuthoritative(input).authoritative;
}
