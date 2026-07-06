/**
 * Post-checkout Paid Pro render gate — first review after checkout must never route into
 * guided question collection. Display server SoT, deterministic local recovery, or an explicit
 * retry/recovery panel only.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildCanonicalAgreementSnapshot,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import type { AuthoritativePaidProReviewInput } from "./authoritativePaidProReview";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  hasPaidPremiumCompletionSession,
  readPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import {
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { isNonfatalGenerationFailureCode } from "./premiumAcceptancePolicy";
import { shouldBlockPaidProReviewReadinessFromFallbackCorpus } from "./paidProApiFailureAuthorityGuard";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

/** Minimum plain length for a displayable degraded/local recovery Pro agreement on first review. */
export const PAID_PRO_RECOVERY_MIN_DISPLAY_LEN = 4_000;

export type PaidProPostCheckoutRenderGateInput = {
  premiumPaidDocumentSurface?: boolean;
  premiumCheckoutCompleted?: boolean;
  premiumCompletionSessionActive?: boolean;
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
  premiumDegradedServerRecoverable?: boolean;
  premiumNetworkLocalRecovery?: boolean;
};

export function isPaidProPostCheckoutRecoveryPipelineSource(
  pipelineSource: string | null | undefined,
): boolean {
  const s = String(pipelineSource || "").trim();
  return (
    s === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE ||
    s === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE ||
    s === "premium_generation_retryable" ||
    s === "rejected_paid_corpus"
  );
}

function isDegradedLocalRecoveryPipelineSource(pipelineSource: string | null | undefined): boolean {
  return String(pipelineSource || "").trim() === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE;
}

function isNetworkLocalRecoveryPipelineSource(pipelineSource: string | null | undefined): boolean {
  return String(pipelineSource || "").trim() === PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE;
}

export function isPaidProPostCheckoutFlowActive(args: PaidProPostCheckoutRenderGateInput): boolean {
  if (!args.premiumPaidDocumentSurface && !args.premiumCheckoutCompleted) return false;
  const pipeline = String(args.premiumRenderSource || "").trim();
  return Boolean(
    args.premiumCheckoutCompleted ||
      args.premiumCompletionSessionActive ||
      hasPaidPremiumCompletionSession() ||
      args.premiumDegradedServerLocalRecovery ||
      args.premiumDegradedServerRecoverable ||
      args.premiumNetworkLocalRecovery ||
      isDegradedLocalRecoveryPipelineSource(pipeline) ||
      isNetworkLocalRecoveryPipelineSource(pipeline) ||
      isPaidProPostCheckoutRecoveryPipelineSource(pipeline),
  );
}

/** Hard gate: paid post-checkout must never mount guided question collection as the primary surface. */
export function shouldSuppressPaidProGuidedCompletionUi(
  args: PaidProPostCheckoutRenderGateInput,
): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  return isPaidProPostCheckoutFlowActive(args);
}

/**
 * When the first degraded json_parse body already satisfies paid Pro display requirements,
 * skip a blocking client structural retry (second premium-full-draft) and use local recovery instead.
 */
export function shouldSkipPremiumStructuralRetryForDegradedDisplay(args: {
  documentText: string;
  intakeText: string;
  generationOutcome?: string | null;
  failureCode?: string | null;
  accRejected: boolean;
}): boolean {
  if (!args.accRejected) return false;
  if ((args.generationOutcome || "").trim() !== "degraded") return false;
  const fc = (args.failureCode || "").trim();
  if (fc !== "json_parse" && !isNonfatalGenerationFailureCode(fc)) return false;
  const doc = (args.documentText || "").trim();
  if (doc.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) return false;
  return meetsPaidProDegradedRecoveryDisplayRequirements(doc, args.intakeText);
}

function normRecoveryPartyToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function recoveryBodyContainsParty(bodyLower: string, partyName: string): boolean {
  const n = normRecoveryPartyToken(partyName);
  if (!n || n.length < 4) return false;
  if (bodyLower.includes(n)) return true;
  const parts = n.split(/\s+/).filter((p) => p.length >= 3);
  if (parts.length >= 2) return parts.every((p) => bodyLower.includes(p));
  return false;
}

