import { buildAgreementPreviewText, buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { emitPremiumRenderResolveLog, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";

/** @deprecated Use PremiumRenderResolveSource — kept as alias for gradual migration. */
export type PremiumPaidReadonlySourceUsed = PremiumRenderResolveSource;

export type PremiumPaidReadonlyPickResult = {
  plainText: string;
  sourceUsed: PremiumPaidReadonlySourceUsed;
  audit: {
    selected: PremiumPaidReadonlySourceUsed;
    forcedPremiumSource: boolean;
    candidates: Array<{
      source: PremiumPaidReadonlySourceUsed;
      len: number;
      nonThin: boolean;
      eligible: boolean;
      reason: string;
    }>;
  };
};

const COMMERCIAL_SIGNAL_RES = [
  /\bcommission\b|\d{1,2}\s*%/i,
  /\bclawback|refund(ed)?\s+deal/i,
  /\breimburs/i,
  /\b(intellectual\s+property|work\s+product|ownership|\bip\b|lead\s+list|crm)\b/i,
  /\bexclusiv|territor/i,
  /\b(termination|dispute|arbitrat|scandal|moral|surviv)/i,
  /\bretainer\b/i,
];

/** Counts discrete commercial concepts present in the paper body (used to prefer richer corpus). */
export function premiumReadonlyCorpusSignalHits(text: string): number {
  const t = (text || "").toLowerCase();
  return COMMERCIAL_SIGNAL_RES.filter((re) => re.test(t)).length;
}

export function scorePremiumReadonlyCorpusCandidate(text: string): number {
  const trimmed = (text || "").trim();
  if (!trimmed) return -1;
  return trimmed.length + premiumReadonlyCorpusSignalHits(trimmed) * 220;
}

export function premiumRenderCorpusContainsSignals(text: string): {
  contains_commission: boolean;
  contains_exclusivity: boolean;
  contains_ip: boolean;
  contains_clawback: boolean;
  contains_reimburs: boolean;
} {
  const t = (text || "").toLowerCase();
  return {
    contains_commission: /\bcommission\b|\d{1,2}\s*%/.test(t),
    contains_exclusivity: /\bexclusiv|territor/i.test(t),
    contains_ip: /\b(intellectual\s+property|work\s+product|ownership|\bip\b|lead\s+list|crm)\b/i.test(t),
    contains_clawback: /\bclawback|refund/i.test(t),
    contains_reimburs: /\breimburs/i.test(t),
  };
}

function pickLongestLegacySnapshot(args: {
  premiumReadonlySnapshotText: string;
  premiumPipelineOutputBodyText?: string;
  hydratedPremiumSnapshotText?: string;
  agreementDocumentText: string;
  agreementDocumentTextHasPremiumMarkers?: boolean;
}): string {
  const cands: string[] = [
    (args.premiumReadonlySnapshotText || "").trim(),
    (args.premiumPipelineOutputBodyText || "").trim(),
    (args.hydratedPremiumSnapshotText || "").trim(),
  ];
  if (args.agreementDocumentTextHasPremiumMarkers) {
    cands.push((args.agreementDocumentText || "").trim());
  }
  const nonempty = cands.filter(Boolean);
  if (!nonempty.length) return "";
  return nonempty.reduce((a, b) => (a.length >= b.length ? a : b));
}

/**
 * Paid premium read-only paper: universal {@link resolvePremiumRenderSource} with tier D
 * from persisted snapshot / pipeline buffers.
 */
export function pickPremiumPaidReadonlyPlainText(args: {
  premiumWinningBodyText?: string;
  premiumReadonlySnapshotText: string;
  premiumPipelineOutputBodyText?: string;
  hydratedPremiumSnapshotText?: string;
  draft: ParsedDraftShape | null;
  agreementDocumentText: string;
  agreementDocumentTextHasPremiumMarkers?: boolean;
  premiumCheckoutCompleted?: boolean;
  /** Raw intake for structural validation (scenario keywords). */
  intakeText?: string;
}): PremiumPaidReadonlyPickResult {
  const legacySnap = pickLongestLegacySnapshot({
    premiumReadonlySnapshotText: args.premiumReadonlySnapshotText,
    premiumPipelineOutputBodyText: args.premiumPipelineOutputBodyText,
    hydratedPremiumSnapshotText: args.hydratedPremiumSnapshotText,
    agreementDocumentText: args.agreementDocumentText,
    agreementDocumentTextHasPremiumMarkers: args.agreementDocumentTextHasPremiumMarkers,
  });

  const res = resolvePremiumRenderSource({
    draft: args.draft,
    intakeText: args.intakeText,
    premiumWinningCorpusFallback: args.premiumWinningBodyText,
    legacySnapshotText: legacySnap || undefined,
    buildLivePreview: () =>
      args.draft
        ? buildAgreementPreviewTextCore(args.draft, {
            starterPreview: false,
            premiumDeliverablePreview: true,
          })
        : "",
    preferLegacySnapshotOverLive: (live, snap) => {
      const ls = (live || "").trim();
      const ss = (snap || "").trim();
      return (
        ss.length > ls.length + 120 ||
        scorePremiumReadonlyCorpusCandidate(ss) > scorePremiumReadonlyCorpusCandidate(ls)
      );
    },
  });
  emitPremiumRenderResolveLog(res);

  const plain = (res.text || "").trim();
  const nonThin = plain.length >= 1200 || premiumReadonlyCorpusSignalHits(plain) >= 3;

  return {
    plainText: plain,
    sourceUsed: res.premium_render_source,
    audit: {
      selected: res.premium_render_source,
      forcedPremiumSource: false,
      candidates: [
        {
          source: res.premium_render_source,
          len: plain.length,
          nonThin,
          eligible: Boolean(plain),
          reason: res.premium_render_reason,
        },
      ],
    },
  };
}

/** Plain paper body for LawDog Pro snapshot + read-only render (universal resolver). */
export function buildPremiumDeliverablePlainTextFromDraft(
  draft: ParsedDraftShape,
  opts?: { intakeText?: string; legacySnapshotText?: string },
): string {
  return buildAgreementPreviewText(draft, {
    starterPreview: false,
    premiumDeliverablePreview: true,
    intakeText: opts?.intakeText,
    legacyPremiumSnapshotText: opts?.legacySnapshotText,
  });
}
