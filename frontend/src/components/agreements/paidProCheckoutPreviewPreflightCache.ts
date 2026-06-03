/**
 * Dedupe preview_premium_deliverable / starter preflight builds within one checkout session.
 * Corpus bytes are unchanged — cache returns prior buildAgreementPreviewText output.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import type { PremiumGenerationCallReason } from "./paidProPremiumGenerationCallAudit";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type CheckoutPreflightPreviewOpts = {
  starterPreview?: boolean;
  premiumDeliverablePreview?: boolean;
  intakeText?: string;
};

const previewCache = new Map<string, string>();

function nz(s: string | null | undefined): string {
  return (s || "").trim();
}

function draftFingerprint(draft: ParsedDraftShape): string {
  const blob = [
    nz(draft.title),
    nz(draft.purpose),
    nz(draft.payment_terms),
    nz(draft.additional_terms),
    nz(draft.termination_summary),
    nz(draft.jurisdiction),
    (draft.parties || []).map((p) => `${nz(p.name)}|${nz(p.role)}`).join(";"),
  ].join("\n");
  return blob.length >= 80 ? hashPaidProCorpus(blob) : `len:${blob.length}`;
}

function cacheKey(args: {
  sessionGenerationId: string;
  intakeFingerprint: string;
  draft: ParsedDraftShape;
  opts: CheckoutPreflightPreviewOpts;
}): string {
  const mode = args.opts.starterPreview
    ? "starter"
    : args.opts.premiumDeliverablePreview
      ? "premium_deliverable"
      : "default";
  const intakeFp = args.opts.intakeText
    ? shortIntakeFingerprint(args.opts.intakeText)
    : "no-intake";
  return `${args.sessionGenerationId}|${args.intakeFingerprint}|${draftFingerprint(args.draft)}|${mode}|${intakeFp}`;
}

export function clearPaidProCheckoutPreviewPreflightCache(): void {
  previewCache.clear();
}

export function readPaidProCheckoutPreviewPreflightCacheSize(): number {
  return previewCache.size;
}

/**
 * Memoized buildAgreementPreviewText for checkout_completion only.
 * Non-checkout paths call buildAgreementPreviewText directly.
 */
export function buildCheckoutPreflightAgreementPreviewText(
  draft: ParsedDraftShape,
  opts: CheckoutPreflightPreviewOpts,
  ctx: {
    premiumGenerationCallReason?: PremiumGenerationCallReason;
    sessionGenerationId?: string | null;
    intakeFingerprint: string;
  },
): string {
  const sessionId = nz(ctx.sessionGenerationId);
  if (ctx.premiumGenerationCallReason !== "checkout_completion" || !sessionId) {
    return buildAgreementPreviewText(draft, opts);
  }
  const key = cacheKey({
    sessionGenerationId: sessionId,
    intakeFingerprint: ctx.intakeFingerprint,
    draft,
    opts,
  });
  const hit = previewCache.get(key);
  if (hit != null) return hit;
  const built = buildAgreementPreviewText(draft, opts);
  previewCache.set(key, built);
  return built;
}
