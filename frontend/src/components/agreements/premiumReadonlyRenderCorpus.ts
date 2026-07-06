import {
  buildAgreementPreviewText,
  buildAgreementPreviewTextCore,
  hydrateIdentityPlaceholdersInAgreementPreviewPlain,
} from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  mapRenderSourceToAuthorityTier,
  type PaidProCorpusAuthorityCandidate,
} from "./paidProCorpusAuthority";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  logPaidProStarterCloneBlocked,
  resolvePaidProReviewRenderSurface,
} from "./paidProRenderSurface";
import {
  emitPremiumRenderResolveLog,
  isAuthoritativePremiumPipelineRenderSource,
  resolvePremiumRenderSource,
} from "./premiumRenderSourceResolver";
import type { PremiumRenderResolveSource } from "./premiumRenderSourceResolver";
import {
  isPremiumGenerationApiUnavailablePipelineSource,
  logPremiumGenerationApiUnavailable,
  MIN_PAID_PRO_AUTHORITY_LEN,
  PREMIUM_GENERATION_DRAFT_API_PATH,
  shouldBlockPaidProLocalCorpusFallback,
} from "./premiumGenerationApiAvailability";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { getPaidProSourceOfTruth, getPaidProDocumentForSurface, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import {
  enforceAuthoritativeProCorpusDisplay,
  logProCorpusSourceMap,
  shouldPreserveAcceptedServerFullDraftText,
} from "./proCorpusSourcePath";
import { requireAuthoritativeCorpusForSurface } from "./authoritativeAgreementDocument";
import { shouldSuppressPaidProCorpusRenderForRejectedPipeline } from "./paidProApiFailureAuthorityGuard";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { applyPaidProDomainScopeGuard, shouldApplyAiWorkflowServicesQualityFloor } from "./paidProDomainScopeGuard";
import { gateOperativeClauseFamilyAppend } from "./documentCompositionAuthority";
import type { OperativeClauseFamily } from "./clauseFamilyRegistry";

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

function isAiWorkflowServicesFallback(draft: ParsedDraftShape | null | undefined, intakeText?: string): boolean {
  const blob = [
    draft?.agreement_family,
    draft?.title,
    draft?.purpose,
    draft?.additional_terms,
    intakeText,
  ]
    .filter(Boolean)
    .join(" ");
  return /\b(?:services?|provider|consulting|contractor)\b/i.test(blob) &&
    shouldApplyAiWorkflowServicesQualityFloor(blob);
}

function nextSectionNumber(text: string): number {
  const nums = [...text.matchAll(/^\s*(\d{1,2})\.\s+/gm)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function insertBeforeExecutionTail(text: string, insertion: string): string {
  const marker = text.search(/\n\s*IN WITNESS WHEREOF\b/i);
  if (marker < 0) return `${text.trimEnd()}\n\n${insertion.trim()}`.trim();
  return `${text.slice(0, marker).trimEnd()}\n\n${insertion.trim()}\n\n${text.slice(marker).trimStart()}`.trim();
}

export function applyAiWorkflowServicesQualityFloorToFallback(
  text: string,
  draft: ParsedDraftShape | null | undefined,
  intakeText?: string,
): string {
  const base = (text || "")
    .replace(/\[Not yet specified\]/gi, "The services begin on the effective date and continue until completed or terminated under this Agreement.")
    .trim();
  if (!base || !isAiWorkflowServicesFallback(draft, intakeText)) return base;
  const parties = draft?.parties ?? [];
  const client = String(parties[0]?.name || "Client").trim() || "Client";
  const provider = String(parties[1]?.name || "Service Provider").trim() || "Service Provider";
  let n = nextSectionNumber(base);
  const sections: string[] = [];
  const pushSection = (family: OperativeClauseFamily | null, headingBody: string, keywordPresent?: RegExp) => {
    if (family) {
      if (!gateOperativeClauseFamilyAppend(base, family).allowed) return;
    } else if (keywordPresent?.test(base)) {
      return;
    }
    sections.push(`${n++}. ${headingBody}`);
  };
  if (!/\bacceptance\b|\bdemonstration review\b/i.test(base)) {
    pushSection(
      null,
      `ACCEPTANCE AND DEMONSTRATION REVIEW\n${provider} will provide a practical demonstration or review of the configured AI workflow setup services. ${client} will review the delivered setup in good faith and identify any material nonconformity with the agreed scope within a reasonable review period.`,
    );
  }
  pushSection(
    "intellectual_property",
    `OWNERSHIP AND WORK PRODUCT\n${client} owns final custom work product and deliverables created for ${client} after payment of amounts due. ${provider} retains pre-existing tools, templates, know-how, background materials, and reusable processes, and ${client} receives a license to use those retained materials as needed to use the delivered workflow setup.`,
  );
  pushSection(
    "confidentiality",
    `CONFIDENTIALITY\nEach Party shall protect the other Party's Confidential Information using commercially reasonable measures and use it only for purposes of this Agreement.`,
  );
  pushSection(
    "termination",
    `TERMINATION\nEither Party may terminate this Agreement for material breach if the breach is not cured within a commercially reasonable notice period. Termination does not affect payment obligations accrued before termination or provisions intended to survive.`,
  );
  if (!/\bthird[-\s]?party|\bsupport\b|\bplatform\b|\bdependency\b/i.test(base)) {
    pushSection(
      null,
      `THIRD-PARTY TOOLS AND OPTIONAL SUPPORT\nProvider is not responsible for outages, changes, or limitations of third-party AI platforms, software, or services outside Provider's control. Any post-delivery support is provided only if separately agreed in writing.`,
    );
  }
  const law = String(draft?.jurisdiction || "").trim() || "the jurisdiction selected by the Parties";
  pushSection(
    "governing_law",
    `GOVERNING LAW\nThis Agreement shall be governed by the laws of ${law}, without regard to conflict-of-law principles.`,
  );
  pushSection(
    "electronic_signatures",
    `ELECTRONIC SIGNATURES\nThis Agreement may be executed electronically through LawDog or comparable e-sign platforms, with the same effect as original signatures.`,
  );
  if (!sections.length) {
    return applyPaidProDomainScopeGuard(base, intakeText, { logSurface: "ai_workflow_quality_floor" });
  }
  return applyPaidProDomainScopeGuard(insertBeforeExecutionTail(base, sections.join("\n\n")), intakeText, {
    logSurface: "ai_workflow_quality_floor",
  });
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

/** Canonical corpus hash used across review, readonly, handoff, VS01, and export surfaces. */
export function hashPlainTextCorpus(text: string): string {
  return fingerprintAgreementBody(text || "");
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
  /** Sticky accepted corpus — never downgrade below this when still valid. */
  stickyAuthoritativePlainText?: string | null;
}): PremiumPaidReadonlyPickResult {
  if (hasAuthoritativeSigningSnapshot()) {
    const hydrated = resolvePaidProPostFinalizeReviewPlain().trim();
    if (hydrated.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      const nonThin =
        hydrated.length >= 1200 || premiumReadonlyCorpusSignalHits(hydrated) >= 3;
      return {
        plainText: hydrated,
        sourceUsed: "server_full_document_text",
        audit: {
          selected: "server_full_document_text",
          forcedPremiumSource: true,
          candidates: [
            {
              source: "server_full_document_text",
              len: hydrated.length,
              nonThin,
              eligible: true,
              reason: "authoritative_signing_snapshot",
            },
          ],
        },
      };
    }
  }
  const latchedAccepted = getLatchedAcceptedServerFullDraftAuthority();
  if (latchedAccepted && latchedAccepted.body.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    const display = latchedAccepted.body.trim();
    const nonThin =
      display.length >= 1200 || premiumReadonlyCorpusSignalHits(display) >= 3;
    return {
      plainText: display,
      sourceUsed: "server_full_document_text",
      audit: {
        selected: "server_full_document_text",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "server_full_document_text",
            len: display.length,
            nonThin,
            eligible: true,
            reason: "latched_pipeline_accepted_server_full_draft",
          },
        ],
      },
    };
  }
  const paidProRecord = getPaidProSourceOfTruth();
  if (paidProRecord) {
    const reviewDoc = getPaidProDocumentForSurface("review", {
      draft: args.draft,
      intakeText: args.intakeText,
    });
    const display = (
      reviewDoc?.signerMetadataApplied ? reviewDoc.text : paidProRecord.text
    ).trim();
    const nonThin =
      display.length >= 1200 || premiumReadonlyCorpusSignalHits(display) >= 3;
    return {
      plainText: display,
      sourceUsed: "server_full_document_text",
      audit: {
        selected: "server_full_document_text",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "server_full_document_text",
            len: display.length,
            nonThin,
            eligible: true,
            reason: reviewDoc?.signerMetadataApplied
              ? "paid_pro_review_hydrated"
              : "paidProSourceOfTruth",
          },
        ],
      },
    };
  }
  const canonical = readCanonicalAgreementCorpusForSurface("readonly", { tier: "pro" });
  if (canonical) {
    const display = canonical.canonicalText;
    const nonThin = display.length >= 1200 || premiumReadonlyCorpusSignalHits(display) >= 3;
    return {
      plainText: display,
      sourceUsed: "server_full_document_text",
      audit: {
        selected: "server_full_document_text",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "server_full_document_text",
            len: display.length,
            nonThin,
            eligible: true,
            reason: "paidProSourceOfTruth",
          },
        ],
      },
    };
  }

  const pipeSrc = (args.lastPremiumPipelineRenderSource || "").trim();
  const authHydr = (args.authoritativeHydratedPlainText || "").trim();
  const latchedPipelineBody = getLatchedAcceptedServerFullDraftAuthority()?.body.trim() ?? "";
  const hasAcceptedCandidate =
    authHydr.length >= 500 ||
    (args.stickyAuthoritativePlainText || "").trim().length >= 500 ||
    (args.paidAuthoritativeProBody || "").trim().length >= 500 ||
    (args.premiumWinningBodyText || "").trim().length >= MIN_PAID_PRO_AUTHORITY_LEN ||
    latchedPipelineBody.length >= MIN_PAID_PRO_AUTHORITY_LEN;
  if (
    shouldSuppressPaidProCorpusRenderForRejectedPipeline({
      pipelineSource: pipeSrc,
      draft: args.draft ?? null,
    })
  ) {
    return {
      plainText: "",
      sourceUsed: "none",
      audit: {
        selected: "none",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "none",
            len: 0,
            nonThin: false,
            eligible: false,
            reason: "rejected_paid_corpus_no_local_fallback",
          },
        ],
      },
    };
  }
  const lockedReviewCorpus = requireAuthoritativeCorpusForSurface({
    surface: "pro_review",
    source: "premium_readonly_pick",
    renderedText: "",
    paidProAccepted: false,
    minLen: 500,
  });
  if (args.premiumCheckoutCompleted && !hasAcceptedCandidate && !lockedReviewCorpus.ok) {
    return {
      plainText: "",
      sourceUsed: "none",
      audit: {
        selected: "none",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "none",
            len: 0,
            nonThin: false,
            eligible: false,
            reason: lockedReviewCorpus.reason,
          },
        ],
      },
    };
  }
  if (args.premiumCheckoutCompleted && !getPaidProSourceOfTruth()) {
    const draftFull = [
      args.draft?.premium_server_full_document_text,
      (args.draft as { server_full_document_text?: string | null } | null | undefined)
        ?.server_full_document_text,
      args.draft?.premium_full_document_text,
    ]
      .map((s) => (s || "").trim())
      .find((t) => t.length >= PAID_PRO_AUTHORITY_MIN_LEN);
    if (draftFull) {
      const nonThin =
        draftFull.length >= 1200 || premiumReadonlyCorpusSignalHits(draftFull) >= 3;
      return {
        plainText: draftFull,
        sourceUsed: "server_full_document_text",
        audit: {
          selected: "server_full_document_text",
          forcedPremiumSource: true,
          candidates: [
            {
              source: "server_full_document_text",
              len: draftFull.length,
              nonThin,
              eligible: true,
              reason: "draft_server_full_before_live_preview",
            },
          ],
        },
      };
    }
  }
  if (args.premiumCheckoutCompleted && isPremiumGenerationApiUnavailablePipelineSource(pipeSrc)) {
    const priorServerBodies = [
      authHydr,
      (args.stickyAuthoritativePlainText || "").trim(),
      (args.paidAuthoritativeProBody || "").trim(),
      (args.premiumWinningBodyText || "").trim(),
    ];
    const hasPriorFullServerDraft = priorServerBodies.some((t) => t.length >= MIN_PAID_PRO_AUTHORITY_LEN);
    if (!hasPriorFullServerDraft) {
      logPremiumGenerationApiUnavailable({
        endpoint: PREMIUM_GENERATION_DRAFT_API_PATH,
        stage: "pickPremiumPaidReadonlyPlainText",
        fallbackBlocked: true,
        pipelineSource: pipeSrc,
      });
      return {
        plainText: "",
        sourceUsed: "none",
        audit: {
          selected: "none",
          forcedPremiumSource: false,
          candidates: [
            {
              source: "none",
              len: 0,
              nonThin: false,
              eligible: false,
              reason: "premium_generation_api_unavailable",
            },
          ],
        },
      };
    }
  }
  if (authHydr.length >= 500 && isAuthoritativePremiumPipelineRenderSource(pipeSrc)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[premium-authoritative-apply] readonly_pick", {
        picked: "hydrated_authoritative_body",
        bodyLen: authHydr.length,
        pipelineSource: pipeSrc,
      });
    }
    const finalized = authHydr;
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
    postCheckoutProLocked: Boolean(args.premiumCheckoutCompleted),
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

  if (args.premiumCheckoutCompleted && res.premium_render_source === "live_generated_preview") {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[premium-render-source-blocked]", {
        reason: "live_generated_preview_after_checkout",
        len: (res.text || "").length,
      });
    }
    return {
      plainText: "",
      sourceUsed: "none",
      audit: {
        selected: "none",
        forcedPremiumSource: true,
        candidates: [
          {
            source: "live_generated_preview",
            len: (res.text || "").length,
            nonThin: false,
            eligible: false,
            reason: "live_generated_preview_after_checkout_blocked",
          },
        ],
      },
    };
  }

  const plain = (res.text || "").trim();
  const stickyBodies = [
    (args.authoritativeHydratedPlainText || "").trim(),
    (args.stickyAuthoritativePlainText || "").trim(),
    (args.paidAuthoritativeProBody || "").trim(),
  ];
  const hasStickyAuthoritative = stickyBodies.some((t) => t.length >= MIN_PAID_PRO_AUTHORITY_LEN);
  const skipDestructiveCanonicalize =
    hasPaidProSourceOfTruth() ||
    hasStickyAuthoritative ||
    (args.premiumCheckoutCompleted && isAuthoritativePremiumPipelineRenderSource(pipeSrc));
  let finalizedPlain =
    args.draft && plain ? hydrateIdentityPlaceholdersInAgreementPreviewPlain(plain, args.draft, args.intakeText ?? null) : plain;
  if (!skipDestructiveCanonicalize) {
    finalizedPlain = canonicalizeProAgreementText(finalizedPlain, {
      canonicalPartyNames: canonicalPartyNamesFromDraft(args.draft),
      canonicalRoles: ["Client", "Service Provider"],
      intakeText: args.intakeText,
      surface: "premium_readonly_pick",
    }).text;
  }
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
    finalizedPlain = shouldPreserveAcceptedServerFullDraftText({
      text: paidFallback,
      pipelineSource: args.lastPremiumPipelineRenderSource,
    })
      ? paidFallback
      : canonicalizeProAgreementText(paidFallback, {
          canonicalPartyNames: canonicalPartyNamesFromDraft(args.draft),
          canonicalRoles: ["Client", "Service Provider"],
          intakeText: args.intakeText,
          surface: "premium_readonly_paid_fallback",
        }).text;
  }
  finalizedPlain = applyPaidProDomainScopeGuard(
    applyAiWorkflowServicesQualityFloorToFallback(finalizedPlain, args.draft, args.intakeText),
    args.intakeText,
    { logSurface: "premium_readonly_paid_picker" },
  );
  const nonThin =
    finalizedPlain.length >= 1200 || premiumReadonlyCorpusSignalHits(finalizedPlain) >= 3;

  if (args.premiumCheckoutCompleted) {
    const extraCandidates: PaidProCorpusAuthorityCandidate[] = [];
    const hydrated = (args.authoritativeHydratedPlainText || "").trim();
    if (hydrated.length >= 500) {
      extraCandidates.push({
        plainText: hydrated,
        tier: mapRenderSourceToAuthorityTier({
          renderSource: "server_full_document_text",
          pipelineSource: args.lastPremiumPipelineRenderSource,
        }),
        sourceLabel: "hydrated_authoritative",
        pipelineSource: args.lastPremiumPipelineRenderSource ?? null,
        sticky: true,
      });
    }
    const sticky = (args.stickyAuthoritativePlainText || "").trim();
    if (sticky.length >= 500 && sticky !== hydrated) {
      extraCandidates.push({
        plainText: sticky,
        tier: mapRenderSourceToAuthorityTier({
          renderSource: "server_full_document_text",
          pipelineSource: args.lastPremiumPipelineRenderSource,
        }),
        sourceLabel: "sticky_authoritative",
        pipelineSource: args.lastPremiumPipelineRenderSource ?? null,
        sticky: true,
      });
    }
    const legacy = (legacySnap || "").trim();
    if (legacy.length >= 500 && legacy !== paidFallback && legacy !== hydrated) {
      extraCandidates.push({
        plainText: legacy,
        tier: mapRenderSourceToAuthorityTier({
          renderSource: "legacy_snapshot",
          pipelineSource: args.lastPremiumPipelineRenderSource,
        }),
        sourceLabel: "legacy_snapshot",
        pipelineSource: args.lastPremiumPipelineRenderSource ?? null,
      });
    }
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: finalizedPlain,
      pickedSource: res.premium_render_source,
      draft: args.draft,
      intakeText: args.intakeText,
      premiumCheckoutCompleted: true,
      paidAuthoritativeFallback: paidFallback,
      pipelineSource: args.lastPremiumPipelineRenderSource ?? null,
      allowLocalDeterministicFallback: !shouldBlockPaidProLocalCorpusFallback(pipeSrc),
      extraCandidates,
      stickyPlainText: sticky || hydrated || paidFallback,
      stickyTier: mapRenderSourceToAuthorityTier({
        renderSource: "server_full_document_text",
        pipelineSource: args.lastPremiumPipelineRenderSource,
      }),
    });
    if (surface.mode === "premium_unavailable_retry") {
      logPaidProStarterCloneBlocked({
        stage: "pickPremiumPaidReadonlyPlainText",
        ...surface,
      });
      return {
        plainText: "",
        sourceUsed: "none",
        audit: {
          selected: "none",
          forcedPremiumSource: false,
          candidates: [
            {
              source: res.premium_render_source,
              len: finalizedPlain.length,
              nonThin,
              eligible: false,
              reason: surface.reason,
            },
          ],
        },
      };
    }
    const authoritativeBase = (args.paidAuthoritativeProBody || sticky || hydrated || "").trim();
    const driftGuard = authoritativeBase
      ? enforceAuthoritativeProCorpusDisplay({
          authoritativeText: authoritativeBase,
          displayText: surface.plainText,
          source: surface.sourceUsed,
          surface: "premium_readonly_pick",
        })
      : { ok: true, blocked: false, displayText: surface.plainText };
    const authoritativePlain = driftGuard.displayText;
    const authoritativeSource = surface.sourceUsed;
    logLawdogOutputPathMap({
      stage: "premium_readonly_pick",
      source: authoritativeSource,
      text: authoritativePlain,
      canMutateBody: false,
      canRejectBody: true,
      canFallback: false,
      reason: driftGuard.blocked ? "authority_drift_blocked" : "paid_readonly_pick",
    });
    logProCorpusSourceMap({
      stage: "pro_review_display",
      source: authoritativeSource,
      len: authoritativePlain.length,
      text: authoritativePlain,
      allowedToOverride: false,
      reason: driftGuard.blocked ? "authority_drift_blocked" : surface.usedLocalDeterministicFallback ? "local_fallback" : "paid_readonly_pick",
    });
    const authNonThin =
      authoritativePlain.length >= 1200 || premiumReadonlyCorpusSignalHits(authoritativePlain) >= 3;
    if (surface.usedLocalDeterministicFallback && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[paid-pro-local-fallback]", {
        len: authoritativePlain.length,
        intakeLen: (args.intakeText || "").length,
      });
    }
    return {
      plainText: authoritativePlain,
      sourceUsed: authoritativeSource,
      audit: {
        selected: authoritativeSource,
        forcedPremiumSource: Boolean(surface.usedLocalDeterministicFallback),
        candidates: [
          {
            source: authoritativeSource,
            len: authoritativePlain.length,
            nonThin: authNonThin,
            eligible: true,
            reason: surface.usedLocalDeterministicFallback
              ? `local_deterministic_fallback:${surface.authorityTier}`
              : `${surface.authorityTier}:${res.premium_render_reason}`,
          },
        ],
      },
    };
  }

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
  const built = buildAgreementPreviewText(draft, {
    starterPreview: false,
    premiumDeliverablePreview: true,
    intakeText: opts?.intakeText,
    legacyPremiumSnapshotText: opts?.legacySnapshotText,
  });
  return applyPaidProDomainScopeGuard(
    applyAiWorkflowServicesQualityFloorToFallback(built, draft, opts?.intakeText),
    opts?.intakeText,
    { logSurface: "premium_deliverable_plain_from_draft" },
  );
}
