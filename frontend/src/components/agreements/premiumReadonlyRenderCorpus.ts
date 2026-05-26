import {
  buildAgreementPreviewText,
  buildAgreementPreviewTextCore,
  hydrateIdentityPlaceholdersInAgreementPreviewPlain,
} from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  emitPremiumRenderResolveLog,
  isAuthoritativePremiumPipelineRenderSource,
  resolvePremiumRenderSource,
} from "./premiumRenderSourceResolver";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";

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

function canonicalPartyNamesFromDraft(draft: ParsedDraftShape | null | undefined): string[] {
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, 2);
}

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

/** FNV-1a 32-bit — stable compare for free-vs-paid corpus audit. */
export function hashPlainTextCorpus(text: string): string {
  let h = 2166136261;
  const s = text || "";
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

export function corpusMatchesFreeBasicDraft(
  selectedPlain: string,
  freeBaselinePlain: string,
): boolean {
  const selected = (selectedPlain || "").trim();
  const free = (freeBaselinePlain || "").trim();
  if (!selected || !free) return false;
  return hashPlainTextCorpus(selected) === hashPlainTextCorpus(free);
}

/** Reject thin free/starter preview masquerading as paid Pro authority after checkout. */
export function shouldRejectFreeBasicDraftForPaidProPick(args: {
  selectedPlain: string;
  freeBaselinePlain: string;
  premiumCheckoutCompleted?: boolean;
  paidAuthoritativeFallback?: string | null;
}): boolean {
  if (!args.premiumCheckoutCompleted) return false;
  const selected = (args.selectedPlain || "").trim();
  const free = (args.freeBaselinePlain || "").trim();
  if (!selected || !free) return false;
  if (!corpusMatchesFreeBasicDraft(selected, free)) return false;
  const fallback = (args.paidAuthoritativeFallback || "").trim();
  return fallback.length >= 500 && fallback.length > selected.length + 80;
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
  /**
   * When the paid completion pipeline (or session snapshot) already committed an accepted Pro body;
   * prevents `live_generated_preview_after_server_tiers_failed` from replacing it.
   */
  paidAuthoritativeProBody?: string | null;
  /**
   * In-memory hydrated body after authoritative paid completion (or restore). When present with an
   * authoritative pipeline source, wins before live preview / thin agreement text.
   */
  authoritativeHydratedPlainText?: string | null;
  /** Latest pipeline render source (e.g. `server_full_draft`) — pairs with `authoritativeHydratedPlainText`. */
  lastPremiumPipelineRenderSource?: string | null;
}): PremiumPaidReadonlyPickResult {
  const pipeSrc = (args.lastPremiumPipelineRenderSource || "").trim();
  const authHydr = (args.authoritativeHydratedPlainText || "").trim();
  if (authHydr.length >= 500 && isAuthoritativePremiumPipelineRenderSource(pipeSrc)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[premium-authoritative-apply] readonly_pick", {
        picked: "hydrated_authoritative_body",
        bodyLen: authHydr.length,
        pipelineSource: pipeSrc,
      });
    }
    const finalizedRaw =
      args.draft && authHydr.trim()
        ? hydrateIdentityPlaceholdersInAgreementPreviewPlain(authHydr, args.draft, args.intakeText ?? null)
        : authHydr;
    const finalized = canonicalizeProAgreementText(finalizedRaw, {
      canonicalPartyNames: canonicalPartyNamesFromDraft(args.draft),
      canonicalRoles: ["Client", "Service Provider"],
    }).text;
    const nonThin =
      finalized.length >= 1200 || premiumReadonlyCorpusSignalHits(finalized) >= 3;
    return {
      plainText: finalized,
      sourceUsed: "server_full_document_text",
      audit: {
        selected: "server_full_document_text",
        forcedPremiumSource: true,
      candidates: [
        {
          source: "server_full_document_text",
          len: finalized.length,
            nonThin,
            eligible: true,
            reason: "hydrated_authoritative_pipeline_body_first",
          },
        ],
      },
    };
  }

  const legacySnap = pickLongestLegacySnapshot({
    premiumReadonlySnapshotText: args.premiumReadonlySnapshotText,
    premiumPipelineOutputBodyText: args.premiumPipelineOutputBodyText,
    hydratedPremiumSnapshotText: args.hydratedPremiumSnapshotText,
    agreementDocumentText: args.agreementDocumentText,
    agreementDocumentTextHasPremiumMarkers: args.agreementDocumentTextHasPremiumMarkers,
  });

  const hydratedHintForResolver = (args.authoritativeHydratedPlainText || "").trim();

  const res = resolvePremiumRenderSource({
    draft: args.draft,
    intakeText: args.intakeText,
    premiumWinningCorpusFallback: args.premiumWinningBodyText,
    legacySnapshotText: legacySnap || undefined,
    paidAuthoritativeProBody: args.paidAuthoritativeProBody,
    hydratedAuthoritativeBodyHint: hydratedHintForResolver.length ? hydratedHintForResolver : undefined,
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
  if (import.meta.env.DEV) emitPremiumRenderResolveLog(res);

  const plain = (res.text || "").trim();
  let finalizedPlain =
    args.draft && plain ? hydrateIdentityPlaceholdersInAgreementPreviewPlain(plain, args.draft, args.intakeText ?? null) : plain;
  finalizedPlain = canonicalizeProAgreementText(finalizedPlain, {
    canonicalPartyNames: canonicalPartyNamesFromDraft(args.draft),
    canonicalRoles: ["Client", "Service Provider"],
  }).text;
  const freeBaseline =
    args.draft && args.premiumCheckoutCompleted
      ? buildAgreementPreviewTextCore(args.draft, { starterPreview: true })
      : "";
  const paidFallback = (args.paidAuthoritativeProBody || legacySnap || hydratedHintForResolver || "").trim();
  if (
    shouldRejectFreeBasicDraftForPaidProPick({
      selectedPlain: finalizedPlain,
      freeBaselinePlain: freeBaseline,
      premiumCheckoutCompleted: args.premiumCheckoutCompleted,
      paidAuthoritativeFallback: paidFallback,
    })
  ) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[premium-picker-audit] rejected_free_basic_draft_for_paid_authority", {
        selectedLen: finalizedPlain.length,
        fallbackLen: paidFallback.length,
      });
    }
    finalizedPlain = canonicalizeProAgreementText(paidFallback, {
      canonicalPartyNames: canonicalPartyNamesFromDraft(args.draft),
      canonicalRoles: ["Client", "Service Provider"],
    }).text;
  }
  const nonThin =
    finalizedPlain.length >= 1200 || premiumReadonlyCorpusSignalHits(finalizedPlain) >= 3;

  return {
    plainText: finalizedPlain,
    sourceUsed: res.premium_render_source,
    audit: {
      selected: res.premium_render_source,
      forcedPremiumSource: false,
      candidates: [
        {
          source: res.premium_render_source,
          len: finalizedPlain.length,
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
