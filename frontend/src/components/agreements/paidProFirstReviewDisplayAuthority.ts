/**
 * TEST310 / Patch 5B — first paid Pro review visible display authority.
 * Commercial paint is server-GET-only: no SoT / completion-snap / latched / picker fallbacks.
 */

import {
  hasVerifiedCommercialDisplayCorpus,
  readDisplayReviewSnapshotAuthority,
  readVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  isMainSectionHeadingLine,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { draftServerFullDocumentExists } from "./paidProRuntimeAuthorityEstablishment";
import {
  isPaidProPostCheckoutFlowActive,
  isPaidProFirstReviewDisplayActive as isPaidProFirstReviewDisplayFlowActive,
} from "./paidProPostCheckoutRenderGate";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  resolvePaidProPostFinalizeUserVisiblePlain,
} from "./paidProDisplayPlainAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  hasPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";

export type PaidProFirstReviewVisibleDisplayResolution = {
  plain: string;
  source: string;
  fallbackReason: string | null;
  hasSoT: boolean;
  hasServerFullDoc: boolean;
  paidProActive: boolean;
  forbiddenSourceBlocked?: boolean;
};

export type PaidProFirstReviewVisibleDisplayArgs = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
  premiumPaidDocumentSurface?: boolean;
  /** When true, block live preview HTML fallback on the forced visible shell. */
  paidProActive?: boolean;
  /** Picker output — never paint-eligible in commercial mode (hint only). */
  pickerPlain?: string | null;
  pickerSource?: string | null;
  /** Required for commercial paint: nonempty agreement id + verified GET corpus. */
  agreementId?: string | null;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function isPaidProFirstReviewVisibleDisplayActive(
  args?: PaidProFirstReviewVisibleDisplayArgs,
): boolean {
  return (
    hasPaidProSourceOfTruth() ||
    isPaidProFirstReviewDisplayFlowActive({
      intakeText: args?.intakeText,
      draft: args?.draft,
      premiumRenderSource: args?.premiumRenderSource,
      premiumCheckoutCompleted: args?.premiumCheckoutCompleted,
    }) ||
    isPaidProPostCheckoutFlowActive({
      premiumPaidDocumentSurface: args?.premiumPaidDocumentSurface,
      premiumCheckoutCompleted: args?.premiumCheckoutCompleted,
      premiumCompletionSessionActive: hasPaidPremiumCompletionSession(),
      premiumRenderSource: args?.premiumRenderSource,
    })
  );
}

function commercialDisplayGateActive(args: PaidProFirstReviewVisibleDisplayArgs): boolean {
  return (
    Boolean(args.paidProActive) ||
    Boolean(args.premiumCheckoutCompleted) ||
    Boolean(args.premiumPaidDocumentSurface) ||
    isPaidProFirstReviewVisibleDisplayActive(args)
  );
}

/**
 * Recover paint agreement id when React displayContext lags behind a successful
 * server snapshot prepare/GET (resume id / display authority already held in session).
 * Prefer an id that already has verified GET corpus so a stale/empty context cannot
 * blank a valid canonical document for the active review session.
 */
function resolveCommercialPaintAgreementId(preferred?: string | null): string {
  const fromArg = trim(preferred);
  if (fromArg && hasVerifiedCommercialDisplayCorpus(fromArg)) {
    return fromArg;
  }
  const display = readDisplayReviewSnapshotAuthority();
  const fromDisplay = trim(display?.agreementId);
  if (fromDisplay && hasVerifiedCommercialDisplayCorpus(fromDisplay)) {
    return fromDisplay;
  }
  // Verified corpus bytes may already be present while displayContext.agreementId
  // is still empty (or briefly stale) on the same tick as SoT/review chrome unlock.
  const verifiedAny = readVerifiedCommercialDisplayCorpus();
  const fromVerified = trim(verifiedAny?.agreementId);
  if (fromVerified) return fromVerified;
  return fromArg;
}