function intakeJurisdictionAnchor(intake: string): string | null {
  const stateOfConstrued = intake.match(
    /\blaws?\s+of\s+(?:the\s+)?State\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i,
  );
  if (stateOfConstrued?.[1]) {
    return stateOfConstrued[1].replace(/\s+/g, " ").trim().toLowerCase();
  }
  const governedMatches = [
    ...intake.matchAll(/\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,2})\s+law\s+governs\b/g),
  ];
  const governed = governedMatches[governedMatches.length - 1];
  if (governed?.[1]) {
    return governed[1].replace(/\s+/g, " ").trim().toLowerCase();
  }
  const labeled = intake.match(/\bgoverning\s+law\s*[:\-]\s*([A-Za-z][A-Za-z\s'.-]{2,40})/i);
  if (labeled?.[1]) {
    return labeled[1].replace(/\s+/g, " ").trim().toLowerCase();
  }
  const stateOf = intake.match(/\bState\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
  if (stateOf?.[1] && /\b(?:govern|law|jurisdiction|construed)\b/i.test(intake)) {
    return stateOf[1].replace(/\s+/g, " ").trim().toLowerCase();
  }
  return null;
}

function authoritativeIntakePartiesForRecovery(intake: string): string[] {
  const labeled = labeledPartyLegalEntities(intake).filter(isAuthoritativeLegalEntityName);
  if (labeled.length >= 2) return labeled;
  return extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName);
}

function recoveryBodySatisfiesIntakePayment(bodyLower: string, intakeLower: string): boolean {
  const amounts = [...intakeLower.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)];
  if (!amounts.length) {
    return /\$\s*[\d,]+|(?:fee|payment|compensation|consideration)\b/i.test(bodyLower);
  }
  return amounts.some((m) => {
    const plain = m[1].replace(/,/g, "");
    const withComma = m[1];
    if (bodyLower.includes(plain) || bodyLower.includes(withComma)) return true;
    const formatted = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return bodyLower.includes(formatted);
  });
}

export function meetsPaidProDegradedRecoveryDisplayRequirements(
  body: string,
  intakeText?: string | null,
): boolean {
  return explainPaidProDegradedRecoveryDisplayRequirements(body, intakeText).ok;
}

export function explainPaidProDegradedRecoveryDisplayRequirements(
  body: string,
  intakeText?: string | null,
): { ok: boolean; failedStep: string } {
  const t = (body || "").trim();
  if (t.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) {
    return { ok: false, failedStep: `len:${t.length}` };
  }
  const intake = (intakeText || "").trim();
  const bodyLower = t.toLowerCase();
  const intakeLower = intake.toLowerCase();

  const parties = authoritativeIntakePartiesForRecovery(intake);
  if (parties.length >= 2) {
    if (!parties.every((p) => recoveryBodyContainsParty(bodyLower, p))) {
      return { ok: false, failedStep: "parties" };
    }
  } else if (!/\b(agreement|consulting|services)\b/i.test(t)) {
    return { ok: false, failedStep: "agreement_keyword" };
  }

  const jurisdiction = intakeJurisdictionAnchor(intake);
  if (jurisdiction && !bodyLower.includes(jurisdiction)) {
    return { ok: false, failedStep: `jurisdiction:${jurisdiction}` };
  }

  if (!recoveryBodySatisfiesIntakePayment(bodyLower, intakeLower)) {
    return { ok: false, failedStep: "payment" };
  }

  if (countPaidProExecutionBlocks(t) !== 1) {
    return { ok: false, failedStep: `execution_blocks:${countPaidProExecutionBlocks(t)}` };
  }
  if (!/\b(agreement|consulting|services)\b/i.test(t)) {
    return { ok: false, failedStep: "agreement_keyword_tail" };
  }
  return { ok: true, failedStep: "" };
}

export function isDisplayablePaidProDegradedLocalRecovery(args: {
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
  body: string;
  intakeText?: string | null;
}): boolean {
  const pipeline = String(args.premiumRenderSource || "").trim();
  if (
    !args.premiumDegradedServerLocalRecovery &&
    !isDegradedLocalRecoveryPipelineSource(pipeline)
  ) {
    return false;
  }
  return meetsPaidProDegradedRecoveryDisplayRequirements(args.body, args.intakeText);
}

export function resolvePaidProPostCheckoutRecoveryDisplayPlain(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  winningPremiumBodyText?: string | null;
  hydratedPremiumBody?: string | null;
  premiumRenderSource?: string | null;
  premiumDegradedServerLocalRecovery?: boolean;
}): string {
  const snap = readPremiumCompletionSnapshot();
  const pipeline = String(
    args?.premiumRenderSource ??
      snap?.premiumPipelineRenderSource ??
      snap?.premiumRenderResolveSource ??
      "",
  ).trim();
  const candidates = [
    args?.winningPremiumBodyText,
    args?.hydratedPremiumBody,
    snap?.premiumWinningBodyText,
    snap?.premiumReadonlyPlainText,
    snap?.premiumDraft?.premium_full_document_text,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const intake = args?.intakeText ?? null;
  for (const body of candidates) {
    if (
      isDisplayablePaidProDegradedLocalRecovery({
        premiumRenderSource: pipeline,
        premiumDegradedServerLocalRecovery:
          args?.premiumDegradedServerLocalRecovery ??
          pipeline === PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
        body,
        intakeText: intake,
      })
    ) {
      return body;
    }
    if (
      isNetworkLocalRecoveryPipelineSource(pipeline) &&
      body.length > PAID_PRO_RECOVERY_MIN_DISPLAY_LEN &&
      body.length >= PREMIUM_USABLE_BODY_MIN_LEN
    ) {
      return body;
    }
  }
  return "";
}

/** Non-empty paid first-review corpus: committed SoT render or gated post-checkout recovery plain. */
export function hasRenderablePaidProFirstReviewCorpus(
  input?: AuthoritativePaidProReviewInput & {
    premiumCheckoutCompleted?: boolean;
    hydratedPremiumBody?: string | null;
    winningPremiumBodyText?: string | null;
    premiumDegradedServerLocalRecovery?: boolean;
    premiumPostCheckoutPhase?: string | null;
  },
): boolean {
  const pipeline = String(input?.premiumRenderSource ?? "").trim();
  const recoveryLen = resolvePaidProPostCheckoutFirstReviewPlain({
    draft: input?.draft ?? null,
    intakeText: input?.intakeText ?? null,
    premiumRenderSource: pipeline,
    winningPremiumBodyText: input?.winningPremiumBodyText,
    hydratedPremiumBody: input?.hydratedPremiumBody,
    premiumDegradedServerLocalRecovery: input?.premiumDegradedServerLocalRecovery,
  }).length;
  const draftLen = Math.max(
    String(input?.draft?.premium_full_document_text ?? "").trim().length,
    String(input?.winningPremiumBodyText ?? "").trim().length,
    recoveryLen,
  );
  if (
    shouldBlockPaidProReviewReadinessFromFallbackCorpus({
      premiumRenderSource: pipeline,
      premiumPostCheckoutPhase: input?.premiumPostCheckoutPhase,
      corpusLen: draftLen,
    })
  ) {
    return false;
  }
  if (hasPaidProSourceOfTruth()) {
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: input?.draft ?? null,
      intakeText: input?.intakeText ?? null,
    });
    if (renderPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) return true;
    return getPaidProSourceOfTruthText().trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;
  }
  if (readAcceptedPipelineReviewCorpusPlain().length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return true;
  }
  const recovery = resolvePaidProPostCheckoutFirstReviewPlain({
    draft: input?.draft ?? null,
    intakeText: input?.intakeText ?? null,
    premiumRenderSource: input?.premiumRenderSource ?? null,
    winningPremiumBodyText: input?.winningPremiumBodyText,
    hydratedPremiumBody: input?.hydratedPremiumBody,
    premiumDegradedServerLocalRecovery: input?.premiumDegradedServerLocalRecovery,
  });
  return recovery.length >= PAID_PRO_AUTHORITY_MIN_LEN;
}

