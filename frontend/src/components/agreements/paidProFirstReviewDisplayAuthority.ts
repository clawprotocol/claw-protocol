/**
 * TEST310 — first paid Pro review visible display authority.
 * Single source-selection path for forced shell / display plain; never live preview after checkout.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getAuthoritativeAgreementText } from "./authoritativeAgreementDocument";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { resolveAuthoritativePaidProReviewPlain } from "./authoritativePaidProReview";
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
  resolvePaidProPostCheckoutFirstReviewPlain,
} from "./paidProPostCheckoutRenderGate";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  hashPaidProCorpus,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  hasPaidPremiumCompletionSession,
  readPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

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
  /** Picker output — used only when not a forbidden post-checkout source. */
  pickerPlain?: string | null;
  pickerSource?: string | null;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function serverFullFromDraft(draft: ParsedDraftShape | null | undefined): string {
  if (!draft) return "";
  const extended = draft as ParsedDraftShape & {
    server_full_document_text?: string | null;
    premium_server_repair_document_text?: string | null;
  };
  const candidates = [
    extended.premium_server_full_document_text,
    extended.server_full_document_text,
    extended.premium_full_document_text,
    extended.premium_server_repair_document_text,
  ];
  return candidates.map((c) => trim(c)).find((t) => t.length >= PAID_PRO_AUTHORITY_MIN_LEN) ?? "";
}

function snapshotServerFullBody(): string {
  const snap = readPremiumCompletionSnapshot();
  const snapDraft = snap?.premiumDraft as
    | (ParsedDraftShape & { server_full_document_text?: string | null })
    | undefined;
  const candidates = [
    snap?.premiumWinningBodyText,
    snap?.premiumReadonlyPlainText,
    snapDraft?.premium_server_full_document_text,
    snapDraft?.server_full_document_text,
    snapDraft?.premium_full_document_text,
  ];
  return candidates.map((c) => trim(c)).find((t) => t.length >= PAID_PRO_AUTHORITY_MIN_LEN) ?? "";
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

/**
 * Resolve visible first-review plain from paid Pro authority only — never live_generated_preview
 * once post-checkout / paid Pro display is active.
 */
export function resolvePaidProFirstReviewVisibleDisplayPlain(
  args: PaidProFirstReviewVisibleDisplayArgs = {},
): PaidProFirstReviewVisibleDisplayResolution {
  const draft = args.draft ?? null;
  const intakeText = trim(args.intakeText);
  const premiumRenderSource = trim(args.premiumRenderSource);
  const paidProActive = isPaidProFirstReviewVisibleDisplayActive(args);
  const hasSoT = hasPaidProSourceOfTruth();
  const hasServerFullDoc = draftServerFullDocumentExists(draft) || snapshotServerFullBody().length >= PAID_PRO_AUTHORITY_MIN_LEN;

  if (isPaidProPostFinalizeHydratedCorpusLocked()) {
    const locked = resolvePaidProPostFinalizeReviewPlain().trim();
    if (locked.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return {
        plain: locked,
        source: "authoritative_signing_snapshot",
        fallbackReason: null,
        hasSoT,
        hasServerFullDoc,
        paidProActive,
      };
    }
  }

  const authoritative = resolveAuthoritativePaidProReviewPlain({
    draft,
    intakeText,
    premiumRenderSource,
  }).trim();
  if (authoritative.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: authoritative,
      source: hasSoT ? "paidProReviewRenderPlain" : "authoritative_paid_pro_review",
      fallbackReason: null,
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const recovery = resolvePaidProPostCheckoutFirstReviewPlain({
    draft,
    intakeText,
    premiumRenderSource,
    winningPremiumBodyText: serverFullFromDraft(draft) || snapshotServerFullBody(),
  }).trim();
  if (recovery.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: recovery,
      source: "post_checkout_recovery_display",
      fallbackReason: null,
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const draftServerFull = serverFullFromDraft(draft);
  if (draftServerFull.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: draftServerFull,
      source: "server_full_document_text",
      fallbackReason: "draft_server_full_document",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const snapBody = snapshotServerFullBody();
  if (snapBody.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    const snap = readPremiumCompletionSnapshot();
    const pipeline = trim(snap?.premiumPipelineRenderSource ?? snap?.premiumRenderResolveSource);
    return {
      plain: snapBody,
      source: isAuthoritativePremiumPipelineRenderSource(pipeline)
        ? "server_full_document_text"
        : "premium_completion_snapshot",
      fallbackReason: "premium_completion_snapshot",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const authoritativeDoc = getAuthoritativeAgreementText().trim();
  if (authoritativeDoc.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: authoritativeDoc,
      source: "authoritativeAgreementDocument",
      fallbackReason: "authoritative_agreement_document",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const frozen = readCanonicalAgreementCorpusForSurface("review", { tier: "pro" });
  const frozenPlain = frozen?.canonicalText?.trim() ?? "";
  if (frozenPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return {
      plain: frozenPlain,
      source: "frozenCanonicalCorpus",
      fallbackReason: "frozen_canonical_corpus",
      hasSoT,
      hasServerFullDoc,
      paidProActive,
    };
  }

  const pickerPlain = trim(args.pickerPlain);
  const pickerSource = trim(args.pickerSource);
  const pickerForbidden =
    paidProActive && isForbiddenPaidProDisplayRenderSource(pickerSource);
  if (pickerPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN && !pickerForbidden) {
    return {
      plain: pickerPlain,
      source: pickerSource || "premium_readonly_picker",
      fallbackReason: null,
      hasSoT,
      hasServerFullDoc,
      paidProActive,
      forbiddenSourceBlocked: false,
    };
  }

  return {
    plain: "",
    source: pickerForbidden ? "none" : pickerSource || "none",
    fallbackReason: pickerForbidden
      ? `forbidden_picker_source:${pickerSource}`
      : paidProActive
        ? "awaiting_paid_pro_authority"
        : "no_authoritative_corpus",
    hasSoT,
    hasServerFullDoc,
    paidProActive,
    forbiddenSourceBlocked: pickerForbidden,
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