/**
 * Resolve visible first-review plain from verified server GET authority only.
 * Local SoT / completion snap / latched draft / picker must never paint commercial review corpus.
 *
 * Once a verified canonical server snapshot exists for the active review session,
 * paint that exact corpus immediately — never blank the body on a transient
 * missing agreementId / displayContext race.
 */
export function resolvePaidProFirstReviewVisibleDisplayPlain(
  args: PaidProFirstReviewVisibleDisplayArgs = {},
): PaidProFirstReviewVisibleDisplayResolution {
  const draft = args.draft ?? null;
  const agreementId = resolveCommercialPaintAgreementId(args.agreementId);
  const paidProActive = commercialDisplayGateActive(args);
  const hasSoT = hasPaidProSourceOfTruth();
  const hasServerFullDoc = draftServerFullDocumentExists(draft);

  if (!paidProActive) {
    return {
      plain: "",
      source: "none",
      fallbackReason: "no_authoritative_corpus",
      hasSoT,
      hasServerFullDoc,
      paidProActive: false,
    };
  }

  if (!agreementId) {
    return {
      plain: "",
      source: "none",
      fallbackReason: "missing_agreement_id",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  if (!hasVerifiedCommercialDisplayCorpus(agreementId)) {
    const pickerSource = trim(args.pickerSource);
    const pickerForbidden =
      paidProActive && isForbiddenPaidProDisplayRenderSource(pickerSource);
    return {
      plain: "",
      source: "none",
      fallbackReason: "awaiting_server_display_authority",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
      forbiddenSourceBlocked: pickerForbidden || undefined,
    };
  }

  const verified = readVerifiedCommercialDisplayCorpus(agreementId);
  const verifiedPlain = trim(verified?.corpusPlain);
  if (verifiedPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: "",
      source: "none",
      fallbackReason: "awaiting_server_display_authority",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  // Post-finalize may project signer-hydrated text only after verified GET authority exists.
  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain().trim();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      const plain = resolvePaidProPostFinalizeUserVisiblePlain(
        locked,
        draft as import("../../agreement/agreementTypes").AgreementDraft | null,
      );
      return {
        plain,
        source: "authoritative_signing_snapshot",
        fallbackReason: null,
        hasSoT,
        hasServerFullDoc,
        paidProActive,
      };
    }
  }

  return {
    plain: verifiedPlain,
    source: "verified_server_canonical_review_snapshot",
    fallbackReason: null,
    hasSoT,
    hasServerFullDoc,
    paidProActive,
  };
}

let lastTest310DisplaySourceKey = "";

export function resetPaidProTest310DisplaySourceLogsForTests(): void {
  lastTest310DisplaySourceKey = "";
}

export function logTest310DisplaySource(resolution: PaidProFirstReviewVisibleDisplayResolution): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${resolution.source}|${resolution.plain.length}|${resolution.fallbackReason ?? ""}`;
  if (key === lastTest310DisplaySourceKey) return;
  lastTest310DisplaySourceKey = key;
  // eslint-disable-next-line no-console
  console.info("[test310-display-source]", {
    source: resolution.source,
    len: resolution.plain.length,
    hash: resolution.plain.length >= 80 ? hashPaidProCorpus(resolution.plain) : null,
    hasSoT: resolution.hasSoT,
    hasServerFullDoc: resolution.hasServerFullDoc,
    paidProActive: resolution.paidProActive,
    fallbackReason: resolution.fallbackReason,
  });
}

let lastTest310BlockClassificationKey = "";

export function resetPaidProTest310BlockClassificationLogsForTests(): void {
  lastTest310BlockClassificationKey = "";
}

export function logTest310BlockClassification(plain: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!plain.trim()) return;
  const summary = summarizePaidProDocumentBlockClassifications(plain);
  const key = `${plain.length}|${summary.mainSectionHeadingCount}|${summary.titleCount}`;
  if (key === lastTest310BlockClassificationKey) return;
  lastTest310BlockClassificationKey = key;
  const blocks = classifyPaidProDocumentBlocks(plain);
  // eslint-disable-next-line no-console
  console.info("[test310-block-classification]", {
    title: summary.titleCount,
    main_section_heading: summary.mainSectionHeadingCount,
    legacy_section_heading: summary.legacySectionHeadingCount,
    body_paragraph: summary.bodyParagraphCount,
    signature_party_start: summary.signaturePartyStartCount,
    signature_entity: summary.signatureEntityCount,
    signature_notice: summary.signatureNoticeCount,
    signature_field: summary.signatureFieldCount,
    section_headings: blocks
      .filter((b) => b.kind === "main_section_heading" || b.kind === "legacy_section_heading")
      .map((b) => b.firstLine),
  });
}

let lastTest313HeadingRenderSourceKey = "";

export function resetPaidProTest313HeadingRenderSourceLogsForTests(): void {
  lastTest313HeadingRenderSourceKey = "";
}

export function logTest313HeadingRenderSource(args: {
  source: string;
  plain: string;
  paidProActive: boolean;
  forbiddenSourceBlocked?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!args.plain.trim()) return;
  const summary = summarizePaidProDocumentBlockClassifications(args.plain);
  const leaks = detectPaidProPlainParagraphHeadingLeaks(args.plain);
  const hash = args.plain.length >= 80 ? hashPaidProCorpus(args.plain) : null;
  const key = `${args.source}|${args.plain.length}|${summary.mainSectionHeadingCount}|${leaks.plainParagraphHeadingLeakCount}`;
  if (key === lastTest313HeadingRenderSourceKey) return;
  lastTest313HeadingRenderSourceKey = key;
  const payload = {
    source: args.source,
    len: args.plain.length,
    hash,
    paidProActive: args.paidProActive,
    forbiddenSourceBlocked: args.forbiddenSourceBlocked ?? false,
    headingCount: summary.mainSectionHeadingCount + summary.legacySectionHeadingCount,
    plainParagraphHeadingLeakCount: leaks.plainParagraphHeadingLeakCount,
    leakedLines: leaks.leakedLines.slice(0, 8),
  };
  // eslint-disable-next-line no-console
  console.info("[test313-heading-render-source]", payload);
  if (
    import.meta.env?.DEV &&
    leaks.plainParagraphHeadingLeakCount > 0
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test313-heading-render-leak]", payload);
  }
}

let lastTest314HeadingInvariantKey = "";

export function resetPaidProTest314HeadingInvariantLogsForTests(): void {
  lastTest314HeadingInvariantKey = "";
}

export function logTest314HeadingInvariant(args: {
  source: string;
  renderer: "react" | "html" | "resolver";
  plain: string;
  sectionOneClass?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!args.plain.trim()) return;
  const summary = summarizePaidProDocumentBlockClassifications(args.plain);
  const leaks = detectPaidProPlainParagraphHeadingLeaks(args.plain);
  const sectionOneBlock = classifyPaidProDocumentBlocks(args.plain).find((b) =>
    /^1\.\s+/.test(b.firstLine.trim()) && isMainSectionHeadingLine(b.firstLine.trim()),
  );
  const key = `${args.renderer}|${args.source}|${summary.mainSectionHeadingCount}|${leaks.plainParagraphHeadingLeakCount}|${args.sectionOneClass ?? ""}`;
  if (key === lastTest314HeadingInvariantKey) return;
  lastTest314HeadingInvariantKey = key;
  // eslint-disable-next-line no-console
  console.info("[test314-heading-invariant]", {
    source: args.source,
    renderer: args.renderer,
    headingCount: summary.mainSectionHeadingCount + summary.legacySectionHeadingCount,
    plainParagraphHeadingLeakCount: leaks.plainParagraphHeadingLeakCount,
    leakedLines: leaks.leakedLines.slice(0, 8),
    sectionOneKind: sectionOneBlock?.kind ?? null,
    sectionOneClass: args.sectionOneClass ?? null,
  });
  if (import.meta.env?.DEV && leaks.plainParagraphHeadingLeakCount > 0) {
    // eslint-disable-next-line no-console
    console.warn("[test314-heading-invariant-leak]", {
      source: args.source,
      renderer: args.renderer,
      leakedLines: leaks.leakedLines,
    });
  }
}