/**
 * Fail closed: paid checkout is latched but no canonical paid corpus is available for review render.
 */
export function shouldBlockPaidProReviewShellWithoutCanonicalCorpus(
  input?: AuthoritativePaidProReviewInput & {
    premiumCheckoutCompleted?: boolean;
    hydratedPremiumBody?: string | null;
    winningPremiumBodyText?: string | null;
    premiumDegradedServerLocalRecovery?: boolean;
    premiumPostCheckoutPhase?: string | null;
  },
): boolean {
  const checkoutLatched = Boolean(
    input?.premiumCheckoutCompleted || hasPaidPremiumCompletionSession(),
  );
  if (!checkoutLatched) return false;
  return !hasRenderablePaidProFirstReviewCorpus(input);
}

export function isPaidProPostCheckoutRecoveryReviewActive(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
}): boolean {
  if (hasPaidProSourceOfTruth()) return false;
  if (!args?.premiumCheckoutCompleted && !hasPaidPremiumCompletionSession()) return false;
  return hasRenderablePaidProFirstReviewCorpus({
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
    premiumRenderSource: args?.premiumRenderSource ?? null,
    premiumCheckoutCompleted: args?.premiumCheckoutCompleted,
    winningPremiumBodyText:
      String(args?.draft?.premium_full_document_text ?? "").trim() || undefined,
  });
}

/** Paid Pro first-review display (SoT or post-checkout recovery) — does not imply SoT acceptance. */
export function isPaidProFirstReviewDisplayActive(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
  isPaidPro?: boolean;
}): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  return isPaidProPostCheckoutRecoveryReviewActive({
    intakeText: args?.intakeText,
    draft: args?.draft,
    premiumRenderSource: args?.premiumRenderSource,
    premiumCheckoutCompleted: args?.premiumCheckoutCompleted,
  });
}

export function resolvePaidProFirstReviewDisplayPlain(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
}): string {
  if (hasPaidProSourceOfTruth()) {
    return "";
  }
  return resolvePaidProPostCheckoutFirstReviewPlain({
    ...args,
    winningPremiumBodyText:
      String(args?.draft?.premium_full_document_text ?? "").trim() || undefined,
  });
}

/**
 * Freeze display-only canonical corpus from post-checkout recovery (never establishes paidProSourceOfTruth).
 */
export function freezePaidProPostCheckoutRecoveryCanonicalSnapshot(args: {
  text: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  reviewSessionId?: string | null;
}): { hash: string; len: number } | null {
  const canonicalText = (args.text || "").trim();
  if (canonicalText.length < PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) return null;
  const parties = ((args.draft?.parties ?? []) as Array<{ name?: string; role?: string; email?: string }>)
    .map((p) => ({ name: p.name || "", role: p.role ?? null, email: p.email ?? null }))
    .filter((p) => p.name.trim());
  const authoritativeSignerCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText ?? "",
    draftParties: parties,
    corpusPlain: canonicalText,
  }).count;
  try {
    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "paid_pro_post_checkout_recovery_display",
      tier: "pro",
      candidates: [
        {
          source: "last_known_good_authoritative",
          text: canonicalText,
        },
      ],
      intakeText: args.intakeText ?? "",
      parties,
      signerState: { complete: false, signerCount: authoritativeSignerCount },
      minLen: PAID_PRO_RECOVERY_MIN_DISPLAY_LEN,
      reviewSessionId: args.reviewSessionId ?? null,
    });
    const frozen = freezeCanonicalAgreementSnapshot(snapshot, "canonical_working_draft");
    if (!frozen?.hash) return null;
    return { hash: frozen.hash, len: frozen.len };
  } catch {
    return { hash: fingerprintAgreementBody(canonicalText), len: canonicalText.length };
  }
}

export function shouldBlockStarterPreviewOverrideForPaidPostCheckout(args?: {
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  premiumRenderSource?: string | null;
  premiumPaidDocumentSurface?: boolean;
  premiumCheckoutCompleted?: boolean;
}): boolean {
  if (!args?.premiumPaidDocumentSurface) return false;
  return isPaidProFirstReviewDisplayActive({
    intakeText: args.intakeText,
    draft: args.draft,
    premiumRenderSource: args.premiumRenderSource,
    premiumCheckoutCompleted: args.premiumCheckoutCompleted,
  });
}

export function shouldHideLegacyPaidProDraftPanels(args: {
  premiumPaidDocumentSurface: boolean;
  paidProFirstReviewDisplayActive: boolean;
}): boolean {
  return Boolean(args.premiumPaidDocumentSurface && args.paidProFirstReviewDisplayActive);
}

/** First-review plain for post-checkout recovery (never establishes SoT). */
export function resolvePaidProPostCheckoutFirstReviewPlain(
  args?: {
    intakeText?: string | null;
    draft?: ParsedDraftShape | null;
    winningPremiumBodyText?: string | null;
    hydratedPremiumBody?: string | null;
    premiumRenderSource?: string | null;
    premiumDegradedServerLocalRecovery?: boolean;
  },
): string {
  if (hasPaidProSourceOfTruth()) return "";
  const recovery = resolvePaidProPostCheckoutRecoveryDisplayPlain(args);
  if (recovery.length >= PAID_PRO_AUTHORITY_MIN_LEN) return recovery;
  return "";
}

export function paidProPostCheckoutShowsExplicitRecoveryPanel(args: {
  gate: PaidProPostCheckoutRenderGateInput;
  recoveryBodyLen: number;
  proIntentGateMessage?: string | null;
}): boolean {
  if (!isPaidProPostCheckoutFlowActive(args.gate)) return false;
  if (hasPaidProSourceOfTruth()) return false;
  if (args.recoveryBodyLen > PAID_PRO_RECOVERY_MIN_DISPLAY_LEN) return false;
  return Boolean(
    args.proIntentGateMessage?.trim() || args.gate.premiumDegradedServerRecoverable,
  );
}

/** Retry CTA on recovery panel must not imply guided completion. */
export function isPaidProExplicitRecoveryRetryLabel(label: string | null | undefined): boolean {
  const t = (label || "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("question")) return false;
  if (t.includes("almost done")) return false;
  return t.includes("retry pro draft") || t === "retry pro draft";
}
