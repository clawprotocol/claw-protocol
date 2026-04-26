import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  VoiceAugmentedInput,
  VoiceAugmentedTextArea,
  type VoiceDictationControl,
} from "../../launch/VoiceAugmentedControl";
import type { HeroDictationPhase } from "../../launch/useHeroMediaDictation";
import type { AgreementCreatorPrepState } from "../../agreement/agreementLifecycle";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  isAgreementDetailsStepReady,
  normalizeAgreementDraftFromApi,
} from "../../agreement/agreementDraftNormalize";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import { fetchWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import { fetchAgreementDraft } from "../../agreement/agreementWorkspaceApi";
import { apiUrl, resolveApiBase } from "../../lib/clawApi";
import { useAccess } from "../../access/AccessContext";
import { useLaunchNav } from "../../launch/LaunchNavContext";
import { triggerPaywall } from "../../launch/triggerPaywall";
import { useInputConfidenceHint } from "../../launch/useInputConfidenceHint";
import {
  NO_ATTORNEY_CLIENT,
  PRODUCT_NOT_LAW_FIRM,
  STRUCTURED_DRAFT_ASSIST_SHORT,
} from "../../compliance/disclosureCopy";
import {
  FUNNEL_CTA_SEND_WITH_PRO,
  FUNNEL_FREE_STARTER_BODY,
  FUNNEL_FREE_STARTER_HEADLINE,
  HOMEPAGE_LONG_INTAKE_EXAMPLE,
  NOTHING_SENT_UNTIL_CONFIRM,
} from "../../launch/pricingContent";
import { LiveAgreementPreview, type IntakeFormationPhase } from "./LiveAgreementPreview";
import { extractIntakePayment } from "./intakeCurrencyParse";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import {
  CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
  consumeAdvancedFullDraftCheckoutGrant,
  peekAdvancedFullDraftCheckoutGrant,
  tierAllowsAdvancedFullDraftReveal,
} from "./agreementAdvancedDraftAccess";
import { AdvancedFullDraftPaywallModal } from "./AdvancedFullDraftPaywallModal";
import {
  clearCreateComplexityResume,
  readCreateComplexityResume,
  stashCreateComplexityResume,
  type CreateComplexityResumeKind,
} from "./agreementCreateComplexityResume";
import {
  draftHasFullDraftExpansion,
  enrichParsedDraftForFullDraftUpgrade,
  FULL_DRAFT_EXPANSION_MARKER,
  mergeParsedPreferRicher,
} from "./fullDraftUpgradeEnrich";
import {
  getSimplifiedAdvancedLimitationCopy,
  getSimplifiedAdvancedUpgradeCtaCopy,
  summarizeComplexityGateIntent,
} from "./agreementAdvancedIntentSummary";
import { simplifyParsedDraftForInstantPath } from "./agreementComplexityGate";
import { shouldInterceptAdvancedDocumentFamily } from "./agreementLaunchFamilies";
import {
  detectFullDraftUpgradeSignals,
  getFullDraftUpgradeComparisonRows,
} from "./fullDraftUpgradeSignals";
import { detectUpgradeIntentSignals, type UpgradeIntentSignal } from "./upgradeTeaser";
import { stashUpgradeCheckoutContext, clearUpgradeCheckoutContext } from "./upgradeCheckoutContextStorage";
import { buildUpgradeContextReasons } from "./upgradeContextReasons";
import { FullDraftUpgradeDiffPreview } from "./FullDraftUpgradeDiffPreview";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { applyPremiumParseExtract } from "./intakePremiumParseApply";
import { applySimpleFlowSmartDefaults, type ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildCanonicalSimpleProductHandoffDraft,
  canonicalizeStarterDraftForReview,
  sanitizeStarterSignerLabelsLine,
} from "./starterRecipientDraftMerge";
import { normalizeParsedDraftLegalConcepts } from "./intakeDraftLegalNormalize";
import {
  buildAgreementPreviewText,
  buildAgreementPreviewTextCore,
  collapseDuplicateEsignNoticesInFullPreview,
} from "./agreementPreviewFromDraft";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import { extractStructuredPatchesFromPreview } from "./agreementPreviewSync";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import {
  applyIntakePartyRoleOverlay,
  defaultIntakePartyRoleLabels,
  type IntakePartyRoleLabels,
} from "./partyRoleIntake";
import {
  buildActionAcknowledgementLine,
  buildAgreementIntakeDraft,
  firstMissingMovesForward,
  getAddedValueSnippet,
  getCaptureAcknowledgement,
  getFirstMissingField,
  getGuidedFlowConfig,
  getGuidedProgressRatio,
  getNextQuestion,
  resolveGuidedFlowId,
  type GuidedFieldKey,
} from "./agreementIntakeDraftModel";
import {
  isStructuredDraftUsableForLocalReviewFallback,
  isUsablePartialIntakeStructure,
  meetsMinimalIntakeProgress,
} from "./intakeGuidedHints";
import {
  buildLiveDraftPreview,
  getInlineParsedField,
  isLivePreviewInlineField,
  LIVE_PREVIEW_INLINE_FIELDS,
  applyQuickCheckConfirmationsToLivePreview,
  mergeLivePreviewInlineOverrides,
  pickLiveStructuringHint,
  type LivePreviewInlineField,
} from "./liveDraftHeuristics";
import { upsertLabeledIntakeLine } from "./inlinePreviewIntakeSync";
import { buildLivePreviewSmartSuggestions } from "./livePreviewSmartSuggestions";
import { MAIN_CLAUSE_SUGGESTIONS } from "./intakeMainClauseSuggestions";
import { computeContextAwareSuggestionResult, type ContextRankedSuggestion } from "./intakeContextAutoSuggestions";
import {
  getRecipientHandoffNamesFromDraft,
  parsePartiesFromUserInput,
  sanitizePartiesInput,
  splitTwoPartiesFromJoinedLine,
} from "./partyIntakeNormalize";
import { buildWeCapturedSummaryBullets, buildWhatWeUnderstoodBullets } from "./intakeWhatWeUnderstood";
import { WhatWeUnderstoodBlock } from "./WhatWeUnderstoodBlock";
import { CreateDraftReviewCard } from "./CreateDraftReviewCard";
import {
  STARTER_REVIEW_PREMIUM_BULLETS,
  STARTER_REVIEW_PREMIUM_CTA,
  STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME,
  STARTER_REVIEW_PREMIUM_HEADLINE,
  STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME,
  STARTER_REVIEW_PREMIUM_MICROCOPY,
  STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME,
} from "./starterReviewPremiumUpsellCopy";
import {
  draftHasPlaceholderFieldsForRecipients,
  draftHasPlaceholderParties,
  draftPartyPlaceholdersOkViaLivePreview,
  getDraftFirstReviewBlocker,
  getPrimaryStructuredFixReviewField,
  mergePremiumDraftPartiesWithRecipientPriority,
  pickRecipientNameForHandoff,
  pickRecipientSignerLabelsForHandoff,
} from "./reviewPlaceholderGuard";
import {
  buildPremiumMergedIntakeWithUserNotes,
  extractCleanPremiumParties,
  stripPremiumUserNotesFromMergedIntake,
  type PremiumCompletionResult,
} from "./premiumCompletionPipeline";
import {
  clearOriginalUserIntakeRaw,
  pickLongestPremiumIntakeCorpus,
  readOriginalUserIntakeRaw,
  writeOriginalUserIntakeRawIfRicher,
} from "./originalUserIntakeRawStorage";
import { isLikelyCategoryOrTradeLabel } from "./premiumDraftTransform";
import {
  hydrateEmailFromHandoff,
  hydrateNameFromHandoff,
  persistPremiumRecipientHandoff,
  readPremiumRecipientHandoff,
  writePremiumRecipientHandoffExact,
} from "./premiumPartyNamesHandoff";
import { ensurePremiumCompletion } from "./premiumCompletionEnsure";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import {
  clearPremiumCompletionStateAfterSend,
  clearPremiumCompletionDoneInLocalStorage,
  markPremiumCompletionDoneInLocalStorage,
  markPremiumPostCheckoutRevealDismissed,
  markPremiumRecipientsSurfaceReleased,
  peekPremiumPostCheckoutRevealDismissed,
  peekPremiumRecipientsSurfaceReleased,
  persistPremiumCompletionSnapshot,
  readPremiumCompletionSnapshot,
  stripPremiumCompletionQueryParam,
  type PremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import { type CreateFlowProductionPhase, isCreateFlowPastCapture } from "./createFlowTypes";
import { CreateUiStage, createUiStagePrimaryCta } from "./createUiStage";
import { getCanonicalAgreementTypeForCreate } from "./agreementTypeCanonical";
import {
  buildIntakeClauseSuggestionRowItems,
  chipLabelForRowItem,
  type IntakeClauseSuggestionRowItem,
} from "./clauseSuggestionRowModel";
import { IntakeClauseSuggestionRow } from "./IntakeClauseSuggestionRow";
import {
  buildAgreementStrengthChecklist,
  computeIntakeConfidenceScore,
  computePreSendTrustLayer,
  hasAtLeastTwoParties,
  paymentCompletionMet,
  type PreSendTrustGapKey,
} from "./intakeConfidenceScore";
import { computeIntakeReadiness, type AgreementReadinessLevel } from "../../agreement/agreementReadiness";
import { scopeLooksVague } from "./livePreviewSmartSuggestions";
import { AgreementReadinessCard } from "./AgreementReadinessCard";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import {
  appendPaidFunnelEvent,
  backfillPaidFunnelIntentForSession,
  buildPaidFunnelRowFromPayload,
  loadPaidFunnelEvents,
  PAID_FUNNEL_LINEAR_STEPS,
  type PaidFunnelEventName,
  type PaidFunnelStoredRow,
} from "../../lib/experimentation/paidFunnelLocalStorage";
import {
  finalizePaidFunnelMonotonicIntent,
  resolveBestPaidFunnelIntentId,
} from "../../lib/experimentation/paidFunnelIntentAttribution";
import { getOrCreateLawdogSessionId } from "../../tracking/lawdogSession";
import {
  AGREEMENT_CREATOR_INTAKE_STORAGE_KEY,
  clearAgreementCreatorIntakeStorage,
  clearCreateReviewAgreementResumeId,
  readFullDraftUpgradeMarkerAgreementId,
  writeFullDraftUpgradeMarkerAgreementId,
  readAgreementCreatorIntakeStorage,
  readCreateReviewAgreementResumeId,
  resolveIntakeBootstrap,
  writeAgreementCreatorIntakeStorage,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";
import {
  clearPremiumCollaborateFirstDefaultPrimed,
  clearPremiumForkUserSendMode,
  inferPremiumDefaultSendMode,
  peekPremiumCollaborateFirstDefaultPrimed,
  peekPremiumForkUserSendMode,
  persistPremiumForkUserSendMode,
  primePremiumCollaborateFirstDefault,
} from "./premiumSendForkDefaults";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";
import { PremiumSendNextStepFork } from "./PremiumSendNextStepFork";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  buildPremiumDeliverablePlainTextFromDraft,
  pickPremiumPaidReadonlyPlainText,
  premiumRenderCorpusContainsSignals,
  scorePremiumReadonlyCorpusCandidate,
} from "./premiumReadonlyRenderCorpus";
import { computePremiumDocumentRenderHints } from "./premiumDocumentRenderHints";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import { FinalizeYourAgreementPanel } from "./FinalizeYourAgreementPanel";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";
import { emitPremiumRenderResolveLog, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import {
  bumpAgreementGenerationId,
  getOrInitSessionAgreementGenerationId,
  shortIntakeFingerprint,
} from "../../lib/agreementGenerationId";
import { buildPremiumFullDraftContextWithIntentMapping } from "./premiumFullDraftApi";
import {
  buildPremiumDetailsGateCopy,
  isPaidProFinishedAgreement,
  isUnacceptablePipelineProSource,
  validatePaidProOutput,
  canShowPremiumSuccess,
} from "./paidProCorpusAcceptance";
import { buildStrictTruthGateCheckoutRevision } from "./premiumTruthGateFunnel";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { stripClientPremiumArtifactBlocksFromDraft } from "./premiumFullDraftClientAcceptance";
import { postPremiumMissingFactsWithRetry } from "./premiumMissingFactsApi";
import { gapTraceNeedlesHit } from "./gapTraceNeedles";
import { PremiumFinishAgreementGapsPanel } from "./PremiumFinishAgreementGapsPanel";
import { shouldShowBlockedDraftPreviewLabel, shouldShowRetryNeedsDetailsPanel } from "./premiumTruthGateUi";

/** One-line upgrade proof for post-payment strip; prefers server finalize audit strengths when present. */
function formatPremiumRevealDeltaRow(audit: PremiumFinalizeAudit | null): string {
  const strengths = (audit?.resolved_strengths ?? []).map((s) => s.trim()).filter(Boolean);
  if (strengths.length >= 2) {
    return strengths.slice(0, 3).join(" · ");
  }
  if (strengths.length === 1) {
    return `${strengths[0]} · Clear review & sign path · Commercially complete structure`;
  }
  return "Stronger ownership & payment protections · Clear review & sign path · Commercially complete structure";
}

export {
  AGREEMENT_CREATOR_INTAKE_STORAGE_KEY,
  clearAgreementCreatorIntakeStorage,
  readAgreementCreatorIntakeStorage,
} from "./agreementIntakeStorage";

type Props = {
  /** Called only after POST succeeds, response is normalized, and GET hydrate confirms the agreement shape. */
  onCreated: (
    agreementId: string,
    primedDraft: AgreementDraft,
    handoff?: { premiumSendIntent?: PremiumSendIntent | null; openFlowPhase?: "review" | "send" },
  ) => void;
  /** POST returned an id but follow-up GET / normalize could not produce a workspace-ready draft. */
  onCreateHydrateFailed?: (agreementId: string) => void;
  /** When set, show a compact retry to load a recently created agreement id (e.g.after a failed hydrate). */
  createRetryAgreementId?: string | null;
  onRetryHydrateCreate?: (agreementId: string) => Promise<void>;
  /** Replace default Tailwind shell (e.g. VS01 agreement card). */
  className?: string;
  /** Launch-style layout: minimal copy, no voice promos when off, guided follow-up card. */
  workspaceUi?: boolean;
  /** Create → Send flow: primary label on the main prompt (default: “Create Draft”). */
  simpleProductFlow?: boolean;
  /** Overrides default submit label when `simpleProductFlow` is true. */
  simpleProductFlowSubmitLabel?: string;
  /** Overrides follow-up step primary button when `simpleProductFlow` is true. */
  simpleProductFollowUpSubmitLabel?: string;
  /** Replaces “Working…” / generic busy copy when `simpleProductFlow` is true. */
  simpleProductFlowGeneratingLabel?: string;
  /** Continuity handoff: read-only source shown above the workspace (e.g. quick-send typed intake). */
  continuitySourcePanel?: { label: string; text: string };
  /** When true, hide the tiny footnote (parent shows compliance in-context). */
  hideWorkspaceComplianceFootnote?: boolean;
  /** Seed textarea when resuming / reopening Step 1 prep. */
  initialIntakeText?: string;
  /** Shown above the form when reopening into prep (e.g. partial restore). */
  resumeNotice?: string | null;
  onPrepStateChange?: (state: AgreementCreatorPrepState) => void;
  /** Create flow: split input + live heuristic preview (desktop side-by-side; mobile tabbed). */
  liveWorkspaceTwoPane?: boolean;
  /** Simple product: placeholder on main intake textarea (plain-English guidance). */
  simpleProductTextareaPlaceholder?: string;
  /** Fires on every intake change (e.g. parent analytics). */
  onIntakeTextChange?: (text: string) => void;
  /**
   * Simple `/app/create` fresh start: input-first layout, delayed preview, explicit Start.
   * False for continuity handoff, resume, hero prefill, template scaffold, or wizard resume.
   */
  freshSimpleCreateStart?: boolean;
  /** First completed LawDog agreement in this browser (marketing / first-win UX only). */
  firstLawdogSession?: boolean;
};

type MissingKey =
  | "title"
  | "jurisdiction"
  | "parties"
  | "purpose"
  | "payment_terms"
  | "duration"
  | "effective_date";

const FIELD_QUESTION: Record<MissingKey, string> = {
  title: "What should the agreement title be?",
  jurisdiction: "Which governing law / jurisdiction should apply?",
  parties: "Who are the two parties? (e.g., Acme Inc, John Smith)",
  purpose: "What is the scope of services or purpose?",
  payment_terms: "What are the payment terms?",
  duration: "How long should this agreement last?",
  effective_date: "When does it become effective?",
};

const FIELD_CHIPS: Record<MissingKey, string[]> = {
  title: [],
  jurisdiction: ["Delaware", "New York", "California", "Texas"],
  parties: [],
  purpose: [],
  payment_terms: ["$3,000 flat", "$500 on signing + $2,000 on delivery", "$2,000 monthly"],
  duration: ["30 days", "90 days", "1 year", "until delivery date"],
  effective_date: ["today", "next Monday", "on signing", "2026-03-01"],
};

const DEFAULT_SECTION = "rounded-xl border border-slate-800 bg-slate-950/40 p-4";

/** Typed follow-up: Enter submits only after this idle gap (avoids accidental submit mid-typing). */
const FOLLOW_UP_ENTER_IDLE_MS = 420;

/** Intake UI phases — keep follow-up visually separate from the main prompt step. */
type IntakeDisplayPhase =
  | "intake"
  | "followup_required"
  | "generating_draft"
  | "hydrating_generated"
  | "preparing_review";

function RecipientOutboxPreviewPanel({
  agreementTitle,
  partyA,
  partyB,
}: {
  agreementTitle: string;
  partyA: string;
  partyB: string;
}) {
  return (
    <div className="mb-3 opacity-[0.92]" role="region" aria-label="What recipients will receive">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-[11px]">
        What recipients will receive
      </p>
      <div className="rounded-lg border border-slate-700/45 bg-slate-950/55 px-3 py-2.5 text-left shadow-sm shadow-black/15 sm:px-3.5 sm:py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Email subject</p>
        <p className="mt-0.5 text-sm font-medium text-slate-200/95">Agreement for signature</p>
        <div className="mt-2.5 border-t border-slate-800/50 pt-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Body preview</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400/95 sm:text-[13px]">
            You&apos;ve been invited to sign an agreement (or complete your assigned role).
          </p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-slate-400/90 sm:text-[13px]">
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-500" aria-hidden>
                •
              </span>
              <span>
                Document: <span className="font-medium text-slate-200/95">{agreementTitle}</span>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-500" aria-hidden>
                •
              </span>
              <span>
                Parties:{" "}
                <span className="font-medium text-slate-200/95">
                  {partyA} <span className="font-normal text-slate-500">and</span> {partyB}
                </span>
              </span>
            </li>
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-400/90 sm:text-[13px]">Open securely to sign or respond:</p>
          <div className="mt-1.5">
            <span className="inline-flex items-center justify-center rounded-md border border-slate-600/50 bg-slate-900/50 px-2.5 py-1 text-[11px] font-medium text-slate-300/95">
              View Agreement
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-400/90 sm:text-[13px]">No account required to sign.</p>
        </div>
        <p className="mt-2 border-t border-slate-800/40 pt-2 text-center text-[10px] text-slate-600">Sent via LawDog</p>
      </div>
      <p className="mt-1.5 text-center text-[10px] leading-relaxed text-slate-600 sm:text-[11px]">
        Delivered securely. No account required for recipients.
      </p>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Scroll review workspace toward agreement preview before navigating to checkout. */
function scrollToPremiumPosAnchor(): void {
  window.requestAnimationFrame(() => {
    const el =
      document.getElementById("claw-agreement-preview-editor") ??
      document.getElementById("claw-simple-create-preview");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** Any snake_case token in a message is treated as internal (never show raw). */
function messageContainsSnakeCaseToken(s: string): boolean {
  return /\b[a-z][a-z0-9]*(_[a-z0-9_]+)+\b/i.test(s);
}

const FOLLOWUP_PLACEHOLDER_HELPER =
  "You can answer above, or continue with placeholders for anything still open — your wording stays on the left.";
const INTAKE_ERROR_HYDRATE =
  "Your agreement was created but we couldn’t load it yet. Your wording is still here — use Retry loading below.";
const INTAKE_HARD_SAVE_GENERIC =
  "We couldn’t save your draft just now. Your text is still here — tap Continue again in a moment.";

function isHydrateIntakeErrorRaw(raw: string): boolean {
  const lower = (raw || "").trim().toLowerCase();
  return (
    lower === "hydrate_failed" ||
    lower.includes("hydrate_failed") ||
    (lower.includes("hydrate") && lower.includes("fail"))
  );
}

/** DEV-only: trace which branch handled (or dropped) the simple-create Send CTA. Strip if noisy. */
function devSendCtaTrace(message: string, data?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.debug(`[AgreementIntake:send-cta] ${message}`, data ?? {});
  }
}

function liveTraceHash(text: string): string {
  let h = 2166136261;
  const s = text || "";
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function logPremiumLiveTrace(stage: string, payload: {
  title?: string;
  payment_terms?: string;
  purpose?: string;
  additional_terms?: string;
  party_roles?: string[];
  signature_labels?: string[];
  source_id?: string;
  text?: string;
  premium_render_source?: string;
}): void {
  if (!import.meta.env.DEV) return;
  const text = (payload.text || "").trim();
  const purpose = (payload.purpose || "").trim();
  const additional = (payload.additional_terms || "").trim();
  const labels = Array.from(
    new Set(
      `${purpose}\n${additional}`
        .match(/(?:^|\n)\s*([A-Z][A-Za-z0-9 /&-]{2,48}):/g)
        ?.map((m) => m.replace(/[:\n]/g, "").trim()) || [],
    ),
  ).slice(0, 8);
  const specificityScore = [
    /\bcommission|revenue share|%\b/i,
    /\bdeposit clears|cleared funds|collected receipts\b/i,
    /\bhouse accounts|pre-existing clients|protected accounts\b/i,
    /\bclawback|chargeback|offset\b/i,
    /\bnon-circumvent|anti-bypass|bypass\b/i,
    /\bno-poach|no-hire|non-solicit\b/i,
    /\bcrm|lead data|customer list|ownership\b/i,
  ].reduce((n, re) => (re.test(`${purpose}\n${payload.payment_terms || ""}\n${additional}`) ? n + 1 : n), 0);
  console.info("[premium-live-trace]", {
    stage,
    source_id: payload.source_id ?? "unknown",
    title: (payload.title || "").trim().slice(0, 140),
    payment_terms: (payload.payment_terms || "").trim().slice(0, 220),
    section_labels: labels,
    clause_specificity_score: specificityScore,
    party_roles: payload.party_roles || [],
    signature_labels: payload.signature_labels || [],
    text_hash: liveTraceHash(text),
    chars: text.length,
    ts: new Date().toISOString(),
  });
}

function humanizePrimaryCtaBlockedReason(reason: string | undefined): string {
  switch (reason) {
    case "recipient_email_or_defer":
      return "Add a valid email for recipient 1, or choose “I’ll add recipients later,” then try again.";
    case "agreement_type_not_accepted":
      return "Confirm the agreement type before continuing.";
    case "parties":
      return "Add at least one party on the draft before adding recipients.";
    case "no_draft":
      return "Your draft is still loading — try again in a moment.";
    case "empty_intake":
      return "Add a short description of your agreement first.";
    case "guided_structure_incomplete":
      return "Complete the guided questions before continuing.";
    case "stage_a_short_input":
      return "Add at least six characters describing your agreement.";
    case "stage_a_needs_clearer_request":
      return "Add who is involved and what you want the agreement to cover (for example parties and purpose).";
    case "draft_pre_commit":
    case "generating":
    case "dictation_processing":
    case "generating_draft":
      return "One moment — please wait for the current step to finish.";
    case "complexity_choice_required":
      return "Choose a draft option above before continuing.";
    case "premium_agreement_review_first":
      return "Scan your upgraded agreement, then continue to recipient setup. You still confirm before anything is sent.";
    case "unified_cta_inactive":
      return "This action is not available in the current view.";
    default:
      return "Please complete the required steps before continuing.";
  }
}

/** Copy for true technical failures only (not partial intake). */
function humanizeHardIntakeError(raw: string): string {
  const m = (raw || "").trim();
  if (!m) {
    return INTAKE_HARD_SAVE_GENERIC;
  }
  if (isHydrateIntakeErrorRaw(m)) {
    return INTAKE_ERROR_HYDRATE;
  }
  return INTAKE_HARD_SAVE_GENERIC;
}

/** Prevent parent-supplied busy labels from showing internal tokens in the button / status line. */
function isUnsafeUserFacingBusyLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (messageContainsSnakeCaseToken(t)) return true;
  if (/^(aborted|error|failed|unknown|working)$/i.test(t)) return true;
  return false;
}

function humanizeVoiceErrorMessage(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const l = t.toLowerCase().replace(/\s+/g, "");
  const norm = t.toLowerCase();
  if (l === "aborted" || norm === "aborted" || l.includes("aborted")) {
    return "Recording stopped. You can try the mic again when you're ready.";
  }
  if (l === "no-speech" || norm === "no-speech" || l.includes("no-speech")) {
    return "We didn’t catch speech that time. Try the mic again or keep typing.";
  }
  if (
    l === "not-allowed" ||
    norm === "not-allowed" ||
    l.includes("not-allowed") ||
    norm.includes("permission") ||
    norm.includes("denied") ||
    norm.includes("notallowed")
  ) {
    return "Microphone access is needed to dictate. Check your browser settings and try again.";
  }
  if (l === "audio-capture" || norm === "audio-capture" || l.includes("audio-capture")) {
    return "We couldn’t access the microphone. Check that it’s connected, then try again.";
  }
  if (
    l === "network" ||
    norm === "network" ||
    l.includes("network") ||
    l === "service-not-allowed" ||
    norm.includes("service-not-allowed")
  ) {
    return "We couldn't reach the voice service. Check your connection and try the mic again.";
  }
  if (l === "speech_error" || norm === "speech_error") {
    return "Something went wrong with the microphone. You can try again or keep typing.";
  }
  if (norm.includes("network") || norm.includes("fetch")) {
    return "We couldn't reach the voice service. Check your connection and try the mic again.";
  }
  if (/^[a-z][a-z0-9_-]{2,42}$/i.test(t) && (/[_-]/.test(t) || norm === "aborted")) {
    return "Something went wrong with the microphone. You can try again or keep typing.";
  }
  return t.length > 160 ? "Something went wrong with the microphone. You can try again or keep typing." : t;
}

/** Debounce before running heuristics / preview parse so users can finish sentences without churn. */
const DEBOUNCE_MS = 900;

/** Starter/basic review — clarify that edits do not auto-upgrade to Complete Version. */
const STARTER_SAFE_EDIT_HELPER =
  "Starter edits stay on this draft. Upgrade only when you want stronger terms and tracked signing.";

/** Premium-only “exact wording” path on starter review — never mutates the free draft until checkout completes. */
const PREMIUM_ORIGINAL_WORDING_TITLE = "Lock in your wording — business-ready output";
const PREMIUM_ORIGINAL_WORDING_SUBTEXT =
  "Paste notes, emails, or your own clauses. With LawDog Pro you get cleaner review, stronger commercial terms, and a path to collaborate before sign or send for tracked signature.";
const PREMIUM_ORIGINAL_WORDING_HELPER = "Your starter draft stays untouched until you complete checkout.";
const PREMIUM_ORIGINAL_WORDING_PLACEHOLDER =
  "Paste rough deal notes, emails, messages, or exact language you want included…";
const PREMIUM_ORIGINAL_WORDING_CTA = FUNNEL_CTA_SEND_WITH_PRO;
const PREMIUM_ORIGINAL_WORDING_DETAILS_SUMMARY = "Use your exact wording (LawDog Pro)";

const STARTER_REVIEW_HEADLINE = FUNNEL_FREE_STARTER_HEADLINE;
const STARTER_REVIEW_SUBLINE = FUNNEL_FREE_STARTER_BODY;
const STARTER_CONTINUE_TO_SEND_UPGRADE_NUDGE =
  "Closing soon? Upgrade to send for a calmer review surface, clearer terms, and professional delivery.";

type FullDraftUpgradeIntakeCalloutProps = {
  onUpgrade: () => void | Promise<void>;
};

function FullDraftUpgradeIntakeCallout({ onUpgrade }: FullDraftUpgradeIntakeCalloutProps) {
  return (
    <div
      role="region"
      aria-label={STARTER_REVIEW_PREMIUM_HEADLINE}
      className={`mt-3 p-4 sm:p-5 ${STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME}`}
    >
      <p className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg">{STARTER_REVIEW_PREMIUM_HEADLINE}</p>
      <ul className="mt-3 space-y-2 text-sm leading-snug text-slate-200/95 sm:leading-relaxed">
        {STARTER_REVIEW_PREMIUM_BULLETS.map((b) => (
          <li key={b} className="flex gap-2">
            <span className={STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME} aria-hidden>
              •
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`mt-4 min-h-[2.75rem] w-full px-4 py-2.5 text-center text-sm sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
        onClick={() => void onUpgrade()}
      >
        {STARTER_REVIEW_PREMIUM_CTA}
      </button>
      <p className="mt-2 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">{STARTER_REVIEW_PREMIUM_MICROCOPY}</p>
    </div>
  );
}

/** FSM-aligned primary CTA for the simple-workspace sticky + inline bar (single source of truth). */
type PrimaryCtaAction =
  | "guided_continue"
  | "fix_review"
  | "continue_basic_draft"
  | "continue_to_recipients"
  | "premium_continue_to_signers"
  | "complete_recipient_details"
  | "send_agreement";

type PrimaryCtaState = {
  label: string;
  action: PrimaryCtaAction;
  disabled: boolean;
  /** Machine-oriented context for DEV / disabled-click feedback. */
  reason?: string;
};

type FixReviewResult =
  | { ok: true; target: string }
  | { ok: false; reason: string };

/** Queued action after basic-review party/recipient modal saves (one-shot resume). */
type PartyDetailsModalPendingResume =
  | "continue_basic"
  | "continue_send"
  | "unlock_premium_rewrite"
  | "upgrade_complete_agreement"
  | "premium_original_wording_checkout";

function scrollLikelyReviewSectionIntoView(): void {
  const partySection = document.getElementById("claw-review-parties-section");
  if (partySection) {
    partySection.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const editor = document.getElementById("claw-agreement-preview-editor");
  if (editor) {
    editor.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  document.getElementById("claw-simple-create-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildUpgradeCheckoutCompletionLabel(
  d: { title?: string | null; parties?: readonly { name?: string | null }[] } | null | undefined,
): string {
  if (!d) return "This agreement";
  const t = (d.title || "").trim();
  if (t.length > 0) return t.length > 88 ? `${t.slice(0, 85)}…` : t;
  const names = (d.parties || [])
    .map((p) => (p?.name || "").trim())
    .filter(Boolean);
  if (names.length >= 2) return `${names.slice(0, 2).join(" · ")}${names.length > 2 ? " · …" : ""}`;
  if (names.length === 1) return names[0];
  return "This agreement";
}

type CreateFlowSendRecipientsPanelProps = {
  variant: "staged" | "workspace";
  isPremiumRecipientSurface: boolean;
  showProTierAdvanced: boolean;
  productionReadyForPersist: boolean;
  draft: ParsedDraftShape | null;
  effectivePremiumSendMode: PremiumSendIntent;
  onPremiumSendModePick: (mode: PremiumSendIntent) => void;
  recipient1Name: string;
  setRecipient1Name: React.Dispatch<React.SetStateAction<string>>;
  recipient1Email: string;
  setRecipient1Email: React.Dispatch<React.SetStateAction<string>>;
  recipient2Name: string;
  setRecipient2Name: React.Dispatch<React.SetStateAction<string>>;
  recipient2Email: string;
  setRecipient2Email: React.Dispatch<React.SetStateAction<string>>;
  recipientSignerLabels: string;
  setRecipientSignerLabels: React.Dispatch<React.SetStateAction<string>>;
  reviewHandoffAgreementEcho: string | null | undefined;
  showStarterRecipientsReassurance: boolean;
  editorOpen: boolean;
  setEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onDeferRecipients: () => void;
  hideDeferOption: boolean;
  onSendClick: () => void;
  sendDisabled: boolean;
  /** When true, primary action opens the premium send confirmation modal (no email sent yet). */
  sendRequiresConfirmStep: boolean;
  stripRecipientEmailNoise: (s: string) => string;
  looksLikeEmail: (s: string) => boolean;
};

function CreateFlowSendRecipientsPanel({
  variant,
  isPremiumRecipientSurface,
  showProTierAdvanced,
  productionReadyForPersist,
  draft,
  effectivePremiumSendMode,
  onPremiumSendModePick,
  recipient1Name,
  setRecipient1Name,
  recipient1Email,
  setRecipient1Email,
  recipient2Name,
  setRecipient2Name,
  recipient2Email,
  setRecipient2Email,
  recipientSignerLabels,
  setRecipientSignerLabels,
  reviewHandoffAgreementEcho,
  showStarterRecipientsReassurance,
  editorOpen,
  setEditorOpen,
  onDeferRecipients,
  hideDeferOption,
  onSendClick,
  sendDisabled,
  sendRequiresConfirmStep,
  stripRecipientEmailNoise,
  looksLikeEmail,
}: CreateFlowSendRecipientsPanelProps) {
  const r1e = stripRecipientEmailNoise(recipient1Email);
  const r2e = stripRecipientEmailNoise(recipient2Email);
  const primaryName = (recipient1Name || "").trim() || "Recipient";
  const primaryEmailLine = looksLikeEmail(r1e) ? r1e : "Add an email to send";
  const modeLinkLabel = effectivePremiumSendMode === "review" ? "Review link" : "Signing link";
  const modeExplain =
    effectivePremiumSendMode === "review"
      ? "Recipients read the draft and can suggest changes before anything is finalized."
      : "Recipients read the final terms, then sign when they are ready.";
  const nextStepExplain = sendRequiresConfirmStep
    ? "Next, you will confirm the exact recipients in one step. Nothing is emailed until then."
    : "Nothing is emailed until you confirm below.";
  const primarySendLabel = sendRequiresConfirmStep
    ? "Continue to confirmation"
    : effectivePremiumSendMode === "review"
      ? "Send review link"
      : "Send signing link";

  const senderInviteTrustStrip = (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Trust cues">
      {["Secure link", "You choose when it sends", "Named recipients only"].map((t) => (
        <li
          key={t}
          className="rounded-full border border-slate-600/70 bg-slate-950/40 px-2.5 py-1 text-[10px] font-medium text-slate-300"
        >
          {t}
        </li>
      ))}
    </ul>
  );

  const recipientFields = (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-400 sm:text-sm">
          Recipient 1 name
          <input
            type="text"
            data-claw-recipient-field="r1-name"
            value={recipient1Name}
            onChange={(e) => setRecipient1Name(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
            autoComplete="name"
          />
        </label>
        <label className="block text-xs font-medium text-slate-400 sm:text-sm">
          Recipient 1 email
          <input
            type="email"
            data-claw-recipient-field="r1-email"
            value={recipient1Email}
            onChange={(e) => setRecipient1Email(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
            autoComplete="email"
          />
        </label>
        <label className="block text-xs font-medium text-slate-400 sm:text-sm">
          Recipient 2 name (optional)
          <input
            type="text"
            data-claw-recipient-field="r2-name"
            value={recipient2Name}
            onChange={(e) => setRecipient2Name(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
          />
        </label>
        <label className="block text-xs font-medium text-slate-400 sm:text-sm">
          Recipient 2 email (optional)
          <input
            type="email"
            data-claw-recipient-field="r2-email"
            value={recipient2Email}
            onChange={(e) => setRecipient2Email(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-400 sm:text-sm">
        Optional signer roles / labels
        <input
          type="text"
          value={recipientSignerLabels}
          onChange={(e) => setRecipientSignerLabels(sanitizeStarterSignerLabelsLine(e.target.value))}
          placeholder=""
          className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
        />
      </label>
    </div>
  );

  const advDetailsClass =
    "rounded-xl border border-slate-800/60 bg-slate-950/50 [&_summary::-webkit-details-marker]:hidden";
  const advSummaryClass =
    "cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 marker:hidden hover:bg-slate-900/40";

  return (
    <div
      id={variant === "staged" ? "claw-recipient-setup" : undefined}
      data-claw-recipient-setup
      className="rounded-2xl border border-slate-700/55 bg-gradient-to-b from-slate-950 via-slate-950/98 to-[#0a101f]/95 p-5 pb-28 shadow-xl shadow-black/25 ring-1 ring-emerald-500/[0.06] sm:p-6 sm:pb-6"
      role="region"
      aria-label="Invite recipients"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recipient invite</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">Share this agreement</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-700/45 bg-emerald-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/95">
          {modeLinkLabel}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        {modeExplain} {nextStepExplain}
      </p>
      {senderInviteTrustStrip}
      <div className="mt-5 rounded-xl border border-slate-700/45 bg-slate-900/35 px-4 py-4 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Who receives it</p>
        <p className="mt-2 text-lg font-medium tracking-tight text-slate-100">{primaryName}</p>
        <p className={`mt-1 text-sm ${looksLikeEmail(r1e) ? "text-slate-300" : "text-amber-200/90"}`}>{primaryEmailLine}</p>
        {looksLikeEmail(r2e) ? (
          <p className="mt-3 text-xs text-slate-500">
            Also sends to{" "}
            <span className="font-medium text-slate-300">
              {(recipient2Name || "").trim() || "Second recipient"}
            </span>{" "}
            <span className="text-slate-400">· {r2e}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-6 hidden sm:block">
        <button
          type="button"
          className="w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3.5 text-center text-base font-semibold text-slate-950 shadow-[0_8px_28px_rgba(16,185,129,0.22)] transition hover:from-emerald-300 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          disabled={sendDisabled}
          onClick={onSendClick}
        >
          {primarySendLabel}
        </button>
      </div>
      <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 sm:text-sm">
        Nothing is emailed or finalized until you confirm{sendRequiresConfirmStep ? " on the next screen" : ""}.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="text-sm font-medium text-emerald-300/95 underline decoration-emerald-500/40 underline-offset-4 hover:text-emerald-200"
          onClick={() => setEditorOpen((o) => !o)}
        >
          {editorOpen ? "Hide recipient fields" : "Edit recipients"}
        </button>
      </div>
      {editorOpen ? recipientFields : null}
      {reviewHandoffAgreementEcho ? (
        <p className="mt-4 rounded-lg border border-slate-700/50 bg-slate-900/55 px-3 py-2 text-[11px] leading-snug text-slate-300 sm:text-xs">
          {reviewHandoffAgreementEcho}
        </p>
      ) : null}
      {showStarterRecipientsReassurance && !isPremiumRecipientSurface ? (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500 sm:text-xs">
          You can send this starter draft now, or upgrade anytime for stronger terms and tracked e-signing.
        </p>
      ) : null}
      <details className={`${advDetailsClass} mt-5`}>
        <summary className={advSummaryClass}>
          <span className="flex items-center justify-between gap-2">
            <span>Advanced options</span>
            <span className="text-xs font-normal text-slate-500">Optional</span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-slate-800/50 px-2 pb-4 pt-3 sm:px-3">
          {(isPremiumRecipientSurface || showProTierAdvanced) && productionReadyForPersist && draft ? (
            <details className={advDetailsClass}>
              <summary className={advSummaryClass}>Signature delivery settings</summary>
              <div className="border-t border-slate-800/50 px-3 pb-4 pt-2">
                <PremiumSendNextStepFork compact={false} selected={effectivePremiumSendMode} onPick={onPremiumSendModePick} />
              </div>
            </details>
          ) : !(isPremiumRecipientSurface || showProTierAdvanced) ? (
            <p className="px-3 py-2 text-xs leading-relaxed text-slate-500">
              Tracked signature and delivery details are included when you send — no extra setup required here.
            </p>
          ) : null}
          {(isPremiumRecipientSurface || showProTierAdvanced) && draft ? (
            <details className={advDetailsClass}>
              <summary className={advSummaryClass}>Shared draft &amp; email preview</summary>
              <div className="border-t border-slate-800/50 px-2 pb-3 pt-2">
                <RecipientOutboxPreviewPanel
                  agreementTitle={(draft.title || "").trim() || "Your agreement"}
                  partyA={(draft.parties?.[0]?.name || "").trim() || "Party A"}
                  partyB={(draft.parties?.[1]?.name || "").trim() || "Party B"}
                />
              </div>
            </details>
          ) : null}
          {(isPremiumRecipientSurface || showProTierAdvanced) && (
            <details className={advDetailsClass}>
              <summary className={advSummaryClass}>Additional signer routing &amp; FYI copy</summary>
              <div className="border-t border-slate-800/50 px-3 pb-3 pt-2 text-xs leading-relaxed text-slate-400">
                <p>
                  Second recipient and signer labels control routing and how names appear on the signing path. Edit
                  fields above or expand <span className="font-medium text-slate-300">Edit recipients</span>.
                </p>
                <p className="mt-2 text-slate-500">
                  FYI-only copies use your tools after send — keep this step focused on who signs first.
                </p>
              </div>
            </details>
          )}
          <details className={advDetailsClass}>
            <summary className={advSummaryClass}>Attach payment requests</summary>
            <div className="border-t border-slate-800/50 px-3 pb-3 pt-2 text-xs leading-relaxed text-slate-500">
              Payment requests are attached from your agreement after this send step — LawDog keeps payment separate
              from the calm send moment here.
            </div>
          </details>
        </div>
      </details>
      {!hideDeferOption ? (
        <button
          type="button"
          className="mt-4 w-full text-center text-[11px] font-medium text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400 sm:text-xs"
          onClick={onDeferRecipients}
        >
          I&apos;ll add recipients later
        </button>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-[85] border-t border-slate-800/90 bg-slate-950/95 p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur sm:hidden">
        <button
          type="button"
          className="w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3.5 text-center text-base font-semibold text-slate-950 shadow-[0_8px_28px_rgba(16,185,129,0.22)] transition hover:from-emerald-300 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
          disabled={sendDisabled}
          onClick={onSendClick}
        >
          {primarySendLabel}
        </button>
      </div>
    </div>
  );
}

const CLAW_PREMIUM_PREPARING_AGREEMENT_COPY = "Preparing your LawDog Pro agreement…";

/** First paint: enter Pro return processing before effects so the free intake shell does not flash. */
function readInitialPremiumReturnFromWindow(): {
  phase: null | "awaiting_gaps" | "processing";
  pipelineMessage: string | null;
} {
  if (typeof window === "undefined") return { phase: null, pipelineMessage: null };
  try {
    if (readPremiumCompletionSnapshot()) return { phase: null, pipelineMessage: null };
    const u = new URL(window.location.href);
    const urlReturn = u.searchParams.get("premiumCompletion") === "1";
    const grantPending = peekAdvancedFullDraftCheckoutGrant() && Boolean(readCreateComplexityResume()?.awaitingProCheckout);
    if (urlReturn || grantPending) {
      return { phase: "processing", pipelineMessage: CLAW_PREMIUM_PREPARING_AGREEMENT_COPY };
    }
  } catch {
    return { phase: null, pipelineMessage: null };
  }
  return { phase: null, pipelineMessage: null };
}

const AgreementBuilderIntake: React.FC<Props> = ({
  onCreated,
  onCreateHydrateFailed,
  createRetryAgreementId,
  onRetryHydrateCreate,
  className,
  workspaceUi = false,
  simpleProductFlow = false,
  simpleProductFlowSubmitLabel = "Create Draft",
  simpleProductFollowUpSubmitLabel = "Continue",
  simpleProductFlowGeneratingLabel,
  continuitySourcePanel,
  hideWorkspaceComplianceFootnote = false,
  initialIntakeText,
  resumeNotice,
  onPrepStateChange,
  liveWorkspaceTwoPane = false,
  simpleProductTextareaPlaceholder,
  onIntakeTextChange,
  freshSimpleCreateStart = false,
  firstLawdogSession = false,
}) => {
  const [intakeBaselineCommitted, setIntakeBaselineCommitted] = useState("");
  const [intakeStepBuffer, setIntakeStepBuffer] = useState(() =>
    resolveIntakeBootstrap(initialIntakeText, readAgreementCreatorIntakeStorage()),
  );
  const [debouncedStepBuffer, setDebouncedStepBuffer] = useState(() =>
    resolveIntakeBootstrap(initialIntakeText, readAgreementCreatorIntakeStorage()),
  );
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [showParseUpdatedLabel, setShowParseUpdatedLabel] = useState(false);
  const [previewFadeIn, setPreviewFadeIn] = useState(true);
  const previewFadeFirstDigestRef = useRef(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const parseUpdatedClearRef = useRef<number>(0);
  const debounceFlushTimerRef = useRef<number>(0);
  const intakeStepBufferRef = useRef(intakeStepBuffer);
  intakeStepBufferRef.current = intakeStepBuffer;
  const debouncedStepBufferRef = useRef(debouncedStepBuffer);
  debouncedStepBufferRef.current = debouncedStepBuffer;
  const [baselineActionAck, setBaselineActionAck] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hardError, setHardError] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingKey[]>([]);
  const [missingAnswer, setMissingAnswer] = useState("");
  const [draft, setDraft] = useState<ParsedDraftShape | null>(null);
  const [displayPhase, setDisplayPhase] = useState<IntakeDisplayPhase>("intake");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const finalTranscriptRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const intakeReadinessShownOnceRef = useRef(false);
  const intakeReadinessPrevLevelRef = useRef<AgreementReadinessLevel | null>(null);
  const [mobileWorkspacePane, setMobileWorkspacePane] = useState<"edit" | "preview">("edit");
  const [followUpDetailTotal, setFollowUpDetailTotal] = useState(0);
  const [intakeDictationPhase, setIntakeDictationPhase] = useState<HeroDictationPhase>("idle");
  const dictationControlRef = useRef<VoiceDictationControl | null>(null);
  const followUpDictationControlRef = useRef<VoiceDictationControl | null>(null);
  const productionResumeHydratedRef = useRef(false);
  const [followUpEnterReady, setFollowUpEnterReady] = useState(false);
  const [intakeAckLine, setIntakeAckLine] = useState<string | null>(null);
  const [scopeGuessConfirmed, setScopeGuessConfirmed] = useState(false);
  const [partiesGuessConfirmed, setPartiesGuessConfirmed] = useState(false);
  const [termGuessConfirmed, setTermGuessConfirmed] = useState(false);
  const prevFirstMissingRef = useRef<GuidedFieldKey | "bootstrap" | null | "unset">("unset");
  const funnelStartedAtRef = useRef<number>(Date.now());
  const funnelEventTsRef = useRef<Record<string, number>>({});
  const funnelMaxStepRef = useRef(0);
  const funnelGeneratedRef = useRef(false);
  const firstInputTrackedRef = useRef(false);
  const readyReachedRef = useRef(false);

  const useGuidedSplitIntake = Boolean(
    simpleProductFlow && liveWorkspaceTwoPane && !continuitySourcePanel,
  );
  /** Production create: explicit capture → draft → review → recipients → send (no collapsed CTAs). */
  const createProductionTwoPane = Boolean(
    simpleProductFlow && liveWorkspaceTwoPane && !continuitySourcePanel,
  );
  /** Fresh simple create: input-first layout, explicit Start, preview only after first guided field advances. */
  const freshSimpleCreateUx = Boolean(
    simpleProductFlow && liveWorkspaceTwoPane && !continuitySourcePanel && freshSimpleCreateStart,
  );
  /** First simple create session: trim review chrome to preview + one continue CTA. */
  const streamlineFirstRunReviewUi = Boolean(freshSimpleCreateUx && firstLawdogSession);
  /** Alias: staged production create (simple two-pane path — no legacy follow-up field stack). */
  const simpleInstantProductionSurface = createProductionTwoPane;
  /** Simple product funnel: `.vs01-shell` is the sole horizontal gate — never stack a 56rem “page rail” here (input, complexity gate, draft/review, continuity handoff all share this wrapper). */
  const simpleCreateWorkspaceOuterMaxClass =
    simpleProductFlow && liveWorkspaceTwoPane ? "max-w-none" : "max-w-[min(100%,56rem)]";
  const [previewPaneRevealed, setPreviewPaneRevealed] = useState(false);
  const [dictationStartNonce, setDictationStartNonce] = useState(0);
  const [voiceEntryHintVisible, setVoiceEntryHintVisible] = useState(false);
  /** Ready + 1200ms idle — emphasize action bar, analytics, preview de-emphasis */
  const [readyIdleForAction, setReadyIdleForAction] = useState(false);
  /** User committed “Draft now” (button or voice) — lock intake, celebrate preview, then allow Send. */
  const [draftNowCommitted, setDraftNowCommitted] = useState(false);
  const [createFlowPhase, setCreateFlowPhase] = useState<CreateFlowProductionPhase>("capturing_input");
  /** Production create: exactly one full-screen step mounts at a time (INPUT | DRAFT | RECIPIENTS). */
  const [createUiStage, setCreateUiStage] = useState<CreateUiStage>(CreateUiStage.INPUT);
  const createStageScrollRef = useRef<HTMLDivElement | null>(null);
  /** Persisted agreement id for create-flow review (update-field); reused on send to avoid duplicate drafts. */
  const [reviewAgreementId, setReviewAgreementId] = useState<string | null>(null);
  const reviewAgreementIdRef = useRef<string | null>(null);
  /** Bumped when leaving review/create so in-flight POST /draft cannot repopulate a cleared workspace id. */
  const reviewWorkspaceSessionRef = useRef(0);
  const reviewAgreementEnsurePromiseRef = useRef<Promise<string | null> | null>(null);
  const reviewWorkspaceBootstrapDepthRef = useRef(0);
  const [reviewWorkspaceBootstrapping, setReviewWorkspaceBootstrapping] = useState(false);
  /** Bumps when user hits “Continue” with placeholder parties so the review card can pulse the parties row. */
  const [reviewPartyHighlightNonce, setReviewPartyHighlightNonce] = useState(0);
  /** Local buffer for premium-only “exact wording” on starter — does not sync into intakeCombined / free draft. */
  const [premiumOriginalWordingBuffer, setPremiumOriginalWordingBuffer] = useState("");
  const premiumOriginalWordingDictationRef = useRef<VoiceDictationControl | null>(null);
  /** Primary agreement document editor (production review); mirrors preview text, syncs heuristics to structured draft. */
  const agreementPreviewEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [agreementDocumentText, setAgreementDocumentText] = useState("");
  const agreementDocumentDirtyRef = useRef(false);
  const agreementDocumentTextRef = useRef("");
  const wasPremiumPaidDocumentSurfaceRef = useRef(false);
  const premiumPipelineOutputBodyRef = useRef("");
  const lastPremiumPipelineRenderSourceRef = useRef<string | null>(null);
  const [premiumTruthPipelineSource, setPremiumTruthPipelineSource] = useState<string | null>(null);
  const [proFullDraftQualityRetry, setProFullDraftQualityRetry] = useState(false);
  const [proFullDraftCustomGateMessage, setProFullDraftCustomGateMessage] = useState<string | null>(null);
  /** Set when the server returned 200 with an explicit Pro model fallback (payment still valid). */
  const [premiumServerGenerationDegraded, setPremiumServerGenerationDegraded] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const hydratedPremiumBodyRef = useRef("");
  const agreementDocSyncTimerRef = useRef(0);
  const [reviewDocRefreshTick, setReviewDocRefreshTick] = useState(0);
  /** Parsed draft held until user picks simplified vs. Pro for advanced instrument intakes. */
  const [complexityPendingParsed, setComplexityPendingParsed] = useState<ParsedDraftShape | null>(null);
  const complexityPendingParsedRef = useRef<ParsedDraftShape | null>(null);
  const complexityResumeHydratedRef = useRef(false);
  const [advancedFullDraftPaywallOpen, setAdvancedFullDraftPaywallOpen] = useState(false);
  /** User opened the full-draft paywall or hit a change that requires full draft while still on basic — blocks silent reversion. */
  const [upgradeIntentDetected, setUpgradeIntentDetected] = useState(false);
  /** Extra wording / clause request to merge into full-draft generation after checkout. */
  const [pendingUpgradePrompt, setPendingUpgradePrompt] = useState("");
  const pendingUpgradePromptRef = useRef("");
  const upgradeIntentDetectedRef = useRef(false);
  const upgradeLockActiveRef = useRef(false);
  /** One-time inline banner after optional full-draft upgrade (not persisted across refresh). */
  const [fullDraftUpgradeBannerVisible, setFullDraftUpgradeBannerVisible] = useState(false);
  const [recipientPartyDetailsModalOpen, setRecipientPartyDetailsModalOpen] = useState(false);
  const [modalParty1Name, setModalParty1Name] = useState("");
  const [modalParty2Name, setModalParty2Name] = useState("");
  const modalParty1NameRef = useRef("");
  const modalParty2NameRef = useRef("");
  const [modalParty1Email, setModalParty1Email] = useState("");
  const [modalParty2Email, setModalParty2Email] = useState("");
  const [modalParty1Role, setModalParty1Role] = useState("");
  const [modalParty2Role, setModalParty2Role] = useState("");
  const fullDraftUpgradeBannerTimerRef = useRef(0);
  const optionalFullUpgradeInFlightRef = useRef(false);
  const premiumCheckoutRunGenRef = useRef(0);
  const draftSnapshotRef = useRef<ParsedDraftShape | null>(null);
  /** User chose simplified path on an advanced-family gate — show a subtle review label. */
  const [reviewShowsSimplifiedAdvancedDraft, setReviewShowsSimplifiedAdvancedDraft] = useState(false);
  const { tier, refreshUsage } = useAccess();
  const { navigate } = useLaunchNav();
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  useEffect(() => {
    if (!simpleProductFlow) return;
    let cancelled = false;
    void fetchWorkspaceProEntitlement().then((ok) => {
      if (!cancelled) setWorkspaceProEntitled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [simpleProductFlow]);
  const suppressIntakePremiumUpsell = workspaceProEntitled;
  const [recipient1Name, setRecipient1Name] = useState("");
  const [recipient1Email, setRecipient1Email] = useState("");
  const [recipient2Name, setRecipient2Name] = useState("");
  const [recipient2Email, setRecipient2Email] = useState("");
  const [recipientSignerLabels, setRecipientSignerLabels] = useState("");
  const recipient1NameRef = useRef("");
  const recipient2NameRef = useRef("");
  const recipient1EmailRef = useRef("");
  const recipient2EmailRef = useRef("");
  const recipientSignerLabelsRef = useRef("");
  const [recipientsDeferred, setRecipientsDeferred] = useState(false);
  const [agreementTypeAccepted, setAgreementTypeAccepted] = useState(false);
  /** Post-checkout: optional gap form → processing → reveal before recipients. */
  const [premiumPostCheckoutPhase, setPremiumPostCheckoutPhase] = useState<null | "awaiting_gaps" | "processing">(
    () => readInitialPremiumReturnFromWindow().phase,
  );
  const [premiumGapQuestions, setPremiumGapQuestions] = useState<string[]>([]);
  const [premiumGapOneField, setPremiumGapOneField] = useState("");
  const runPremiumModelPassRef = useRef<
    | ((
        args: { intakeText: string; userGapAnswers: string | null; gapResolverSkippedWithDefaults: boolean },
      ) => Promise<void>)
    | null
  >(null);
  const premiumLastGapAnswersRef = useRef<string>("");
  const premiumGapBaseIntakeRef = useRef<string>("");
  const premiumModalEscapeHandlerRef = useRef<null | (() => void)>(null);
  const premiumModalPrevPhaseRef = useRef<null | "awaiting_gaps" | "processing">(null);
  /** After premium completion, relax draft-stage party friction (Party A/B fallback, etc.). */
  const [premiumSendPathUnlocked, setPremiumSendPathUnlocked] = useState(false);
  /** Premium path: copy + checklist tuned for “add recipients → send”. */
  const [premiumRecipientUxActive, setPremiumRecipientUxActive] = useState(false);
  /** Snapshot / completed premium: suppress starter paywall and “fix draft” friction. */
  const [premiumPersistedFlowActive, setPremiumPersistedFlowActive] = useState(false);
  /** Bumps when sessionStorage premium recipient gate changes so memos re-read peek helpers. */
  const [premiumSurfaceGateTick, setPremiumSurfaceGateTick] = useState(0);
  const bumpPremiumSurfaceGateTick = React.useCallback(() => setPremiumSurfaceGateTick((n) => n + 1), []);
  /** Post–full-draft light review (POST /api/agreements/premium-review). */
  const [premiumRefineReview, setPremiumRefineReview] = useState<PremiumAgreementReview | null>(null);
  const [premiumFinalizeAudit, setPremiumFinalizeAudit] = useState<PremiumFinalizeAudit | null>(null);
  const [premiumReviewRoute, setPremiumReviewRoute] = useState<PremiumReviewRoute | null>(null);
  const [finalizeRoutePrimaryActionNonce, setFinalizeRoutePrimaryActionNonce] = useState(0);
  /** Recipient / send-for-signature chrome only after explicit “continue to signers” (post-payment review-first). */
  const premiumSignersSurfaceReady = useMemo(
    () =>
      Boolean(
        premiumRecipientUxActive ||
          (premiumPersistedFlowActive && peekPremiumRecipientsSurfaceReleased()),
      ),
    [premiumRecipientUxActive, premiumPersistedFlowActive, premiumSurfaceGateTick],
  );
  /** Matches `send_agreement` branch: premium two-pane recipients step opens confirm modal instead of sending immediately. */
  const premiumSendConfirmGateActive = useMemo(
    () =>
      Boolean(
        createProductionTwoPane &&
          createUiStage === CreateUiStage.RECIPIENTS &&
          premiumSignersSurfaceReady,
      ),
    [createProductionTwoPane, createUiStage, premiumSignersSurfaceReady],
  );
  /** Keep intent/lock refs aligned with state for same-tick handlers (e.g. clear lock then continue). */
  const syncUpgradeIntentRefs = React.useCallback((intent: boolean) => {
    upgradeIntentDetectedRef.current = intent;
    const fullDraftEntitled =
      tierAllowsAdvancedFullDraftReveal(tier) ||
      draftHasFullDraftExpansion(draft) ||
      premiumSendPathUnlocked ||
      premiumPersistedFlowActive;
    upgradeLockActiveRef.current = intent && !fullDraftEntitled;
  }, [tier, draft, premiumSendPathUnlocked, premiumPersistedFlowActive]);

  /** Includes session premium flags — AccessContext tier does not yet reflect stub checkout. */
  const hasFullDraftAccess = useMemo(
    () =>
      Boolean(
        tierAllowsAdvancedFullDraftReveal(tier) ||
          draftHasFullDraftExpansion(draft) ||
          premiumSendPathUnlocked ||
          premiumPersistedFlowActive,
      ),
    [tier, draft, premiumSendPathUnlocked, premiumPersistedFlowActive],
  );

  const buildPreviewForCurrentTier = React.useCallback(
    (d: ParsedDraftShape) => {
      const starterPreview = !(
        tierAllowsAdvancedFullDraftReveal(tier) ||
        draftHasFullDraftExpansion(d) ||
        premiumSendPathUnlocked ||
        premiumPersistedFlowActive
      );
      return buildAgreementPreviewText(d, {
        starterPreview,
        premiumDeliverablePreview: !starterPreview,
        intakeText: debouncedStepBuffer,
      });
    },
    [tier, premiumSendPathUnlocked, premiumPersistedFlowActive, debouncedStepBuffer],
  );

  const renderedAgreementPreview = useMemo(
    () => (draft ? buildPreviewForCurrentTier(draft) : ""),
    [draft, buildPreviewForCurrentTier],
  );

  const [premiumPipelineUserMessage, setPremiumPipelineUserMessage] = useState<string | null>(() => {
    return readInitialPremiumReturnFromWindow().pipelineMessage;
  });
  useEffect(() => {
    const prev = premiumModalPrevPhaseRef.current;
    if (premiumPostCheckoutPhase && prev !== premiumPostCheckoutPhase) {
      if (premiumPostCheckoutPhase === "processing") {
        console.info("[premium-modal-enter]", { phase: premiumPostCheckoutPhase, ts: new Date().toISOString() });
      }
      console.info("[premium-modal-stage]", { from: prev, to: premiumPostCheckoutPhase, ts: new Date().toISOString() });
    }
    if (!premiumPostCheckoutPhase && prev) {
      console.info("[premium-modal-exit]", { from: prev, ts: new Date().toISOString() });
    }
    premiumModalPrevPhaseRef.current = premiumPostCheckoutPhase;
  }, [premiumPostCheckoutPhase]);
  const [premiumSendConfirmOpen, setPremiumSendConfirmOpen] = useState(false);
  const [premiumSendCcSelf, setPremiumSendCcSelf] = useState(false);
  /** Premium paid review: default read-only HTML document; toggle opens legacy textarea editor. */
  const [premiumReviewDocEditorOpen, setPremiumReviewDocEditorOpen] = useState(false);
  const [premiumSendModeUserChoice, setPremiumSendModeUserChoice] = useState<PremiumSendIntent | null>(() =>
    peekPremiumForkUserSendMode(),
  );
  const [premiumSendModeTouched, setPremiumSendModeTouched] = useState(() => Boolean(peekPremiumForkUserSendMode()));
  /** Bumps when premium completion primes sessionStorage collaborate-default (re-runs fork default inference). */
  const [premiumForkPrimedNonce, setPremiumForkPrimedNonce] = useState(0);
  /** Premium-style production send: success replaces bottom CTA (no full-screen ceremony). */
  const [productionSendBarPhase, setProductionSendBarPhase] = useState<"idle" | "sent">("idle");
  const [productionSendBarAgreementId, setProductionSendBarAgreementId] = useState<string | null>(null);
  /** Calm send step: collapsible recipient grid; auto-open once when primary contact incomplete. */
  const [createFlowSendRecipientEditorOpen, setCreateFlowSendRecipientEditorOpen] = useState(false);
  const createFlowSendEditorPrimedRef = useRef(false);
  const premiumRecipientUxActiveRef = useRef(false);
  const premiumSendAnotherSkipOnCreatedRef = useRef(false);
  const productionSendInFlightRef = useRef(false);
  /** Brief input freeze before commit so “draft now” / Continue feels like a handoff, not an instant form flip. */
  const [draftPreCommitFreeze, setDraftPreCommitFreeze] = useState(false);
  const draftPreCommitTimerRef = useRef(0);
  /** When heuristics miss a preview line, keep showing the user’s exact wording until parse catches up. */
  const [previewFieldOverrides, setPreviewFieldOverrides] = useState<Partial<Record<LivePreviewInlineField, string>>>({});
  const [usedSmartSuggestionIds, setUsedSmartSuggestionIds] = useState(() => new Set<string>());
  const [usedMainClauseSuggestionIds, setUsedMainClauseSuggestionIds] = useState(() => new Set<string>());
  const [usedContextSuggestionIds, setUsedContextSuggestionIds] = useState(() => new Set<string>());
  const [intakeClauseAddedToast, setIntakeClauseAddedToast] = useState<string | null>(null);
  const intakeClauseToastTimerRef = useRef<number | null>(null);
  const [intakePartyRoleLabels, setIntakePartyRoleLabels] = useState<IntakePartyRoleLabels>(() => defaultIntakePartyRoleLabels());
  useLayoutEffect(() => {
    draftSnapshotRef.current = draft;
  }, [draft]);
  useLayoutEffect(() => {
    recipient1NameRef.current = recipient1Name;
  }, [recipient1Name]);
  useLayoutEffect(() => {
    recipient2NameRef.current = recipient2Name;
  }, [recipient2Name]);
  useLayoutEffect(() => {
    recipient1EmailRef.current = recipient1Email;
  }, [recipient1Email]);
  useLayoutEffect(() => {
    recipient2EmailRef.current = recipient2Email;
  }, [recipient2Email]);
  useLayoutEffect(() => {
    recipientSignerLabelsRef.current = recipientSignerLabels;
  }, [recipientSignerLabels]);
  useLayoutEffect(() => {
    modalParty1NameRef.current = modalParty1Name;
  }, [modalParty1Name]);
  useLayoutEffect(() => {
    modalParty2NameRef.current = modalParty2Name;
  }, [modalParty2Name]);
  useLayoutEffect(() => {
    premiumRecipientUxActiveRef.current = premiumRecipientUxActive || premiumPersistedFlowActive;
  }, [premiumRecipientUxActive, premiumPersistedFlowActive]);

  const prevCreateUiStageForPremiumForkRef = useRef(createUiStage);
  useEffect(() => {
    const prev = prevCreateUiStageForPremiumForkRef.current;
    prevCreateUiStageForPremiumForkRef.current = createUiStage;
    if (prev === CreateUiStage.RECIPIENTS && createUiStage !== CreateUiStage.RECIPIENTS) {
      setPremiumSendConfirmOpen(false);
      setPremiumSendModeUserChoice(null);
      setPremiumSendModeTouched(false);
      clearPremiumForkUserSendMode();
      setCreateFlowSendRecipientEditorOpen(false);
      createFlowSendEditorPrimedRef.current = false;
    }
  }, [createUiStage]);

  useEffect(() => {
    if (premiumSendConfirmOpen) setPremiumSendCcSelf(false);
  }, [premiumSendConfirmOpen]);

  useEffect(() => {
    if (!premiumSendConfirmOpen) return;
    const ho = readPremiumRecipientHandoff();
    if (!ho) return;
    setRecipient1Name((p) => hydrateNameFromHandoff(p, ho.party1.name));
    setRecipient2Name((p) => hydrateNameFromHandoff(p, ho.party2.name));
    setRecipient1Email((p) => hydrateEmailFromHandoff(p, ho.party1.email));
    setRecipient2Email((p) => hydrateEmailFromHandoff(p, ho.party2.email));
  }, [premiumSendConfirmOpen]);

  useLayoutEffect(() => {
    if (createUiStage !== CreateUiStage.RECIPIENTS) return;
    if (!createProductionTwoPane) return;
    if (!(premiumRecipientUxActive || premiumPersistedFlowActive || premiumSendPathUnlocked)) return;
    const ho = readPremiumRecipientHandoff();
    if (!ho) return;
    setRecipient1Name((p) => hydrateNameFromHandoff(p, ho.party1.name));
    setRecipient2Name((p) => hydrateNameFromHandoff(p, ho.party2.name));
    setRecipient1Email((p) => hydrateEmailFromHandoff(p, ho.party1.email));
    setRecipient2Email((p) => hydrateEmailFromHandoff(p, ho.party2.email));
  }, [
    createUiStage,
    createProductionTwoPane,
    premiumRecipientUxActive,
    premiumPersistedFlowActive,
    premiumSendPathUnlocked,
  ]);

  useEffect(() => {
    if (createUiStage !== CreateUiStage.RECIPIENTS) {
      setProductionSendBarPhase("idle");
      setProductionSendBarAgreementId(null);
    }
  }, [createUiStage]);
  const draftVoiceHandledRef = useRef(false);
  const simpleCreateActionBarRef = useRef<HTMLDivElement | null>(null);
  const fullDraftUpgradeReviewCardRef = useRef<HTMLDivElement | null>(null);
  /** Avoid repeated auto-scroll to the optional upgrade compare card (feels like a loop). */
  const basicUpgradeCompareScrolledForKeyRef = useRef<string>("");
  const upgradeRequiredBlockRef = useRef<HTMLDivElement | null>(null);
  /** Synced after `showUpgradeToFullDraftOnReview` is computed (callbacks above that memo use this ref). */
  const showUpgradeToFullDraftOnReviewRef = useRef(false);
  /** After “Add party names” modal, resume the CTA the user originally wanted (send / premium / upgrade). */
  const partyDetailsModalPendingResumeRef = useRef<PartyDetailsModalPendingResume | null>(null);
  const editOriginalWordingDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const actionModeEnteredLoggedRef = useRef(false);
  /** Stage-A only applies on INPUT — never on DRAFT/RECIPIENTS (prevents unified CTA using stage-A heuristics after a draft exists). */
  const stageAInputFirst =
    freshSimpleCreateUx && createUiStage === CreateUiStage.INPUT && !intakeBaselineCommitted.trim();
  const showSplitPreview = !freshSimpleCreateUx || previewPaneRevealed;
  /** Fresh-simple UX can keep the preview pane collapsed until reveal; production must still mount the preview column once past INPUT, while generating, or whenever a parsed draft exists (e.g. missing-field revisit) so DRAFT + draft never loses the review card to a null sibling. */
  const showWorkspacePreview = Boolean(
    showSplitPreview ||
      (createProductionTwoPane &&
        (createUiStage !== CreateUiStage.INPUT ||
          createFlowPhase === "generating_draft" ||
          createFlowPhase === "complexity_choice_required" ||
          Boolean(complexityPendingParsed) ||
          Boolean(draft) ||
          Boolean(reviewAgreementId?.trim()) ||
          reviewWorkspaceBootstrapping)),
  );
  /** Production DRAFT review canvas: includes generating_draft so the same layout shows a skeleton instead of a separate “loading” screen. */
  const productionDraftPrimaryReviewSurface = Boolean(
    createProductionTwoPane &&
      createUiStage === CreateUiStage.DRAFT &&
      (draft !== null ||
        createFlowPhase === "generating_draft" ||
        reviewWorkspaceBootstrapping ||
        Boolean(reviewAgreementId?.trim())),
  );
  /** When the user edits the full agreement preview, persist that blob into `purpose` on POST/PATCH so the server can render it as the primary body (see backend `_purpose_looks_like_full_client_agreement_text`). */
  const mergeParsedForApiPersist = React.useCallback(
    (parsedIn: ParsedDraftShape): ParsedDraftShape => {
      if (!productionDraftPrimaryReviewSurface) return parsedIn;
      if (!agreementDocumentDirtyRef.current) return parsedIn;
      const doc = agreementDocumentTextRef.current.trim();
      if (!doc) return parsedIn;
      try {
        const starterPreview = !(
          tierAllowsAdvancedFullDraftReveal(tier) ||
          draftHasFullDraftExpansion(parsedIn) ||
          premiumSendPathUnlocked ||
          premiumPersistedFlowActive
        );
        if (
          doc ===
          buildAgreementPreviewText(parsedIn, {
            starterPreview,
            premiumDeliverablePreview: !starterPreview,
            intakeText: debouncedStepBuffer,
          }).trim()
        )
          return parsedIn;
      } catch {
        return parsedIn;
      }
      return { ...parsedIn, purpose: doc };
    },
    [productionDraftPrimaryReviewSurface, tier, premiumSendPathUnlocked, premiumPersistedFlowActive, debouncedStepBuffer],
  );
  /** Inline wording edit on the review surface; full legacy intake chrome stays gated by `showLegacyIntakeShell`. */
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const hasReviewState = Boolean(
    draft ||
      createUiStage === CreateUiStage.DRAFT ||
      createUiStage === CreateUiStage.RECIPIENTS ||
      (createProductionTwoPane && createFlowPhase === "generating_draft") ||
      (createProductionTwoPane && createFlowPhase === "complexity_choice_required"),
  );

  const trackFunnelEvent = React.useCallback(
    (
      name:
        | "landing_view"
        | "starter_selected"
        | "first_input"
        | "step_completed"
        | "ready_state_reached"
        | "generate_clicked"
        | "agreement_generated",
      payload?: Record<string, unknown>,
    ) => {
      const now = Date.now();
      funnelEventTsRef.current[name] = now;
      const enrich =
        simpleProductFlow && liveWorkspaceTwoPane
          ? {
              fresh_simple_create_ux: freshSimpleCreateUx,
              first_lawdog_session: firstLawdogSession,
            }
          : {};
      logProductEvent(name, {
        flow_started_at_ms: funnelStartedAtRef.current,
        event_ts_ms: now,
        since_start_ms: now - funnelStartedAtRef.current,
        ...enrich,
        ...payload,
      });
    },
    [simpleProductFlow, liveWorkspaceTwoPane, freshSimpleCreateUx, firstLawdogSession],
  );
  const paidFunnelEmittedRef = useRef<Record<string, boolean>>({});
  const paidCheckoutCompletedRef = useRef(false);
  /** After checkout, first `premium_checkout_completed` can be `ok` while client truth-gate still blocks; one revision row. */
  const truthGateCheckoutRevisionEmittedRef = useRef(false);
  const paidAgreementSentRef = useRef(false);
  const paywallOpenPrevRef = useRef(false);
  const paidFunnelEventRowsRef = useRef<PaidFunnelStoredRow[]>([]);

  const resolvePaidFunnelMetadata = React.useCallback(
    (overrides?: Record<string, unknown>): Record<string, unknown> => {
      const sessionId = getOrCreateLawdogSessionId();
      const resumeSnap = readCreateComplexityResume();
      const b = intakeBaselineCommitted.trim();
      const s = intakeStepBuffer.trim();
      const c = useGuidedSplitIntake ? (b && s ? `${b}\n\n${s}` : b || s) : s;
      const origResume = (resumeSnap?.originalUserIntakeRaw || "").trim();
      const origStore = readOriginalUserIntakeRaw().trim();
      // Funnel SoT: original session intake, resume's `originalUserIntakeRaw` (user line), and
      // the guided merge of baseline + step. Do not use `resume.rawIntake` — it can be a long
      // stitched draft / preview and false-trigger estate heuristics (e.g. "parent" in
      // "parent company") while the short home prompt is a design deal.
      // Do not merge `readAgreementCreatorIntakeStorage` (stale) or draft coercion (preview echo).
      const longCorpus = pickLongestPremiumIntakeCorpus(0, origStore, origResume, c, c || s);
      const parserHint = [draft?.title, draft?.purpose, draft?.payment_terms]
        .map((x) => (x || "").trim())
        .filter(Boolean)
        .join("\n");
      const bestIntent = finalizePaidFunnelMonotonicIntent(
        sessionId,
        resolveBestPaidFunnelIntentId({ sessionId, longCorpus, parserHint }),
      );
      const isMobile =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 1023px)").matches;
      const premiumGenerationOutcome = proFullDraftQualityRetry ? "needs_details" : "unknown";
      return {
        agreement_intent_id: bestIntent,
        device: isMobile ? "mobile" : "desktop",
        free_title_present: (draft?.title || "").trim() ? "yes" : "no",
        premium_generation_outcome: premiumGenerationOutcome,
        render_source: premiumTruthPipelineSource || "unknown",
        session_id: sessionId,
        ...(overrides ?? {}),
      };
    },
    [
      draft,
      proFullDraftQualityRetry,
      premiumTruthPipelineSource,
      useGuidedSplitIntake,
      intakeBaselineCommitted,
      intakeStepBuffer,
    ],
  );

  const logPaidFunnelSummary = React.useCallback((rows: PaidFunnelStoredRow[]) => {
    if (!import.meta.env.DEV) return;
    const sessionsByStep: Record<string, Set<string>> = {};
    for (const s of PAID_FUNNEL_LINEAR_STEPS) sessionsByStep[s] = new Set<string>();
    for (const r of rows) {
      if (sessionsByStep[r.name]) sessionsByStep[r.name].add(r.session_id);
    }
    const table = PAID_FUNNEL_LINEAR_STEPS.map((step, idx) => {
      const sessions = sessionsByStep[step].size;
      if (idx === 0) return { step, sessions, conversion_from_prev: 1 };
      const prev = sessionsByStep[PAID_FUNNEL_LINEAR_STEPS[idx - 1]].size;
      return {
        step,
        sessions,
        conversion_from_prev: prev > 0 ? Number((sessions / prev).toFixed(3)) : 0,
      };
    });
    // eslint-disable-next-line no-console
    console.table(table);
  }, []);

  const emitPaidFunnelEvent = React.useCallback(
    (name: PaidFunnelEventName, options?: { once?: boolean; extra?: Record<string, unknown> }) => {
      if (options?.once && paidFunnelEmittedRef.current[name]) return;
      const payload = resolvePaidFunnelMetadata(options?.extra);
      logProductEvent(name, payload);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[paid-funnel]", { name, ...payload });
      }
      if (typeof window !== "undefined") {
        const ph = (window as Window & { posthog?: { capture?: (n: string, p?: Record<string, unknown>) => void } })
          .posthog;
        if (ph?.capture) {
          try {
            ph.capture(name, payload);
          } catch {
            /* ignore optional analytics hook */
          }
        }
        try {
          const ts = Date.now();
          const row = buildPaidFunnelRowFromPayload(name, ts, payload);
          appendPaidFunnelEvent(row);
          if (row.session_id && row.agreement_intent_id && row.agreement_intent_id !== "custom_unknown") {
            backfillPaidFunnelIntentForSession(row.session_id, row.agreement_intent_id);
          }
          const next = loadPaidFunnelEvents();
          paidFunnelEventRowsRef.current = next;
          logPaidFunnelSummary(next);
        } catch {
          /* ignore local summary persistence */
        }
      }
      if (options?.once) paidFunnelEmittedRef.current[name] = true;
    },
    [resolvePaidFunnelMetadata, logPaidFunnelSummary],
  );
  const intakeCombined = useMemo(() => {
    const b = intakeBaselineCommitted.trim();
    const s = intakeStepBuffer.trim();
    if (!useGuidedSplitIntake) return s;
    if (!b) return s;
    if (!s) return b;
    return `${b}\n\n${s}`;
  }, [useGuidedSplitIntake, intakeBaselineCommitted, intakeStepBuffer]);

  const intakeCombinedRef = useRef(intakeCombined);
  intakeCombinedRef.current = intakeCombined;

  /** Text snapshot used for heuristics, guided progression, and live preview (debounced + explicit flush only). */
  const intakeGuidanceCombined = useMemo(() => {
    const b = intakeBaselineCommitted.trim();
    const s = debouncedStepBuffer.trim();
    if (!useGuidedSplitIntake) return s;
    if (!b) return s;
    if (!s) return b;
    return `${b}\n\n${s}`;
  }, [useGuidedSplitIntake, intakeBaselineCommitted, debouncedStepBuffer]);

  const flashParseUpdatedLabel = useCallback(() => {
    window.clearTimeout(parseUpdatedClearRef.current);
    setShowParseUpdatedLabel(true);
    parseUpdatedClearRef.current = window.setTimeout(() => setShowParseUpdatedLabel(false), 1800);
  }, []);

  const flushDebouncedStepBuffer = useCallback(
    (opts?: { forceFlash?: boolean }) => {
      window.clearTimeout(debounceFlushTimerRef.current);
      const next = intakeStepBufferRef.current;
      const cur = debouncedStepBufferRef.current;
      if (next === cur && !opts?.forceFlash) {
        setIsUserTyping(false);
        return;
      }
      setDebouncedStepBuffer(next);
      setIsUserTyping(false);
      flashParseUpdatedLabel();
    },
    [flashParseUpdatedLabel],
  );

  /** Stop speech, wait for final transcripts, then align debounced preview buffer before parse / commit. */
  const finalizeIntakeCapture = useCallback(async () => {
    await dictationControlRef.current?.finalizeDictation();
    await followUpDictationControlRef.current?.finalizeDictation();
    flushDebouncedStepBuffer({ forceFlash: true });
  }, [flushDebouncedStepBuffer]);

  const handleIntakeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      setIsUserTyping(true);
      setShowParseUpdatedLabel(false);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        flushDebouncedStepBuffer();
      }
    },
    [flushDebouncedStepBuffer],
  );

  const handleIntakeBlur = useCallback(() => {
    const next = intakeStepBufferRef.current;
    const cur = debouncedStepBufferRef.current;
    if (next === cur) {
      setIsUserTyping(false);
      return;
    }
    flushDebouncedStepBuffer();
  }, [flushDebouncedStepBuffer]);

  /** Heuristic parse runs only on debounced / flushed text (`intakeGuidanceCombined`), not live keystrokes. */
  const livePreviewModel = useMemo(
    () => buildLiveDraftPreview(intakeGuidanceCombined),
    [intakeGuidanceCombined],
  );

  useEffect(() => {
    if (!livePreviewModel.extraction?.scopeInferred) setScopeGuessConfirmed(false);
  }, [livePreviewModel.extraction?.scopeInferred]);

  useEffect(() => {
    if (!livePreviewModel.partiesUncertain) setPartiesGuessConfirmed(false);
  }, [livePreviewModel.partiesUncertain]);

  useEffect(() => {
    if (!livePreviewModel.extraction?.termInferred) setTermGuessConfirmed(false);
  }, [livePreviewModel.extraction?.termInferred]);

  const contextSuggestionResult = useMemo(
    () => computeContextAwareSuggestionResult(intakeCombined, livePreviewModel, usedContextSuggestionIds),
    [intakeCombined, livePreviewModel, usedContextSuggestionIds],
  );

  const visibleMainClauseSuggestions = useMemo(
    () => MAIN_CLAUSE_SUGGESTIONS.filter((s) => !contextSuggestionResult.suppressMainClauseIds.has(s.id)),
    [contextSuggestionResult.suppressMainClauseIds],
  );

  const intakeConfidenceScore = useMemo(
    () => computeIntakeConfidenceScore(livePreviewModel, intakeGuidanceCombined),
    [livePreviewModel, intakeGuidanceCombined],
  );

  const agreementStrengthPanel = useMemo(
    () =>
      simpleProductFlow && liveWorkspaceTwoPane
        ? {
            nominalPercent: intakeConfidenceScore.nominalPercent,
            checklist: buildAgreementStrengthChecklist(livePreviewModel, intakeGuidanceCombined),
          }
        : null,
    [simpleProductFlow, liveWorkspaceTwoPane, intakeConfidenceScore.nominalPercent, livePreviewModel, intakeGuidanceCombined],
  );

  /** First simple-create session: defer strength UI until parties + payment are present (focus → optimize). */
  const firstAgreementStrengthGateMet = useMemo(() => {
    if (!freshSimpleCreateUx) return true;
    return (
      hasAtLeastTwoParties(intakeGuidanceCombined, livePreviewModel) &&
      paymentCompletionMet(intakeGuidanceCombined, livePreviewModel)
    );
  }, [freshSimpleCreateUx, intakeGuidanceCombined, livePreviewModel]);

  const displayLivePreviewModel = useMemo(() => {
    const merged = mergeLivePreviewInlineOverrides(livePreviewModel, previewFieldOverrides);
    const qc = createProductionTwoPane
      ? { parties: true, scope: true, term: true }
      : { parties: partiesGuessConfirmed, scope: scopeGuessConfirmed, term: termGuessConfirmed };
    return applyQuickCheckConfirmationsToLivePreview(merged, qc);
  }, [
    livePreviewModel,
    previewFieldOverrides,
    createProductionTwoPane,
    partiesGuessConfirmed,
    scopeGuessConfirmed,
    termGuessConfirmed,
  ]);

  const whatWeUnderstoodDisplayBullets = useMemo(
    () =>
      createProductionTwoPane
        ? buildWeCapturedSummaryBullets(intakeGuidanceCombined.trim(), displayLivePreviewModel, {
            parties: true,
            scope: true,
            term: true,
          })
        : buildWhatWeUnderstoodBullets(displayLivePreviewModel),
    [
      createProductionTwoPane,
      intakeGuidanceCombined,
      displayLivePreviewModel,
    ],
  );

  const whatWeUnderstoodInlineDisabled = Boolean(
    isUserTyping ||
      (freshSimpleCreateUx && !previewPaneRevealed) ||
      draftNowCommitted ||
      draftPreCommitFreeze ||
      (createProductionTwoPane && createFlowPhase !== "capturing_input"),
  );

  useEffect(() => {
    setPreviewFieldOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const field of LIVE_PREVIEW_INLINE_FIELDS) {
        const o = next[field]?.trim();
        if (!o) continue;
        const parsed = getInlineParsedField(livePreviewModel, field);
        if (parsed && parsed.trim() === o) {
          delete next[field];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [livePreviewModel]);
  const agreementIntakeDraft = useMemo(
    () => buildAgreementIntakeDraft(intakeGuidanceCombined.trim(), livePreviewModel),
    [intakeGuidanceCombined, livePreviewModel],
  );
  const intakeReadiness = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || displayPhase !== "intake") return null;
    const t = intakeGuidanceCombined.trim();
    if (t.length < 24) return null;
    return computeIntakeReadiness(t, livePreviewModel);
  }, [simpleProductFlow, liveWorkspaceTwoPane, displayPhase, intakeGuidanceCombined, livePreviewModel]);
  const structuringHint = useMemo(() => {
    const raw = intakeGuidanceCombined.trim();
    if (createProductionTwoPane && raw.length >= 4) {
      const canon = getCanonicalAgreementTypeForCreate(raw, livePreviewModel);
      return canon.isSuggested ? `Suggested type: ${canon.headline}` : canon.headline;
    }
    return pickLiveStructuringHint(intakeGuidanceCombined, livePreviewModel.docTitle);
  }, [createProductionTwoPane, intakeGuidanceCombined, livePreviewModel]);
  const mainIntakePlaceholder =
    simpleProductTextareaPlaceholder?.trim() ||
    (simpleProductFlow && liveWorkspaceTwoPane
      ? HOMEPAGE_LONG_INTAKE_EXAMPLE
      : "Describe who’s involved, what’s being done, how payment works, timing, and governing law…");
  const stepIntakePlaceholder =
    useGuidedSplitIntake && intakeBaselineCommitted.trim()
      ? "Type or dictate your answer here…"
      : mainIntakePlaceholder;

  useEffect(() => {
    trackFunnelEvent("landing_view", {
      surface: "agreement_intake",
      flow: simpleProductFlow ? "simple_product" : "default",
    });
  }, [trackFunnelEvent, simpleProductFlow]);

  useEffect(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
    const profile = resumeNotice?.trim()
      ? "resume_notice"
      : continuitySourcePanel
        ? "continuity_handoff"
        : freshSimpleCreateStart
          ? "fresh_input_first"
          : "standard_split";
    logProductEvent("simple_create_intake_loaded", {
      profile,
      first_lawdog_session: firstLawdogSession,
    });
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    resumeNotice,
    continuitySourcePanel,
    freshSimpleCreateStart,
    firstLawdogSession,
  ]);

  useEffect(() => {
    window.clearTimeout(debounceFlushTimerRef.current);
    debounceFlushTimerRef.current = window.setTimeout(() => {
      const next = intakeStepBufferRef.current;
      const cur = debouncedStepBufferRef.current;
      if (next === cur) {
        setIsUserTyping(false);
        return;
      }
      setDebouncedStepBuffer(next);
      setIsUserTyping(false);
      flashParseUpdatedLabel();
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(debounceFlushTimerRef.current);
  }, [intakeStepBuffer, flashParseUpdatedLabel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const h = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useLayoutEffect(() => {
    if (prefersReducedMotion) {
      setPreviewFadeIn(true);
      return;
    }
    if (previewFadeFirstDigestRef.current) {
      previewFadeFirstDigestRef.current = false;
      return;
    }
    setPreviewFadeIn(false);
    const id = window.requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewFadeIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [intakeGuidanceCombined, prefersReducedMotion]);

  const livePreviewSurfaceStyle = useMemo<CSSProperties>(() => {
    const transition = "opacity 200ms ease-out";
    if (prefersReducedMotion) {
      return { opacity: isUserTyping ? 0.5 : 1, transition };
    }
    if (isUserTyping) return { opacity: 0.5, transition };
    return { opacity: previewFadeIn ? 1 : 0, transition };
  }, [prefersReducedMotion, isUserTyping, previewFadeIn]);

  useEffect(() => {
    onIntakeTextChange?.(intakeCombined);
  }, [intakeCombined, onIntakeTextChange]);

  useEffect(() => {
    if (firstInputTrackedRef.current) return;
    const chars = intakeCombined.trim().length;
    if (chars < 8) return;
    firstInputTrackedRef.current = true;
    trackFunnelEvent("first_input", { chars });
  }, [intakeCombined, trackFunnelEvent]);

  useEffect(() => {
    return () => {
      if (funnelGeneratedRef.current) return;
      logProductEvent("draft_abandoned", {
        drop_off_point: "agreement_intake",
        dropped_after_ms: Date.now() - funnelStartedAtRef.current,
        max_step_reached: funnelMaxStepRef.current,
      });
    };
  }, []);

  useEffect(() => {
    finalTranscriptRef.current = intakeCombined.trim();
  }, [intakeCombined]);

  useEffect(() => {
    if (!simpleProductFlow) return;
    const onPrefill = (e: Event) => {
      const t = String((e as CustomEvent<{ text?: string }>).detail?.text ?? "").trim();
      if (!t) return;
      if (simpleProductFlow && liveWorkspaceTwoPane && !continuitySourcePanel) {
        trackFunnelEvent("starter_selected", { starter_chars: t.length });
        if (t.length >= 8 && !firstInputTrackedRef.current) {
          firstInputTrackedRef.current = true;
          trackFunnelEvent("first_input", { chars: t.length, source: "starter_chip" });
        }
        setPreviewPaneRevealed(false);
        setIntakeBaselineCommitted(t);
        setIntakeStepBuffer("");
        setDebouncedStepBuffer("");
        setBaselineActionAck(buildActionAcknowledgementLine(t));
        prevFirstMissingRef.current = "unset";
      } else {
        setIntakeBaselineCommitted("");
        setIntakeStepBuffer(t);
        setBaselineActionAck(null);
      }
      textareaRef.current?.focus();
    };
    window.addEventListener("claw-prefill-intake", onPrefill as EventListener);
    return () => window.removeEventListener("claw-prefill-intake", onPrefill as EventListener);
  }, [simpleProductFlow, liveWorkspaceTwoPane, continuitySourcePanel, trackFunnelEvent]);

  useEffect(() => {
    if (!freshSimpleCreateUx) return;
    const onVoiceChip = () => {
      setDictationStartNonce((n) => n + 1);
      setVoiceEntryHintVisible(true);
      window.setTimeout(() => setVoiceEntryHintVisible(false), 5200);
      textareaRef.current?.focus();
    };
    window.addEventListener("claw-intake-start-dictation", onVoiceChip);
    return () => window.removeEventListener("claw-intake-start-dictation", onVoiceChip);
  }, [freshSimpleCreateUx]);

  useEffect(() => {
    if (!useGuidedSplitIntake) return;
    if (freshSimpleCreateUx) return;
    if (intakeBaselineCommitted.trim()) return;
    const step = intakeStepBuffer.trim();
    if (step.length < 6) return;
    const live = buildLiveDraftPreview(step);
    if (!isUsablePartialIntakeStructure(live, step) && !meetsMinimalIntakeProgress(step, live)) return;
    setIntakeBaselineCommitted(step);
    setIntakeStepBuffer("");
    setDebouncedStepBuffer("");
    setBaselineActionAck(buildActionAcknowledgementLine(step));
    prevFirstMissingRef.current = "unset";
  }, [useGuidedSplitIntake, freshSimpleCreateUx, intakeBaselineCommitted, intakeStepBuffer]);

  useEffect(() => {
    try {
      if (intakeCombined.trim()) {
        localStorage.setItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY, intakeCombined);
      }
    } catch {
      /* ignore */
    }
  }, [intakeCombined]);

  useEffect(() => {
    if (!intakeReadiness) {
      intakeReadinessPrevLevelRef.current = null;
      return;
    }
    if (!intakeReadinessShownOnceRef.current) {
      intakeReadinessShownOnceRef.current = true;
      logProductEvent("readiness_shown", {
        level: intakeReadiness.level,
        missingSignalsCount: intakeReadiness.missingSignals.length,
        surface: "agreement_intake",
        route: "create",
      });
    }
    const prev = intakeReadinessPrevLevelRef.current;
    if (prev !== null && prev !== intakeReadiness.level) {
      logProductEvent("readiness_level_changed", {
        from: prev,
        to: intakeReadiness.level,
        missingSignalsCount: intakeReadiness.missingSignals.length,
        surface: "agreement_intake",
        route: "create",
      });
    }
    intakeReadinessPrevLevelRef.current = intakeReadiness.level;
  }, [intakeReadiness]);

  const emitPrep = (s: AgreementCreatorPrepState) => {
    onPrepStateChange?.(s);
  };

  useEffect(() => {
    if (hardError && !loading) emitPrep("error");
    else if (
      displayPhase === "generating_draft" ||
      displayPhase === "hydrating_generated" ||
      displayPhase === "preparing_review" ||
      loading
    ) {
      emitPrep("generating");
    } else if (displayPhase === "followup_required") emitPrep("followup_required");
    else emitPrep("intake");
  }, [displayPhase, loading, hardError, onPrepStateChange]);

  function coerceDraftFromApiPayload(draft: unknown, intakeFallback: string, payment: ReturnType<typeof extractIntakePayment>): ParsedDraftShape {
    const structuredFallback = parseIntakeToStructuredAgreement(intakeFallback);
    const family = detectAgreementFamily(intakeFallback);
    const govFallback = structuredFallback.governing_law.trim();
    const scopeFallback = structuredFallback.scope.trim();
    const base: ParsedDraftShape = {
      title: "",
      jurisdiction: govFallback && !isLikelyCategoryOrTradeLabel(govFallback) ? govFallback : "TBD",
      parties: [],
      purpose: scopeFallback && !isLikelyCategoryOrTradeLabel(scopeFallback) ? scopeFallback : "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment,
      agreement_family: family,
    };
    if (!draft || typeof draft !== "object") return base;
    const o = draft as Record<string, unknown>;
    const partiesIn = Array.isArray(o.parties) ? o.parties : [];
    const parties: { name: string; role: string }[] = [];
    for (const p of partiesIn) {
      if (!p || typeof p !== "object") continue;
      const rec = p as Record<string, unknown>;
      const rawName = String(rec.name ?? "").trim();
      const cleaned = sanitizePartiesInput(rawName);
      const name = cleaned || rawName;
      const role = String(rec.role ?? "party").trim() || "party";
      if (name) parties.push({ name, role });
    }
    const dueRaw = o.due_date != null ? String(o.due_date).trim() : "";
    const durationRaw = o.duration != null ? String(o.duration).trim() : "";
    const apiGovRaw = String(o.jurisdiction ?? "").trim();
    const apiPurposeRaw = String(o.purpose ?? "").trim();
    const apiGov = apiGovRaw && !isLikelyCategoryOrTradeLabel(apiGovRaw) ? apiGovRaw : "";
    const apiPurpose = apiPurposeRaw && !isLikelyCategoryOrTradeLabel(apiPurposeRaw) ? apiPurposeRaw : "";
    const out: ParsedDraftShape = {
      title: String(o.title ?? "").trim(),
      jurisdiction:
        apiGov || (govFallback && !isLikelyCategoryOrTradeLabel(govFallback) ? govFallback : "") || "TBD",
      parties,
      purpose: apiPurpose || (scopeFallback && !isLikelyCategoryOrTradeLabel(scopeFallback) ? scopeFallback : ""),
      payment_terms: String(o.payment_terms ?? "").trim(),
      duration: durationRaw || null,
      due_date: dueRaw || null,
      effective_date: o.effective_date != null ? String(o.effective_date).trim() || null : null,
      payment,
    };
    if (typeof o.termination_summary === "string") {
      const ts = String(o.termination_summary).trim();
      if (ts) out.termination_summary = ts;
    }
    if (typeof o.additional_terms === "string") {
      const at = String(o.additional_terms).trim();
      if (at) out.additional_terms = at;
    }
    const purposeTrim = (out.purpose || "").trim();
    const addTrim = (out.additional_terms || "").trim();
    if (purposeTrim.includes(FULL_DRAFT_EXPANSION_MARKER) && !addTrim.includes(FULL_DRAFT_EXPANSION_MARKER)) {
      out.additional_terms = FULL_DRAFT_EXPANSION_MARKER;
    }
    return { ...out, agreement_family: family };
  }

  async function parseDraft(
    rawText: string,
    opts?: { aiModelClass?: "basic" | "premium" },
  ): Promise<ParsedDraftShape> {
    const payment = extractIntakePayment(rawText);
    const intakeFallback = rawText.trim();
    const isPremium = opts?.aiModelClass === "premium";
    if (import.meta.env.DEV && isPremium) {
      console.info("[agreement-parse] premium_request_payload", {
        intakeChars: intakeFallback.length,
        hasExactWordingMarker: intakeFallback.includes("Complete Version: exact wording"),
      });
    }
    try {
      const reqTs = new Date().toISOString();
      const controller = new AbortController();
      const parseTimeoutMs = isPremium ? 60000 : 5000;
      const parseTimeoutId = window.setTimeout(() => controller.abort("premium_parse_timeout"), parseTimeoutMs);
      const parseApiBase = resolveApiBase();
      const parseUrl = apiUrl("/api/agreements/parse");
      if (import.meta.env.DEV && isPremium) {
        console.info("[premium-parse-network] request", {
          origin: window.location.origin,
          api_base: parseApiBase,
          request_url: parseUrl,
          timeout_ms: parseTimeoutMs,
          method: "POST",
        });
      }
      let res: Response;
      try {
        const requestInit: RequestInit = {
          method: "POST",
          headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
          signal: controller.signal,
          body: JSON.stringify({
            intake_text: rawText,
            ai_model_class: opts?.aiModelClass ?? "basic",
          }),
        };
        try {
          res = await fetch(parseUrl, requestInit);
        } catch (errFirst) {
          const firstName = errFirst instanceof Error ? errFirst.name : "unknown";
          const firstMsg = errFirst instanceof Error ? errFirst.message : String(errFirst);
          const aborted = controller.signal.aborted;
          const isAbort = firstName === "AbortError" || aborted;
          const isNetworkFetchFailure = firstName === "TypeError" && /failed to fetch/i.test(firstMsg);
          const reqHost = new URL(parseUrl, window.location.origin).host;
          const originHost = new URL(window.location.origin).host;
          const cause = isAbort
            ? "abort_signal"
            : isNetworkFetchFailure
              ? reqHost !== originHost
                ? "mixed_host_port_mismatch_or_cors"
                : "network_refused_or_dropped"
              : "unknown_fetch_error";
          if (import.meta.env.DEV && isPremium) {
            console.warn("[premium-parse-network] fetch_error", {
              origin: window.location.origin,
              request_url: parseUrl,
              api_base: parseApiBase,
              error_name: firstName,
              error_message: firstMsg,
              signal_aborted: aborted,
              signal_reason: String((controller.signal as AbortSignal & { reason?: unknown }).reason ?? ""),
              classified_cause: cause,
              fetch_options: { method: requestInit.method, has_signal: Boolean(requestInit.signal), has_body: Boolean(requestInit.body) },
            });
          }
          if (isNetworkFetchFailure && !isAbort) {
            await sleep(250);
            res = await fetch(parseUrl, requestInit);
          } else {
            throw errFirst;
          }
        }
      } finally {
        window.clearTimeout(parseTimeoutId);
      }
      const payload = (await res.json().catch((err: unknown) => {
        console.warn("partial parse failure", err);
        return {};
      })) as { draft?: unknown; parse_meta?: Record<string, unknown>; detail?: unknown };
      if (import.meta.env.DEV && payload.parse_meta) {
        console.info("[agreement-parse] parse_meta", payload.parse_meta);
        if (isPremium) {
          const meta = payload.parse_meta as Record<string, unknown>;
          console.info("[premium-api-trace] parse_call", {
            timestamp: reqTs,
            model: String(meta.model ?? meta.model_name ?? meta.provider_model ?? "unknown"),
            tokens_in: Number(meta.tokens_in ?? meta.prompt_tokens ?? meta.input_tokens ?? 0),
            tokens_out: Number(meta.tokens_out ?? meta.completion_tokens ?? meta.output_tokens ?? 0),
            response_chars: Number(meta.response_chars ?? meta.raw_text_chars ?? 0),
          });
        }
      }
      if (!res.ok) {
        if (isPremium) {
          const d = payload.detail as { message?: string; code?: string } | string | undefined;
          const msg =
            typeof d === "object" && d && typeof d.message === "string"
              ? d.message
              : typeof d === "string"
                ? d
                : `premium_parse_http_${res.status}`;
          console.warn("[agreement-parse] premium_path_http_error", { status: res.status, detail: payload.detail });
          throw new Error(msg);
        }
        console.warn("partial parse failure", { status: res.status });
        return coerceDraftFromApiPayload(null, intakeFallback, payment);
      }
      const draft = payload?.draft;
      if (draft == null) {
        if (isPremium) {
          console.warn("[agreement-parse] premium_path_missing_draft");
          throw new Error("Premium parse returned no draft.");
        }
        console.warn("partial parse failure", "missing draft in response");
        return coerceDraftFromApiPayload(null, intakeFallback, payment);
      }
      if (import.meta.env.DEV && isPremium) {
        const draftText = JSON.stringify(draft);
        console.info("[premium-api-trace] parse_response", {
          timestamp: new Date().toISOString(),
          response_chars: draftText.length,
        });
        const draftObj = draft as Record<string, unknown>;
        logPremiumLiveTrace("parse_response", {
          source_id: "api_parse_response",
          title: String(draftObj.title ?? ""),
          payment_terms: String(draftObj.payment_terms ?? ""),
          purpose: String(draftObj.purpose ?? ""),
          additional_terms: String(draftObj.additional_terms ?? ""),
          party_roles: Array.isArray(draftObj.parties)
            ? (draftObj.parties as Array<Record<string, unknown>>).map((p) => String(p.role ?? "").trim()).filter(Boolean)
            : [],
          text: draftText,
        });
      }
      const payloadFull = payload as { extract?: import("./intakePremiumParseApply").ApiAgreementParseExtract | null };
      let out = coerceDraftFromApiPayload(draft, intakeFallback, payment);
      if (isPremium) {
        out = applyPremiumParseExtract(out, intakeFallback, payloadFull.extract);
      }
      return out;
    } catch (e: unknown) {
      if (isPremium) throw e;
      console.warn("partial parse failure", e);
      return coerceDraftFromApiPayload(null, intakeFallback, payment);
    }
  }

  async function postNewDraft(
    parsed: ParsedDraftShape,
    partyNameContext?: string,
  ): Promise<{ id: string; postDraft: AgreementDraft | null }> {
    const merged = mergeParsedForApiPersist(parsed);
    const {
      payment: _payment,
      termination_summary: _ts,
      additional_terms: _at,
      agreement_family: _fam,
      material_asks: _ma,
      premium_full_document_text: _pfd,
      premium_server_full_document_text: _psf,
      premium_server_repair_document_text: _psr,
      premium_full_draft_key_terms: _pfk,
      premium_full_draft_missing_info: _pfm,
      llc_company_name: _llc,
      management_structure: _ms,
      members_ownership_summary: _mo,
      capital_contributions_summary: _cc,
      distributions_summary: _ds,
      transfer_restrictions_summary: _tr,
      dissolution_summary: _diss,
      ...rest
    } = merged;
    const apiDraft = {
      title: rest.title,
      jurisdiction: rest.jurisdiction,
      parties: rest.parties,
      purpose: rest.purpose,
      payment_terms: rest.payment_terms,
      duration: rest.duration ?? null,
      due_date: rest.due_date ?? null,
      effective_date: rest.effective_date ?? null,
    };
    const draftUrl = apiUrl("/api/agreements/draft");
    console.log("[AgreementIntake] generate: draft API request");
    const res = await fetch(draftUrl, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(apiDraft),
    });
    const payload = await res.json().catch(() => ({}));
    let apiHost = "";
    try {
      apiHost = new URL(draftUrl, typeof window !== "undefined" ? window.location.href : "http://localhost").host;
    } catch {
      apiHost = "";
    }
    console.log("[AgreementIntake] generate: draft API response", {
      ok: res.ok,
      status: res.status,
      request_host: apiHost,
      agreement_id: payload?.id != null ? String(payload.id) : "(missing)",
      hasDraftPayload: payload?.draft != null,
    });
    if (!res.ok) {
      if (import.meta.env.PROD) {
        // eslint-disable-next-line no-console
        console.warn("[CLAW] draft POST failed", { status: res.status, path: "/api/agreements/draft" });
      }
      const errBody = payload as { detail?: { paywall?: boolean; code?: string; message?: string } };
      const d = errBody?.detail;
      if (d && typeof d === "object" && d.paywall) {
        triggerPaywall({ code: d.code, surface: "draft_create" });
      }
      const pe = payload as { detail?: unknown };
      const detailKind =
        typeof pe.detail === "string"
          ? pe.detail.slice(0, 120)
          : Array.isArray(pe.detail)
            ? "validation_array"
            : pe.detail != null && typeof pe.detail === "object"
              ? "detail_object"
              : "";
      if (import.meta.env.PROD) {
        // eslint-disable-next-line no-console
        console.warn("[CLAW] draft POST error detail (truncated)", { status: res.status, detailKind });
      }
      throw new Error(`create_failed_http_${res.status}`);
    }
    const id = String(payload?.id || "").trim();
    const postDraft = normalizeAgreementDraftFromApi(payload?.draft ?? null, {
      fallbackAgreementId: id,
      partyNameContext,
    });
    if (!id) throw new Error("missing_id");
    if (postDraft && !isAgreementDetailsStepReady(postDraft, id)) {
      console.warn("[AgreementIntake] POST draft failed details-step invariant — will rely on GET hydrate");
    }
    return { id, postDraft };
  }

  /** Create (or reuse) the persisted agreement row for review refine / inline field updates. Dedupes concurrent callers. */
  const ensureReviewAgreementWorkspaceId = React.useCallback(async (): Promise<string | null> => {
    const cached = reviewAgreementIdRef.current?.trim();
    if (cached) return cached;
    if (reviewAgreementEnsurePromiseRef.current) return reviewAgreementEnsurePromiseRef.current;
    const session = reviewWorkspaceSessionRef.current;
    const snapshot = draft;
    if (!snapshot) return null;
    const { n1: handoffParty1 } = getRecipientHandoffNamesFromDraft(snapshot);
    const party = pickRecipientNameForHandoff(recipient1Name, handoffParty1).trim() || "Party";
    const p = (async (): Promise<string | null> => {
      reviewWorkspaceBootstrapDepthRef.current += 1;
      if (reviewWorkspaceBootstrapDepthRef.current === 1) setReviewWorkspaceBootstrapping(true);
      try {
        const { id } = await postNewDraft(snapshot, party);
        const tid = String(id || "").trim();
        if (tid && reviewWorkspaceSessionRef.current === session) {
          setReviewAgreementId(tid);
          return tid;
        }
        return null;
      } catch {
        return null;
      } finally {
        reviewAgreementEnsurePromiseRef.current = null;
        reviewWorkspaceBootstrapDepthRef.current -= 1;
        if (reviewWorkspaceBootstrapDepthRef.current <= 0) {
          reviewWorkspaceBootstrapDepthRef.current = 0;
          setReviewWorkspaceBootstrapping(false);
        }
      }
    })();
    reviewAgreementEnsurePromiseRef.current = p;
    return p;
  }, [draft, recipient1Name]);

  async function hydrateCreatedAgreement(
    agreementId: string,
    postDraft: AgreementDraft | null,
    partyNameContext?: string,
  ): Promise<AgreementDraft> {
    console.log("[AgreementIntake] hydrate_after_create start", agreementId);
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { ok, draft } = await fetchAgreementDraft(agreementId, { partyNameContext });
      const ready = Boolean(draft && isAgreementDetailsStepReady(draft, agreementId));
      console.log("[AgreementIntake] hydrate_after_create attempt", attempt, {
        ok,
        agreement_id: agreementId,
        ready,
        normalized: Boolean(draft),
      });
      if (ok && draft && ready) {
        console.log("[AgreementIntake] hydrate_after_create success", agreementId);
        return draft;
      }
      await sleep(120 * (attempt + 1));
    }
    if (postDraft && isAgreementDetailsStepReady(postDraft, agreementId)) {
      console.warn("[AgreementIntake] hydrate_after_create fallback to normalized POST draft", agreementId);
      return postDraft;
    }
    console.error("[AgreementIntake] hydrate_after_create failed", agreementId);
    throw new Error("hydrate_failed");
  }

  function computeMissing(next: ParsedDraftShape): MissingKey[] {
    const fam = next.agreement_family;
    if (fam === "operating_agreement" || fam === "nda") {
      const out: MissingKey[] = [];
      if (!(next.title || "").trim()) out.push("title");
      if (!(next.jurisdiction || "").trim() || (next.jurisdiction || "").trim().toLowerCase() === "tbd")
        out.push("jurisdiction");
      if ((next.parties || []).length < 2) out.push("parties");
      if (!(next.purpose || "").trim()) out.push("purpose");
      return out;
    }
    if (fam === "generic_business_agreement") {
      const out: MissingKey[] = [];
      if (!(next.title || "").trim()) out.push("title");
      if (!(next.jurisdiction || "").trim() || (next.jurisdiction || "").trim().toLowerCase() === "tbd")
        out.push("jurisdiction");
      if ((next.parties || []).length < 2) out.push("parties");
      if (!(next.purpose || "").trim()) out.push("purpose");
      if (!(next.duration || "").trim() && !(next.due_date || "").trim()) out.push("duration");
      if (!(next.effective_date || "").trim()) out.push("effective_date");
      return out;
    }
    const out: MissingKey[] = [];
    if (!(next.title || "").trim()) out.push("title");
    if (!(next.jurisdiction || "").trim() || (next.jurisdiction || "").trim().toLowerCase() === "tbd")
      out.push("jurisdiction");
    if ((next.parties || []).length < 2) out.push("parties");
    if (!(next.purpose || "").trim()) out.push("purpose");
    if (!(next.payment_terms || "").trim()) out.push("payment_terms");
    if (!(next.duration || "").trim() && !(next.due_date || "").trim()) out.push("duration");
    if (!(next.effective_date || "").trim()) out.push("effective_date");
    return out;
  }

  function commitParsedDraftToReviewFlow(next: ParsedDraftShape): void {
    let nextDraft = canonicalizeStarterDraftForReview(next);
    if (simpleInstantProductionSurface) {
      const raw = intakeCombined.trim();
      if (raw.length >= 8) {
        nextDraft = applySimpleFlowSmartDefaults(nextDraft, raw);
        nextDraft = alignParsedWithCanonicalType(nextDraft, raw);
        nextDraft = normalizeParsedDraftLegalConcepts(nextDraft, raw);
      }
    }
    const nextMissing = computeMissing(nextDraft);
    setComplexityPendingParsed(null);
    setMissing(simpleInstantProductionSurface && nextMissing.length > 0 ? [] : nextMissing);
    setMissingAnswer("");
    const structuralFollowupBlocks =
      nextMissing.length > 0 && !simpleInstantProductionSurface && !createProductionTwoPane;
    if (structuralFollowupBlocks) {
      setDraft(nextDraft);
      setFollowUpDetailTotal(nextMissing.length);
      setDisplayPhase("followup_required");
      setCreateFlowPhase("capturing_input");
      setCreateUiStage(CreateUiStage.DRAFT);
      return;
    }
    setDraft(nextDraft);
    setFollowUpDetailTotal(0);
    setDisplayPhase("intake");
    setDraftNowCommitted(true);
    setCreateFlowPhase("draft_ready_for_review");
    setCreateUiStage(CreateUiStage.DRAFT);
    setMobileWorkspacePane("preview");
    setPreviewPaneRevealed(true);
    setIntakeStepBuffer("");
    setDebouncedStepBuffer("");
    agreementDocumentDirtyRef.current = false;
    setReviewDocRefreshTick((n) => n + 1);
    window.requestAnimationFrame(() => {
      document.getElementById("claw-simple-create-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function applyMissingValue(next: ParsedDraftShape, key: MissingKey, value: string): ParsedDraftShape {
    const v = (value || "").trim();
    if (!v) return next;
    if (key === "title") return { ...next, title: v };
    if (key === "jurisdiction") return { ...next, jurisdiction: v };
    if (key === "purpose") return { ...next, purpose: v };
    if (key === "payment_terms") return { ...next, payment_terms: v };
    if (key === "duration") return { ...next, duration: v };
    if (key === "effective_date") return { ...next, effective_date: v };
    if (key === "parties") {
      const parsed = parsePartiesFromUserInput(v);
      if (!parsed) return next;
      return { ...next, parties: parsed };
    }
    return next;
  }

  function stripRecipientEmailNoise(s: string): string {
    return (s || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u00A0/g, " ").trim();
  }

  /** Loose but practical gate: dotful domains OR longer no-dot hosts (e.g. internal). */
  function looksLikeEmail(s: string): boolean {
    const t = stripRecipientEmailNoise(s);
    if (!t.includes("@")) return false;
    const at = t.lastIndexOf("@");
    if (at <= 0 || at === t.length - 1) return false;
    const local = t.slice(0, at);
    const domain = t.slice(at + 1);
    if (!local || !domain || local.includes(" ") || domain.includes(" ") || domain.includes("@")) return false;
    if (domain.includes(".")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    return domain.length >= 4;
  }

  function partyEmailAtIndex(
    parties: readonly { name?: string; role?: string; email?: string }[] | null | undefined,
    idx: number,
  ): string {
    const em = stripRecipientEmailNoise(String(parties?.[idx]?.email ?? ""));
    return looksLikeEmail(em) ? em : "";
  }

  const persistPremiumRecipientHandoffFromDraftAndUi = React.useCallback(
    (
      d: ParsedDraftShape,
      opts?: {
        displayName1?: string;
        displayName2?: string;
      },
    ) => {
      const p0 = d.parties?.[0];
      const p1 = d.parties?.[1];
      const n1 =
        (opts?.displayName1 ?? "").trim() ||
        (recipient1NameRef.current || "").trim() ||
        String(p0?.name || "").trim();
      const n2 =
        (opts?.displayName2 ?? "").trim() ||
        (recipient2NameRef.current || "").trim() ||
        String(p1?.name || "").trim();
      const draftE1 = partyEmailAtIndex(d.parties, 0);
      const draftE2 = partyEmailAtIndex(d.parties, 1);
      const ui1 = stripRecipientEmailNoise(recipient1EmailRef.current);
      const ui2 = stripRecipientEmailNoise(recipient2EmailRef.current);
      const e1 = looksLikeEmail(ui1) ? ui1 : draftE1 || undefined;
      const e2 = looksLikeEmail(ui2) ? ui2 : draftE2 || undefined;
      persistPremiumRecipientHandoff({
        party1: {
          name: n1,
          ...(e1 ? { email: e1 } : {}),
          role: String(p0?.role || "party").trim() || "party",
        },
        party2: {
          name: n2,
          ...(e2 ? { email: e2 } : {}),
          role: String(p1?.role || "party").trim() || "party",
        },
      });
    },
    [],
  );

  useEffect(() => {
    if (createUiStage !== CreateUiStage.RECIPIENTS || !createProductionTwoPane) return;
    if (createFlowSendEditorPrimedRef.current) return;
    createFlowSendEditorPrimedRef.current = true;
    const r1e = stripRecipientEmailNoise(recipient1Email);
    if (!(recipient1Name || "").trim() || !looksLikeEmail(r1e)) {
      setCreateFlowSendRecipientEditorOpen(true);
    }
  }, [createUiStage, createProductionTwoPane, recipient1Name, recipient1Email]);

  function scrollVisibleRecipientSetupIntoView(block: ScrollLogicalPosition = "center") {
    const regions = document.querySelectorAll<HTMLElement>("[data-claw-recipient-setup]");
    for (const el of regions) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        el.scrollIntoView({ behavior: "smooth", block });
        return;
      }
    }
    regions[0]?.scrollIntoView({ behavior: "smooth", block });
  }

  function focusVisibleRecipientInput(field: "r1-name" | "r1-email" | "r2-name" | "r2-email"): boolean {
    const inputs = document.querySelectorAll<HTMLInputElement>(`[data-claw-recipient-field="${field}"]`);
    for (const el of inputs) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        scrollVisibleRecipientSetupIntoView("center");
        window.requestAnimationFrame(() => {
          el.focus({ preventScroll: false });
          el.classList.add("ring-2", "ring-amber-400/55", "ring-offset-2", "ring-offset-[#141d32]");
          window.setTimeout(() => {
            el.classList.remove("ring-2", "ring-amber-400/55", "ring-offset-2", "ring-offset-[#141d32]");
          }, 2000);
        });
        return true;
      }
    }
    return false;
  }

  const alignParsedWithCanonicalType = React.useCallback((parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape => {
    if (parsed.agreement_family === "operating_agreement") {
      return parsed;
    }
    const raw = rawIntake.trim();
    if (raw.length < 8) return parsed;
    const canon = getCanonicalAgreementTypeForCreate(raw, buildLiveDraftPreview(raw));
    const headline = (canon.headline || "").trim();
    if (!headline) return parsed;
    const priorTitle = (parsed.title || "").trim();
    const safeSimplifiedTitles = new Set([
      "Consulting Agreement",
      "Business Services Agreement",
      "Independent Contractor Agreement",
      "Payment Plan Agreement",
    ]);
    if (safeSimplifiedTitles.has(priorTitle) && canon.headline === "Confidentiality Agreement") {
      return { ...parsed, title: priorTitle };
    }
    return { ...parsed, title: headline };
  }, []);

  const resolveRawIntakeForPremiumCheckout = React.useCallback(
    (draftForFallback?: ParsedDraftShape | null): string => {
      const resumeSnap = readCreateComplexityResume();
      let storage = "";
      try {
        storage = readAgreementCreatorIntakeStorage().trim();
      } catch {
        /* ignore */
      }
      const c = intakeCombinedRef.current.trim();
      const r = resumeSnap?.rawIntake?.trim() ?? "";
      const origResume = resumeSnap?.originalUserIntakeRaw?.trim() ?? "";
      const origStore = readOriginalUserIntakeRaw();
      const longest = pickLongestPremiumIntakeCorpus(48, origStore, origResume, c, r, storage);
      if (longest) return longest;
      const d = draftForFallback ?? draftSnapshotRef.current;
      if (d) {
        const fromDraft = buildReviewCoercionRawIntakeFromDraft(d, "").trim();
        if (fromDraft) return fromDraft;
      }
      return "";
    },
    [],
  );

  const currentPremiumMergedIntakeKey = useMemo(() => {
    if (!draft) return "";
    const raw = (resolveRawIntakeForPremiumCheckout(draft) || "").trim();
    if (!raw) return "";
    const resume = readCreateComplexityResume();
    const notes = (resume?.premiumUpgradeNotes || "").trim() || pendingUpgradePrompt.trim();
    return buildPremiumMergedIntakeWithUserNotes(raw, notes);
  }, [draft, pendingUpgradePrompt, resolveRawIntakeForPremiumCheckout, reviewDocRefreshTick, intakeCombined]);

  useLayoutEffect(() => {
    const snap = readCreateComplexityResume();
    const o = snap?.originalUserIntakeRaw?.trim();
    if (o) writeOriginalUserIntakeRawIfRicher(o);
  }, []);

  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    const c = intakeCombined.trim();
    writeOriginalUserIntakeRawIfRicher(c);
  }, [createProductionTwoPane, simpleProductFlow, intakeCombined]);

  /** Rehydrate paid premium state from session snapshot (refresh / return navigation). */
  function applyHydrationFromPremiumSnapshot(snap: PremiumCompletionSnapshot): void {
    setPremiumRefineReview(snap.premiumReview ?? null);
    setPremiumFinalizeAudit(snap.premiumFinalizeAudit ?? null);
    setPremiumReviewRoute(snap.premiumReviewRoute ?? null);
    hydratedPremiumBodyRef.current = (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim();
    logPremiumLiveTrace("hydrated_snapshot", {
      source_id: "session_snapshot_hydrate",
      title: snap.premiumDraft?.title || "",
      payment_terms: snap.premiumDraft?.payment_terms || "",
      purpose: snap.premiumDraft?.purpose || "",
      additional_terms: snap.premiumDraft?.additional_terms || "",
      party_roles: (snap.premiumDraft?.parties || []).map((p) => (p.role || "").trim()).filter(Boolean),
      text: (snap.premiumWinningBodyText || snap.premiumReadonlyPlainText || "").trim(),
    });
    const priorDraftForNames = readCreateComplexityResume()?.pending ?? draftSnapshotRef.current;
    clearCreateComplexityResume();
    clearOriginalUserIntakeRaw();
    clearUpgradeCheckoutContext();
    setUpgradeIntentDetected(false);
    setPendingUpgradePrompt("");
    pendingUpgradePromptRef.current = "";
    syncUpgradeIntentRefs(false);
    setAdvancedFullDraftPaywallOpen(false);
    setFullDraftUpgradeBannerVisible(false);
    setPremiumPipelineUserMessage(null);
    setPremiumServerGenerationDegraded(snap.serverGenerationDegraded ?? null);
    setPremiumPersistedFlowActive(true);
    setPremiumSendPathUnlocked(true);
    lastPremiumPipelineRenderSourceRef.current = snap.premiumPipelineRenderSource || "snapshot_server_full_draft";
    setPremiumTruthPipelineSource(snap.premiumPipelineRenderSource || "snapshot_server_full_draft");

    const recipientsSurfaceReleased = peekPremiumRecipientsSurfaceReleased();
    const revealSeen = peekPremiumPostCheckoutRevealDismissed();
    if (recipientsSurfaceReleased) {
      setPremiumRecipientUxActive(true);
      setPremiumPostCheckoutPhase(null);
    } else if (revealSeen) {
      setPremiumRecipientUxActive(false);
      setPremiumPostCheckoutPhase(null);
    } else {
      setPremiumRecipientUxActive(false);
      markPremiumPostCheckoutRevealDismissed();
      setPremiumPostCheckoutPhase(null);
    }

    const merged = mergePremiumDraftPartiesWithRecipientPriority(
      snap.premiumDraft,
      priorDraftForNames,
      recipient1NameRef.current,
      recipient2NameRef.current,
      snap.recipientCandidates[0]?.name,
      snap.recipientCandidates[1]?.name,
      modalParty1NameRef.current,
      modalParty2NameRef.current,
    );

    const raw = buildReviewCoercionRawIntakeFromDraft(merged.draft, "");
    setIntakeBaselineCommitted(raw);
    setIntakeStepBuffer("");
    setDebouncedStepBuffer(raw);
    writeAgreementCreatorIntakeStorage(raw);

    commitParsedDraftToReviewFlow(merged.draft);
    if (recipientsSurfaceReleased) {
      setCreateFlowPhase("recipient_setup_required");
      setCreateUiStage(CreateUiStage.RECIPIENTS);
    }
    setMobileWorkspacePane("preview");
    setPreviewPaneRevealed(true);
    setAgreementTypeAccepted(true);

    const c0 = snap.recipientCandidates[0];
    const c1 = snap.recipientCandidates[1];
    if (merged.displayName1) setRecipient1Name(merged.displayName1);
    setRecipient1Email((c0?.email || "").trim());
    if (merged.displayName2) setRecipient2Name(merged.displayName2);
    setRecipient2Email((c1?.email || "").trim());
    setRecipientSignerLabels(
      pickRecipientSignerLabelsForHandoff(recipientSignerLabelsRef.current, merged.displayName1, merged.displayName2, {
        role1: merged.draft.parties?.[0]?.role,
        role2: merged.draft.parties?.[1]?.role,
      }),
    );

    agreementDocumentDirtyRef.current = false;
    try {
      setAgreementDocumentText(
        buildAgreementPreviewText(merged.draft, {
          starterPreview: false,
          premiumDeliverablePreview: true,
          intakeText: raw,
        }),
      );
    } catch {
      setAgreementDocumentText("");
    }
    setReviewDocRefreshTick((n) => n + 1);

    if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
    primePremiumCollaborateFirstDefault();
    setPremiumForkPrimedNonce((n) => n + 1);
    markPremiumCompletionDoneInLocalStorage();
    writePremiumRecipientHandoffExact(
      {
        name: (merged.draft.parties?.[0]?.name || merged.displayName1 || "").trim(),
        email: (c0?.email || "").trim(),
        role: (merged.draft.parties?.[0]?.role || "party").trim() || "party",
      },
      {
        name: (merged.draft.parties?.[1]?.name || merged.displayName2 || "").trim(),
        email: (c1?.email || "").trim(),
        role: (merged.draft.parties?.[1]?.role || "party").trim() || "party",
      },
    );
    bumpPremiumSurfaceGateTick();
  }

  useLayoutEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    let u: URL;
    try {
      u = new URL(window.location.href);
    } catch {
      return;
    }
    const snap = readPremiumCompletionSnapshot();
    if (snap) {
      applyHydrationFromPremiumSnapshot(snap);
      try {
        if (u.searchParams.get("premiumCompletion") === "1") {
          u.searchParams.delete("premiumCompletion");
          const qs = u.searchParams.toString();
          window.history.replaceState(window.history.state, "", qs ? `${u.pathname}?${qs}` : u.pathname);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    const urlReturn = u.searchParams.get("premiumCompletion") === "1";
    const grantPending = peekAdvancedFullDraftCheckoutGrant() && Boolean(readCreateComplexityResume()?.awaitingProCheckout);
    if (urlReturn || grantPending) {
      clearPremiumCompletionDoneInLocalStorage();
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[CLAW] premium return detected", { from: urlReturn ? "url" : "grant_and_resume" });
        // eslint-disable-next-line no-console
        console.info("[CLAW] premium hydration start", { from: "layout" });
      }
      setPremiumPostCheckoutPhase("processing");
      setPremiumPipelineUserMessage(CLAW_PREMIUM_PREPARING_AGREEMENT_COPY);
    }
  }, [createProductionTwoPane, simpleProductFlow]);

  const postAgreementFieldUpdate = React.useCallback(async (agreementId: string, field: string, value: unknown) => {
    const res = await fetch(apiUrl(`/api/agreements/${encodeURIComponent(agreementId)}/update-field`), {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ field, value }),
    });
    if (!res.ok) throw new Error("update_field_failed");
  }, []);

  const runOptionalFullDraftUpgrade = React.useCallback(
    async (opts: {
      rawIntake: string;
      priorDraft: ParsedDraftShape;
      showSuccessBanner: boolean;
      consumeCheckoutGrant: boolean;
    }) => {
      if (optionalFullUpgradeInFlightRef.current) return;
      optionalFullUpgradeInFlightRef.current = true;
      const { priorDraft, showSuccessBanner, consumeCheckoutGrant } = opts;
      let rawIntake = opts.rawIntake.trim();
      const pend = pendingUpgradePromptRef.current.trim();
      if (pend && !rawIntake.includes(pend)) {
        rawIntake = `${rawIntake}\n\n--- Pending change request ---\n${pend}`;
      }
      const devLog = (...args: unknown[]) => {
        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) console.debug(...args);
      };
      setAdvancedFullDraftPaywallOpen(false);
      setHardError(null);
      setCreateFlowPhase("generating_draft");
      setDisplayPhase("generating_draft");
      setCreateUiStage(CreateUiStage.DRAFT);
      setLoading(true);
      await finalizeIntakeCapture();
      try {
        let mergedPrior = priorDraft;
        const docSnap = agreementDocumentTextRef.current.trim();
        if (docSnap) {
          const patch = extractStructuredPatchesFromPreview(docSnap, mergedPrior);
          if (Object.keys(patch).length) mergedPrior = { ...mergedPrior, ...patch };
        }
        let parsed = await parseDraft(rawIntake);
        parsed = { ...parsed, payment: extractIntakePayment(rawIntake) };
        parsed = mergeParsedPreferRicher(mergedPrior, parsed);
        parsed = runIntakeDefaultsAndRoles(parsed, rawIntake, simpleProductFlow, intakePartyRoleLabels);
        parsed = alignParsedWithCanonicalType(parsed, rawIntake);
        parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
        parsed = enrichParsedDraftForFullDraftUpgrade(parsed, rawIntake);

        setReviewShowsSimplifiedAdvancedDraft(false);
        reviewWorkspaceSessionRef.current += 1;
        reviewAgreementEnsurePromiseRef.current = null;
        setReviewAgreementId(null);

        if (consumeCheckoutGrant && peekAdvancedFullDraftCheckoutGrant()) {
          consumeAdvancedFullDraftCheckoutGrant();
        } else if (tierAllowsAdvancedFullDraftReveal(tier) && peekAdvancedFullDraftCheckoutGrant()) {
          consumeAdvancedFullDraftCheckoutGrant();
        }

        commitParsedDraftToReviewFlow(parsed);
        clearCreateComplexityResume();
        setUpgradeIntentDetected(false);
        setPendingUpgradePrompt("");
        pendingUpgradePromptRef.current = "";
        syncUpgradeIntentRefs(false);
        if (showSuccessBanner) setFullDraftUpgradeBannerVisible(true);
        devLog("[optional-full-draft-upgrade] applied", { rawLen: rawIntake.length });
        if (showSuccessBanner) {
          window.requestAnimationFrame(() => {
            const el =
              document.getElementById("claw-agreement-preview-editor") ??
              document.getElementById("claw-simple-create-preview");
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      } catch (e: unknown) {
        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          console.warn("[optional-full-draft-upgrade] apply failed", e);
        }
        setDisplayPhase("intake");
        setCreateFlowPhase("draft_ready_for_review");
      } finally {
        setLoading(false);
        optionalFullUpgradeInFlightRef.current = false;
      }
    },
    [
      finalizeIntakeCapture,
      simpleProductFlow,
      intakePartyRoleLabels,
      alignParsedWithCanonicalType,
      tier,
      syncUpgradeIntentRefs,
    ],
  );

  /** After create-flow checkout: premium completion + reveal before recipients (Stripe `?premiumCompletion=1` or grant+resume). */
  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    let cancelled = false;
    let url: URL | null = null;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }
    const urlPc = url.searchParams.get("premiumCompletion") === "1";
    const grantPending = peekAdvancedFullDraftCheckoutGrant() && Boolean(readCreateComplexityResume()?.awaitingProCheckout);
    if (!urlPc && !grantPending) return;

    if (readPremiumCompletionSnapshot()) {
      try {
        if (url.searchParams.get("premiumCompletion") === "1") {
          url.searchParams.delete("premiumCompletion");
          const qs = url.searchParams.toString();
          window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
        }
      } catch {
        /* ignore */
      }
      return;
    }

    if (!peekAdvancedFullDraftCheckoutGrant()) {
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[CLAW] premium hydration failed", { reason: "no_checkout_grant" });
      }
      stripPremiumCompletionQueryParam();
      setHardError(
        "We could not verify your upgrade from this link. If you just finished checkout, refresh once or open your agreement from your workspace.",
      );
      return;
    }

    const runGen = ++premiumCheckoutRunGenRef.current;
    void (async () => {
      setPremiumPostCheckoutPhase("processing");
      setPremiumPipelineUserMessage(CLAW_PREMIUM_PREPARING_AGREEMENT_COPY);
      setHardError(null);
      await finalizeIntakeCapture();

      const resumeSnap = readCreateComplexityResume();
      const origFromResume = resumeSnap?.originalUserIntakeRaw?.trim();
      if (origFromResume) writeOriginalUserIntakeRawIfRicher(origFromResume);
      let prior = draftSnapshotRef.current ?? resumeSnap?.pending ?? null;
      const rawIntakeBase = resolveRawIntakeForPremiumCheckout(prior);
      if (!rawIntakeBase.trim() || !prior) {
        if (import.meta.env.MODE !== "test") {
          // eslint-disable-next-line no-console
          console.info("[CLAW] premium hydration failed", {
            reason: !prior ? "no_prior_draft" : "empty_raw_intake_after_resolve",
          });
        }
        console.warn("[premium-flow] premium_rewrite_aborted", {
          reason: !prior ? "no_prior_draft" : "empty_raw_intake_after_resolve",
          hasPrior: Boolean(prior),
        });
        stripPremiumCompletionQueryParam();
        setHardError(
          "We could not restore your draft after checkout (this tab had no saved intake). Use what is on screen or reopen your agreement from your workspace.",
        );
        setPremiumPostCheckoutPhase(null);
        setPremiumPipelineUserMessage(null);
        return;
      }
      const pendCaptured =
        (resumeSnap?.premiumUpgradeNotes ?? "").trim() || pendingUpgradePromptRef.current.trim();
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[CLAW] premium return detected", { from: "effect", phase: "post_finalized" });
      }
      console.info("[premium-flow] payment_return_detected", {
        premiumCompletion: true,
        rawBaseLen: rawIntakeBase.length,
        pendingUpgradeLen: pendingUpgradePromptRef.current.trim().length,
        premiumResumeNotesLen: (resumeSnap?.premiumUpgradeNotes ?? "").trim().length,
        pendCapturedLen: pendCaptured.length,
      });

      const docSnap = agreementDocumentTextRef.current.trim();
      if (docSnap) {
        try {
          const patch = extractStructuredPatchesFromPreview(docSnap, prior);
          if (Object.keys(patch).length) prior = { ...prior, ...patch };
        } catch {
          /* ignore */
        }
      }

      const mergedIntake = buildPremiumMergedIntakeWithUserNotes(rawIntakeBase, pendCaptured);
      const minMs = 1500 + Math.floor(Math.random() * 1001);
      const started = Date.now();

      const applySuccess = (result: PremiumCompletionResult) => {
        paidCheckoutCompletedRef.current = true;
        emitPaidFunnelEvent("premium_checkout_completed", {
          once: true,
          extra: {
            premium_generation_outcome: result.serverGenerationDegraded
              ? "degraded"
              : result.proIntentGateMessage || result.founderDetailsGateMessage
                ? "needs_details"
                : "ok",
            render_source: result.premiumRenderSource,
            ...(result.serverGenerationDegraded?.code
              ? { server_generation_failure_code: result.serverGenerationDegraded.code }
              : {}),
          },
        });
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info("[dev-premium-bind] apply", {
            raw_intake_hash: shortIntakeFingerprint(mergedIntake),
            active_generation_id: getOrInitSessionAgreementGenerationId(),
            premium_response_generation_id: result.agreementGenerationId,
            premium_request_fp: result.premiumRequestIntakeFingerprint,
            render_source: result.premiumRenderSource,
          });
        }
        if (result.staleIntakeOrGeneration) {
          setPremiumServerGenerationDegraded(null);
          setHardError("Your details changed while we were finishing. Retry Pro draft when you are ready.");
          setProFullDraftQualityRetry(true);
          setPremiumPostCheckoutPhase(null);
          setPremiumPipelineUserMessage(null);
          return;
        }
        if (result.proIntentGateMessage || result.founderDetailsGateMessage) {
          setPremiumServerGenerationDegraded(null);
          setProFullDraftCustomGateMessage(
            result.proIntentGateMessage || result.founderDetailsGateMessage || null,
          );
          setProFullDraftQualityRetry(true);
          setHardError(null);
          clearPremiumForkUserSendMode();
          setPremiumSendModeUserChoice(null);
          setPremiumSendModeTouched(false);
          if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
          lastPremiumPipelineRenderSourceRef.current = result.premiumRenderSource;
          setPremiumTruthPipelineSource(result.premiumRenderSource);
          premiumPipelineOutputBodyRef.current = "";
          setPremiumRefineReview(null);
          setPremiumFinalizeAudit(null);
          setPremiumReviewRoute(null);
          const priorForFounder =
            draftSnapshotRef.current ?? readCreateComplexityResume()?.pending ?? prior ?? null;
          const mergedF = mergePremiumDraftPartiesWithRecipientPriority(
            result.premiumDraft,
            priorForFounder,
            recipient1NameRef.current,
            recipient2NameRef.current,
            result.recipientCandidates[0]?.name,
            result.recipientCandidates[1]?.name,
            modalParty1NameRef.current,
            modalParty2NameRef.current,
          );
          commitParsedDraftToReviewFlow(stripClientPremiumArtifactBlocksFromDraft(mergedF.draft));
          agreementDocumentDirtyRef.current = false;
          setAgreementDocumentText("");
          setReviewDocRefreshTick((n) => n + 1);
          setPremiumPostCheckoutPhase(null);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info("[founder_intent] UI gate; custom message", { message: result.founderDetailsGateMessage });
          }
          return;
        }
        setProFullDraftCustomGateMessage(null);
        setPremiumServerGenerationDegraded(result.serverGenerationDegraded ?? null);
        setPremiumRefineReview(result.premiumReview ?? null);
        setPremiumFinalizeAudit(result.premiumFinalizeAudit ?? null);
        setPremiumReviewRoute(result.premiumReviewRoute ?? null);
        lastPremiumPipelineRenderSourceRef.current = result.premiumRenderSource;
        setPremiumTruthPipelineSource(result.premiumRenderSource);
        const priorForMerge =
          draftSnapshotRef.current ?? readCreateComplexityResume()?.pending ?? prior ?? null;
        const merged = mergePremiumDraftPartiesWithRecipientPriority(
          result.premiumDraft,
          priorForMerge,
          recipient1NameRef.current,
          recipient2NameRef.current,
          result.recipientCandidates[0]?.name,
          result.recipientCandidates[1]?.name,
          modalParty1NameRef.current,
          modalParty2NameRef.current,
        );
        if (hasFullDraftAccess && isUnacceptablePipelineProSource(result.premiumRenderSource)) {
          setPremiumServerGenerationDegraded(null);
          setPremiumTruthPipelineSource(result.premiumRenderSource);
          setProFullDraftQualityRetry(true);
          setHardError(null);
          clearPremiumForkUserSendMode();
          setPremiumSendModeUserChoice(null);
          setPremiumSendModeTouched(false);
          if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
          premiumPipelineOutputBodyRef.current = "";
          setPremiumRefineReview(null);
          setPremiumFinalizeAudit(null);
          setPremiumReviewRoute(null);
          commitParsedDraftToReviewFlow(stripClientPremiumArtifactBlocksFromDraft(merged.draft));
          agreementDocumentDirtyRef.current = false;
          setAgreementDocumentText(
            "Your LawDog Pro agreement is ready for review. You can also use Retry Pro draft to run the full Pro pass on your current intake if you want a different version.",
          );
          setReviewDocRefreshTick((n) => n + 1);
          setPremiumPostCheckoutPhase(null);
          emitPaidFunnelEvent("premium_checkout_completed", {
            extra: {
              premium_generation_outcome: "needs_details",
              render_source: result.premiumRenderSource,
            },
          });
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn("[pro-quality] blocked paid surface; pipeline or body unacceptable", {
              source: result.premiumRenderSource,
            });
          }
          return;
        }
        premiumPipelineOutputBodyRef.current = (result.winningPremiumBodyText || "").trim();
        console.info("[premium-flow] payment_success", { path: "premium_rewrite_apply_success" });
        if (import.meta.env.MODE !== "test") {
          if (result.serverGenerationDegraded) {
            // eslint-disable-next-line no-console
            console.info("[CLAW] premium draft degraded", {
              code: result.serverGenerationDegraded.code,
              source: result.premiumRenderSource,
            });
          } else {
            // eslint-disable-next-line no-console
            console.info("[CLAW] premium draft success", { source: result.premiumRenderSource });
          }
        }
        clearPremiumForkUserSendMode();
        setPremiumSendModeUserChoice(null);
        setPremiumSendModeTouched(false);
        if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
        const rc0 = result.recipientCandidates[0] ?? { name: "", email: "", role: "Party" };
        const rc1 = result.recipientCandidates[1] ?? { name: "", email: "", role: "Party" };
        const recipientCandidates = [
          { ...rc0, name: merged.displayName1 },
          { ...rc1, name: merged.displayName2 },
        ];
        const winning = (result.winningPremiumBodyText || "").trim();
        const resolvedPersist = resolvePremiumRenderSource({
          draft: merged.draft,
          intakeText: mergedIntake,
          premiumWinningCorpusFallback: winning,
          buildLivePreview: () =>
            buildAgreementPreviewTextCore(merged.draft, {
              starterPreview: false,
              premiumDeliverablePreview: true,
            }),
        });
        emitPremiumRenderResolveLog(resolvedPersist);
        if (import.meta.env.DEV && result.tierADiagnostic?.enabled) {
          // eslint-disable-next-line no-console
          console.info("[premium-tier-a-diagnostic]", {
            ...result.tierADiagnostic,
            resolverDecision: {
              premium_render_source: resolvedPersist.premium_render_source,
              premium_render_reason: resolvedPersist.premium_render_reason,
              premium_validation_result: resolvedPersist.premium_validation_result,
            },
            finalRenderSource: resolvedPersist.premium_render_source,
            premiumPipelineSource: result.premiumRenderSource,
          });
        }
        const snapshotPlain = resolvedPersist.text.trim();
        if (hasFullDraftAccess) {
          const contractIc = resolveAgreementIntentContract(mergedIntake);
          const fin = isPaidProFinishedAgreement({
            text: snapshotPlain,
            rawIntake: mergedIntake,
            readonlyRenderSource: resolvedPersist.premium_render_source,
            pipelineSource: result.premiumRenderSource,
            stale: false,
            intentContract: contractIc,
            draft: merged.draft,
            qualityRetryActive: false,
            serverGenerationDegraded: Boolean(result.serverGenerationDegraded),
          });
          if (!fin.ok) {
            setPremiumServerGenerationDegraded(null);
            if (contractIc.pro_strict) {
              const d = buildPremiumDetailsGateCopy(contractIc, fin.gate?.validation.reasons ?? fin.reasons);
              setProFullDraftCustomGateMessage(
                [d.title, d.body, "", d.bullets.map((b) => `• ${b}`).join("\n")].filter(Boolean).join("\n\n"),
              );
            } else {
              setProFullDraftCustomGateMessage(null);
            }
            setProFullDraftQualityRetry(true);
            setHardError(null);
            clearPremiumForkUserSendMode();
            setPremiumSendModeUserChoice(null);
            setPremiumSendModeTouched(false);
            if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
            premiumPipelineOutputBodyRef.current = "";
            setPremiumRefineReview(null);
            setPremiumFinalizeAudit(null);
            setPremiumReviewRoute(null);
            commitParsedDraftToReviewFlow(stripClientPremiumArtifactBlocksFromDraft(merged.draft));
            agreementDocumentDirtyRef.current = false;
            setAgreementDocumentText(
              "Your LawDog Pro agreement is ready for review. You can use Retry Pro draft to try a fuller pass if you want, or keep editing the text below.",
            );
            setReviewDocRefreshTick((n) => n + 1);
            setPremiumPostCheckoutPhase(null);
            emitPaidFunnelEvent("premium_checkout_completed", {
              extra: {
                premium_generation_outcome: "needs_details",
                render_source: result.premiumRenderSource,
              },
            });
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn("[pro-quality] render resolver or corpus failed paid gate", { reasons: fin.reasons });
            }
            return;
          }
        }
        setProFullDraftQualityRetry(false);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info("[dev-premium-bind] persist", {
            raw_intake_hash: shortIntakeFingerprint(mergedIntake),
            active_generation_id: getOrInitSessionAgreementGenerationId(),
            premium_response_generation_id: result.agreementGenerationId,
            render_source: result.premiumRenderSource,
            readonly_render: resolvedPersist.premium_render_source,
          });
        }
        logPremiumLiveTrace("premium_pipeline_output", {
          source_id: "ensurePremiumCompletion_result",
          premium_render_source: resolvedPersist.premium_render_source,
          title: merged.draft.title,
          payment_terms: merged.draft.payment_terms,
          purpose: merged.draft.purpose,
          additional_terms: merged.draft.additional_terms || "",
          party_roles: (merged.draft.parties || []).map((p) => (p.role || "").trim()).filter(Boolean),
          text: snapshotPlain,
        });
        persistPremiumCompletionSnapshot({
          premiumDraft: merged.draft,
          premiumParties: result.premiumParties,
          recipientCandidates,
          premiumWinningBodyText: snapshotPlain,
          premiumReadonlyPlainText: snapshotPlain,
          premiumReview: result.premiumReview ?? null,
          premiumFinalizeAudit: result.premiumFinalizeAudit ?? null,
          premiumReviewRoute: result.premiumReviewRoute ?? null,
          agreementGenerationId: result.agreementGenerationId,
          intakeTextFingerprint: shortIntakeFingerprint(mergedIntake),
          premiumPipelineRenderSource: result.premiumRenderSource,
          serverGenerationDegraded: result.serverGenerationDegraded ?? null,
        });
        if (import.meta.env.DEV) {
          const snapDoc = snapshotPlain;
          const hit = gapTraceNeedlesHit(snapDoc);
          console.info("[gap-trace] stage=snapshot_persistence", {
            rendered_source: resolvedPersist.premium_render_source,
            premium_render_source: resolvedPersist.premium_render_source,
            snapshot_text_hash: liveTraceHash(snapDoc),
            snapshot_len: snapDoc.length,
            contains_needles: hit.length > 0,
            needles_hit: hit,
            user_gap_answers_len: premiumLastGapAnswersRef.current.length,
          });
        }
        const persisted = readPremiumCompletionSnapshot();
        logPremiumLiveTrace("persisted_snapshot", {
          source_id: "session_snapshot",
          title: persisted?.premiumDraft?.title || merged.draft.title,
          payment_terms: persisted?.premiumDraft?.payment_terms || merged.draft.payment_terms,
          purpose: persisted?.premiumDraft?.purpose || merged.draft.purpose || "",
          additional_terms: persisted?.premiumDraft?.additional_terms || merged.draft.additional_terms || "",
          party_roles: (persisted?.premiumDraft?.parties || merged.draft.parties || [])
            .map((p) => (p.role || "").trim())
            .filter(Boolean),
          text: (persisted?.premiumWinningBodyText || persisted?.premiumReadonlyPlainText || "").trim(),
        });
        primePremiumCollaborateFirstDefault();
        setPremiumForkPrimedNonce((n) => n + 1);
        markPremiumCompletionDoneInLocalStorage();
        setPremiumPersistedFlowActive(true);
        setPremiumSendPathUnlocked(true);
        commitParsedDraftToReviewFlow(merged.draft);
        agreementDocumentDirtyRef.current = false;
        setAgreementDocumentText(collapseDuplicateEsignNoticesInFullPreview(snapshotPlain));
        setReviewDocRefreshTick((n) => n + 1);
        clearCreateComplexityResume();
        clearOriginalUserIntakeRaw();
        clearUpgradeCheckoutContext();
        setUpgradeIntentDetected(false);
        setPendingUpgradePrompt("");
        pendingUpgradePromptRef.current = "";
        syncUpgradeIntentRefs(false);
        setAdvancedFullDraftPaywallOpen(false);
        setFullDraftUpgradeBannerVisible(false);

        if (merged.displayName1) setRecipient1Name(merged.displayName1);
        setRecipient1Email((rc0.email || "").trim());
        if (merged.displayName2) setRecipient2Name(merged.displayName2);
        setRecipient2Email((rc1.email || "").trim());
        setRecipientSignerLabels(
          pickRecipientSignerLabelsForHandoff(recipientSignerLabelsRef.current, merged.displayName1, merged.displayName2, {
            role1: merged.draft.parties?.[0]?.role,
            role2: merged.draft.parties?.[1]?.role,
          }),
        );

        markPremiumPostCheckoutRevealDismissed();
        setPremiumRecipientUxActive(false);
        setPremiumPostCheckoutPhase(null);
        bumpPremiumSurfaceGateTick();
        writePremiumRecipientHandoffExact(
          {
            name: (merged.draft.parties?.[0]?.name || merged.displayName1 || "").trim(),
            email: (rc0.email || "").trim(),
            role: (merged.draft.parties?.[0]?.role || "party").trim() || "party",
          },
          {
            name: (merged.draft.parties?.[1]?.name || merged.displayName2 || "").trim(),
            email: (rc1.email || "").trim(),
            role: (merged.draft.parties?.[1]?.role || "party").trim() || "party",
          },
        );
        try {
          if (url) {
            url.searchParams.delete("premiumCompletion");
            const qs = url.searchParams.toString();
            window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
          }
        } catch {
          /* ignore */
        }
        window.requestAnimationFrame(() => {
          document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }) ??
            document.getElementById("claw-simple-create-preview")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        });
      };

      const applyFailureFallback = (winningBodyText?: string) => {
        setPremiumRefineReview(null);
        setPremiumFinalizeAudit(null);
        setPremiumReviewRoute(null);
        setPremiumGapQuestions([]);
        setPremiumGapOneField("");
        runPremiumModelPassRef.current = null;
        clearPremiumForkUserSendMode();
        setPremiumSendModeUserChoice(null);
        setPremiumSendModeTouched(false);
        const parties = extractCleanPremiumParties(mergedIntake, prior!);
        const recipientCandidates = parties.map((p) => ({ name: p.name, email: "", role: "Party" }));
        const patched: ParsedDraftShape = { ...prior!, parties };
        const priorForMergeFb =
          draftSnapshotRef.current ?? readCreateComplexityResume()?.pending ?? prior ?? null;
        const merged = mergePremiumDraftPartiesWithRecipientPriority(
          patched,
          priorForMergeFb,
          recipient1NameRef.current,
          recipient2NameRef.current,
          recipientCandidates[0]?.name,
          recipientCandidates[1]?.name,
          modalParty1NameRef.current,
          modalParty2NameRef.current,
        );
        const mergedRc = [
          { ...recipientCandidates[0], name: merged.displayName1 },
          { ...recipientCandidates[1], name: merged.displayName2 },
        ];
        const readonlyFromDraftFb = buildPremiumDeliverablePlainTextFromDraft(merged.draft, {
          intakeText: mergedIntake,
        });
        const winningFb = (winningBodyText || readPremiumCompletionSnapshot()?.premiumWinningBodyText || "").trim();
        persistPremiumCompletionSnapshot({
          premiumDraft: merged.draft,
          premiumParties: parties,
          recipientCandidates: mergedRc,
          premiumWinningBodyText: winningFb || readPremiumCompletionSnapshot()?.premiumWinningBodyText,
          premiumReadonlyPlainText: winningFb.length >= readonlyFromDraftFb.length ? winningFb : readonlyFromDraftFb,
          premiumFinalizeAudit: readPremiumCompletionSnapshot()?.premiumFinalizeAudit ?? null,
          premiumReviewRoute: readPremiumCompletionSnapshot()?.premiumReviewRoute ?? null,
        });
        premiumPipelineOutputBodyRef.current = (winningBodyText || readPremiumCompletionSnapshot()?.premiumWinningBodyText || "").trim();
        const persisted = readPremiumCompletionSnapshot();
        logPremiumLiveTrace("persisted_snapshot", {
          source_id: "session_snapshot_fallback",
          title: persisted?.premiumDraft?.title || merged.draft.title,
          payment_terms: persisted?.premiumDraft?.payment_terms || merged.draft.payment_terms,
          purpose: persisted?.premiumDraft?.purpose || merged.draft.purpose || "",
          additional_terms: persisted?.premiumDraft?.additional_terms || merged.draft.additional_terms || "",
          party_roles: (persisted?.premiumDraft?.parties || merged.draft.parties || [])
            .map((p) => (p.role || "").trim())
            .filter(Boolean),
          text: (persisted?.premiumWinningBodyText || persisted?.premiumReadonlyPlainText || "").trim(),
        });
        primePremiumCollaborateFirstDefault();
        setPremiumForkPrimedNonce((n) => n + 1);
        markPremiumCompletionDoneInLocalStorage();
        commitParsedDraftToReviewFlow(merged.draft);
        agreementDocumentDirtyRef.current = false;
        try {
          setAgreementDocumentText(
            buildAgreementPreviewText(merged.draft, {
              starterPreview: false,
              premiumDeliverablePreview: true,
              intakeText: mergedIntake,
            }),
          );
        } catch {
          setAgreementDocumentText("");
        }
        setReviewDocRefreshTick((n) => n + 1);
        clearCreateComplexityResume();
        clearUpgradeCheckoutContext();
        setUpgradeIntentDetected(false);
        setPendingUpgradePrompt("");
        pendingUpgradePromptRef.current = "";
        syncUpgradeIntentRefs(false);
        setAdvancedFullDraftPaywallOpen(false);
        setFullDraftUpgradeBannerVisible(false);
        if (merged.displayName1) setRecipient1Name(merged.displayName1);
        setRecipient1Email("");
        if (merged.displayName2) setRecipient2Name(merged.displayName2);
        setRecipient2Email("");
        setRecipientSignerLabels(
          pickRecipientSignerLabelsForHandoff(recipientSignerLabelsRef.current, merged.displayName1, merged.displayName2, {
            role1: merged.draft.parties?.[0]?.role,
            role2: merged.draft.parties?.[1]?.role,
          }),
        );
        setPremiumPersistedFlowActive(true);
        setPremiumSendPathUnlocked(true);
        markPremiumPostCheckoutRevealDismissed();
        setPremiumRecipientUxActive(false);
        setPremiumPostCheckoutPhase(null);
        bumpPremiumSurfaceGateTick();
        setHardError(null);
        writePremiumRecipientHandoffExact(
          {
            name: (merged.draft.parties?.[0]?.name || merged.displayName1 || "").trim(),
            email: "",
            role: (merged.draft.parties?.[0]?.role || "party").trim() || "party",
          },
          {
            name: (merged.draft.parties?.[1]?.name || merged.displayName2 || "").trim(),
            email: "",
            role: (merged.draft.parties?.[1]?.role || "party").trim() || "party",
          },
        );
        try {
          if (url) {
            url.searchParams.delete("premiumCompletion");
            const qs = url.searchParams.toString();
            window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
          }
        } catch {
          /* ignore */
        }
        window.requestAnimationFrame(() => {
          document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }) ??
            document.getElementById("claw-simple-create-preview")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        });
      };

      let absoluteTimeoutId = 0;
      try {
        const guidedFlowId = resolveGuidedFlowId(mergedIntake, buildLiveDraftPreview(mergedIntake));
        let timedOut = false;
        const runIsCurrent = () => !cancelled && runGen === premiumCheckoutRunGenRef.current;
        const failOpenFromTimeout = () => {
          if (!runIsCurrent()) return;
          timedOut = true;
          premiumCheckoutRunGenRef.current += 1;
          console.warn("[premium-modal-timeout]", { timeoutMs: 30_000, ts: new Date().toISOString() });
          console.info("[premium-modal-failopen]", { reason: "absolute_timeout", source: "cached_or_prior_draft" });
          if (import.meta.env.MODE !== "test") {
            // eslint-disable-next-line no-console
            console.info("[CLAW] premium hydration failed", { reason: "modal_timeout" });
          }
          setPremiumPipelineUserMessage(null);
          setHardError("Premium finalization timed out. Opened your upgraded agreement using the best available version.");
          runPremiumModelPassRef.current = null;
          applyFailureFallback();
          setPremiumPostCheckoutPhase(null);
          setPremiumGapQuestions([]);
          setPremiumGapOneField("");
        };

        const runModelPass = async (args: {
          intakeText: string;
          userGapAnswers: string | null;
          gapResolverSkippedWithDefaults: boolean;
        }): Promise<void> => {
          if (!runIsCurrent()) return;
          setPremiumPostCheckoutPhase("processing");
          setPremiumPipelineUserMessage(CLAW_PREMIUM_PREPARING_AGREEMENT_COPY);
          setPremiumGapQuestions([]);
          let result: Awaited<ReturnType<typeof ensurePremiumCompletion>> | null = null;
          absoluteTimeoutId = window.setTimeout(failOpenFromTimeout, 30_000);
          premiumModalEscapeHandlerRef.current = () => {
            if (!runIsCurrent()) return;
            if (absoluteTimeoutId) {
              window.clearTimeout(absoluteTimeoutId);
            }
            console.info("[premium-modal-failopen]", { reason: "user_escape", source: "cached_or_prior_draft" });
            setPremiumPipelineUserMessage(null);
            applyFailureFallback();
            setPremiumPostCheckoutPhase(null);
            setPremiumGapQuestions([]);
            setPremiumGapOneField("");
          };
          for (let attempt = 0; attempt < 2; attempt++) {
            if (!runIsCurrent()) return;
            if (attempt === 1) {
              setPremiumPipelineUserMessage("We had trouble finalizing your agreement — retrying…");
              console.info("[premium-modal-stage]", { retryAttempt: 1, ts: new Date().toISOString() });
            }
            const premiumCompletionAttemptStartedAt = Date.now();
            const premiumCompletionAttemptTimeoutMs = 90_000;
            try {
              const originalMergeHint = pickLongestPremiumIntakeCorpus(
                48,
                readOriginalUserIntakeRaw(),
                readCreateComplexityResume()?.originalUserIntakeRaw,
                stripPremiumUserNotesFromMergedIntake(rawIntakeBase),
              );
              const startGen = bumpAgreementGenerationId();
              const startFp = shortIntakeFingerprint(args.intakeText);
              result = await withTimeout(
                ensurePremiumCompletion({
                  intakeText: args.intakeText,
                  originalUserIntakeRawForMerge: originalMergeHint,
                  structuredDraft: prior!,
                  agreementFamily: prior!.agreement_family ?? detectAgreementFamily(args.intakeText),
                  guidedFlowId,
                  simpleProductFlow,
                  partyRoleLabels: intakePartyRoleLabels,
                  parseDraft: (raw) => parseDraft(raw, { aiModelClass: "premium" }),
                  userGapAnswers: args.userGapAnswers,
                  gapResolverSkippedWithDefaults: args.gapResolverSkippedWithDefaults,
                  agreementGenerationId: startGen,
                  premiumRequestIntakeFingerprint: startFp,
                  isPremiumRequestStillValid: () => getOrInitSessionAgreementGenerationId() === startGen,
                }),
                premiumCompletionAttemptTimeoutMs,
                "premium_completion_attempt",
              );
              console.info("[premium-flow] premium_completion_timeout_boundary", {
                attempt,
                started_at: new Date(premiumCompletionAttemptStartedAt).toISOString(),
                elapsed_ms: Date.now() - premiumCompletionAttemptStartedAt,
                completed_before_timeout: true,
                timeout_ms: premiumCompletionAttemptTimeoutMs,
              });
              console.info("[premium-flow] premium_rewrite_request_success", { attempt });
              break;
            } catch (e) {
              const em = e instanceof Error ? e.message : String(e);
              const timedOutThisAttempt = em.includes("premium_completion_attempt_timeout_");
              console.info("[premium-flow] premium_completion_timeout_boundary", {
                attempt,
                started_at: new Date(premiumCompletionAttemptStartedAt).toISOString(),
                elapsed_ms: Date.now() - premiumCompletionAttemptStartedAt,
                completed_before_timeout: false,
                timeout_ms: premiumCompletionAttemptTimeoutMs,
                timed_out: timedOutThisAttempt,
              });
              console.warn("[premium-flow] premium_rewrite_request_failure", { attempt, err: e });
              if (attempt === 1) {
                if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
                  console.warn("[premium-completion] apply failed after retry", e);
                }
                result = null;
              } else {
                if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
                  console.warn("[premium-completion] apply failed, will retry once", e);
                }
              }
            }
          }
          if (absoluteTimeoutId) {
            window.clearTimeout(absoluteTimeoutId);
          }
          absoluteTimeoutId = 0;
          premiumModalEscapeHandlerRef.current = null;
          if (timedOut || !runIsCurrent()) return;

          const elapsed = Date.now() - started;
          if (elapsed < minMs) await sleep(minMs - elapsed);
          if (!runIsCurrent()) return;

          if (result) {
            applySuccess(result);
          } else {
            if (import.meta.env.MODE !== "test") {
              // eslint-disable-next-line no-console
              console.info("[CLAW] premium hydration failed", { reason: "model_path_exhausted" });
            }
            console.warn("[premium-flow] premium_rewrite_request_exhausted", {
              fallback: "party_extract_only",
              note: "Premium model path failed — last saved draft shown; edit or retry checkout flow.",
            });
            setHardError(
              "We could not run the premium agreement rewrite (model path). Your previous draft is shown — you can edit it, or try again shortly.",
            );
            applyFailureFallback();
            setPremiumPostCheckoutPhase(null);
          }
          setPremiumPipelineUserMessage(null);
          runPremiumModelPassRef.current = null;
        };

        runPremiumModelPassRef.current = runModelPass;

        let gapList: { questions: string[] } = { questions: [] };
        try {
          gapList = await postPremiumMissingFactsWithRetry({
            intakeText: mergedIntake,
            context: buildPremiumFullDraftContextWithIntentMapping(mergedIntake, prior!),
          });
        } catch (ge) {
          console.warn("[premium-gap] missing-facts request failed, continuing", ge);
        }
        if (gapList.questions.length > 0 && runIsCurrent()) {
          premiumModalEscapeHandlerRef.current = () => {
            if (!runIsCurrent()) return;
            stripPremiumCompletionQueryParam();
            setHardError(
              "The post-checkout form was closed before your full agreement was generated. Your draft on screen is unchanged — use “Use defaults” or “Build my agreement” if this step appears again.",
            );
            setPremiumPostCheckoutPhase(null);
            setPremiumGapQuestions([]);
            setPremiumGapOneField("");
            runPremiumModelPassRef.current = null;
          };
          premiumGapBaseIntakeRef.current = mergedIntake;
          setPremiumGapQuestions(gapList.questions);
          setPremiumGapOneField("");
          setPremiumPostCheckoutPhase("awaiting_gaps");
          console.info("[premium-flow] premium_gap_resolver_active", { count: gapList.questions.length, guidedFlowId });
          return;
        }

        console.info("[premium-flow] premium_rewrite_request_start", {
          mergedLen: mergedIntake.length,
          pendCapturedLen: pendCaptured.length,
          guidedFlowId,
        });
        await runModelPass({
          intakeText: mergedIntake,
          userGapAnswers: null,
          gapResolverSkippedWithDefaults: false,
        });
      } catch (e: unknown) {
        if (absoluteTimeoutId) {
          window.clearTimeout(absoluteTimeoutId);
        }
        premiumModalEscapeHandlerRef.current = null;
        if (import.meta.env.MODE !== "test") {
          // eslint-disable-next-line no-console
          console.info("[CLAW] premium hydration failed", { reason: "unexpected_error" });
        }
        if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
          console.warn("[premium-completion] unexpected failure", e);
        }
        setHardError(
          "Premium completion hit an unexpected error. Your previous draft is shown — you can still edit and continue.",
        );
        applyFailureFallback();
        setPremiumPostCheckoutPhase(null);
        setPremiumGapQuestions([]);
        setPremiumGapOneField("");
        setPremiumPipelineUserMessage(null);
        runPremiumModelPassRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      premiumCheckoutRunGenRef.current += 1;
      premiumModalEscapeHandlerRef.current = null;
      runPremiumModelPassRef.current = null;
    };
  }, [
    createProductionTwoPane,
    simpleProductFlow,
    intakePartyRoleLabels,
    finalizeIntakeCapture,
    syncUpgradeIntentRefs,
    bumpPremiumSurfaceGateTick,
    hasFullDraftAccess,
  ]);

  const upgradeContextReasons = useMemo(
    () =>
      buildUpgradeContextReasons({
        sourceText: `${intakeCombined.trim()}\n${agreementDocumentText}`,
        agreementFamily:
          draft?.agreement_family ?? (intakeCombined.trim() ? detectAgreementFamily(intakeCombined.trim()) : undefined),
        guidedFlowId: resolveGuidedFlowId(intakeCombined.trim(), livePreviewModel),
        draftForParties: draft,
        partiesLine: livePreviewModel.partiesLine,
      }),
    [intakeCombined, agreementDocumentText, draft, livePreviewModel],
  );

  const openPartyDetailsModalForReviewPlaceholder = React.useCallback(
    (d: ParsedDraftShape, pending: PartyDetailsModalPendingResume) => {
      partyDetailsModalPendingResumeRef.current = pending;
      const ho = readPremiumRecipientHandoff();
      const d0e = partyEmailAtIndex(d.parties, 0);
      const d1e = partyEmailAtIndex(d.parties, 1);
      setModalParty1Name(d.parties?.[0]?.name?.trim() ?? "");
      setModalParty2Name(d.parties?.[1]?.name?.trim() ?? "");
      setModalParty1Email(hydrateEmailFromHandoff(recipient1Email, hydrateEmailFromHandoff(d0e, ho?.party1.email ?? "")));
      setModalParty2Email(hydrateEmailFromHandoff(recipient2Email, hydrateEmailFromHandoff(d1e, ho?.party2.email ?? "")));
      setModalParty1Role(((d.parties?.[0]?.role || "").trim() || ho?.party1.role || "party").trim());
      setModalParty2Role(((d.parties?.[1]?.role || "").trim() || ho?.party2.role || "party").trim());
      setHardError(null);
      setRecipientPartyDetailsModalOpen(true);
    },
    [recipient1Email, recipient2Email],
  );

  const handleUpgradeToFullDraft = React.useCallback(async (draftOverride?: ParsedDraftShape | null) => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    if (tierAllowsAdvancedFullDraftReveal(tier)) return;
    const gateDraft = draftOverride ?? draft;
    const raw = resolveRawIntakeForPremiumCheckout(gateDraft);
    if (!raw) {
      console.warn("[premium-flow] upgrade_modal_aborted", { reason: "empty_raw_intake" });
      return;
    }
    console.info("[premium-flow] button_click", { button: "upgrade_to_full_draft_modal" });
    logProductEvent("upgrade_clicked", { surface: "agreement_optional_full_draft", intent: "full_draft_upgrade" });
    setPendingUpgradePrompt(raw);
    pendingUpgradePromptRef.current = raw;
    setUpgradeIntentDetected(true);
    syncUpgradeIntentRefs(true);
    let prior = gateDraft;
    if (!prior) {
      setLoading(true);
      try {
        let p = await parseDraft(raw);
        p = { ...p, payment: extractIntakePayment(raw) };
        p = runIntakeDefaultsAndRoles(p, raw, simpleProductFlow, intakePartyRoleLabels);
        p = alignParsedWithCanonicalType(p, raw);
        p = normalizeParsedDraftLegalConcepts(p, raw);
        prior = p;
      } catch {
        prior = null;
      } finally {
        setLoading(false);
      }
    }
    if (!prior) return;
    stashCreateComplexityResume({
      rawIntake: raw,
      pending: prior,
      awaitingProCheckout: true,
      resume_kind: "optional_full_upgrade",
    });
    stashUpgradeCheckoutContext(upgradeContextReasons, {
      completionLabel: buildUpgradeCheckoutCompletionLabel(prior),
      intentSignals: detectUpgradeIntentSignals(`${raw}\n${agreementDocumentText}`),
    });
    setAdvancedFullDraftPaywallOpen(true);
  }, [
    createProductionTwoPane,
    simpleProductFlow,
    draft,
    tier,
    intakePartyRoleLabels,
    alignParsedWithCanonicalType,
    syncUpgradeIntentRefs,
    upgradeContextReasons,
    agreementDocumentText,
    resolveRawIntakeForPremiumCheckout,
  ]);

  const runProductionLocalDraftParse = React.useCallback(
    async (opts?: { rawOverride?: string; handoffSource?: string }): Promise<boolean> => {
    const rawIntake = (opts?.rawOverride ?? intakeCombined).trim();
    if (!rawIntake) return false;
    if (
      upgradeIntentDetectedRef.current &&
      !tierAllowsAdvancedFullDraftReveal(tier) &&
      draft &&
      !draftHasFullDraftExpansion(draft)
    ) {
      return false;
    }
    console.debug("[handoff-start]", {
      source: opts?.handoffSource ?? "runProductionLocalDraftParse",
      createUiStage,
      createFlowPhase_before: createFlowPhase,
      displayPhase_before: displayPhase,
    });
    setHardError(null);
    setCreateFlowPhase("generating_draft");
    setDisplayPhase("generating_draft");
    setCreateUiStage(CreateUiStage.DRAFT);
    setLoading(true);
    await finalizeIntakeCapture();
    try {
      let parsed = await parseDraft(rawIntake);
      parsed = { ...parsed, payment: extractIntakePayment(rawIntake) };
      parsed = runIntakeDefaultsAndRoles(parsed, rawIntake, simpleProductFlow, intakePartyRoleLabels);
      parsed = alignParsedWithCanonicalType(parsed, rawIntake);
      parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
      if (simpleInstantProductionSurface) {
        parsed = applySimpleFlowSmartDefaults(parsed, rawIntake);
        parsed = alignParsedWithCanonicalType(parsed, rawIntake);
        parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
      }
      let nextMissing = computeMissing(parsed);
      if (nextMissing.length > 0 && simpleInstantProductionSurface) {
        parsed = applySimpleFlowSmartDefaults(parsed, rawIntake);
        parsed = alignParsedWithCanonicalType(parsed, rawIntake);
        parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
        nextMissing = computeMissing(parsed);
      }
      setMissing(nextMissing);
      setMissingAnswer("");
      if (nextMissing.length > 0) {
        if (simpleInstantProductionSurface) {
          setMissing([]);
          setMissingAnswer("");
        } else if (!createProductionTwoPane) {
          setDraft(parsed);
          setFollowUpDetailTotal(nextMissing.length);
          setDisplayPhase("followup_required");
          setCreateFlowPhase("capturing_input");
          setCreateUiStage(CreateUiStage.DRAFT);
          return false;
        }
      }
      if (shouldInterceptAdvancedDocumentFamily(rawIntake, parsed.agreement_family)) {
        stashCreateComplexityResume({
          rawIntake,
          pending: parsed,
          awaitingProCheckout: false,
          resume_kind: "complexity_gate",
        });
        setReviewShowsSimplifiedAdvancedDraft(false);
        setComplexityPendingParsed(parsed);
        setDraft(null);
        setCreateFlowPhase("complexity_choice_required");
        setDisplayPhase("intake");
        setCreateUiStage(CreateUiStage.DRAFT);
        setLoading(false);
        return false;
      }
      clearCreateComplexityResume();
      setReviewShowsSimplifiedAdvancedDraft(false);
      setDraft(parsed);
      setFollowUpDetailTotal(0);
      setDisplayPhase("intake");
      setDraftNowCommitted(true);
      setCreateFlowPhase("draft_ready_for_review");
      setCreateUiStage(CreateUiStage.DRAFT);
      setMobileWorkspacePane("preview");
      setPreviewPaneRevealed(true);
      setIntakeStepBuffer("");
      setDebouncedStepBuffer("");
      agreementDocumentDirtyRef.current = false;
      setReviewDocRefreshTick((n) => n + 1);
      emitPaidFunnelEvent("free_draft_generated", { once: true, extra: { source: "local_parse" } });
      window.requestAnimationFrame(() => {
        document.getElementById("claw-simple-create-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return true;
    } catch {
      setDisplayPhase("intake");
      setCreateFlowPhase("capturing_input");
      setCreateUiStage(CreateUiStage.DRAFT);
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    intakeCombined,
    finalizeIntakeCapture,
    simpleProductFlow,
    intakePartyRoleLabels,
    alignParsedWithCanonicalType,
    createUiStage,
    createFlowPhase,
    displayPhase,
    tier,
    draft,
    createProductionTwoPane,
    emitPaidFunnelEvent,
  ]);

  const resolveComplexityChoice = React.useCallback(
    async (choice: "simplified" | "pro") => {
      const pending = complexityPendingParsedRef.current;
      if (!pending || !createProductionTwoPane) return;
      const rawIntake = intakeCombined.trim() || resolveRawIntakeForPremiumCheckout(pending);
      if (!rawIntake && choice === "pro") return;
      if (choice === "pro" && !tierAllowsAdvancedFullDraftReveal(tier)) {
        logProductEvent("paywall_triggered", {
          surface: "agreement_advanced_full_draft",
          code: "premium_agreement_template",
        });
        const raw = intakeCombined.trim();
        setPendingUpgradePrompt(raw);
        pendingUpgradePromptRef.current = raw;
        setUpgradeIntentDetected(true);
        syncUpgradeIntentRefs(true);
        stashUpgradeCheckoutContext(upgradeContextReasons, {
          completionLabel: buildUpgradeCheckoutCompletionLabel(pending),
          intentSignals: detectUpgradeIntentSignals(`${rawIntake}\n${agreementDocumentText}`),
        });
        setAdvancedFullDraftPaywallOpen(true);
        return;
      }
      setAdvancedFullDraftPaywallOpen(false);
      if (choice === "simplified") {
        setReviewShowsSimplifiedAdvancedDraft(true);
        clearCreateComplexityResume();
      } else {
        setReviewShowsSimplifiedAdvancedDraft(false);
        clearCreateComplexityResume();
      }
      let next: ParsedDraftShape =
        choice === "simplified" ? simplifyParsedDraftForInstantPath(pending, rawIntake) : { ...pending };
      next = runIntakeDefaultsAndRoles(next, rawIntake, simpleProductFlow, intakePartyRoleLabels);
      next = alignParsedWithCanonicalType(next, rawIntake);
      next = normalizeParsedDraftLegalConcepts(next, rawIntake);
      next = canonicalizeStarterDraftForReview(next);
      commitParsedDraftToReviewFlow(next);
    },
    [
      createProductionTwoPane,
      intakeCombined,
      simpleProductFlow,
      intakePartyRoleLabels,
      alignParsedWithCanonicalType,
      canonicalizeStarterDraftForReview,
      tier,
      syncUpgradeIntentRefs,
      upgradeContextReasons,
      agreementDocumentText,
      resolveRawIntakeForPremiumCheckout,
    ],
  );

  const beginAdvancedFullDraftCheckout = React.useCallback((draftOverride?: ParsedDraftShape | null) => {
    console.info("[premium-flow] button_click", { button: "unlock_premium_rewrite_checkout" });
    const gateDraft = draftOverride ?? draft;
    const resumeSnap = readCreateComplexityResume();
    const pending =
      complexityPendingParsedRef.current ?? gateDraft ?? (resumeSnap?.pending ?? null);
    const raw = resolveRawIntakeForPremiumCheckout(pending);
    if (!raw) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "empty_raw_intake", hasPending: Boolean(pending) });
      return;
    }
    if (!pending) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "no_pending_draft" });
      return;
    }
    const resumeKind: CreateComplexityResumeKind =
      complexityPendingParsedRef.current != null ? "complexity_gate" : "optional_full_upgrade";
    scrollToPremiumPosAnchor();
    console.info("[premium-flow] checkout_launch", { surface: "advanced_full_draft_stripe", rawLen: raw.length });
    stashCreateComplexityResume({
      rawIntake: raw,
      pending,
      awaitingProCheckout: true,
      resume_kind: resumeKind,
    });
    stashUpgradeCheckoutContext(upgradeContextReasons, {
      completionLabel: buildUpgradeCheckoutCompletionLabel(pending),
      intentSignals: detectUpgradeIntentSignals(`${raw}\n${agreementDocumentText}`),
    });
    persistPremiumRecipientHandoffFromDraftAndUi(pending);
    setAdvancedFullDraftPaywallOpen(false);
    const cadence = "annual";
    const returnTo = encodeURIComponent("/app/create");
    emitPaidFunnelEvent("premium_checkout_opened", { extra: { checkout_surface: "create_flow_checkout" } });
    navigate(
      `/app/checkout/${encodeURIComponent(CREATE_FLOW_CHECKOUT_AGREEMENT_ID)}?tier=pro&cadence=${encodeURIComponent(
        cadence,
      )}&returnTo=${returnTo}`,
    );
  }, [navigate, draft, upgradeContextReasons, agreementDocumentText, resolveRawIntakeForPremiumCheckout, persistPremiumRecipientHandoffFromDraftAndUi, emitPaidFunnelEvent]);

  const beginAdvancedFullDraftBilling = React.useCallback(() => {
    const resumeSnap = readCreateComplexityResume();
    const pending =
      complexityPendingParsedRef.current ?? draft ?? (resumeSnap?.pending ?? null);
    const raw = resolveRawIntakeForPremiumCheckout(pending);
    if (!raw || !pending) return;
    const resumeKind: CreateComplexityResumeKind =
      complexityPendingParsedRef.current != null ? "complexity_gate" : "optional_full_upgrade";
    stashCreateComplexityResume({
      rawIntake: raw,
      pending,
      awaitingProCheckout: true,
      resume_kind: resumeKind,
    });
    stashUpgradeCheckoutContext(upgradeContextReasons, {
      completionLabel: buildUpgradeCheckoutCompletionLabel(pending),
      intentSignals: detectUpgradeIntentSignals(`${raw}\n${agreementDocumentText}`),
    });
    setAdvancedFullDraftPaywallOpen(false);
    navigate(`/app/billing?returnTo=${encodeURIComponent("/app/create")}`);
  }, [navigate, draft, upgradeContextReasons, agreementDocumentText, resolveRawIntakeForPremiumCheckout]);

  const beginPremiumOriginalWordingCheckout = React.useCallback((draftOverride?: ParsedDraftShape | null) => {
    console.info("[premium-flow] button_click", { button: "upgrade_apply_my_wording" });
    if (!createProductionTwoPane) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "not_production_two_pane" });
      return;
    }
    const wording = premiumOriginalWordingBuffer.trim();
    if (!wording) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "empty_premium_wording_buffer" });
      return;
    }
    const gateDraft = draftOverride ?? draft;
    const resumeSnap = readCreateComplexityResume();
    const pending =
      gateDraft ?? complexityPendingParsedRef.current ?? resumeSnap?.pending ?? null;
    const raw = resolveRawIntakeForPremiumCheckout(pending);
    if (!raw) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "empty_raw_intake", hasPending: Boolean(pending) });
      return;
    }
    if (!pending) {
      console.warn("[premium-flow] checkout_launch_aborted", { reason: "no_pending_draft" });
      return;
    }
    logProductEvent("upgrade_clicked", {
      surface: "agreement_original_wording_premium",
      intent: "exact_wording_checkout",
    });
    pendingUpgradePromptRef.current = wording;
    setPendingUpgradePrompt(wording);
    setUpgradeIntentDetected(true);
    syncUpgradeIntentRefs(true);
    scrollToPremiumPosAnchor();
    console.info("[premium-flow] checkout_launch", {
      surface: "exact_wording_stripe",
      rawLen: raw.length,
      premiumWordingLen: wording.length,
    });
    stashCreateComplexityResume({
      rawIntake: raw,
      pending,
      awaitingProCheckout: true,
      resume_kind: "optional_full_upgrade",
      premiumUpgradeNotes: wording,
    });
    persistPremiumRecipientHandoffFromDraftAndUi(pending);
    stashUpgradeCheckoutContext(upgradeContextReasons, {
      completionLabel: buildUpgradeCheckoutCompletionLabel(pending),
      intentSignals: detectUpgradeIntentSignals(`${raw}\n${wording}\n${agreementDocumentText}`),
    });
    setAdvancedFullDraftPaywallOpen(false);
    const cadence = "annual";
    const returnTo = encodeURIComponent("/app/create");
    navigate(
      `/app/checkout/${encodeURIComponent(CREATE_FLOW_CHECKOUT_AGREEMENT_ID)}?tier=pro&cadence=${encodeURIComponent(
        cadence,
      )}&returnTo=${returnTo}`,
    );
  }, [
    createProductionTwoPane,
    premiumOriginalWordingBuffer,
    draft,
    navigate,
    upgradeContextReasons,
    agreementDocumentText,
    syncUpgradeIntentRefs,
    resolveRawIntakeForPremiumCheckout,
    persistPremiumRecipientHandoffFromDraftAndUi,
  ]);

  const handleProductionInlineWordingSubmit = React.useCallback(async () => {
    if (!tierAllowsAdvancedFullDraftReveal(tier)) return;
    if (!createProductionTwoPane) return;
    if (upgradeLockActiveRef.current) return;
    const ok = await runProductionLocalDraftParse({ handoffSource: "inline_wording_submit" });
    if (ok) {
      setIsEditingDescription(false);
    }
  }, [createProductionTwoPane, runProductionLocalDraftParse, tier]);

  const clearUpgradeLockAndResume = React.useCallback(() => {
    setUpgradeIntentDetected(false);
    setPendingUpgradePrompt("");
    pendingUpgradePromptRef.current = "";
    upgradeIntentDetectedRef.current = false;
    upgradeLockActiveRef.current = false;
    clearCreateComplexityResume();
    clearUpgradeCheckoutContext();
    setAdvancedFullDraftPaywallOpen(false);
  }, []);

  /** Modal “Stay with starter” — do not wipe complexity-gate resume so user can still pick simplified vs complete. */
  const dismissPaywallStayStarter = React.useCallback(() => {
    setAdvancedFullDraftPaywallOpen(false);
    setUpgradeIntentDetected(false);
    setPendingUpgradePrompt("");
    pendingUpgradePromptRef.current = "";
    syncUpgradeIntentRefs(false);
    clearUpgradeCheckoutContext();
    const snap = readCreateComplexityResume();
    if (snap?.resume_kind === "optional_full_upgrade") {
      clearCreateComplexityResume();
    }
  }, [syncUpgradeIntentRefs]);

  async function runPersistAndOpen(
    parsed: ParsedDraftShape,
    partyNameContext: string,
    inlineContextualSend?: boolean,
    premiumSendIntent?: PremiumSendIntent | null,
    simpleSendOpenPhase?: "review" | "send",
  ): Promise<boolean> {
    let postedId = "";
    try {
      const existingId = reviewAgreementIdRef.current?.trim();
      let id: string;
      let postDraft: AgreementDraft | null;
      if (existingId) {
        id = existingId;
        const mergedForFallback = mergeParsedForApiPersist(parsed);
        postDraft = normalizeAgreementDraftFromApi(
          {
            id,
            title: mergedForFallback.title ?? parsed.title,
            jurisdiction: mergedForFallback.jurisdiction ?? parsed.jurisdiction,
            parties: mergedForFallback.parties ?? parsed.parties,
            purpose: mergedForFallback.purpose ?? parsed.purpose,
            payment_terms: mergedForFallback.payment_terms ?? parsed.payment_terms,
            duration: mergedForFallback.duration ?? parsed.duration ?? null,
            due_date: mergedForFallback.due_date ?? parsed.due_date ?? null,
            effective_date: mergedForFallback.effective_date ?? parsed.effective_date ?? null,
          },
          { fallbackAgreementId: id, partyNameContext },
        );
      } else {
        const created = await postNewDraft(parsed, partyNameContext);
        id = created.id;
        postDraft = created.postDraft;
      }
      postedId = id;
      /** Any time we reuse a persisted row (review, recipients send after refresh, etc.), push the latest structured snapshot before hydrate. */
      if (existingId) {
        const merged = mergeParsedForApiPersist(parsed);
        const purposeForApi = (merged.purpose || "").trim() ? merged.purpose : parsed.purpose;
        const pushField = async (field: string, value: unknown) => {
          try {
            await postAgreementFieldUpdate(id, field, value);
          } catch {
            /* non-fatal */
          }
        };
        await pushField("purpose", purposeForApi);
        await pushField("parties", parsed.parties ?? []);
        await pushField("payment_terms", parsed.payment_terms ?? "");
        await pushField("jurisdiction", parsed.jurisdiction ?? "");
        await pushField("duration", parsed.duration ?? null);
      }
      if (!inlineContextualSend) {
        setDisplayPhase("hydrating_generated");
      }
      const normalized = await hydrateCreatedAgreement(id, postDraft, partyNameContext);
      console.log("[AgreementIntake] persistence + hydrate OK, advancing wizard", id);
      const elapsedMs = Date.now() - funnelStartedAtRef.current;
      funnelGeneratedRef.current = true;
      trackFunnelEvent("agreement_generated", {
        agreement_id: id,
        total_elapsed_ms: elapsedMs,
        total_elapsed_seconds: Number((elapsedMs / 1000).toFixed(2)),
        time_to_ready_ms:
          funnelEventTsRef.current.ready_state_reached && funnelEventTsRef.current.landing_view
            ? funnelEventTsRef.current.ready_state_reached - funnelEventTsRef.current.landing_view
            : null,
        max_step_reached: funnelMaxStepRef.current,
        step_conversion_rate: stepTotal > 0 ? funnelMaxStepRef.current / stepTotal : 0,
        drop_off_point: null,
      });
      emitPaidFunnelEvent("free_draft_generated", {
        once: true,
        extra: {
          agreement_id: id,
          free_title_present: Boolean((normalized?.title || "").trim()),
        },
      });
      if (!inlineContextualSend) {
        setDisplayPhase("preparing_review");
        const dwellMs = 800;
        await sleep(dwellMs);
      }
      setFollowUpDetailTotal(0);
      setDisplayPhase("intake");
      clearAgreementCreatorIntakeStorage();
      clearPremiumCompletionStateAfterSend();
      /** Any successful simple-product persist → send/review handoff must not leave a create-page resume id (zombie shell). */
      if (simpleProductFlow && liveWorkspaceTwoPane) {
        clearCreateReviewAgreementResumeId();
      }
      const createdHandoff = {
        premiumSendIntent: premiumSendIntent ?? null,
        ...(simpleSendOpenPhase === "send" || simpleSendOpenPhase === "review"
          ? { openFlowPhase: simpleSendOpenPhase }
          : {}),
      };

      if (premiumSendAnotherSkipOnCreatedRef.current) {
        premiumSendAnotherSkipOnCreatedRef.current = false;
        setProductionSendBarPhase("idle");
        setProductionSendBarAgreementId(null);
        navigate("/app/create");
        return true;
      }
      if (inlineContextualSend) {
        setProductionSendBarPhase("sent");
        setProductionSendBarAgreementId(id);
        paidAgreementSentRef.current = true;
        emitPaidFunnelEvent("agreement_sent", { extra: { agreement_id: id, send_path: "inline_contextual" } });
        const primed = normalized;
        window.setTimeout(() => {
          onCreated(id, primed, createdHandoff);
        }, 420);
        return true;
      }
      onCreated(id, normalized, createdHandoff);
      return true;
    } catch (e: unknown) {
      const msg =
        typeof (e as { message?: unknown })?.message === "string"
          ? (e as { message: string }).message
          : String(e ?? "Could not create draft.");
      console.error("[AgreementIntake] create/hydrate failed", { postedId, rawMessage: msg });
      const hydrate = msg === "hydrate_failed" || msg.toLowerCase().includes("hydrate");
      if (hydrate) {
        if (postedId) onCreateHydrateFailed?.(postedId);
        setHardError(msg);
        return false;
      }
      const rawIntake = (finalTranscriptRef.current || intakeCombined).trim();
      const model = buildLiveDraftPreview(rawIntake);
      const structuredOk = isStructuredDraftUsableForLocalReviewFallback(parsed, model, rawIntake);
      if (structuredOk) {
        setHardError(null);
      } else {
        setHardError(msg);
      }
      if (createProductionTwoPane && !hydrate && structuredOk) {
        setCreateFlowPhase("draft_ready_for_review");
        setCreateUiStage(CreateUiStage.DRAFT);
        setDisplayPhase("intake");
        setMobileWorkspacePane("preview");
        setDraftNowCommitted(true);
        setPreviewPaneRevealed(true);
        if (import.meta.env.PROD) {
          // eslint-disable-next-line no-console
          console.warn("[CLAW] on-page review fallback (draft POST/hydrate failed; structured parse OK)", {
            err: msg.slice(0, 120),
          });
        }
        setProductionSendBarPhase("idle");
        setProductionSendBarAgreementId(null);
        return true;
      }
      setProductionSendBarPhase("idle");
      setProductionSendBarAgreementId(null);
      return false;
    }
  }

  const onGenerate = async () => {
    if (import.meta.env.DEV) {
      devSendCtaTrace("onGenerate entered", {
        createProductionTwoPane,
        createUiStage,
        createFlowPhase,
        simpleCreateReadyForSend,
        intakeLen: intakeCombined.trim().length,
        hasDraft: Boolean(draft),
        reviewAgreementId: Boolean(reviewAgreementId?.trim()),
      });
    }
    try {
      await finalizeIntakeCapture();
    } catch (e) {
      if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] onGenerate finalizeIntakeCapture", e);
      throw e;
    }
    const intakeTrim = intakeCombined.trim();
    const draftPartyEmailsReadyForSend = Boolean(
      (draft?.parties as { email?: string }[] | undefined)?.some((p) =>
        looksLikeEmail(String(p?.email ?? "")),
      ),
    );
    const hasProductionRecipientEmail =
      [recipient1Email, recipient2Email].some((e) => looksLikeEmail(String(e ?? ""))) || draftPartyEmailsReadyForSend;
    const productionRecipientsPersist =
      createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      draft &&
      agreementTypeAccepted &&
      (draft.parties?.length ?? 0) >= 1 &&
      (recipientsDeferred || hasProductionRecipientEmail);

    /** Continuity handoff disables `createProductionTwoPane` but sticky can still show Send + `simpleCreateReadyForSend` — must not require raw intake. */
    const simpleWorkspacePersistSend =
      simpleProductFlow &&
      liveWorkspaceTwoPane &&
      !createProductionTwoPane &&
      simpleCreateReadyForSend &&
      Boolean(draft);

    if (productionRecipientsPersist) {
      if (productionSendInFlightRef.current) {
        if (import.meta.env.DEV) devSendCtaTrace("onGenerate skip: production send already in flight");
        return;
      }
      productionSendInFlightRef.current = true;
      const draftWithRecipientUi = buildCanonicalSimpleProductHandoffDraft(draft, {
        recipient1Name,
        recipient1Email,
        recipient2Name,
        recipient2Email,
        stripRecipientEmailNoise,
        looksLikeEmail,
      });
      setDraft(draftWithRecipientUi);
      persistPremiumRecipientHandoffFromDraftAndUi(draftWithRecipientUi);
      if (import.meta.env.DEV) devSendCtaTrace("onGenerate branch: productionRecipientsPersist → runPersistAndOpen");
      console.debug("[handoff-start]", {
        source: "onGenerate_production_recipients",
        createUiStage,
        createFlowPhase_before: createFlowPhase,
        displayPhase_before: displayPhase,
      });
      setLoading(true);
      setHardError(null);
      setCreateFlowPhase("ready_to_send");
      try {
        const rawFromDraft = buildReviewCoercionRawIntakeFromDraft(draftWithRecipientUi, intakeCombined);
        const rawIntake = (rawFromDraft || finalTranscriptRef.current || "").trim();
        trackFunnelEvent("generate_clicked", {
          ready_state: intakeGuidedComplete,
          intake_chars: rawIntake.length,
          max_step_reached: funnelMaxStepRef.current,
          production_phase: "ready_to_send",
        });
        const partiesForCtx = (draftWithRecipientUi?.parties ?? []) as { email?: string }[];
        const resolvedR1 =
          looksLikeEmail(recipient1Email) ? stripRecipientEmailNoise(recipient1Email) : partyEmailAtIndex(partiesForCtx, 0);
        const resolvedR2 =
          looksLikeEmail(recipient2Email) ? stripRecipientEmailNoise(recipient2Email) : partyEmailAtIndex(partiesForCtx, 1);
        const partyCtx = [
          rawIntake,
          recipient1Name.trim(),
          resolvedR1,
          recipient2Name.trim(),
          resolvedR2,
          sanitizeStarterSignerLabelsLine(recipientSignerLabels),
        ]
          .filter(Boolean)
          .join("\n");
        const inlineContextualSend = Boolean(premiumRecipientUxActive || premiumPersistedFlowActive);
        const ok = await runPersistAndOpen(
          draftWithRecipientUi,
          partyCtx,
          inlineContextualSend,
          inlineContextualSend ? effectivePremiumSendMode : null,
          inlineContextualSend ? "send" : undefined,
        );
        if (!ok) {
          setDisplayPhase("intake");
          setProductionSendBarPhase("idle");
          setProductionSendBarAgreementId(null);
          setHardError(
            "We couldn’t finish sending from this screen. Your agreement is still here — try again in a moment, or reopen it from My agreements.",
          );
        }
      } finally {
        setLoading(false);
        productionSendInFlightRef.current = false;
      }
      return;
    }

    if (simpleWorkspacePersistSend) {
      const d = draft;
      if (!d) {
        if (import.meta.env.DEV) devSendCtaTrace("return: simpleWorkspacePersistSend but draft null");
        return;
      }
      const dWithRecipientUi = buildCanonicalSimpleProductHandoffDraft(d, {
        recipient1Name,
        recipient1Email,
        recipient2Name,
        recipient2Email,
        stripRecipientEmailNoise,
        looksLikeEmail,
      });
      setDraft(dWithRecipientUi);
      persistPremiumRecipientHandoffFromDraftAndUi(dWithRecipientUi);
      if (import.meta.env.DEV) {
        devSendCtaTrace("onGenerate branch: simpleWorkspacePersistSend (continuity / non-staged two-pane) → runPersistAndOpen", {
          continuitySourcePanel: Boolean(continuitySourcePanel),
        });
      }
      setLoading(true);
      setHardError(null);
      try {
        const rawFromDraft = buildReviewCoercionRawIntakeFromDraft(dWithRecipientUi, intakeCombined);
        const rawIntake = (rawFromDraft || finalTranscriptRef.current || "").trim();
        trackFunnelEvent("generate_clicked", {
          ready_state: intakeGuidedComplete,
          intake_chars: rawIntake.length,
          max_step_reached: funnelMaxStepRef.current,
          production_phase: "simple_workspace_ready_send",
        });
        const partiesForCtx = (dWithRecipientUi?.parties ?? []) as { email?: string }[];
        const resolvedR1 =
          looksLikeEmail(recipient1Email) ? stripRecipientEmailNoise(recipient1Email) : partyEmailAtIndex(partiesForCtx, 0);
        const resolvedR2 =
          looksLikeEmail(recipient2Email) ? stripRecipientEmailNoise(recipient2Email) : partyEmailAtIndex(partiesForCtx, 1);
        const partyCtx = [
          rawIntake,
          recipient1Name.trim(),
          resolvedR1,
          recipient2Name.trim(),
          resolvedR2,
          sanitizeStarterSignerLabelsLine(recipientSignerLabels),
        ]
          .filter(Boolean)
          .join("\n");
        const ok = await runPersistAndOpen(dWithRecipientUi, partyCtx, undefined, undefined, "send");
        if (!ok) {
          setDisplayPhase("intake");
          setHardError(
            "We couldn’t finish sending from this screen. Your draft is still here — try again in a moment, or reopen review from My agreements.",
          );
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] simpleWorkspacePersistSend error", e);
        setDisplayPhase("intake");
        setHardError("Something went wrong while sending. Your draft is still here — try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!intakeTrim) {
      if (import.meta.env.DEV) {
        devSendCtaTrace("return: empty intakeTrim (parse-from-intake path only)", {
          simpleCreateReadyForSend,
          createProductionTwoPane,
          hasDraft: Boolean(draft),
        });
      }
      return;
    }
    trackFunnelEvent("generate_clicked", {
      ready_state: intakeGuidedComplete,
      intake_chars: intakeCombined.trim().length,
      max_step_reached: funnelMaxStepRef.current,
    });
    if (simpleProductFlow && liveWorkspaceTwoPane && intakeReadiness) {
      logProductEvent("readiness_continue_clicked", {
        level: intakeReadiness.level,
        missingSignalsCount: intakeReadiness.missingSignals.length,
        surface: "agreement_intake",
        route: "create",
      });
    }
    console.log("[AgreementIntake] generate: submit clicked");
    setLoading(true);
    setHardError(null);
    if (createProductionTwoPane) {
      console.debug("[handoff-start]", {
        source: "onGenerate_parse_path",
        createUiStage,
        createFlowPhase_before: createFlowPhase,
        displayPhase_before: displayPhase,
      });
      setCreateFlowPhase("generating_draft");
    }
    setDisplayPhase("generating_draft");
    try {
      finalTranscriptRef.current = intakeCombined.trim();
      const rawIntake = intakeCombined.trim();
      let parsed = await parseDraft(rawIntake);
      parsed = { ...parsed, payment: extractIntakePayment(rawIntake) };
      parsed = runIntakeDefaultsAndRoles(parsed, rawIntake, simpleProductFlow, intakePartyRoleLabels);
      if (createProductionTwoPane) {
        parsed = alignParsedWithCanonicalType(parsed, rawIntake);
      }
      parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
      if (simpleInstantProductionSurface) {
        parsed = applySimpleFlowSmartDefaults(parsed, rawIntake);
        if (createProductionTwoPane) {
          parsed = alignParsedWithCanonicalType(parsed, rawIntake);
        }
        parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
      }
      setDraft(parsed);
      let nextMissing = computeMissing(parsed);
      if (nextMissing.length > 0 && simpleInstantProductionSurface) {
        parsed = applySimpleFlowSmartDefaults(parsed, rawIntake);
        if (createProductionTwoPane) {
          parsed = alignParsedWithCanonicalType(parsed, rawIntake);
        }
        parsed = normalizeParsedDraftLegalConcepts(parsed, rawIntake);
        setDraft(parsed);
        nextMissing = computeMissing(parsed);
      }
      setMissing(simpleInstantProductionSurface && nextMissing.length > 0 ? [] : nextMissing);
      setMissingAnswer("");
      if (nextMissing.length === 0 || simpleInstantProductionSurface || createProductionTwoPane) {
        const ok = await runPersistAndOpen(parsed, rawIntake);
        if (!ok) setDisplayPhase("intake");
      } else {
        setFollowUpDetailTotal(nextMissing.length);
        setDisplayPhase("followup_required");
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] onGenerate parse/persist path", e);
      setDisplayPhase("intake");
    } finally {
      setLoading(false);
    }
  };

  const continueWithPlaceholderFill = async () => {
    if (!draft) return;
    await finalizeIntakeCapture();
    const rawIntake = intakeCombined.trim();
    const filled = runIntakeDefaultsAndRoles(
      { ...draft, payment: extractIntakePayment(rawIntake) },
      rawIntake,
      simpleProductFlow,
      intakePartyRoleLabels,
    );
    let filledWithRoles = filled;
    if (createProductionTwoPane) {
      filledWithRoles = alignParsedWithCanonicalType(filledWithRoles, rawIntake);
    }
    filledWithRoles = normalizeParsedDraftLegalConcepts(filledWithRoles, rawIntake);
    setDraft(filledWithRoles);
    setMissing([]);
    setMissingAnswer("");
    if (createProductionTwoPane) {
      setDisplayPhase("intake");
      setDraftNowCommitted(true);
      setCreateFlowPhase("draft_ready_for_review");
      setCreateUiStage(CreateUiStage.DRAFT);
      setMobileWorkspacePane("preview");
      return;
    }
    setLoading(true);
    setHardError(null);
    setDisplayPhase("generating_draft");
    try {
      const ok = await runPersistAndOpen(filledWithRoles, rawIntake);
      if (!ok) setDisplayPhase("followup_required");
    } finally {
      setLoading(false);
    }
  };

  const applyMissingAnswer = async (value: string) => {
    if (!draft || missing.length === 0) return;
    await finalizeIntakeCapture();
    const target = missing[0];
    const rawIntake = intakeCombined.trim();
    let patched: ParsedDraftShape = {
      ...applyMissingValue(draft, target, value),
      payment: extractIntakePayment(rawIntake),
    };
    patched = normalizeParsedDraftLegalConcepts(patched, rawIntake);
    setDraft(patched);
    const nextMissing = computeMissing(patched);
    setMissing(nextMissing);
    setMissingAnswer("");
    if (nextMissing.length > 0) return;
    const followCtx = [
      finalTranscriptRef.current,
      ...(patched.parties || []).map((p) => p.name),
      patched.purpose,
      patched.title,
    ]
      .filter(Boolean)
      .join("\n");
    let patchedWithRoles = simpleProductFlow ? applyIntakePartyRoleOverlay(patched, intakePartyRoleLabels) : patched;
    if (createProductionTwoPane) {
      patchedWithRoles = alignParsedWithCanonicalType(patchedWithRoles, rawIntake);
    }
    patchedWithRoles = normalizeParsedDraftLegalConcepts(patchedWithRoles, rawIntake);
    if (createProductionTwoPane) {
      setDraft(patchedWithRoles);
      setDisplayPhase("intake");
      setDraftNowCommitted(true);
      setCreateFlowPhase("draft_ready_for_review");
      setCreateUiStage(CreateUiStage.DRAFT);
      setMobileWorkspacePane("preview");
      return;
    }
    setLoading(true);
    setHardError(null);
    setDisplayPhase("generating_draft");
    try {
      const ok = await runPersistAndOpen(patchedWithRoles, followCtx);
      if (!ok) setDisplayPhase("followup_required");
    } finally {
      setLoading(false);
    }
  };

  const returnToIntakeEditing = () => {
    setIsEditingDescription(false);
    setDisplayPhase("intake");
    setMissing([]);
    reviewWorkspaceSessionRef.current += 1;
    clearCreateReviewAgreementResumeId();
    productionResumeHydratedRef.current = false;
    setReviewAgreementId(null);
    setComplexityPendingParsed(null);
    agreementDocumentDirtyRef.current = false;
    setAgreementDocumentText("");
    setReviewDocRefreshTick(0);
    window.clearTimeout(agreementDocSyncTimerRef.current);
    setDraft(null);
    setMissingAnswer("");
    setHardError(null);
    setFollowUpDetailTotal(0);
    setPreviewPaneRevealed(false);
    if (createProductionTwoPane) {
      setCreateFlowPhase("capturing_input");
      setCreateUiStage(CreateUiStage.INPUT);
      setDraftNowCommitted(false);
      setRecipient1Name("");
      setRecipient1Email("");
      setRecipient2Name("");
      setRecipient2Email("");
      setRecipientSignerLabels("");
      setRecipientsDeferred(false);
      setAgreementTypeAccepted(false);
    }
    if (simpleProductFlow && liveWorkspaceTwoPane && !continuitySourcePanel) {
      const merged = intakeCombined.trim();
      setIntakeBaselineCommitted("");
      setIntakeStepBuffer(merged);
      setDebouncedStepBuffer(merged);
      setBaselineActionAck(null);
    }
    prevFirstMissingRef.current = "unset";
  };

  const handleFollowUpOrLegacyEditDescriptionClick = React.useCallback(() => {
    if (createProductionTwoPane && (draft != null || createUiStage === CreateUiStage.DRAFT)) {
      setIsEditingDescription(true);
      setMobileWorkspacePane("preview");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    returnToIntakeEditing();
  }, [createProductionTwoPane, draft, createUiStage, returnToIntakeEditing]);

  const commitBaselineFromTypedDescription = React.useCallback((): boolean => {
    const step = intakeStepBuffer.trim();
    if (step.length < 6) return false;
    const live = buildLiveDraftPreview(step);
    if (!isUsablePartialIntakeStructure(live, step) && !meetsMinimalIntakeProgress(step, live)) return false;
    setIntakeBaselineCommitted(step);
    setIntakeStepBuffer("");
    setDebouncedStepBuffer("");
    setBaselineActionAck(buildActionAcknowledgementLine(step));
    prevFirstMissingRef.current = "unset";
    setPreviewPaneRevealed(false);
    if (!firstInputTrackedRef.current) {
      firstInputTrackedRef.current = true;
      trackFunnelEvent("first_input", { chars: step.length, source: "start_cta" });
    }
    return true;
  }, [intakeStepBuffer, trackFunnelEvent]);

  const primaryBtn = workspaceUi
    ? "btn shrink-0 bg-emerald-600 px-6 py-3 text-[0.9375rem] font-semibold text-white shadow-md shadow-emerald-600/40 ring-1 ring-emerald-300/35 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/35 disabled:opacity-60 md:text-base lg:text-[1.125rem]"
    : "btn bg-emerald-600 px-6 py-3 text-xs text-white shadow-md shadow-emerald-950/45 ring-1 ring-emerald-400/30 hover:bg-emerald-500 disabled:opacity-60";

  /** Legacy per-field follow-up stack — suppressed on simple instant path so plain English → draft stays modern. */
  const showFollowUpOnly =
    displayPhase === "followup_required" && missing.length > 0 && !simpleInstantProductionSurface;
  /** Keep the staged create shell mounted whenever production two-pane is past intake (avoids unified CTA / legacy lane split bugs). */
  const productionCreateWorkspaceShellActive = Boolean(
    createProductionTwoPane &&
      liveWorkspaceTwoPane &&
      simpleProductFlow &&
      !showFollowUpOnly &&
      (createUiStage === CreateUiStage.DRAFT ||
        createUiStage === CreateUiStage.RECIPIENTS ||
        createFlowPhase === "complexity_choice_required" ||
        createFlowPhase === "draft_ready_for_review" ||
        createFlowPhase === "recipient_setup_required" ||
        createFlowPhase === "ready_to_send"),
  );
  const showMainIntakeForm =
    displayPhase === "intake" ||
    (liveWorkspaceTwoPane &&
      (displayPhase === "generating_draft" ||
        displayPhase === "hydrating_generated" ||
        displayPhase === "preparing_review")) ||
    productionCreateWorkspaceShellActive ||
    Boolean(
      premiumPostCheckoutPhase && liveWorkspaceTwoPane && simpleProductFlow && createProductionTwoPane,
    );

  useEffect(() => {
    if (!showFollowUpOnly) {
      setFollowUpEnterReady(false);
      return;
    }
    const trimmed = missingAnswer.trim();
    if (!trimmed) {
      setFollowUpEnterReady(false);
      return;
    }
    setFollowUpEnterReady(false);
    const id = window.setTimeout(() => setFollowUpEnterReady(true), FOLLOW_UP_ENTER_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [missingAnswer, showFollowUpOnly]);

  function handleFollowUpAnswerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (loading || !missingAnswer.trim() || !followUpEnterReady) return;
    void applyMissingAnswer(missingAnswer);
  }

  const isGenerating =
    displayPhase === "generating_draft" ||
    displayPhase === "hydrating_generated" ||
    displayPhase === "preparing_review" ||
    loading;

  /**
   * Authoritative: user has left the first-time “describe only” INPUT shell (generation started or draft exists).
   * Used so the legacy intake chrome never flashes between INPUT → DRAFT (state-driven, not refs).
   */
  const hasEnteredDraftFlow = Boolean(
    draft != null ||
      createUiStage !== CreateUiStage.INPUT ||
      createFlowPhase === "generating_draft" ||
      displayPhase === "generating_draft" ||
      createFlowPhase === "complexity_choice_required" ||
      createFlowPhase === "draft_ready_for_review" ||
      createFlowPhase === "recipient_setup_required" ||
      createFlowPhase === "ready_to_send" ||
      displayPhase === "followup_required" ||
      Boolean(complexityPendingParsed),
  );

  /** Reactive: production handoff / review / refine / workspace prep — never use refs for UI gating. */
  const hasEnteredReviewState = Boolean(
    Boolean(draft) ||
      Boolean(reviewAgreementId?.trim()) ||
      createUiStage === CreateUiStage.DRAFT ||
      createUiStage === CreateUiStage.RECIPIENTS ||
      isGenerating ||
      createFlowPhase === "generating_draft" ||
      createFlowPhase === "draft_ready_for_review" ||
      createFlowPhase === "recipient_setup_required" ||
      createFlowPhase === "ready_to_send" ||
      reviewWorkspaceBootstrapping,
  );
  /** Advanced gate: staged left intentionally returns null (see `renderProductionStagedLeft`) while preview holds the UI — do not keep a fixed-width empty column. */
  const complexityGateActive = Boolean(
    createProductionTwoPane && createFlowPhase === "complexity_choice_required",
  );
  /** Sole production gate for the large legacy “Describe / Say or type” intake chrome (never during handoff or review). */
  const shouldShowProductionInputShell = Boolean(
    createProductionTwoPane &&
      createUiStage === CreateUiStage.INPUT &&
      !hasEnteredDraftFlow &&
      !draft &&
      !isGenerating &&
      !reviewWorkspaceBootstrapping &&
      createFlowPhase === "capturing_input" &&
      displayPhase === "intake" &&
      !isEditingDescription &&
      !premiumPostCheckoutPhase,
  );
  const showLegacyIntakeShell = Boolean(
    createUiStage === CreateUiStage.INPUT &&
      !hasEnteredDraftFlow &&
      !isEditingDescription &&
      !isGenerating &&
      (createProductionTwoPane
        ? displayPhase === "intake" && createFlowPhase === "capturing_input" && shouldShowProductionInputShell
        : !hasReviewState && !hasEnteredDraftFlow),
  );
  /** Production left column: use staged rail unless stage‑A first paint before review (else branch = legacy two‑pane intake chrome). */
  const productionUseStagedLeftColumn = Boolean(
    createProductionTwoPane &&
      (!(stageAInputFirst && shouldShowProductionInputShell && createUiStage === CreateUiStage.INPUT) ||
        hasEnteredReviewState ||
        hasEnteredDraftFlow ||
        isEditingDescription),
  );

  const showingReviewLoadingOverlay = Boolean(
    productionDraftPrimaryReviewSurface &&
      createUiStage === CreateUiStage.DRAFT &&
      createFlowPhase === "generating_draft" &&
      !draft,
  );

  useEffect(() => {
    if (!createProductionTwoPane) return;
    console.debug("[review-handoff]", {
      createUiStage,
      createFlowPhase,
      displayPhase,
      showingLegacyShell: showLegacyIntakeShell,
      showingReviewOverlay: showingReviewLoadingOverlay,
      hasDraft: Boolean(draft),
    });
  }, [
    createProductionTwoPane,
    createUiStage,
    createFlowPhase,
    displayPhase,
    showLegacyIntakeShell,
    showingReviewLoadingOverlay,
    draft,
  ]);

  useEffect(() => {
    if (!createProductionTwoPane || createUiStage !== CreateUiStage.DRAFT) return;
    const hasP = draftHasPlaceholderParties(draft);
    const hasF = draftHasPlaceholderFieldsForRecipients(draft);
    console.debug("[review-placeholder-guard]", {
      hasPlaceholderParties: hasP,
      hasPlaceholderFields: hasF,
      continueAllowed: Boolean(draft && !hasP && !isGenerating),
    });
  }, [createProductionTwoPane, createUiStage, draft, isGenerating]);

  useEffect(() => {
    if (!createProductionTwoPane) return;
    console.debug("[review-gate]", {
      createUiStage,
      createFlowPhase,
      displayPhase,
      draft: Boolean(draft),
      isGenerating,
      reviewWorkspaceBootstrapping,
      hasEnteredReviewState,
      shouldShowProductionInputShell,
    });
  }, [
    createProductionTwoPane,
    createUiStage,
    createFlowPhase,
    displayPhase,
      draft,
      isGenerating,
      reviewWorkspaceBootstrapping,
    hasEnteredReviewState,
    shouldShowProductionInputShell,
  ]);

  useEffect(() => {
    if (!productionDraftPrimaryReviewSurface) return;
    console.debug("[review-editor-mount]");
    return () => {
      console.debug("[review-editor-unmount]");
    };
  }, [productionDraftPrimaryReviewSurface]);

  /** Canonical structured model for review card + agreement preview (same as `draft` once review exists). */
  const reviewDraft = draft;

  useLayoutEffect(() => {
    complexityPendingParsedRef.current = complexityPendingParsed;
  }, [complexityPendingParsed]);

  useLayoutEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow || complexityResumeHydratedRef.current) return;
    if (readPremiumCompletionSnapshot()) {
      complexityResumeHydratedRef.current = true;
      return;
    }
    const resume = readCreateComplexityResume();
    if (!resume?.pending) {
      complexityResumeHydratedRef.current = true;
      return;
    }
    if (resume.resume_kind === "optional_full_upgrade") {
      complexityResumeHydratedRef.current = true;
      return;
    }
    complexityResumeHydratedRef.current = true;
    const stored = readAgreementCreatorIntakeStorage().trim();
    if (stored !== resume.rawIntake.trim()) return;
    setComplexityPendingParsed(resume.pending);
    setCreateFlowPhase("complexity_choice_required");
    setDisplayPhase("intake");
    setCreateUiStage(CreateUiStage.DRAFT);
    setLoading(false);
    setDraft(null);
  }, [createProductionTwoPane, simpleProductFlow]);

  /** Premium unlock: complexity-gate full draft, or optional full-draft upgrade after checkout / tier sync. */
  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    const rawIntake = intakeCombined.trim() || readAgreementCreatorIntakeStorage().trim();
    if (!rawIntake) return;

    try {
      if (new URL(window.location.href).searchParams.get("premiumCompletion") === "1") return;
    } catch {
      /* ignore */
    }

    if (readPremiumCompletionSnapshot()) return;

    const resume = readCreateComplexityResume();
    const tierOk = tierAllowsAdvancedFullDraftReveal(tier);
    const grantWaiting = peekAdvancedFullDraftCheckoutGrant();

    if (resume?.resume_kind === "optional_full_upgrade" && resume.awaitingProCheckout) {
      if (resume.rawIntake.trim() !== rawIntake.trim()) return;
      if (tierOk) {
        clearCreateComplexityResume();
        return;
      }
      if (!grantWaiting) return;
      void runOptionalFullDraftUpgrade({
        rawIntake,
        priorDraft: resume.pending,
        showSuccessBanner: true,
        consumeCheckoutGrant: true,
      });
      return;
    }

    if (createFlowPhase !== "complexity_choice_required" || !complexityPendingParsed) return;

    const applyFullAdvancedFromGate = (raw: string, pending: ParsedDraftShape): void => {
      let next: ParsedDraftShape = { ...pending };
      next = runIntakeDefaultsAndRoles(next, raw, simpleProductFlow, intakePartyRoleLabels);
      next = alignParsedWithCanonicalType(next, raw);
      next = normalizeParsedDraftLegalConcepts(next, raw);
      clearCreateComplexityResume();
      setReviewShowsSimplifiedAdvancedDraft(false);
      setAdvancedFullDraftPaywallOpen(false);
      commitParsedDraftToReviewFlow(next);
    };

    if (tierOk) {
      if (peekAdvancedFullDraftCheckoutGrant()) consumeAdvancedFullDraftCheckoutGrant();
      applyFullAdvancedFromGate(rawIntake, complexityPendingParsed);
      return;
    }

    if (!grantWaiting) return;
    const resume2 = readCreateComplexityResume();
    if (!resume2?.awaitingProCheckout || resume2.rawIntake.trim() !== rawIntake.trim()) return;
    if (resume2.resume_kind === "optional_full_upgrade") return;
    if (!consumeAdvancedFullDraftCheckoutGrant()) return;
    applyFullAdvancedFromGate(rawIntake, complexityPendingParsed);
  }, [
    createProductionTwoPane,
    simpleProductFlow,
    createFlowPhase,
    complexityPendingParsed,
    intakeCombined,
    tier,
    intakePartyRoleLabels,
    alignParsedWithCanonicalType,
    runOptionalFullDraftUpgrade,
  ]);

  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    const onVis = () => {
      if (document.visibilityState === "visible") refreshUsage();
    };
    const onShow = () => refreshUsage();
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, [createProductionTwoPane, simpleProductFlow, refreshUsage]);

  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    try {
      const url = new URL(window.location.href);
      if (url.pathname !== "/app/create" || url.searchParams.get("advancedFullDraft") !== "1") return;
      url.searchParams.delete("advancedFullDraft");
      const qs = url.searchParams.toString();
      window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
    } catch {
      /* ignore */
    }
  }, [createProductionTwoPane, simpleProductFlow]);

  useEffect(() => {
    if (!fullDraftUpgradeBannerVisible) return;
    window.clearTimeout(fullDraftUpgradeBannerTimerRef.current);
    fullDraftUpgradeBannerTimerRef.current = window.setTimeout(() => {
      setFullDraftUpgradeBannerVisible(false);
      fullDraftUpgradeBannerTimerRef.current = 0;
    }, 4000);
    const onScroll = () => setFullDraftUpgradeBannerVisible(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(fullDraftUpgradeBannerTimerRef.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [fullDraftUpgradeBannerVisible]);

  useLayoutEffect(() => {
    agreementDocumentTextRef.current = agreementDocumentText;
  }, [agreementDocumentText]);

  useLayoutEffect(() => {
    if (!productionDraftPrimaryReviewSurface) return;
    if (!draft) {
      setAgreementDocumentText("");
      return;
    }
    if (agreementDocumentDirtyRef.current) return;
    try {
      const starterPreview = !(
        tierAllowsAdvancedFullDraftReveal(tier) ||
        draftHasFullDraftExpansion(draft) ||
        premiumSendPathUnlocked ||
        premiumPersistedFlowActive
      );
      setAgreementDocumentText(
        buildAgreementPreviewText(draft, {
          starterPreview,
          premiumDeliverablePreview: !starterPreview,
          intakeText: debouncedStepBuffer,
        }),
      );
    } catch {
      setAgreementDocumentText("");
    }
  }, [
    draft,
    productionDraftPrimaryReviewSurface,
    reviewDocRefreshTick,
    tier,
    premiumSendPathUnlocked,
    premiumPersistedFlowActive,
    debouncedStepBuffer,
  ]);

  const scheduleAgreementDocSync = React.useCallback((text: string) => {
    window.clearTimeout(agreementDocSyncTimerRef.current);
    agreementDocSyncTimerRef.current = window.setTimeout(() => {
      setDraft((prev) => {
        if (!prev) return prev;
        const patch = extractStructuredPatchesFromPreview(text, prev);
        if (Object.keys(patch).length === 0) return prev;
        return { ...prev, ...patch };
      });
    }, 450);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(agreementDocSyncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!createProductionTwoPane || !productionDraftPrimaryReviewSurface) return;
    console.debug("[review-model]", {
      draftExists: Boolean(draft),
      reviewDraftExists: Boolean(reviewDraft),
      renderedPreviewExists: renderedAgreementPreview.length > 0,
      structuredSource: "reviewDraft",
      fullPreviewSource: "buildAgreementPreviewText(reviewDraft)",
    });
  }, [createProductionTwoPane, productionDraftPrimaryReviewSurface, draft, reviewDraft, renderedAgreementPreview]);

  useEffect(() => {
    if (!createProductionTwoPane || !productionDraftPrimaryReviewSurface) return;
    console.debug("[full-preview-source]", {
      source: "renderedAgreementPreview",
      length: renderedAgreementPreview.length,
    });
  }, [createProductionTwoPane, productionDraftPrimaryReviewSurface, renderedAgreementPreview]);

  const intakeRefinementWarning = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || isGenerating) return null;
    const ex = livePreviewModel.extraction;
    if (!ex) return null;
    const bits: string[] = [];
    /** Free-tier recipients: keep the step clean — no “scope partial” nudge above Add recipients. */
    const skipScopePartialMicrocopy =
      createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      !premiumRecipientUxActive &&
      !premiumPersistedFlowActive;
    if (
      !skipScopePartialMicrocopy &&
      !scopeGuessConfirmed &&
      (ex.scopeInferred || (ex.scopeSignalPresent && ex.scopeConfidence < 0.72)) &&
      (livePreviewModel.scopeLine || "").trim().length > 0
    ) {
      bits.push("Scope looks partial — you can refine later.");
    } else if (
      !skipScopePartialMicrocopy &&
      !scopeGuessConfirmed &&
      scopeLooksVague(livePreviewModel) &&
      (livePreviewModel.scopeLine || "").trim().length > 0
    ) {
      bits.push("Scope looks partial — you can refine later.");
    }
    if (
      !termGuessConfirmed &&
      ex.termInferred &&
      ((livePreviewModel.termLine || "").trim().length > 0 || (livePreviewModel.scheduleLine || "").trim().length > 0)
    ) {
      bits.push("Timing looks partial — you can refine later.");
    }
    return bits.length ? bits.join(" ") : null;
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    isGenerating,
    livePreviewModel,
    scopeGuessConfirmed,
    termGuessConfirmed,
    createProductionTwoPane,
    createUiStage,
    premiumRecipientUxActive,
    premiumPersistedFlowActive,
  ]);

  const intakeEngaged =
    intakeCombined.trim().length > 0 ||
    intakeDictationPhase === "recording" ||
    intakeDictationPhase === "processing";
  /** During two-pane generation the right preview carries status — avoid competing rotating lines under the textarea. */
  const confidenceActive =
    liveWorkspaceTwoPane ? intakeEngaged && !isGenerating : intakeEngaged || isGenerating;
  const confidenceHint = useInputConfidenceHint(Boolean(confidenceActive));
  const hideIntakeMicrocopy =
    freshSimpleCreateUx && liveWorkspaceTwoPane && showMainIntakeForm && !showFollowUpOnly;

  const followUpProgressRatio =
    followUpDetailTotal > 0 && missing.length > 0 && followUpDetailTotal > 1
      ? Math.min(
          1,
          Math.max(0, (followUpDetailTotal - missing.length + 1 - 1) / (followUpDetailTotal - 1)),
        )
      : 0;
  const missingKey = missing[0];

  const guidedStepOpts = useMemo(
    () => ({ stepBuffer: useGuidedSplitIntake ? debouncedStepBuffer : undefined }),
    [useGuidedSplitIntake, debouncedStepBuffer],
  );

  const nextIntakeQuestion = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || !showMainIntakeForm || showFollowUpOnly) return null;
    if (hardError || loading || isGenerating) return null;
    return getNextQuestion(intakeGuidanceCombined.trim(), livePreviewModel, agreementIntakeDraft, guidedStepOpts);
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    showMainIntakeForm,
    showFollowUpOnly,
    hardError,
    loading,
    isGenerating,
    intakeGuidanceCombined,
    livePreviewModel,
    agreementIntakeDraft,
    guidedStepOpts,
  ]);

  const guidedStructureComplete = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || !showMainIntakeForm || showFollowUpOnly) return false;
    if (hardError || loading) return false;
    /** Parsed draft exists past INPUT — do not let intake heuristics block production Continue / legacy lane. */
    if (createProductionTwoPane && createUiStage !== CreateUiStage.INPUT && draft) return true;
    const t = intakeGuidanceCombined.trim();
    if (t.length < 6) return false;
    if (meetsMinimalIntakeProgress(t, livePreviewModel)) return true;
    if (!isUsablePartialIntakeStructure(livePreviewModel, t)) return false;
    return getNextQuestion(t, livePreviewModel, agreementIntakeDraft, guidedStepOpts) === null;
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    showMainIntakeForm,
    showFollowUpOnly,
    hardError,
    loading,
    createProductionTwoPane,
    createUiStage,
    draft,
    intakeGuidanceCombined,
    livePreviewModel,
    agreementIntakeDraft,
    guidedStepOpts,
  ]);

  const upgradeLockActive = useMemo(
    () => Boolean(upgradeIntentDetected && !hasFullDraftAccess),
    [upgradeIntentDetected, hasFullDraftAccess],
  );

  useEffect(() => {
    upgradeIntentDetectedRef.current = upgradeIntentDetected;
  }, [upgradeIntentDetected]);

  useEffect(() => {
    pendingUpgradePromptRef.current = pendingUpgradePrompt;
  }, [pendingUpgradePrompt]);

  useEffect(() => {
    upgradeLockActiveRef.current = upgradeLockActive;
  }, [upgradeLockActive]);

  useEffect(() => {
    if (!hasFullDraftAccess) return;
    if (peekAdvancedFullDraftCheckoutGrant()) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("premiumCompletion") === "1") return;
    } catch {
      /* ignore */
    }
    try {
      const r = readCreateComplexityResume();
      if (r?.premiumUpgradeNotes?.trim()) return;
    } catch {
      /* ignore */
    }
    setUpgradeIntentDetected(false);
    setPendingUpgradePrompt("");
    pendingUpgradePromptRef.current = "";
    syncUpgradeIntentRefs(false);
  }, [hasFullDraftAccess, syncUpgradeIntentRefs]);

  const showUpgradeToFullDraftCta = useMemo(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return false;
    if (premiumSendPathUnlocked || premiumPersistedFlowActive) return false;
    if (tierAllowsAdvancedFullDraftReveal(tier)) return false;
    if (upgradeLockActive && createUiStage === CreateUiStage.DRAFT && draft && !loading && !isGenerating) return true;
    if (createUiStage === CreateUiStage.RECIPIENTS) return false;
    if (createFlowPhase === "recipient_setup_required" || createFlowPhase === "ready_to_send") return false;
    if (loading || isGenerating) return false;
    if (createFlowPhase === "complexity_choice_required") return false;
    if (reviewShowsSimplifiedAdvancedDraft) return false;
    if (draftHasFullDraftExpansion(draft)) return false;
    if (fullDraftUpgradeBannerVisible) return false;
    const hasBody = Boolean(draft) || intakeCombined.trim().length >= 28;
    if (!hasBody) return false;
    return true;
  }, [
    createProductionTwoPane,
    simpleProductFlow,
    tier,
    createUiStage,
    createFlowPhase,
    loading,
    isGenerating,
    reviewShowsSimplifiedAdvancedDraft,
    draft,
    intakeCombined,
    fullDraftUpgradeBannerVisible,
    upgradeLockActive,
    premiumSendPathUnlocked,
    premiumPersistedFlowActive,
  ]);

  const showUpgradeIntakeFullDraftCallout = useMemo(() => {
    if (suppressIntakePremiumUpsell) return false;
    if (freshSimpleCreateUx) return false;
    if (!showUpgradeToFullDraftCta) return false;
    if (createUiStage !== CreateUiStage.INPUT) return false;
    if (showFollowUpOnly) return false;
    const t = intakeCombined.trim();
    if (t.length < 40) return false;
    return detectFullDraftUpgradeSignals(t, null, livePreviewModel.partiesLine);
  }, [
    showUpgradeToFullDraftCta,
    createUiStage,
    showFollowUpOnly,
    intakeCombined,
    livePreviewModel.partiesLine,
    freshSimpleCreateUx,
    suppressIntakePremiumUpsell,
  ]);

  const upgradeIntentSignals = useMemo<UpgradeIntentSignal[]>(
    () => detectUpgradeIntentSignals(`${intakeCombined.trim()}\n${agreementDocumentText}`),
    [intakeCombined, agreementDocumentText],
  );

  const showUpgradeToFullDraftOnReview = useMemo(() => {
    if (suppressIntakePremiumUpsell) return false;
    if (premiumPersistedFlowActive || premiumSendPathUnlocked) return false;
    if (upgradeLockActive && createUiStage === CreateUiStage.DRAFT && draft) {
      if (displayPhase === "followup_required") return false;
      return true;
    }
    if (!showUpgradeToFullDraftCta) return false;
    if (createUiStage !== CreateUiStage.DRAFT) return false;
    if (!draft) return false;
    if (reviewShowsSimplifiedAdvancedDraft) return false;
    if (displayPhase === "followup_required") return false;
    return createFlowPhase === "draft_ready_for_review";
  }, [
    upgradeLockActive,
    showUpgradeToFullDraftCta,
    createUiStage,
    draft,
    reviewShowsSimplifiedAdvancedDraft,
    createFlowPhase,
    displayPhase,
    premiumPersistedFlowActive,
    premiumSendPathUnlocked,
    suppressIntakePremiumUpsell,
  ]);

  /** Paid simple-home review: full-draft chrome (not starter tease / not free compact). */
  const premiumPaidDocumentSurface = useMemo(
    () =>
      Boolean(
        productionDraftPrimaryReviewSurface &&
          createUiStage === CreateUiStage.DRAFT &&
          hasFullDraftAccess &&
          !showUpgradeToFullDraftOnReview,
      ),
    [
      productionDraftPrimaryReviewSurface,
      createUiStage,
      hasFullDraftAccess,
      showUpgradeToFullDraftOnReview,
    ],
  );

  useLayoutEffect(() => {
    const surface = premiumPaidDocumentSurface;
    if (!surface) {
      wasPremiumPaidDocumentSurfaceRef.current = false;
      return;
    }
    const became = !wasPremiumPaidDocumentSurfaceRef.current;
    wasPremiumPaidDocumentSurfaceRef.current = true;
    if (!became) return;
    const raw = agreementDocumentTextRef.current;
    const next = stripPremiumInstructionNoiseForDocument(raw);
    if (next !== raw) {
      setAgreementDocumentText(next);
      scheduleAgreementDocSync(next);
    }
  }, [premiumPaidDocumentSurface, scheduleAgreementDocSync]);

  const premiumPostCheckoutSummaryVisible = useMemo(
    () =>
      Boolean(
        premiumPersistedFlowActive &&
          peekPremiumPostCheckoutRevealDismissed() &&
          !peekPremiumRecipientsSurfaceReleased() &&
          createUiStage === CreateUiStage.DRAFT &&
          draft,
      ),
    [
      premiumPersistedFlowActive,
      createUiStage,
      draft,
      premiumSurfaceGateTick,
    ],
  );

  const showFinalizeYourAgreement = useMemo(
    () =>
      Boolean(
        createProductionTwoPane &&
          simpleProductFlow &&
          premiumPaidDocumentSurface &&
          createUiStage === CreateUiStage.DRAFT &&
          draft &&
          productionDraftPrimaryReviewSurface,
      ),
    [
      createProductionTwoPane,
      simpleProductFlow,
      premiumPaidDocumentSurface,
      createUiStage,
      draft,
      productionDraftPrimaryReviewSurface,
    ],
  );

  /** Starter/basic review editor helper — independent of upgrade lock so copy stays visible while editing. */
  const starterReviewEditableHelperSurface = useMemo(() => {
    if (premiumPersistedFlowActive) return false;
    if (!showUpgradeToFullDraftCta) return false;
    if (createUiStage !== CreateUiStage.DRAFT) return false;
    if (!draft) return false;
    if (reviewShowsSimplifiedAdvancedDraft) return false;
    if (displayPhase === "followup_required") return false;
    return createFlowPhase === "draft_ready_for_review";
  }, [
    premiumPersistedFlowActive,
    showUpgradeToFullDraftCta,
    createUiStage,
    draft,
    reviewShowsSimplifiedAdvancedDraft,
    displayPhase,
    createFlowPhase,
  ]);

  const starterSafeEditHelperEl = useMemo(
    () =>
      starterReviewEditableHelperSurface ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500 sm:text-xs">{STARTER_SAFE_EDIT_HELPER}</p>
      ) : null,
    [starterReviewEditableHelperSurface],
  );

  /** Starter/free review: “original wording” must not mutate the free draft — premium checkout only. */
  const originalWordingIsPremiumOnlyOnStarter = useMemo(
    () =>
      Boolean(
        !tierAllowsAdvancedFullDraftReveal(tier) &&
          createProductionTwoPane &&
          createUiStage === CreateUiStage.DRAFT &&
          draft,
      ),
    [tier, createProductionTwoPane, createUiStage, draft],
  );

  useLayoutEffect(() => {
    showUpgradeToFullDraftOnReviewRef.current = showUpgradeToFullDraftOnReview;
  }, [showUpgradeToFullDraftOnReview]);

  const showFullDraftDiffPreview = useMemo(
    () =>
      Boolean(
        showUpgradeToFullDraftOnReview &&
          createUiStage === CreateUiStage.DRAFT &&
          draft &&
          !draftHasFullDraftExpansion(draft) &&
          !upgradeLockActive,
      ),
    [showUpgradeToFullDraftOnReview, createUiStage, draft, upgradeLockActive],
  );

  /** First simple pass: hide legacy “edit wording / optional clause” blocks so review stays clean. */
  const suppressSimpleFirstPassReviewExtras = useMemo(
    () =>
      Boolean(
        freshSimpleCreateUx &&
          createProductionTwoPane &&
          productionDraftPrimaryReviewSurface &&
          createUiStage === CreateUiStage.DRAFT &&
          !showUpgradeToFullDraftOnReview,
      ),
    [
      freshSimpleCreateUx,
      createProductionTwoPane,
      productionDraftPrimaryReviewSurface,
      createUiStage,
      showUpgradeToFullDraftOnReview,
    ],
  );

  const fullDraftComparisonRows = useMemo(
    () =>
      showFullDraftDiffPreview
        ? getFullDraftUpgradeComparisonRows(draft, intakeCombined, livePreviewModel.partiesLine, agreementDocumentText)
        : [],
    [showFullDraftDiffPreview, draft, intakeCombined, livePreviewModel.partiesLine, agreementDocumentText],
  );

  useLayoutEffect(() => {
    if (!showFullDraftDiffPreview || createUiStage !== CreateUiStage.DRAFT) return;
    const key = (reviewAgreementId ?? "").trim() || "local-draft";
    if (basicUpgradeCompareScrolledForKeyRef.current === key) return;
    basicUpgradeCompareScrolledForKeyRef.current = key;
    const id = window.requestAnimationFrame(() => {
      fullDraftUpgradeReviewCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [showFullDraftDiffPreview, createUiStage, reviewAgreementId]);

  useEffect(() => {
    if (guidedStructureComplete) return;

    const preserveProductionProgress =
      createProductionTwoPane &&
      (readPremiumCompletionSnapshot() != null ||
        Boolean(reviewAgreementId?.trim()) ||
        draft != null ||
        createUiStage !== CreateUiStage.INPUT ||
        createFlowPhase === "draft_ready_for_review" ||
        createFlowPhase === "recipient_setup_required" ||
        createFlowPhase === "ready_to_send" ||
        createFlowPhase === "generating_draft");

    if (preserveProductionProgress) return;

    setDraftNowCommitted(false);
    draftVoiceHandledRef.current = false;
    setDraftPreCommitFreeze(false);
    setUsedMainClauseSuggestionIds(new Set());
    setUsedContextSuggestionIds(new Set());
    if (draftPreCommitTimerRef.current) {
      window.clearTimeout(draftPreCommitTimerRef.current);
      draftPreCommitTimerRef.current = 0;
    }
    if (createProductionTwoPane) {
      setCreateFlowPhase("capturing_input");
      setCreateUiStage(CreateUiStage.INPUT);
      setRecipient1Name("");
      setRecipient1Email("");
      setRecipient2Name("");
      setRecipient2Email("");
      setRecipientSignerLabels("");
      setRecipientsDeferred(false);
      setAgreementTypeAccepted(false);
      setPremiumPostCheckoutPhase(null);
      setPremiumSendPathUnlocked(false);
      setPremiumRecipientUxActive(false);
      setPremiumPersistedFlowActive(false);
      setPremiumPipelineUserMessage(null);
    }
  }, [
    guidedStructureComplete,
    createProductionTwoPane,
    reviewAgreementId,
    draft,
    createUiStage,
    createFlowPhase,
  ]);

  useEffect(() => {
    if (!createProductionTwoPane || stageAInputFirst) return;
    if (createUiStage === CreateUiStage.RECIPIENTS) return;
    const id = window.setTimeout(() => {
      createStageScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (createUiStage === CreateUiStage.INPUT) {
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [createUiStage, createProductionTwoPane, stageAInputFirst]);

  useEffect(() => {
    if (createUiStage === CreateUiStage.RECIPIENTS) {
      basicUpgradeCompareScrolledForKeyRef.current = "";
    }
  }, [createUiStage]);

  useEffect(() => {
    if (!createProductionTwoPane) return;
    if (createUiStage === CreateUiStage.DRAFT && draft) {
      setMobileWorkspacePane("preview");
      setPreviewPaneRevealed(true);
    }
  }, [createProductionTwoPane, createUiStage, draft]);

  const draftPartiesPrefillKey = useMemo(
    () => JSON.stringify((draft?.parties || []).map((p) => [(p.name || "").trim(), (p.role || "").trim()])),
    [draft?.parties],
  );

  /** Prefill recipient names / signer labels from structured parties when fields are still empty. */
  useEffect(() => {
    if (!createProductionTwoPane || !draft?.parties?.length) return;
    const { n1, n2 } = getRecipientHandoffNamesFromDraft(draft);
    setRecipient1Name((prev) => pickRecipientNameForHandoff(prev, n1));
    setRecipient2Name((prev) => pickRecipientNameForHandoff(prev, n2));
    setRecipientSignerLabels((prev) =>
      pickRecipientSignerLabelsForHandoff(prev, n1, n2, {
        role1: draft.parties?.[0]?.role,
        role2: draft.parties?.[1]?.role,
      }),
    );
  }, [createProductionTwoPane, draftPartiesPrefillKey, draft]);

  useEffect(() => {
    reviewAgreementIdRef.current = reviewAgreementId;
  }, [reviewAgreementId]);

  useEffect(() => {
    if (!createProductionTwoPane) return;
    const id = reviewAgreementId?.trim();
    if (id) writeCreateReviewAgreementResumeId(id);
  }, [createProductionTwoPane, reviewAgreementId]);

  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow) return;
    const id = reviewAgreementId?.trim();
    if (!id || !draft) return;
    if (!draftHasFullDraftExpansion(draft)) return;
    writeFullDraftUpgradeMarkerAgreementId(id);
  }, [createProductionTwoPane, simpleProductFlow, reviewAgreementId, draft]);

  useEffect(() => {
    if ((initialIntakeText ?? "").trim().length > 0) {
      clearCreateReviewAgreementResumeId();
    }
  }, [initialIntakeText]);

  useEffect(() => {
    if (!createProductionTwoPane || !simpleProductFlow || !liveWorkspaceTwoPane) return;
    if (draft != null) return;
    if (productionResumeHydratedRef.current) return;
    const hid = readCreateReviewAgreementResumeId();
    if (!hid) return;
    productionResumeHydratedRef.current = true;
    void (async () => {
      try {
        const { ok, draft: ad } = await fetchAgreementDraft(hid, { partyNameContext: "Party" });
        if (!ok || !ad) {
          clearCreateReviewAgreementResumeId();
          productionResumeHydratedRef.current = false;
          return;
        }
        const rawIntake =
          [ad.title, ad.purpose, ad.payment_terms].filter(Boolean).join("\n\n").trim() || ad.purpose || "";
        const payment = extractIntakePayment(rawIntake);
        let next = coerceDraftFromApiPayload(ad as unknown, rawIntake, payment);
        next = runIntakeDefaultsAndRoles(next, rawIntake, simpleProductFlow, intakePartyRoleLabels);
        next = alignParsedWithCanonicalType(next, rawIntake);
        next = normalizeParsedDraftLegalConcepts(next, rawIntake);
        if (readFullDraftUpgradeMarkerAgreementId() === hid && !draftHasFullDraftExpansion(next)) {
          next = { ...next, additional_terms: FULL_DRAFT_EXPANSION_MARKER };
        }
        setReviewAgreementId(hid);
        setDraft(next);
        setMissing([]);
        setFollowUpDetailTotal(0);
        setCreateUiStage(CreateUiStage.DRAFT);
        setCreateFlowPhase("draft_ready_for_review");
        setDraftNowCommitted(true);
        setDisplayPhase("intake");
        setHardError(null);
        if (rawIntake.trim()) {
          setIntakeBaselineCommitted(rawIntake);
          setIntakeStepBuffer("");
          setDebouncedStepBuffer("");
        }
        setMobileWorkspacePane("preview");
        setPreviewPaneRevealed(true);
      } catch {
        clearCreateReviewAgreementResumeId();
        productionResumeHydratedRef.current = false;
      }
    })();
  }, [
    createProductionTwoPane,
    simpleProductFlow,
    liveWorkspaceTwoPane,
    draft,
    alignParsedWithCanonicalType,
    intakePartyRoleLabels,
  ]);

  /** Best-effort: create persisted row early so Send can reuse the same id (deduped inside ensure). Does not gate the refine UI. */
  useEffect(() => {
    if (!createProductionTwoPane || !productionDraftPrimaryReviewSurface || !draft || reviewAgreementId) return;
    void ensureReviewAgreementWorkspaceId();
  }, [
    createProductionTwoPane,
    productionDraftPrimaryReviewSurface,
    draft,
    reviewAgreementId,
    recipient1Name,
    ensureReviewAgreementWorkspaceId,
  ]);

  useEffect(
    () => () => {
      if (draftPreCommitTimerRef.current) {
        window.clearTimeout(draftPreCommitTimerRef.current);
        draftPreCommitTimerRef.current = 0;
      }
    },
    [],
  );

  const intakeGuidedComplete = guidedStructureComplete && !isGenerating;

  const simpleCreateUnifiedBottomCta = Boolean(
    simpleProductFlow &&
      liveWorkspaceTwoPane &&
      showMainIntakeForm &&
      !showFollowUpOnly &&
      !(createProductionTwoPane && createFlowPhase === "complexity_choice_required"),
  );
  /** Soft advisory above primary CTA when party names are still placeholders (never blocks upgrade). */
  const showPartyNamesPlaceholderHint = Boolean(
    simpleCreateUnifiedBottomCta &&
      createProductionTwoPane &&
      createUiStage === CreateUiStage.DRAFT &&
      Boolean(draft) &&
      draftHasPlaceholderParties(draft) &&
      !premiumPersistedFlowActive &&
      !(draftHasFullDraftExpansion(draft) || tierAllowsAdvancedFullDraftReveal(tier) || premiumSendPathUnlocked),
  );
  /** Hide fixed bottom bar during upgrade diff review so the in-card upgrade CTA is the only bottom action. */
  const simpleCreateStickyBottomBarVisible =
    simpleCreateUnifiedBottomCta && !showFullDraftDiffPreview;
  /** Production draft parse / hydrate: sticky showed NOTTHING_SENT + busy CTA — one line only. */
  const stickyProductionAgreementCreationLoading = Boolean(
    simpleCreateStickyBottomBarVisible &&
      createProductionTwoPane &&
      (displayPhase === "generating_draft" ||
        displayPhase === "hydrating_generated" ||
        displayPhase === "preparing_review"),
  );
  const stickyProductionAgreementCreatingLabel = "Creating your agreement… Please wait";
  const draftPartyRecipientEmailPresent = Boolean(
    (draft?.parties as { email?: string }[] | undefined)?.some((p) =>
      looksLikeEmail(String(p?.email ?? "")),
    ),
  );
  const hasAnyValidRecipientEmail =
    [recipient1Email, recipient2Email].some((e) => looksLikeEmail(String(e ?? ""))) || draftPartyRecipientEmailPresent;
  const productionReadyForPersist = Boolean(
    createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      draft &&
      agreementTypeAccepted &&
      (draft.parties?.length ?? 0) >= 1 &&
      (recipientsDeferred || hasAnyValidRecipientEmail),
  );
  const simpleCreateReadyForSend = Boolean(
    productionReadyForPersist ||
      (simpleCreateUnifiedBottomCta && guidedStructureComplete && draftNowCommitted && !createProductionTwoPane),
  );

  const premiumDefaultSendMode = useMemo((): PremiumSendIntent => {
    return inferPremiumDefaultSendMode({
      draft,
      agreementDocDirty: agreementDocumentDirtyRef.current,
      agreementDocumentText,
      intakeCombined,
      hasRecipientsReady: hasAnyValidRecipientEmail,
      suggestCollaboratePrimed: peekPremiumCollaborateFirstDefaultPrimed(),
      getDraftFirstReviewBlocker,
    });
  }, [draft, agreementDocumentText, intakeCombined, hasAnyValidRecipientEmail, premiumForkPrimedNonce]);

  const effectivePremiumSendMode = premiumSendModeUserChoice ?? premiumDefaultSendMode;

  const premiumRecipientSetupTitle = useMemo(() => {
    if (!premiumSignersSurfaceReady) return "Add recipients";
    if (productionReadyForPersist && !premiumSendModeTouched) return "Choose reviewer or signer path";
    return effectivePremiumSendMode === "review" ? "Reviewer Setup" : "Signer Setup";
  }, [
    premiumSignersSurfaceReady,
    productionReadyForPersist,
    premiumSendModeTouched,
    effectivePremiumSendMode,
  ]);

  const premiumRecipientSetupSubcopy = useMemo(() => {
    if (!premiumSignersSurfaceReady) return "";
    if (!productionReadyForPersist) {
      return "Add reviewer and signer details below. Nothing sends until your final confirmation step.";
    }
    if (!premiumSendModeTouched) {
      return "Choose review-first or signature-ready, then confirm recipient emails. You stay in control until final send.";
    }
    if (effectivePremiumSendMode === "review") {
      return "Invite reviewers to comment first, then move to signer setup when terms are final.";
    }
    return "Invite signers for tracked e-signing with timestamped proof and delivery tracking.";
  }, [
    premiumSignersSurfaceReady,
    productionReadyForPersist,
    premiumSendModeTouched,
    effectivePremiumSendMode,
  ]);

  const premiumRouteMomentumRibbon = useMemo(() => {
    if (!premiumSignersSurfaceReady || !premiumReviewRoute) return null;
    if (effectivePremiumSendMode === "review") {
      return {
        title: "Keep momentum — invite review now",
        body: "Counterparties can comment and redline inline in minutes. You stay in control until you confirm send.",
      };
    }
    if (effectivePremiumSendMode === "signature") {
      return {
        title: "Fast, trustworthy signing",
        body: "Tracked e-sign works on mobile for every party. Nothing sends until you confirm recipients on the last step.",
      };
    }
    return null;
  }, [premiumSignersSurfaceReady, premiumReviewRoute, effectivePremiumSendMode]);

  const handlePremiumSendModePick = React.useCallback((mode: PremiumSendIntent) => {
    clearPremiumCollaborateFirstDefaultPrimed();
    persistPremiumForkUserSendMode(mode);
    setPremiumForkPrimedNonce((n) => n + 1);
    setPremiumSendModeUserChoice(mode);
    setPremiumSendModeTouched(true);
  }, []);

  const handleRetryProFullDraft = React.useCallback(() => {
    const m = runPremiumModelPassRef.current;
    if (!m) {
      setHardError("We couldn’t start a retry from this state. Refresh the page, then try again.");
      return;
    }
    setProFullDraftQualityRetry(false);
    setProFullDraftCustomGateMessage(null);
    setPremiumServerGenerationDegraded(null);
    setHardError(null);
    if (!draft) {
      setHardError("We need a draft to retry. Restore your agreement or re-enter your intake, then use Retry Pro draft again.");
      return;
    }
    const raw = resolveRawIntakeForPremiumCheckout(draft) || "";
    if (!raw.trim()) {
      setHardError("We need your current intake to retry. Confirm your text above, then try again.");
      return;
    }
    const notes = (readCreateComplexityResume()?.premiumUpgradeNotes || "").trim() || pendingUpgradePromptRef.current.trim();
    const it = buildPremiumMergedIntakeWithUserNotes(raw, notes);
    const ga = (premiumLastGapAnswersRef.current || "").trim();
    setPremiumPostCheckoutPhase("processing");
    void m({
      intakeText: it,
      userGapAnswers: ga || null,
      gapResolverSkippedWithDefaults: !ga,
    });
  }, [draft, resolveRawIntakeForPremiumCheckout]);

  useEffect(() => {
    if (!premiumPaidDocumentSurface) setPremiumReviewDocEditorOpen(false);
  }, [premiumPaidDocumentSurface]);

  const premiumPaidReadonlyPick = useMemo(() => {
    const snapObj = readPremiumCompletionSnapshot();
    let snapBindInvalid = false;
    if (snapObj) {
      const genOk =
        !snapObj.agreementGenerationId || snapObj.agreementGenerationId === getOrInitSessionAgreementGenerationId();
      const fpCur = currentPremiumMergedIntakeKey
        ? shortIntakeFingerprint(currentPremiumMergedIntakeKey)
        : null;
      const fpOk =
        !snapObj.intakeTextFingerprint || (fpCur != null && snapObj.intakeTextFingerprint === fpCur);
      snapBindInvalid = !genOk || !fpOk;
    }
    let snap = snapObj?.premiumReadonlyPlainText?.trim() ?? "";
    let winner = snapObj?.premiumWinningBodyText?.trim() ?? "";
    if (snapBindInvalid) {
      snap = "";
      winner = "";
    }
    const pipelineBody = premiumPipelineOutputBodyRef.current.trim();
    const hydratedBody = snapBindInvalid ? "" : hydratedPremiumBodyRef.current.trim();
    const adt = agreementDocumentText.trim();
    const adtHasPremiumMarkers = /\b(lawdog pro|commercial safeguards|raw-intent premium protections|execution\s+—\s+signatures|signatures)\b/i.test(
      adt,
    );
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumWinningBodyText: winner,
      premiumReadonlySnapshotText: snap,
      premiumPipelineOutputBodyText: pipelineBody,
      hydratedPremiumSnapshotText: hydratedBody,
      draft,
      agreementDocumentText,
      agreementDocumentTextHasPremiumMarkers: adtHasPremiumMarkers,
      premiumCheckoutCompleted: premiumPersistedFlowActive || premiumPaidDocumentSurface || Boolean(snapObj),
      intakeText: intakeCombined,
    });
    if (import.meta.env.DEV) {
      console.info("[premium-picker-audit]", {
        selected_source: pick.sourceUsed,
        forced_premium_source: pick.audit.forcedPremiumSource,
        candidate_lengths: pick.audit.candidates.map((c) => ({ source: c.source, len: c.len, nonThin: c.nonThin })),
        skipped_reasons: pick.audit.candidates.map((c) => ({ source: c.source, eligible: c.eligible, reason: c.reason })),
      });
    }
    if (premiumPaidDocumentSurface && pick.plainText.trim()) {
      logPremiumLiveTrace("readonly_corpus_picker", {
        source_id: pick.sourceUsed,
        title: draft?.title || "",
        payment_terms: draft?.payment_terms || "",
        text: pick.plainText,
      });
      if (import.meta.env.DEV) {
        const hit = gapTraceNeedlesHit(pick.plainText);
        console.info("[gap-trace] stage=readonly_render", {
          final_document_text_hash: liveTraceHash(pick.plainText),
          final_len: pick.plainText.length,
          contains_needles: hit.length > 0,
          needles_hit: hit,
          source_id: pick.sourceUsed,
          user_gap_answers_len: premiumLastGapAnswersRef.current.length,
        });
      }
    }
    return pick;
  }, [
    draft,
    agreementDocumentText,
    premiumForkPrimedNonce,
    reviewDocRefreshTick,
    premiumPaidDocumentSurface,
    intakeCombined,
    currentPremiumMergedIntakeKey,
    proFullDraftQualityRetry,
  ]);

  const premiumProTruthGate = useMemo(() => {
    if (!hasFullDraftAccess || !premiumPersistedFlowActive) return null;
    const t = (premiumPaidReadonlyPick.plainText || "").trim();
    if (!t) return null;
    const i = (currentPremiumMergedIntakeKey || intakeCombined).trim() || intakeCombined;
    const contract = resolveAgreementIntentContract(i);
    const v = validatePaidProOutput({
      text: t,
      rawIntake: i,
      draft: draft ?? null,
      intentContract: contract,
    });
    return canShowPremiumSuccess({
      intentContract: contract,
      renderSource: premiumPaidReadonlyPick.sourceUsed,
      validation: v,
      documentText: t,
      intakeText: i,
      premiumPipelineSource: premiumTruthPipelineSource ?? lastPremiumPipelineRenderSourceRef.current,
      stale: false,
      draft: draft ?? null,
      qualityRetryActive: proFullDraftQualityRetry,
      serverGenerationDegraded: Boolean(premiumServerGenerationDegraded),
    });
  }, [
    hasFullDraftAccess,
    premiumPersistedFlowActive,
    premiumPaidReadonlyPick.plainText,
    premiumPaidReadonlyPick.sourceUsed,
    currentPremiumMergedIntakeKey,
    intakeCombined,
    draft,
    proFullDraftQualityRetry,
    premiumServerGenerationDegraded,
    premiumTruthPipelineSource,
    reviewDocRefreshTick,
  ]);

  /**
   * If checkout occurred and strict truth gate blocks success, emit a second (non-once)
   * `premium_checkout_completed` revision row with `needs_details`.
   */
  useEffect(() => {
    if (truthGateCheckoutRevisionEmittedRef.current) return;
    if (typeof window === "undefined") return;
    if (!hasFullDraftAccess) return;
    const paidReturnFlow = (() => {
      try {
        return new URL(window.location.href).searchParams.get("premiumCompletion") === "1";
      } catch {
        return false;
      }
    })();
    if (!(paidReturnFlow || premiumPersistedFlowActive || premiumPaidDocumentSurface)) return;
    if (premiumPostCheckoutPhase) return;
    if (createUiStage !== CreateUiStage.DRAFT) return;
    if (!premiumProTruthGate) return;
    if (premiumProTruthGate.successBannerAllowed || premiumProTruthGate.signerCtaAllowed) return;
    const sid = getOrCreateLawdogSessionId();
    const rows = loadPaidFunnelEvents();
    const fallbackIntentId =
      [...rows]
        .reverse()
        .find((r) => r.session_id === sid && r.agreement_intent_id && r.agreement_intent_id !== "custom_unknown")
        ?.agreement_intent_id ?? null;

    const snap = readPremiumCompletionSnapshot();
    const snapPipe = (snap?.premiumPipelineRenderSource || "").trim();
    const linePipe = (premiumTruthPipelineSource || lastPremiumPipelineRenderSourceRef.current || "").trim();
    const readonlySrc = String(premiumPaidReadonlyPick.sourceUsed || "");
    const gateSaysRejected = premiumProTruthGate.validation.reasons.some((r) => /rejected_paid_corpus/.test(r));
    const renderForFunnel =
      gateSaysRejected ||
      linePipe === "rejected_paid_corpus" ||
      snapPipe === "rejected_paid_corpus" ||
      readonlySrc === "rejected_paid_corpus" ||
      (proFullDraftQualityRetry && !linePipe && !readonlySrc)
        ? "rejected_paid_corpus"
        : linePipe || readonlySrc || "unknown";
    const extra = buildStrictTruthGateCheckoutRevision({
      sessionId: sid,
      rows,
      gateStrictIntent: premiumProTruthGate.strict_intent,
      gateIntentId: premiumProTruthGate.intent_id,
      fallbackIntentId,
      renderSource: renderForFunnel,
    });
    if (!extra) return;
    emitPaidFunnelEvent("premium_checkout_completed", { extra });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[paid-funnel-terminal-gate]", { session_id: sid, ...extra, paidReturnFlow });
    }
    truthGateCheckoutRevisionEmittedRef.current = true;
  }, [
    hasFullDraftAccess,
    premiumPersistedFlowActive,
    premiumPaidDocumentSurface,
    premiumPostCheckoutPhase,
    createUiStage,
    premiumProTruthGate,
    proFullDraftQualityRetry,
    premiumTruthPipelineSource,
    premiumPaidReadonlyPick.sourceUsed,
    emitPaidFunnelEvent,
  ]);

  useEffect(() => {
    const opened = advancedFullDraftPaywallOpen;
    if (opened && !paywallOpenPrevRef.current) {
      emitPaidFunnelEvent("premium_checkout_opened", { extra: { checkout_surface: "paywall_modal" } });
    }
    paywallOpenPrevRef.current = opened;
  }, [advancedFullDraftPaywallOpen, emitPaidFunnelEvent]);

  useEffect(() => {
    if (!showUpgradeToFullDraftOnReview) return;
    emitPaidFunnelEvent("premium_upsell_seen", { once: true });
  }, [showUpgradeToFullDraftOnReview, emitPaidFunnelEvent]);

  useEffect(() => {
    if (!(premiumPostCheckoutSummaryVisible && premiumProTruthGate?.successBannerAllowed)) return;
    emitPaidFunnelEvent("premium_success_banner_seen", { once: true });
  }, [premiumPostCheckoutSummaryVisible, premiumProTruthGate?.successBannerAllowed, emitPaidFunnelEvent]);

  useEffect(() => {
    if (createUiStage !== CreateUiStage.RECIPIENTS) return;
    if (!(premiumPersistedFlowActive || premiumSendPathUnlocked || premiumRecipientUxActive)) return;
    emitPaidFunnelEvent("recipient_setup_opened", { once: true });
  }, [createUiStage, premiumPersistedFlowActive, premiumSendPathUnlocked, premiumRecipientUxActive, emitPaidFunnelEvent]);

  useEffect(() => {
    const handleAbandon = () => {
      if (!paidCheckoutCompletedRef.current || paidAgreementSentRef.current) return;
      emitPaidFunnelEvent("send_abandoned_after_payment", {
        once: true,
        extra: { abandon_surface: createUiStage, abandon_phase: createFlowPhase },
      });
    };
    if (typeof window !== "undefined") window.addEventListener("beforeunload", handleAbandon);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("beforeunload", handleAbandon);
    };
  }, [emitPaidFunnelEvent, createUiStage, createFlowPhase]);

  const premiumReadonlyAgreementHtml = useMemo(() => {
    if (!premiumPaidDocumentSurface) return "";
    if (proFullDraftQualityRetry) return "";
    const rd = reviewDraft ?? draft;
    const corpus = premiumPaidReadonlyPick.plainText;
    const partyNameA = (rd?.parties?.[0]?.name || "").trim() || "Party A";
    const partyNameB = (rd?.parties?.[1]?.name || "").trim() || "Party B";
    const referralEconomicsPrompt = /\b(\d{1,2}\s*%|commission|referral|realtor|lead|source(?:d)?\b)\b/i.test(intakeCombined);
    const genericPaymentInRender = /\b(to be agreed|to be specified|payment schedule to be agreed)\b/i.test(corpus);
    const titleNow = (rd?.title || "").trim();
    const badReferralTitle = referralEconomicsPrompt && /^payment plan agreement$/i.test(titleNow);
    if (import.meta.env.DEV && referralEconomicsPrompt && genericPaymentInRender) {
      console.error("[premium-live-trace] hard_assert_failed", {
        stage: "rendered_body_source",
        reason: "generic_payment_with_explicit_economics",
        source_id: premiumPaidReadonlyPick.sourceUsed,
        title: titleNow,
      });
      console.assert(false, "[premium-live-trace] rendered payment_terms cannot be generic when referral/commission signals exist");
    }
    if (import.meta.env.DEV && badReferralTitle) {
      console.error("[premium-live-trace] hard_assert_failed", {
        stage: "rendered_body_source",
        reason: "invalid_title_for_referral_signals",
        source_id: premiumPaidReadonlyPick.sourceUsed,
        title: titleNow,
      });
      console.assert(false, "[premium-live-trace] title cannot be PAYMENT PLAN AGREEMENT for referral/lead prompt");
    }
    if (import.meta.env.DEV) {
      const sig = premiumRenderCorpusContainsSignals(corpus);
      const freeBaselineDraft = rd ?? draft;
      const freeBaseline = freeBaselineDraft
        ? buildAgreementPreviewText(freeBaselineDraft, { starterPreview: true })
        : "";
      if (freeBaseline.trim() && liveTraceHash(corpus) === liveTraceHash(freeBaseline)) {
        console.warn("[premium-picker-audit] selected_hash_matches_free_basic_draft", {
          source_used: premiumPaidReadonlyPick.sourceUsed,
          hash: liveTraceHash(corpus),
        });
      }
      console.info("[premium-render]", {
        timestamp: new Date().toISOString(),
        source_used: premiumPaidReadonlyPick.sourceUsed,
        agreementDocumentText_len: agreementDocumentText.trim().length,
        picked_plaintext_len: corpus.length,
        text_len: corpus.length,
        ...sig,
      });
      logPremiumLiveTrace("rendered_body_source", {
        source_id: premiumPaidReadonlyPick.sourceUsed,
        title: titleNow,
        payment_terms: rd?.payment_terms || "",
        purpose: rd?.purpose || "",
        additional_terms: rd?.additional_terms || "",
        party_roles: (rd?.parties || []).map((p) => (p.role || "").trim()).filter(Boolean),
        signature_labels: [partyNameA, partyNameB],
        text: corpus,
      });
    }
    const renderHints = computePremiumDocumentRenderHints(rd, corpus);
    return buildPremiumAgreementReadonlyHtml(corpus, {
      signatureSectionMode: effectivePremiumSendMode === "signature" ? "execution" : "collaboration",
      partyNameA,
      partyNameB,
      renderHints,
    });
  }, [
    premiumPaidDocumentSurface,
    premiumPaidReadonlyPick,
    effectivePremiumSendMode,
    reviewDraft,
    draft,
    proFullDraftQualityRetry,
  ]);

  const preSendTrustLayer = useMemo(
    () =>
      simpleCreateReadyForSend ? computePreSendTrustLayer(intakeGuidanceCombined, livePreviewModel) : null,
    [simpleCreateReadyForSend, intakeGuidanceCombined, livePreviewModel],
  );

  const firstMissingField = useMemo(
    () => getFirstMissingField(intakeGuidanceCombined.trim(), livePreviewModel, agreementIntakeDraft, guidedStepOpts),
    [intakeGuidanceCombined, livePreviewModel, agreementIntakeDraft, guidedStepOpts],
  );

  const guidedFlowId = useMemo(
    () => resolveGuidedFlowId(intakeGuidanceCombined.trim(), livePreviewModel),
    [intakeGuidanceCombined, livePreviewModel],
  );
  const stepTotal = useMemo(() => getGuidedFlowConfig(guidedFlowId).fieldOrder.length, [guidedFlowId]);

  const guidedSplitProgressActive = Boolean(useGuidedSplitIntake && !guidedStructureComplete);

  const guidedProgressRatio = useMemo(
    () =>
      useGuidedSplitIntake
        ? getGuidedProgressRatio(firstMissingField, intakeGuidanceCombined.trim(), livePreviewModel)
        : 0,
    [useGuidedSplitIntake, firstMissingField, intakeGuidanceCombined, livePreviewModel],
  );

  const showGuidedFlowProgressBar = Boolean(
    simpleProductFlow && liveWorkspaceTwoPane && useGuidedSplitIntake && !guidedStructureComplete,
  );

  useEffect(() => {
    if (!intakeGuidedComplete || readyReachedRef.current) return;
    readyReachedRef.current = true;
    trackFunnelEvent("ready_state_reached", {
      time_to_ready_ms: Date.now() - funnelStartedAtRef.current,
      steps_completed: funnelMaxStepRef.current,
      total_steps: stepTotal,
      conversion_rate_to_ready: stepTotal > 0 ? funnelMaxStepRef.current / stepTotal : 0,
    });
  }, [intakeGuidedComplete, stepTotal, trackFunnelEvent]);

  useEffect(() => {
    if (!guidedStructureComplete) actionModeEnteredLoggedRef.current = false;
  }, [guidedStructureComplete]);

  useEffect(() => {
    if (!guidedStructureComplete || isGenerating || isUserTyping) {
      setReadyIdleForAction(false);
      return;
    }
    const id = window.setTimeout(() => setReadyIdleForAction(true), 1200);
    return () => {
      window.clearTimeout(id);
      setReadyIdleForAction(false);
    };
  }, [guidedStructureComplete, isGenerating, intakeGuidanceCombined, isUserTyping]);

  useEffect(() => {
    if (!readyIdleForAction || actionModeEnteredLoggedRef.current) return;
    actionModeEnteredLoggedRef.current = true;
    const elapsed = Date.now() - funnelStartedAtRef.current;
    logProductEvent("action_mode_entered", {
      time_to_action_mode: elapsed,
      time_to_action_mode_ms: elapsed,
      scroll_position_at_action: typeof window !== "undefined" ? window.scrollY : null,
      fresh_simple_create_ux: freshSimpleCreateUx,
      first_lawdog_session: firstLawdogSession,
    });
    window.requestAnimationFrame(() => {
      simpleCreateActionBarRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [readyIdleForAction, freshSimpleCreateUx, firstLawdogSession]);

  const guidedQuestionPlaceholder = useMemo(() => {
    if (stageAInputFirst) return HOMEPAGE_LONG_INTAKE_EXAMPLE;
    if (!nextIntakeQuestion) return stepIntakePlaceholder;
    switch (nextIntakeQuestion.field) {
      case "parties":
        return "Type the two parties here…";
      case "scope":
      case "confidential_scope":
        return "Describe what this agreement is for…";
      case "duration":
      case "term":
        return "Enter the duration (e.g. 2 years)…";
      case "confidentiality_structure":
        return "Choose mutual or one-way confidentiality…";
      case "payment":
        return "Enter payment terms (amount, schedule, method)…";
      case "extras":
        return "Add anything else, or type 'draft now'";
      default:
        return stepIntakePlaceholder;
    }
  }, [stageAInputFirst, nextIntakeQuestion, stepIntakePlaceholder]);

  const draftSoFarSummary = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane) return undefined;
    const m = livePreviewModel;
    const lines: { label: string; value: string }[] = [];
    const parties = m.partiesLine?.trim() || m.signerPlaceholdersLine?.trim();
    if (parties) lines.push({ label: "Parties", value: parties });
    const scope = (m.scopeLine || m.servicesLine || "").trim();
    if (scope) lines.push({ label: "Scope", value: scope });
    const term = (m.termLine || m.scheduleLine || "").trim();
    if (term) lines.push({ label: "Term", value: term });
    if (m.compensationLine?.trim()) lines.push({ label: "Payment", value: m.compensationLine.trim() });
    return lines.length > 0 ? lines : undefined;
  }, [simpleProductFlow, liveWorkspaceTwoPane, livePreviewModel]);

  const readyFieldChecklist = useMemo(() => {
    const m = livePreviewModel;
    return {
      parties: Boolean((m.partiesLine || m.signerPlaceholdersLine || "").trim().length > 1),
      scope: Boolean((m.scopeLine || m.servicesLine || "").trim().length > 1),
      payment: Boolean((m.compensationLine || "").trim().length > 0),
      term: Boolean((m.termLine || m.scheduleLine || "").trim().length > 0),
    };
  }, [livePreviewModel]);

  const micNudgeVariant = useMemo<"static" | "pulse">(() => {
    if (typeof window === "undefined") return "static";
    const key = "claw:create:mic-nudge-v1";
    const cached = window.localStorage.getItem(key);
    if (cached === "static" || cached === "pulse") return cached;
    const next = Math.random() < 0.5 ? "static" : "pulse";
    window.localStorage.setItem(key, next);
    logProductEvent("experiment_exposure", {
      experiment_id: "create_mic_nudge_v1",
      variant: next,
      surface: "agreement_intake",
    });
    return next;
  }, []);

  const micLoggedRef = useRef(false);
  const typingLoggedRef = useRef(false);
  const handleDictationPhaseChange = React.useCallback(
    (phase: HeroDictationPhase) => {
      setIntakeDictationPhase(phase);
      if (phase === "recording" && !micLoggedRef.current && simpleProductFlow && liveWorkspaceTwoPane) {
        micLoggedRef.current = true;
        logProductEvent("mic_used", { surface: "agreement_intake_create" });
      }
    },
    [simpleProductFlow, liveWorkspaceTwoPane],
  );
  const markIntakeEdit = React.useCallback(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
    setIsUserTyping(true);
    setShowParseUpdatedLabel(false);
  }, [simpleProductFlow, liveWorkspaceTwoPane]);

  const handleIntakeStepBufferChange = React.useCallback(
    (v: string) => {
      setIntakeStepBuffer(v);
      markIntakeEdit();
      if (!typingLoggedRef.current && v.trim().length > 0 && simpleProductFlow && liveWorkspaceTwoPane) {
        typingLoggedRef.current = true;
        logProductEvent("intake_typing_started", { surface: "agreement_intake_create" });
      }
    },
    [simpleProductFlow, liveWorkspaceTwoPane, markIntakeEdit],
  );

  const micIdleAttract = Boolean(nextIntakeQuestion) && !isGenerating && micNudgeVariant === "pulse";

  const premiumOriginalWordingStarterPanel = useMemo(() => {
    if (suppressIntakePremiumUpsell) return null;
    if (!originalWordingIsPremiumOnlyOnStarter) return null;
    return (
      <div
        className="mt-2 rounded-xl border border-amber-500/45 bg-gradient-to-b from-amber-950/35 via-slate-950/90 to-slate-950/95 p-3 shadow-md shadow-amber-950/15 ring-1 ring-amber-500/25 sm:p-4"
        role="region"
        aria-label={PREMIUM_ORIGINAL_WORDING_TITLE}
      >
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <svg
            className="h-4 w-4 shrink-0 text-amber-400/95"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2h1a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1v-7a1 1 0 011-1h1zm8-2V7a3 3 0 10-6 0v2h6z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="text-sm font-semibold tracking-tight text-amber-50/95 sm:text-base">{PREMIUM_ORIGINAL_WORDING_TITLE}</h3>
          <span className="rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200/95">
            PREMIUM
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-300/95 sm:text-sm">{PREMIUM_ORIGINAL_WORDING_SUBTEXT}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-amber-100/80 sm:text-xs">{PREMIUM_ORIGINAL_WORDING_HELPER}</p>
        <div className="relative mt-3 pb-8 sm:mt-3">
          <VoiceAugmentedTextArea
            value={premiumOriginalWordingBuffer}
            onValueChange={setPremiumOriginalWordingBuffer}
            onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
            dictationControlRef={premiumOriginalWordingDictationRef}
            onDictationPhaseChange={handleDictationPhaseChange}
            disabled={isGenerating || upgradeLockActive}
            voiceUiEnabled={!isGenerating && !upgradeLockActive}
            micIdleAttract={micIdleAttract}
            dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
            wrapperClassName="w-full rounded-lg border border-amber-600/40 bg-[#141d32]/95 shadow-inner shadow-black/20"
            className="min-h-[10rem] w-full rounded-lg border-0 border-transparent bg-transparent px-4 py-3 pb-12 pr-12 text-sm leading-relaxed text-gray-100 caret-amber-300/90 outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-60 sm:min-h-[11rem] sm:px-5 sm:py-4 sm:text-[0.9375rem]"
            placeholder={PREMIUM_ORIGINAL_WORDING_PLACEHOLDER}
            aria-label="Premium exact wording for complete version"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm shadow-amber-950/30 transition hover:from-amber-300 hover:to-amber-500 disabled:pointer-events-none disabled:opacity-45"
            disabled={
              isGenerating || upgradeLockActive || !premiumOriginalWordingBuffer.trim()
            }
            onClick={() => beginPremiumOriginalWordingCheckout()}
          >
            {PREMIUM_ORIGINAL_WORDING_CTA}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600/70 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-50"
            disabled={isGenerating || upgradeLockActive}
            onClick={() => setIsEditingDescription(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }, [
    originalWordingIsPremiumOnlyOnStarter,
    premiumOriginalWordingBuffer,
    beginPremiumOriginalWordingCheckout,
    isGenerating,
    upgradeLockActive,
    micIdleAttract,
    freshSimpleCreateUx,
    dictationStartNonce,
    handleDictationPhaseChange,
    suppressIntakePremiumUpsell,
  ]);

  const starterStrongProtectionsUpsellEl = useMemo(() => {
    if (suppressIntakePremiumUpsell) return null;
    if (!originalWordingIsPremiumOnlyOnStarter) return null;
    return (
      <div
        className={`mt-3 p-4 sm:mt-3 sm:p-5 ${STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME}`}
        role="region"
        aria-label={STARTER_REVIEW_PREMIUM_HEADLINE}
      >
        <p className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg">{STARTER_REVIEW_PREMIUM_HEADLINE}</p>
        <ul className="mt-3 space-y-2 text-sm leading-snug text-slate-200/95 sm:leading-relaxed">
          {STARTER_REVIEW_PREMIUM_BULLETS.map((b) => (
            <li key={b} className="flex gap-2">
              <span className={STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME} aria-hidden>
                •
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`mt-4 w-full min-h-[2.75rem] px-4 py-2.5 text-sm sm:w-auto sm:min-w-[14rem] sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
          onClick={() => {
            logProductEvent("upgrade_clicked", {
              surface: "starter_review_protections_upsell",
              intent: "unlock_premium_rewrite",
            });
            beginAdvancedFullDraftCheckout();
          }}
        >
          {STARTER_REVIEW_PREMIUM_CTA}
        </button>
        <p className="mt-2 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">{STARTER_REVIEW_PREMIUM_MICROCOPY}</p>
      </div>
    );
  }, [originalWordingIsPremiumOnlyOnStarter, beginAdvancedFullDraftCheckout, suppressIntakePremiumUpsell]);

  const continueIsSecondary = Boolean(
    simpleProductFlow &&
      liveWorkspaceTwoPane &&
      showMainIntakeForm &&
      !showFollowUpOnly &&
      nextIntakeQuestion &&
      !stageAInputFirst,
  );
  /** Intent CTAs (non–simple-two-pane paths). Simple two-pane uses unified bottom bar copy. */
  const guidedMainCtaLabel = !guidedStructureComplete
    ? "Next"
    : draftNowCommitted
      ? "Send"
      : "Review";

  const conversationStepKey = nextIntakeQuestion ? `${nextIntakeQuestion.field}:${nextIntakeQuestion.question}` : "";

  useEffect(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || showFollowUpOnly) return;
    if (!nextIntakeQuestion || isGenerating) return;
    const id = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [conversationStepKey, simpleProductFlow, liveWorkspaceTwoPane, showFollowUpOnly, nextIntakeQuestion, isGenerating]);

  useEffect(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || showFollowUpOnly) return;
    if (isUserTyping) return;
    const raw = intakeGuidanceCombined.trim();
    const cur = getFirstMissingField(raw, livePreviewModel, agreementIntakeDraft, guidedStepOpts);
    const prev = prevFirstMissingRef.current;
    if (prev === "unset") {
      prevFirstMissingRef.current = cur;
      return;
    }
    if (prev !== null && cur !== prev && firstMissingMovesForward(prev, cur, raw, livePreviewModel)) {
      const completedStep = Math.min(funnelMaxStepRef.current + 1, stepTotal);
      funnelMaxStepRef.current = Math.max(funnelMaxStepRef.current, completedStep);
      trackFunnelEvent("step_completed", {
        step_number: completedStep,
        total_steps: stepTotal,
        step_conversion_rate: stepTotal > 0 ? completedStep / stepTotal : 0,
      });
      if (freshSimpleCreateUx && prev !== "bootstrap" && prev !== null) {
        setPreviewPaneRevealed(true);
      }
      if (useGuidedSplitIntake && intakeBaselineCommitted.trim() && intakeStepBuffer.trim()) {
        const stepSnap = intakeStepBuffer.trim();
        setIntakeBaselineCommitted((b) => `${b.trim()}\n\n${stepSnap}`);
        setIntakeStepBuffer("");
        setDebouncedStepBuffer("");
      }
      const fid = resolveGuidedFlowId(raw, livePreviewModel);
      const line =
        prev === "bootstrap"
          ? "✓ Description captured"
          : `✓ Added: ${getAddedValueSnippet(prev as GuidedFieldKey, agreementIntakeDraft, raw, livePreviewModel, intakeStepBuffer) || getCaptureAcknowledgement(fid, prev as GuidedFieldKey)}`;
      setIntakeAckLine(line);
      const timer = window.setTimeout(() => setIntakeAckLine(null), 700);
      prevFirstMissingRef.current = cur;
      return () => clearTimeout(timer);
    }
    prevFirstMissingRef.current = cur;
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    showFollowUpOnly,
    intakeGuidanceCombined,
    livePreviewModel,
    agreementIntakeDraft,
    useGuidedSplitIntake,
    intakeBaselineCommitted,
    intakeStepBuffer,
    guidedStepOpts,
    stepTotal,
    trackFunnelEvent,
    freshSimpleCreateUx,
    isUserTyping,
  ]);
  const hardErrorForUi = useMemo(() => {
    if (!hardError) return null;
    const humanized = humanizeHardIntakeError(hardError);
    if (
      simpleProductFlow &&
      createProductionTwoPane &&
      !loading &&
      humanized === INTAKE_HARD_SAVE_GENERIC
    ) {
      if (
        createUiStage === CreateUiStage.RECIPIENTS &&
        createFlowPhase === "recipient_setup_required"
      ) {
        return null;
      }
      if (
        createUiStage === CreateUiStage.DRAFT &&
        createFlowPhase === "draft_ready_for_review" &&
        draft &&
        !draftHasPlaceholderParties(draft)
      ) {
        return null;
      }
    }
    return humanized;
  }, [
    hardError,
    simpleProductFlow,
    createProductionTwoPane,
    createUiStage,
    createFlowPhase,
    loading,
    draft,
  ]);
  const errorIsHydrate = Boolean(hardError && isHydrateIntakeErrorRaw(hardError));

  const handleInlinePreviewCommit = React.useCallback(
    (fieldLabel: string, next: string) => {
      if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
      if (!isLivePreviewInlineField(fieldLabel)) return;
      const v = next.trim();
      if (!v) return;
      setPreviewFieldOverrides((prev) => ({ ...prev, [fieldLabel]: v }));
      setIntakeStepBuffer((prev) => upsertLabeledIntakeLine(prev, fieldLabel, v));
      flushDebouncedStepBuffer({ forceFlash: true });
    },
    [simpleProductFlow, liveWorkspaceTwoPane, flushDebouncedStepBuffer],
  );

  const handleStructuredPartyCommit = React.useCallback(
    (partyIndex: 1 | 2, next: string) => {
      const v = next.trim();
      if (!v) return;
      const m = displayLivePreviewModel;
      const s = m.partiesStructured ?? splitTwoPartiesFromJoinedLine(m.partiesLine ?? "");
      if (!s) return;
      const p1 = partyIndex === 1 ? v : sanitizePartiesInput(s.party_1.trim());
      const p2 = partyIndex === 2 ? v : sanitizePartiesInput(s.party_2.trim());
      handleInlinePreviewCommit("Parties", `${p1} and ${p2}`);
    },
    [displayLivePreviewModel, handleInlinePreviewCommit],
  );

  const handleInlineSmartSuggestion = React.useCallback(
    (id: string, append: string) => {
      if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
      const a = append.trim();
      if (!a) return;
      setUsedSmartSuggestionIds((prev) => new Set([...prev, id]));
      setIntakeStepBuffer((prev) => {
        const t = prev.trim();
        return t ? `${t}\n\n${a}` : a;
      });
      flushDebouncedStepBuffer({ forceFlash: true });
    },
    [simpleProductFlow, liveWorkspaceTwoPane, flushDebouncedStepBuffer],
  );

  const handleMainClauseSuggestion = React.useCallback(
    (id: string, append: string) => {
      if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
      if (isGenerating || draftNowCommitted || draftPreCommitFreeze) return;
      const a = append.trim();
      if (!a) return;
      setUsedMainClauseSuggestionIds((prev) => new Set([...prev, id]));
      setIntakeStepBuffer((prev) => {
        const t = prev.trim();
        return t ? `${t}\n\n${a}` : a;
      });
      flushDebouncedStepBuffer({ forceFlash: true });
      logProductEvent("intake_clause_suggestion_clicked", { suggestion_id: id, surface: "agreement_intake_create" });
    },
    [simpleProductFlow, liveWorkspaceTwoPane, isGenerating, draftNowCommitted, draftPreCommitFreeze, flushDebouncedStepBuffer],
  );

  const handleContextAutoSuggestion = React.useCallback(
    (s: ContextRankedSuggestion) => {
      if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
      if (isGenerating || draftNowCommitted || draftPreCommitFreeze) return;
      const a = s.clauseText.trim();
      if (!a) return;
      markIntakeEdit();
      setUsedContextSuggestionIds((prev) => new Set([...prev, s.id]));
      const mainClauseId = s.syncMainClauseId;
      if (mainClauseId) {
        setUsedMainClauseSuggestionIds((prev) => new Set([...prev, mainClauseId]));
      }
      setIntakeStepBuffer((prev) => {
        const t = prev.trim();
        return t ? `${t}\n\n${a}` : a;
      });
      flushDebouncedStepBuffer({ forceFlash: true });
      logProductEvent("intake_context_suggestion_clicked", { suggestion_id: s.id });
    },
    [
      simpleProductFlow,
      liveWorkspaceTwoPane,
      isGenerating,
      draftNowCommitted,
      draftPreCommitFreeze,
      flushDebouncedStepBuffer,
      markIntakeEdit,
    ],
  );

  /** Pre-send trust gaps: unlock draft if needed, append clause stub, focus intake. */
  const handlePreSendTrustGapClick = React.useCallback(
    (key: PreSendTrustGapKey) => {
      if (!simpleProductFlow || !liveWorkspaceTwoPane) return;
      if (isGenerating || draftPreCommitFreeze) return;
      const stub = MAIN_CLAUSE_SUGGESTIONS.find((s) => s.id === key);
      if (!stub) return;
      const a = stub.append.trim();
      if (!a) return;
      if (draftNowCommitted) setDraftNowCommitted(false);
      setUsedMainClauseSuggestionIds((prev) => new Set([...prev, stub.id]));
      setIntakeStepBuffer((prev) => {
        const t = prev.trim();
        return t ? `${t}\n\n${a}` : a;
      });
      flushDebouncedStepBuffer({ forceFlash: true });
      setMobileWorkspacePane("edit");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
      logProductEvent("intake_clause_suggestion_clicked", {
        suggestion_id: stub.id,
        surface: "agreement_intake_pre_send_trust",
      });
    },
    [
      simpleProductFlow,
      liveWorkspaceTwoPane,
      isGenerating,
      draftNowCommitted,
      draftPreCommitFreeze,
      flushDebouncedStepBuffer,
    ],
  );

  const previewInlineSmartSuggestions = useMemo(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane) return [];
    if (isGenerating || draftNowCommitted || isUserTyping) return [];
    if (freshSimpleCreateUx && !previewPaneRevealed) return [];
    return buildLivePreviewSmartSuggestions({
      model: livePreviewModel,
      rawIntake: intakeGuidanceCombined,
      usedIds: usedSmartSuggestionIds,
    });
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    isGenerating,
    draftNowCommitted,
    isUserTyping,
    freshSimpleCreateUx,
    previewPaneRevealed,
    livePreviewModel,
    intakeGuidanceCombined,
    usedSmartSuggestionIds,
  ]);

  /** Simple create preview + chrome: drafting → ready (after Draft now) → sending (generate). */
  const simpleCreateIntakeUiPhase: "drafting" | "ready" | "sending" | null =
    simpleProductFlow && liveWorkspaceTwoPane
      ? isGenerating
        ? "sending"
        : createProductionTwoPane
          ? createFlowPhase === "ready_to_send"
            ? "ready"
            : "drafting"
          : draftNowCommitted && guidedStructureComplete
            ? "ready"
            : "drafting"
      : null;

  const livePreviewExtras = useMemo(
    () =>
      simpleProductFlow && liveWorkspaceTwoPane
        ? (() => {
            const showAgreementStrengthInPreview = Boolean(
              !createProductionTwoPane &&
                agreementStrengthPanel &&
                (!freshSimpleCreateUx || firstAgreementStrengthGateMet),
            );
            const previewRowLocked = createProductionTwoPane
              ? createUiStage !== CreateUiStage.INPUT
              : Boolean(draftNowCommitted || draftPreCommitFreeze);
            return {
              inlineEditable:
                (!freshSimpleCreateUx || previewPaneRevealed) &&
                !isUserTyping &&
                !previewRowLocked,
              onInlineFieldCommit:
                isUserTyping || (freshSimpleCreateUx && !previewPaneRevealed) || previewRowLocked
                  ? undefined
                  : handleInlinePreviewCommit,
              onStructuredPartyCommit:
                isUserTyping || (freshSimpleCreateUx && !previewPaneRevealed) || previewRowLocked
                  ? undefined
                  : handleStructuredPartyCommit,
              smartChips: [],
              onSmartChip: undefined,
              showExportReassurance: !freshSimpleCreateUx || previewPaneRevealed,
              firstSessionPreview: freshSimpleCreateUx && !previewPaneRevealed,
              draftSoFarSummary,
              intakeUiPhase: simpleCreateIntakeUiPhase,
              draftCommitted: createProductionTwoPane
                ? isCreateFlowPastCapture(createFlowPhase) && !isGenerating
                : draftNowCommitted && guidedStructureComplete && !isGenerating,
              deemphasize: Boolean(
                createProductionTwoPane
                  ? createFlowPhase === "capturing_input" &&
                      guidedStructureComplete &&
                      readyIdleForAction &&
                      !isGenerating
                  : guidedStructureComplete && readyIdleForAction && !isGenerating && !draftNowCommitted,
              ),
              agreementStrengthFadeIn: Boolean(
                !createProductionTwoPane && freshSimpleCreateUx && firstAgreementStrengthGateMet && agreementStrengthPanel,
              ),
              agreementStrength: showAgreementStrengthInPreview ? agreementStrengthPanel : null,
              onAgreementStrengthAction:
                showAgreementStrengthInPreview &&
                (!freshSimpleCreateUx || previewPaneRevealed) &&
                !isUserTyping &&
                !previewRowLocked &&
                !isGenerating
                  ? handleInlineSmartSuggestion
                  : undefined,
              partyRoleIntake: {
                value: intakePartyRoleLabels,
                onChange: setIntakePartyRoleLabels,
                corpus: intakeGuidanceCombined,
                disabled: Boolean(
                  isUserTyping || (freshSimpleCreateUx && !previewPaneRevealed) || previewRowLocked || isGenerating,
                ),
              },
            };
          })()
        : {},
    [
      simpleProductFlow,
      liveWorkspaceTwoPane,
      agreementStrengthPanel,
      firstAgreementStrengthGateMet,
      freshSimpleCreateUx,
      previewPaneRevealed,
      handleInlinePreviewCommit,
      handleStructuredPartyCommit,
      handleInlineSmartSuggestion,
      draftSoFarSummary,
      simpleCreateIntakeUiPhase,
      guidedStructureComplete,
      draftNowCommitted,
      isGenerating,
      readyIdleForAction,
      isUserTyping,
      draftPreCommitFreeze,
      intakePartyRoleLabels,
      intakeGuidanceCombined,
      createProductionTwoPane,
      createFlowPhase,
      displayPhase,
    ],
  );

  const rawBusyLabel = simpleProductFlow ? simpleProductFlowGeneratingLabel?.trim() : undefined;
  const productFlowBusyShort =
    rawBusyLabel && !isUnsafeUserFacingBusyLabel(rawBusyLabel) ? rawBusyLabel : null;

  const busyStructuring =
    createProductionTwoPane &&
    (displayPhase === "generating_draft" ||
      displayPhase === "hydrating_generated" ||
      displayPhase === "preparing_review")
      ? "Creating your agreement…"
      : productFlowBusyShort ?? "Creating your agreement…";
  const busyPreparing = "Preparing your agreement…";
  const primaryBusyLabel = isGenerating
    ? createProductionTwoPane
      ? busyStructuring
      : displayPhase === "generating_draft"
        ? busyStructuring
        : busyPreparing
    : productFlowBusyShort ?? "Working…";
  const paneBusyMessage = busyStructuring;
  const hydrateBusyMessage = busyPreparing;

  const formationPhaseForPreview: IntakeFormationPhase | null =
    isGenerating && liveWorkspaceTwoPane
      ? displayPhase === "generating_draft"
        ? "structuring"
        : displayPhase === "hydrating_generated"
          ? "persisting"
          : displayPhase === "preparing_review"
            ? "opening"
            : "structuring"
      : null;

  const stripTrailingDraftNowCommand = React.useCallback((s: string) => s.replace(/\s*draft\s+now\.?\s*$/i, "").trimEnd(), []);

  const handleDraftNowCommit = React.useCallback(
    (opts?: { stripVoiceCommand?: boolean }) => {
      if (createProductionTwoPane) return;
      if (!guidedStructureComplete || draftNowCommitted || isGenerating || draftPreCommitFreeze) return;
      if (opts?.stripVoiceCommand) {
        setIntakeStepBuffer((prev) => stripTrailingDraftNowCommand(prev));
        flushDebouncedStepBuffer({ forceFlash: true });
      }
      if (draftPreCommitTimerRef.current) {
        window.clearTimeout(draftPreCommitTimerRef.current);
        draftPreCommitTimerRef.current = 0;
      }
      setDraftPreCommitFreeze(true);
      draftPreCommitTimerRef.current = window.setTimeout(() => {
        draftPreCommitTimerRef.current = 0;
        setDraftPreCommitFreeze(false);
        setDraftNowCommitted(true);
        logProductEvent("draft_now_committed", {
          surface: "agreement_intake_create",
          via: opts?.stripVoiceCommand ? "voice" : "click",
        });
        setMobileWorkspacePane("preview");
        window.requestAnimationFrame(() => {
          document.getElementById("claw-simple-create-preview")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }, 400);
    },
    [
      guidedStructureComplete,
      draftNowCommitted,
      draftPreCommitFreeze,
      isGenerating,
      stripTrailingDraftNowCommand,
      flushDebouncedStepBuffer,
      createProductionTwoPane,
    ],
  );

  useEffect(() => {
    if (!simpleProductFlow || !liveWorkspaceTwoPane || !guidedStructureComplete || draftNowCommitted || isGenerating) return;
    if (draftPreCommitFreeze) return;
    if (draftVoiceHandledRef.current) return;
    const t = intakeGuidanceCombined.trim();
    if (!t) return;
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    if (!/^draft\s+now\.?$/i.test(last)) return;
    draftVoiceHandledRef.current = true;
    void (async () => {
      if (createProductionTwoPane) {
        console.debug("[handoff-start]", {
          source: "voice_draft_now",
          createUiStage,
          createFlowPhase_before: createFlowPhase,
          displayPhase_before: displayPhase,
        });
        setHardError(null);
        setLoading(true);
        setCreateFlowPhase("generating_draft");
        setDisplayPhase("generating_draft");
      }
      await finalizeIntakeCapture();
      if (createProductionTwoPane) {
        setIntakeStepBuffer((prev) => stripTrailingDraftNowCommand(prev));
        flushDebouncedStepBuffer({ forceFlash: true });
        trackFunnelEvent("generate_clicked", {
          ready_state: guidedStructureComplete && !isGenerating,
          intake_chars: intakeGuidanceCombined.trim().length,
          max_step_reached: funnelMaxStepRef.current,
          production_phase: "voice_draft_now",
        });
        await runProductionLocalDraftParse({ handoffSource: "voice_draft_now" });
        return;
      }
      handleDraftNowCommit({ stripVoiceCommand: true });
    })();
  }, [
    intakeGuidanceCombined,
    simpleProductFlow,
    liveWorkspaceTwoPane,
    guidedStructureComplete,
    draftNowCommitted,
    draftPreCommitFreeze,
    isGenerating,
    handleDraftNowCommit,
    finalizeIntakeCapture,
    createProductionTwoPane,
    stripTrailingDraftNowCommand,
    flushDebouncedStepBuffer,
    runProductionLocalDraftParse,
    trackFunnelEvent,
    intakeGuidanceCombined,
    guidedStructureComplete,
    isGenerating,
  ]);

  const simpleCreateDraftInputLocked = Boolean(
    createProductionTwoPane
      ? createUiStage !== CreateUiStage.INPUT
      : simpleProductFlow &&
          liveWorkspaceTwoPane &&
          guidedStructureComplete &&
          draftNowCommitted &&
          !isGenerating,
  );

  const showWhatWeUnderstood = Boolean(
    simpleProductFlow &&
      liveWorkspaceTwoPane &&
      !createProductionTwoPane &&
      !isGenerating &&
      !draftNowCommitted &&
      !draftPreCommitFreeze &&
      !simpleCreateDraftInputLocked &&
      intakeGuidanceCombined.trim().length >= 8 &&
      whatWeUnderstoodDisplayBullets.length > 0 &&
      !(createProductionTwoPane && !stageAInputFirst),
  );

  const unifiedClauseSuggestionItems = useMemo(
    () =>
      buildIntakeClauseSuggestionRowItems({
        contextTop: contextSuggestionResult.topSuggestions,
        smart: previewInlineSmartSuggestions,
        mains: visibleMainClauseSuggestions,
        usedContextIds: usedContextSuggestionIds,
        usedSmartIds: usedSmartSuggestionIds,
        usedMainIds: usedMainClauseSuggestionIds,
      }),
    [
      contextSuggestionResult.topSuggestions,
      previewInlineSmartSuggestions,
      visibleMainClauseSuggestions,
      usedContextSuggestionIds,
      usedSmartSuggestionIds,
      usedMainClauseSuggestionIds,
    ],
  );

  const showUnifiedClauseSuggestions = Boolean(
    simpleProductFlow &&
      liveWorkspaceTwoPane &&
      !isGenerating &&
      !draftNowCommitted &&
      !draftPreCommitFreeze &&
      !simpleCreateDraftInputLocked &&
      unifiedClauseSuggestionItems.length > 0,
  );

  const clauseSuggestionRowDisabled = useMemo(
    () =>
      Boolean(
        isUserTyping ||
          (freshSimpleCreateUx && !previewPaneRevealed) ||
          draftNowCommitted ||
          draftPreCommitFreeze ||
          isGenerating,
      ),
    [
      isUserTyping,
      freshSimpleCreateUx,
      previewPaneRevealed,
      draftNowCommitted,
      draftPreCommitFreeze,
      isGenerating,
    ],
  );

  const flashIntakeClauseAddedToast = useCallback((chip: string) => {
    setIntakeClauseAddedToast(chip);
    const prev = intakeClauseToastTimerRef.current;
    if (prev != null) window.clearTimeout(prev);
    intakeClauseToastTimerRef.current = window.setTimeout(() => {
      setIntakeClauseAddedToast(null);
      intakeClauseToastTimerRef.current = null;
    }, 2400);
  }, []);

  const handleClauseSuggestionRowApply = useCallback(
    (item: IntakeClauseSuggestionRowItem) => {
      if (clauseSuggestionRowDisabled) return;
      const chip = chipLabelForRowItem(item);
      if (item.kind === "context") {
        handleContextAutoSuggestion(item.suggestion);
      } else if (item.kind === "main") {
        handleMainClauseSuggestion(item.suggestion.id, item.suggestion.append);
      } else {
        handleInlineSmartSuggestion(item.suggestion.id, item.suggestion.append);
      }
      flashIntakeClauseAddedToast(chip);
    },
    [
      clauseSuggestionRowDisabled,
      handleContextAutoSuggestion,
      handleMainClauseSuggestion,
      handleInlineSmartSuggestion,
      flashIntakeClauseAddedToast,
    ],
  );

  useEffect(() => {
    return () => {
      if (intakeClauseToastTimerRef.current != null) {
        window.clearTimeout(intakeClauseToastTimerRef.current);
      }
    };
  }, []);

  const handleUnlockDraftInput = React.useCallback(() => {
    setIsEditingDescription(false);
    setDraftNowCommitted(false);
    draftVoiceHandledRef.current = false;
    setDraftPreCommitFreeze(false);
    setIntakePartyRoleLabels(defaultIntakePartyRoleLabels());
    setUsedMainClauseSuggestionIds(new Set());
    setUsedContextSuggestionIds(new Set());
    if (draftPreCommitTimerRef.current) {
      window.clearTimeout(draftPreCommitTimerRef.current);
      draftPreCommitTimerRef.current = 0;
    }
    if (createProductionTwoPane) {
      setComplexityPendingParsed(null);
      setCreateFlowPhase("capturing_input");
      setCreateUiStage(CreateUiStage.INPUT);
      setRecipient1Name("");
      setRecipient1Email("");
      setRecipient2Name("");
      setRecipient2Email("");
      setRecipientSignerLabels("");
      setRecipientsDeferred(false);
      setAgreementTypeAccepted(false);
      reviewWorkspaceSessionRef.current += 1;
      clearCreateReviewAgreementResumeId();
      productionResumeHydratedRef.current = false;
      setReviewAgreementId(null);
      setDraft(null);
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [createProductionTwoPane]);

  const followUpContinueBtnClass = workspaceUi
    ? "btn min-h-[3.25rem] shrink-0 border border-emerald-500/45 bg-emerald-950/35 px-6 py-3 text-base font-medium text-emerald-100/90 shadow-md shadow-emerald-950/35 ring-1 ring-emerald-500/30 hover:border-emerald-400/70 hover:bg-emerald-950/50 hover:shadow-lg hover:shadow-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto md:text-[1.0625rem] lg:text-[1.125rem]"
    : "btn border border-emerald-700/45 bg-slate-900/70 px-6 py-3 text-xs font-medium text-emerald-200/90 shadow-md shadow-black/30 hover:bg-slate-800/85 disabled:cursor-not-allowed disabled:opacity-45";

  const intakeMainCtaClass = `${continueIsSecondary ? followUpContinueBtnClass : primaryBtn}${
    !continueIsSecondary &&
    intakeGuidedComplete &&
    simpleProductFlow &&
    liveWorkspaceTwoPane &&
    !draftNowCommitted &&
    !draftPreCommitFreeze
      ? " ring-2 ring-emerald-300/80 ring-offset-2 ring-offset-slate-950 shadow-xl shadow-emerald-500/30 motion-safe:animate-pulse"
      : ""
  }`;

  /** Stage-A Continue only when commitBaselineFromTypedDescription would succeed (avoids enabled no-op). */
  const stageAContinueBlocked = useMemo(() => {
    if (!stageAInputFirst) return false;
    const step = intakeStepBuffer.trim();
    if (step.length < 6) return true;
    const live = buildLiveDraftPreview(step);
    return !isUsablePartialIntakeStructure(live, step) && !meetsMinimalIntakeProgress(step, live);
  }, [stageAInputFirst, intakeStepBuffer]);

  /** Single primary style for simple create two-pane bottom bar (Continue / Send agreement). */
  const simpleCreateBottomPrimaryClass =
    "flex min-h-[3.35rem] w-full items-center justify-center rounded-lg bg-emerald-400 px-6 py-3 text-base font-bold tracking-tight text-emerald-950 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-200/40 transition hover:bg-emerald-300 disabled:pointer-events-none disabled:opacity-65 sm:text-lg";

  const primaryIntakeCtaDisabled = (() => {
    if (isGenerating || draftPreCommitFreeze || intakeDictationPhase === "processing") return true;
    if (stageAInputFirst) return stageAContinueBlocked;
    if (createProductionTwoPane) {
      if (createFlowPhase === "complexity_choice_required") return true;
      if (createUiStage === CreateUiStage.INPUT) {
        return !intakeCombined.trim() || !guidedStructureComplete;
      }
      if (createUiStage === CreateUiStage.DRAFT) return !draft;
      if (createUiStage === CreateUiStage.RECIPIENTS) {
        const partiesOk = (draft?.parties?.length ?? 0) >= 1;
        const typeOk = agreementTypeAccepted;
        const recOk = recipientsDeferred || hasAnyValidRecipientEmail;
        return !draft || !partiesOk || !typeOk || !recOk;
      }
      return true;
    }
    return !intakeCombined.trim();
  })();
  const primaryIntakeCtaLabel = isGenerating
    ? primaryBusyLabel
    : stageAInputFirst
      ? stageAContinueBlocked
        ? "Describe your agreement"
        : "Create draft"
      : guidedMainCtaLabel;

  const unifiedPrimaryCta = useMemo((): PrimaryCtaState => {
    if (!simpleCreateUnifiedBottomCta) {
      return {
        label: "",
        action: "guided_continue",
        disabled: true,
        reason: "unified_cta_inactive",
      };
    }
    if (isGenerating || intakeDictationPhase === "processing") {
      return {
        label: primaryBusyLabel,
        action: "guided_continue",
        disabled: true,
        reason: isGenerating ? "generating" : "dictation_processing",
      };
    }
    if (stageAInputFirst) {
      const dis = stageAContinueBlocked;
      return {
        label: isGenerating ? primaryBusyLabel : dis ? "Describe your agreement" : "Create draft",
        action: "guided_continue",
        disabled: dis,
        reason: dis
          ? intakeStepBuffer.trim().length < 6
            ? "stage_a_short_input"
            : "stage_a_needs_clearer_request"
          : undefined,
      };
    }
    if (createProductionTwoPane) {
      if (draftPreCommitFreeze) {
        return { label: "One moment…", action: "guided_continue", disabled: true, reason: "draft_pre_commit" };
      }
      if (createFlowPhase === "complexity_choice_required") {
        return {
          label: "Choose a draft option above",
          action: "guided_continue",
          disabled: true,
          reason: "complexity_choice_required",
        };
      }
      if (createUiStage === CreateUiStage.INPUT) {
        const dis = !intakeCombined.trim() || !guidedStructureComplete;
        const empty = !intakeCombined.trim();
        return {
          label: empty
            ? "Describe your agreement"
            : guidedStructureComplete
              ? "Create draft"
              : "Continue",
          action: "guided_continue",
          disabled: dis,
          reason: dis
            ? !intakeCombined.trim()
              ? "empty_intake"
              : "guided_structure_incomplete"
            : undefined,
        };
      }
      if (createUiStage === CreateUiStage.DRAFT) {
        if (premiumPostCheckoutPhase === "awaiting_gaps" || premiumPostCheckoutPhase === "processing") {
          return {
            label:
              premiumPostCheckoutPhase === "awaiting_gaps"
                ? "Finish a few details…"
                : "Finalizing upgrade…",
            action: "continue_to_recipients",
            disabled: true,
            reason: "draft_pre_commit",
          };
        }
        if (isGenerating && createFlowPhase === "generating_draft") {
          return {
            label: primaryBusyLabel,
            action: "guided_continue",
            disabled: true,
            reason: "generating_draft",
          };
        }
        const premiumForkSurfaceEarly =
          premiumSendPathUnlocked || premiumPersistedFlowActive || premiumRecipientUxActive;
        const streamlineContinueLabelEarly =
          streamlineFirstRunReviewUi && premiumForkSurfaceEarly
            ? "Continue to send"
            : streamlineFirstRunReviewUi
              ? "Continue to send"
              : "Continue";
        if (showUpgradeToFullDraftOnReview) {
          return {
            label: streamlineContinueLabelEarly,
            action: "continue_basic_draft",
            disabled: !draft,
            reason: !draft ? "no_draft" : undefined,
          };
        }
        const firstBlocker = draft ? getDraftFirstReviewBlocker(draft) : null;
        const softPartyRecipientsPath = Boolean(
          draft &&
            (missing.length === 0 || createProductionTwoPane) &&
            firstBlocker === "party_placeholder" &&
            (draftHasFullDraftExpansion(draft) ||
              tierAllowsAdvancedFullDraftReveal(tier) ||
              premiumSendPathUnlocked ||
              premiumPersistedFlowActive),
        );
        const premiumOverridesReviewFriction = Boolean(
          (premiumSendPathUnlocked || premiumPersistedFlowActive) &&
            draft &&
            (missing.length === 0 || createProductionTwoPane),
        );
        /** BASIC only: live preview parties line can be correct while structured draft.parties still lags. */
        const basicPartyNamesResolvedViaLivePreview = Boolean(
          draft &&
            !premiumSendPathUnlocked &&
            !premiumPersistedFlowActive &&
            draftPartyPlaceholdersOkViaLivePreview(draft, displayLivePreviewModel.partiesLine, displayLivePreviewModel.partiesStructured ?? null),
        );
        const partyNamesIncompleteForProgress = Boolean(
          draft && draftHasPlaceholderParties(draft) && !basicPartyNamesResolvedViaLivePreview,
        );
        const draftPartiesOkForLimitedReview = Boolean(
          draft &&
            (!draftHasPlaceholderParties(draft) || basicPartyNamesResolvedViaLivePreview),
        );
        const limitedReviewIgnoresGenericTitleOnly = Boolean(
          showUpgradeToFullDraftOnReview &&
            draft &&
            (missing.length === 0 || createProductionTwoPane) &&
            draftPartiesOkForLimitedReview,
        );
        const reviewIncomplete = Boolean(
          draft &&
            (partyNamesIncompleteForProgress ||
              (!limitedReviewIgnoresGenericTitleOnly && draftHasPlaceholderFieldsForRecipients(draft))),
        );
        if (reviewIncomplete && !softPartyRecipientsPath && !premiumOverridesReviewFriction) {
          const fixLabel = firstBlocker === "party_placeholder" ? "Add party names" : "Fix details";
          return {
            label: fixLabel,
            action: "fix_review",
            disabled: !draft,
            reason: !draft ? "no_draft" : undefined,
          };
        }
        const premiumForkSurfaceActive =
          premiumSendPathUnlocked || premiumPersistedFlowActive || premiumRecipientUxActive;
        const streamlineContinueLabel =
          streamlineFirstRunReviewUi && premiumForkSurfaceActive
            ? "Continue to send"
            : streamlineFirstRunReviewUi
              ? "Continue to send"
              : "Continue";
        if (!showUpgradeToFullDraftOnReview && premiumPersistedFlowActive && !peekPremiumRecipientsSurfaceReleased()) {
          const reviewPath = effectivePremiumSendMode === "review";
          const proTruthBlocksPaidContinue =
            Boolean(premiumProTruthGate && !premiumProTruthGate.signerCtaAllowed) || proFullDraftQualityRetry;
          return {
            label: reviewPath ? "Continue to reviewer setup" : "Continue to signer setup",
            action: "premium_continue_to_signers",
            disabled: proTruthBlocksPaidContinue,
            reason: proTruthBlocksPaidContinue
              ? proFullDraftQualityRetry
                ? "pro_full_draft_retry_gate"
                : "premium_pro_truth_gate"
              : undefined,
          };
        }
        return {
          label: streamlineContinueLabel,
          action: "continue_to_recipients",
          disabled: !draft,
          reason: !draft ? "no_draft" : undefined,
        };
      }
      if (createUiStage === CreateUiStage.RECIPIENTS) {
        if (productionReadyForPersist) {
          const sendDisabled =
            !hasAnyValidRecipientEmail || Boolean(loading) || premiumSendConfirmOpen;
          const premiumOutbox = premiumSignersSurfaceReady;
          const persistSendLabel =
            loading &&
            createUiStage === CreateUiStage.RECIPIENTS &&
            createFlowPhase === "ready_to_send"
              ? "Sending…"
              : premiumSendConfirmGateActive
                ? "Continue to confirmation"
                : premiumOutbox
                  ? effectivePremiumSendMode === "review"
                    ? "Send review link"
                    : "Send signing link"
                  : streamlineFirstRunReviewUi
                    ? "Send review link"
                    : "Send signing link";
          return {
            label: persistSendLabel,
            action: "send_agreement",
            disabled: sendDisabled,
          };
        }
        const partiesOk = (draft?.parties?.length ?? 0) >= 1;
        const typeOk = agreementTypeAccepted;
        const recOk = recipientsDeferred || hasAnyValidRecipientEmail;
        const dis = !draft || !partiesOk || !typeOk || !recOk;
        let reason: string | undefined;
        if (!draft) reason = "no_draft";
        else if (!partiesOk) reason = "parties";
        else if (!typeOk) reason = "agreement_type_not_accepted";
        else if (!recOk) reason = "recipient_email_or_defer";
        return {
          label: "Add recipients",
          action: "complete_recipient_details",
          disabled: dis,
          reason,
        };
      }
      return {
        label: createUiStagePrimaryCta(
          createUiStage,
          Boolean(isGenerating && createFlowPhase === "generating_draft"),
          primaryBusyLabel,
        ),
        action: "guided_continue",
        disabled: true,
        reason: "unexpected_production_stage",
      };
    }
    if (draftPreCommitFreeze) {
      return { label: "One moment…", action: "guided_continue", disabled: true, reason: "draft_pre_commit" };
    }
    if (simpleCreateReadyForSend) {
      return {
        label: "Send",
        action: "send_agreement",
        disabled: (productionReadyForPersist && !hasAnyValidRecipientEmail) || Boolean(loading),
      };
    }
    const dis = !intakeCombined.trim();
    return {
      label: "Continue",
      action: "guided_continue",
      disabled: dis,
      reason: dis ? "empty_intake" : undefined,
    };
  }, [
    simpleCreateUnifiedBottomCta,
    isGenerating,
    intakeDictationPhase,
    stageAInputFirst,
    stageAContinueBlocked,
    intakeStepBuffer,
    createProductionTwoPane,
    draftPreCommitFreeze,
    createFlowPhase,
    createUiStage,
    intakeCombined,
    guidedStructureComplete,
    primaryBusyLabel,
    draft,
    missing,
    showUpgradeToFullDraftOnReview,
    productionReadyForPersist,
    agreementTypeAccepted,
    recipientsDeferred,
    recipient1Email,
    simpleCreateReadyForSend,
    tier,
    premiumSendPathUnlocked,
    premiumRecipientUxActive,
    premiumPersistedFlowActive,
    premiumPostCheckoutPhase,
    premiumSurfaceGateTick,
    loading,
    premiumSendConfirmOpen,
    premiumSendConfirmGateActive,
    recipient2Email,
    hasAnyValidRecipientEmail,
    streamlineFirstRunReviewUi,
    effectivePremiumSendMode,
    displayLivePreviewModel,
    premiumProTruthGate,
    proFullDraftQualityRetry,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !simpleCreateUnifiedBottomCta) return;
    const cta = unifiedPrimaryCta;
    if (cta.action === "send_agreement" && createUiStage !== CreateUiStage.RECIPIENTS && createProductionTwoPane) {
      console.error("[CTA invariant] send_agreement action outside RECIPIENTS", {
        createUiStage,
        createFlowPhase,
        label: cta.label,
        disabled: cta.disabled,
        simpleCreateReadyForSend,
      });
    }
    if (
      cta.action === "send_agreement" &&
      createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      !simpleCreateReadyForSend
    ) {
      console.error("[CTA invariant] send_agreement while simpleCreateReadyForSend is false", {
        productionReadyForPersist,
        disabled: cta.disabled,
        label: cta.label,
      });
    }
    if (createProductionTwoPane && createUiStage === CreateUiStage.DRAFT && cta.action === "send_agreement") {
      console.error("[CTA invariant] send_agreement in DRAFT stage", { createFlowPhase, label: cta.label });
    }
    if (createProductionTwoPane && createUiStage === CreateUiStage.RECIPIENTS && cta.action === "continue_to_recipients") {
      console.error("[CTA invariant] continue_to_recipients action in RECIPIENTS stage", { label: cta.label, action: cta.action });
    }
    if (createProductionTwoPane && createUiStage === CreateUiStage.DRAFT && cta.action === "premium_continue_to_signers") {
      if (
        import.meta.env.DEV &&
        cta.disabled &&
        cta.reason !== "premium_pro_truth_gate" &&
        cta.reason !== "pro_full_draft_retry_gate"
      ) {
        console.error("[CTA invariant] premium_continue_to_signers unexpectedly disabled in DRAFT", cta);
      }
    }
    if (import.meta.env.DEV && createUiStage === CreateUiStage.DRAFT && cta.action === "send_agreement") {
      console.error("[FSM VIOLATION] Send shown in DRAFT", cta);
    }
    if (import.meta.env.DEV && createUiStage === CreateUiStage.RECIPIENTS && cta.action === "continue_basic_draft") {
      console.error("[FSM VIOLATION] Wrong action in RECIPIENTS", cta);
    }
  }, [
    unifiedPrimaryCta,
    simpleCreateUnifiedBottomCta,
    createProductionTwoPane,
    createUiStage,
    createFlowPhase,
    simpleCreateReadyForSend,
    productionReadyForPersist,
  ]);

  const simpleCreateBottomPrimaryLabel = simpleCreateUnifiedBottomCta
    ? unifiedPrimaryCta.label
    : primaryIntakeCtaLabel;

  const productionPremiumInlineSendSurface = Boolean(
    createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      productionReadyForPersist &&
      premiumSignersSurfaceReady,
  );
  const showProductionPremiumInlineSendSuccess = Boolean(
    productionPremiumInlineSendSurface && productionSendBarPhase === "sent" && productionSendBarAgreementId,
  );
  const showProductionPremiumInlineSendLoading = Boolean(
    productionPremiumInlineSendSurface &&
      loading &&
      createFlowPhase === "ready_to_send" &&
      productionSendBarPhase !== "sent",
  );

  const effectivePrimaryCtaDisabled = simpleCreateUnifiedBottomCta
    ? unifiedPrimaryCta.disabled
    : primaryIntakeCtaDisabled;

  /** Sticky CTA stays pressable so we can scroll/focus missing recipient fields instead of a dead disabled button. */
  const stickyRecipientBlockedNudge = Boolean(
    simpleCreateUnifiedBottomCta &&
      createProductionTwoPane &&
      createUiStage === CreateUiStage.RECIPIENTS &&
      unifiedPrimaryCta.action === "complete_recipient_details" &&
      unifiedPrimaryCta.disabled &&
      unifiedPrimaryCta.reason === "recipient_email_or_defer",
  );
  const stickyPrimaryButtonNativeDisabled = effectivePrimaryCtaDisabled && !stickyRecipientBlockedNudge;
  const blockedPreviewRenderSource =
    (premiumTruthPipelineSource || premiumPaidReadonlyPick.sourceUsed || lastPremiumPipelineRenderSourceRef.current || "").trim();
  const showStrictRetryNeedsDetailsPanel = shouldShowRetryNeedsDetailsPanel({
    proFullDraftQualityRetry,
    premiumProTruthGate,
  });
  const showStrictBlockedDraftPreviewLabel = shouldShowBlockedDraftPreviewLabel({
    premiumProTruthGate,
    renderSource: blockedPreviewRenderSource,
  });
  const showRetryAsPrimaryCta = Boolean(
    simpleCreateUnifiedBottomCta &&
      createProductionTwoPane &&
      createUiStage === CreateUiStage.DRAFT &&
      premiumPaidDocumentSurface &&
      showStrictRetryNeedsDetailsPanel,
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !simpleProductFlow || !liveWorkspaceTwoPane || !showMainIntakeForm) return;
    const sendRelated =
      simpleCreateBottomPrimaryLabel === "Send agreement" ||
      simpleCreateBottomPrimaryLabel === "Send" ||
      simpleCreateBottomPrimaryLabel === "Sending…" ||
      createUiStage === CreateUiStage.RECIPIENTS ||
      simpleCreateReadyForSend;
    if (!sendRelated) return;
    devSendCtaTrace("render: send-related snapshot", {
      stickyVisible: simpleCreateStickyBottomBarVisible,
      inlineFallback: simpleCreateUnifiedBottomCta && !simpleCreateStickyBottomBarVisible,
      label: simpleCreateUnifiedBottomCta ? unifiedPrimaryCta.label : primaryIntakeCtaLabel,
      primaryIntakeCtaDisabled: effectivePrimaryCtaDisabled,
      createUiStage,
      createFlowPhase,
      simpleCreateReadyForSend,
      simpleCreateStickyBottomBarVisible,
      guidedStructureComplete,
      hasDraft: Boolean(draft),
      reviewAgreementId: Boolean(reviewAgreementId?.trim()),
      recipient1Email: Boolean(recipient1Email.trim()),
      recipientsDeferred,
      loading,
      createProductionTwoPane,
    });
  }, [
    simpleProductFlow,
    liveWorkspaceTwoPane,
    showMainIntakeForm,
    simpleCreateBottomPrimaryLabel,
    createUiStage,
    simpleCreateReadyForSend,
    simpleCreateStickyBottomBarVisible,
    simpleCreateUnifiedBottomCta,
    primaryIntakeCtaLabel,
    primaryIntakeCtaDisabled,
    unifiedPrimaryCta,
    effectivePrimaryCtaDisabled,
    createFlowPhase,
    guidedStructureComplete,
    draft,
    reviewAgreementId,
    recipient1Email,
    recipientsDeferred,
    loading,
    createProductionTwoPane,
  ]);

  const simpleCreateBarCoolToneForBasicContinuePath = Boolean(upgradeLockActive);

  /** Hidden when optional upgrade compare is on-screen so we don’t imply “ready to send” before Continue. */
  const productionReviewReadyToSendLine = Boolean(
    createProductionTwoPane &&
      createUiStage === CreateUiStage.DRAFT &&
      Boolean(draft) &&
      !isGenerating &&
      !draftPreCommitFreeze &&
      (!draftHasPlaceholderParties(draft) ||
        draftHasFullDraftExpansion(draft) ||
        tierAllowsAdvancedFullDraftReveal(tier)) &&
      (!draftHasPlaceholderFieldsForRecipients(draft) ||
        (showUpgradeToFullDraftOnReview && draft && !draftHasPlaceholderParties(draft)) ||
        (draft &&
          getDraftFirstReviewBlocker(draft) === "party_placeholder" &&
          (draftHasFullDraftExpansion(draft) || tierAllowsAdvancedFullDraftReveal(tier)))) &&
      !(showFullDraftDiffPreview && createUiStage === CreateUiStage.DRAFT),
  );

  /** Free starter path on recipients — show subtle “sendable as-is” reassurance (not paywalled). */
  const showStarterRecipientsReassurance = useMemo(
    () =>
      Boolean(
        createProductionTwoPane &&
          draft &&
          !draftHasFullDraftExpansion(draft) &&
          !tierAllowsAdvancedFullDraftReveal(tier) &&
          !premiumRecipientUxActive &&
          !premiumPersistedFlowActive &&
          !premiumSendPathUnlocked,
      ),
    [
      createProductionTwoPane,
      draft,
      tier,
      premiumRecipientUxActive,
      premiumPersistedFlowActive,
      premiumSendPathUnlocked,
    ],
  );

  /** One-line echo of reviewed agreement for recipients / e-sign continuity (no new screens). */
  const reviewHandoffAgreementEcho = React.useMemo(() => {
    const d = draft;
    if (!d) return null;
    const title = (d.title || "").trim();
    const names = (d.parties || [])
      .map((p) => (p.name || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (names.length === 2) {
      return title ? (title.length > 96 ? `${title.slice(0, 93)}…` : title) : null;
    }
    const bits: string[] = [];
    if (title) bits.push(title.length > 96 ? `${title.slice(0, 93)}…` : title);
    if (names.length) bits.push(names.join(" · "));
    return bits.length ? bits.join(" — ") : null;
  }, [draft]);

  const focusFirstBlockingReviewIssue = React.useCallback((): FixReviewResult => {
    setHardError(null);
    const d = draft;
    const failVisible = (reason: string): FixReviewResult => {
      setHardError(reason);
      scrollLikelyReviewSectionIntoView();
      if (import.meta.env.DEV) {
        console.debug("[fix_review]", {
          blocker: "fallback",
          targetId: null,
          beginInline: false,
          focused: false,
          fallbackError: true,
        });
      }
      return { ok: false, reason };
    };

    if (!d) {
      return failVisible("Please complete the missing review details before continuing.");
    }

    const first = getDraftFirstReviewBlocker(d);

    if (first === "party_placeholder") {
      /** BASIC/simple-create: open the dedicated party/recipient name modal instead of scrolling the full agreement editor. */
      const openPartyDetailsModalForBasicDraftReview = Boolean(
        createProductionTwoPane &&
          createUiStage === CreateUiStage.DRAFT &&
          createFlowPhase === "draft_ready_for_review" &&
          !premiumSendPathUnlocked &&
          !premiumPersistedFlowActive,
      );
      if (openPartyDetailsModalForBasicDraftReview) {
        const pendingResume: PartyDetailsModalPendingResume = showUpgradeToFullDraftOnReviewRef.current
          ? "continue_basic"
          : "continue_send";
        openPartyDetailsModalForReviewPlaceholder(d, pendingResume);
        if (import.meta.env.DEV) {
          console.debug("[fix_review]", {
            blocker: "party_placeholder",
            targetId: "recipient_party_details_modal",
            basicDraftReview: true,
            pendingResume,
          });
        }
        return { ok: true, target: "recipient_party_details_modal" };
      }

      setReviewPartyHighlightNonce((n) => n + 1);
      window.requestAnimationFrame(() => {
        document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.requestAnimationFrame(() => {
          window.setTimeout(() => {
            agreementPreviewEditorRef.current?.focus({ preventScroll: true });
            const input = agreementPreviewEditorRef.current;
            const focused = document.activeElement === input;
            if (!focused) {
              setHardError("Please complete the missing review details before continuing.");
              scrollLikelyReviewSectionIntoView();
            }
            if (import.meta.env.DEV) {
              console.debug("[fix_review]", {
                blocker: "party_placeholder",
                targetId: "claw-agreement-preview-editor",
                beginInline: false,
                syntheticClick: false,
                focused,
                fallbackError: !focused,
              });
            }
          }, 0);
        });
      });
      return { ok: true, target: "claw-agreement-preview-editor" };
    }

    if (first === "other_placeholder") {
      const structured = getPrimaryStructuredFixReviewField(d);
      window.requestAnimationFrame(() => {
        document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.requestAnimationFrame(() => {
          agreementPreviewEditorRef.current?.focus({ preventScroll: true });
          if (import.meta.env.DEV) {
            console.debug("[fix_review]", { blocker: "other_placeholder", structured });
          }
        });
      });
      return { ok: true, target: "claw-agreement-preview-editor" };
    }

    if (missing.length > 0) {
      window.requestAnimationFrame(() => {
        scrollLikelyReviewSectionIntoView();
        if (import.meta.env.DEV) {
          console.debug("[fix_review]", {
            blocker: "draft_advisory_structure",
            firstMissing: missing[0],
            targetId: "claw-agreement-preview-editor",
            beginInline: false,
            focused: false,
            fallbackError: false,
          });
        }
      });
      return { ok: true, target: "claw-agreement-preview-editor" };
    }

    if (first == null) {
      window.requestAnimationFrame(() => {
        document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (import.meta.env.DEV) {
          console.debug("[fix_review]", { blocker: "none", targetId: "claw-agreement-preview-editor" });
        }
      });
      return { ok: true, target: "claw-agreement-preview-editor" };
    }

    return failVisible("Please complete the missing review details before continuing.");
  }, [
    draft,
    missing,
    createProductionTwoPane,
    createUiStage,
    createFlowPhase,
    premiumSendPathUnlocked,
    premiumPersistedFlowActive,
    openPartyDetailsModalForReviewPlaceholder,
  ]);

  const handOffProductionDraftToRecipients = React.useCallback(
    async (opts?: { partyNamesJustResolvedDraft?: ParsedDraftShape }) => {
    if (!(createProductionTwoPane && createUiStage === CreateUiStage.DRAFT)) {
      console.error("[BLOCKED ACTION] handOff:not_draft_two_pane", { createUiStage, createProductionTwoPane });
      setHardError("Continue to send is only available from draft review.");
      return;
    }
    const draftForPartyGate = opts?.partyNamesJustResolvedDraft ?? draft;
    if (draftForPartyGate && draftHasPlaceholderParties(draftForPartyGate)) {
      const allowSoftPartyContinue =
        draftHasFullDraftExpansion(draftForPartyGate) ||
        tierAllowsAdvancedFullDraftReveal(tier) ||
        premiumSendPathUnlocked ||
        premiumPersistedFlowActive;
      if (!allowSoftPartyContinue) {
        setReviewPartyHighlightNonce((n) => n + 1);
        window.requestAnimationFrame(() => {
          document.getElementById("claw-review-parties-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        setHardError("Add legal party names in review before recipient setup, or complete final details before sending.");
        return;
      }
    }
    if (intakeStepBufferRef.current.trim()) {
      const applied = await runProductionLocalDraftParse({ handoffSource: "draft_reparse_intake_buffer" });
      if (!applied) {
        console.error("[BLOCKED ACTION] handOff:intake_buffer_parse_not_applied");
        setHardError("Could not apply your latest edits. Try again or shorten the note.");
        return;
      }
    }
    if (
      upgradeLockActiveRef.current &&
      !premiumSendPathUnlocked &&
      !premiumPersistedFlowActive
    ) {
      setHardError("Choose basic or full draft above before adding recipients.");
      return;
    }
    const d = opts?.partyNamesJustResolvedDraft ?? draft;
    if (d) {
      const { n1, n2 } = getRecipientHandoffNamesFromDraft(d);
      const next1 = pickRecipientNameForHandoff(recipient1Name, n1);
      const next2 = pickRecipientNameForHandoff(recipient2Name, n2);
      setRecipient1Name(next1);
      setRecipient2Name(next2);
      setRecipientSignerLabels((prev) =>
        pickRecipientSignerLabelsForHandoff(prev, next1, next2, {
          role1: d.parties?.[0]?.role,
          role2: d.parties?.[1]?.role,
        }),
      );
      try {
        agreementDocumentDirtyRef.current = false;
        setAgreementDocumentText(buildPreviewForCurrentTier(d));
      } catch {
        /* ignore */
      }
      setReviewDocRefreshTick((tick) => tick + 1);
      setHardError(null);
      persistPremiumRecipientHandoffFromDraftAndUi(d, { displayName1: next1, displayName2: next2 });
    }
    setAgreementTypeAccepted(true);
    setCreateFlowPhase("recipient_setup_required");
    setCreateUiStage(CreateUiStage.RECIPIENTS);
    setMobileWorkspacePane("preview");
    window.requestAnimationFrame(() => {
      scrollVisibleRecipientSetupIntoView("start");
    });
  }, [
    createProductionTwoPane,
    createUiStage,
    missing,
    draft,
    runProductionLocalDraftParse,
    setRecipient1Name,
    setRecipient2Name,
    recipient1Email,
    recipient2Email,
    setRecipientSignerLabels,
    setAgreementTypeAccepted,
    setCreateFlowPhase,
    setCreateUiStage,
    setMobileWorkspacePane,
    setHardError,
    setAgreementDocumentText,
    tier,
    premiumSendPathUnlocked,
    premiumPersistedFlowActive,
    recipient1Name,
    recipient2Name,
    persistPremiumRecipientHandoffFromDraftAndUi,
    buildPreviewForCurrentTier,
  ]);

  const handlePremiumReviewFirstContinueToSigners = React.useCallback(() => {
    if (hasFullDraftAccess) {
      const t = (premiumPaidReadonlyPick.plainText || "").trim();
      if (t) {
        const i = (currentPremiumMergedIntakeKey || intakeCombined).trim() || intakeCombined;
        const contract = resolveAgreementIntentContract(i);
        const v = validatePaidProOutput({
          text: t,
          rawIntake: i,
          draft: draft ?? null,
          intentContract: contract,
        });
        const g = canShowPremiumSuccess({
          intentContract: contract,
          renderSource: premiumPaidReadonlyPick.sourceUsed,
          validation: v,
          documentText: t,
          intakeText: i,
          premiumPipelineSource: premiumTruthPipelineSource ?? lastPremiumPipelineRenderSourceRef.current,
          stale: false,
          draft: draft ?? null,
          qualityRetryActive: proFullDraftQualityRetry,
          serverGenerationDegraded: Boolean(premiumServerGenerationDegraded),
        });
        if (!g.signerCtaAllowed) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.info("[premium-truth-telemetry] continue_to_signers blocked", g);
          }
          return;
        }
      }
    }
    emitPaidFunnelEvent("premium_continue_recipients_clicked", { extra: { continue_mode: effectivePremiumSendMode } });
    markPremiumRecipientsSurfaceReleased();
    setPremiumRecipientUxActive(true);
    bumpPremiumSurfaceGateTick();
    void handOffProductionDraftToRecipients();
  }, [
    hasFullDraftAccess,
    premiumPaidReadonlyPick,
    currentPremiumMergedIntakeKey,
    intakeCombined,
    draft,
    premiumTruthPipelineSource,
    proFullDraftQualityRetry,
    premiumServerGenerationDegraded,
    handOffProductionDraftToRecipients,
    bumpPremiumSurfaceGateTick,
    emitPaidFunnelEvent,
    effectivePremiumSendMode,
  ]);

  const handleFinalizeRoutePrimaryAction = React.useCallback(
    (mode: PremiumSendIntent) => {
      handlePremiumSendModePick(mode);
      if (mode === "review" || mode === "signature") {
        void handlePremiumReviewFirstContinueToSigners();
      }
    },
    [handlePremiumSendModePick, handlePremiumReviewFirstContinueToSigners],
  );

  const bumpFinalizeRoutePrimaryActionNonce = React.useCallback(() => {
    setFinalizeRoutePrimaryActionNonce((n) => n + 1);
  }, []);

  const commitRecipientPartyDetailsModal = React.useCallback(() => {
    const d = draft;
    if (!d) {
      partyDetailsModalPendingResumeRef.current = null;
      setRecipientPartyDetailsModalOpen(false);
      return;
    }
    const n0 = modalParty1Name.trim() || (d.parties?.[0]?.name || "").trim();
    const n1 = modalParty2Name.trim() || (d.parties?.[1]?.name || "").trim();
    const r0 = modalParty1Role.trim() || (d.parties?.[0]?.role || "party");
    const r1 = modalParty2Role.trim() || (d.parties?.[1]?.role || "party");
    const nextParties = [...(d.parties || [])];
    if (nextParties[0]) nextParties[0] = { ...nextParties[0], name: n0 || nextParties[0].name, role: r0 || "party" };
    if (nextParties[1]) nextParties[1] = { ...nextParties[1], name: n1 || nextParties[1].name, role: r1 || "party" };
    else if (n1) nextParties.push({ name: n1, role: r1 || "party" });
    const nextDraft = { ...d, parties: nextParties };
    if (draftHasPlaceholderParties(nextDraft)) {
      setHardError("Add two distinguishable legal names for both parties before continuing.");
      return;
    }
    window.clearTimeout(agreementDocSyncTimerRef.current);
    agreementDocSyncTimerRef.current = 0;
    agreementDocumentDirtyRef.current = false;
    const pendingResume = partyDetailsModalPendingResumeRef.current;
    partyDetailsModalPendingResumeRef.current = null;

    flushSync(() => {
      setDraft(nextDraft);
      setAgreementDocumentText(buildPreviewForCurrentTier(nextDraft));
      setRecipient1Name((prev) => modalParty1Name.trim() || prev);
      setRecipient2Name((prev) => modalParty2Name.trim() || prev);
      if (looksLikeEmail(modalParty1Email.trim())) setRecipient1Email(modalParty1Email.trim());
      if (looksLikeEmail(modalParty2Email.trim())) setRecipient2Email(modalParty2Email.trim());
      setRecipientPartyDetailsModalOpen(false);
      setHardError(null);
    });
    setReviewDocRefreshTick((tick) => tick + 1);
    persistPremiumRecipientHandoff({
      party1: {
        name: (nextDraft.parties?.[0]?.name || "").trim(),
        ...(looksLikeEmail(modalParty1Email.trim())
          ? { email: stripRecipientEmailNoise(modalParty1Email.trim()) }
          : {}),
        role: r0 || "party",
      },
      party2: {
        name: (nextDraft.parties?.[1]?.name || "").trim(),
        ...(looksLikeEmail(modalParty2Email.trim())
          ? { email: stripRecipientEmailNoise(modalParty2Email.trim()) }
          : {}),
        role: r1 || "party",
      },
    });

    if (!pendingResume) return;

    void (async () => {
      try {
        if (pendingResume === "continue_basic" || pendingResume === "continue_send") {
          await handOffProductionDraftToRecipients({ partyNamesJustResolvedDraft: nextDraft });
          return;
        }
        if (pendingResume === "unlock_premium_rewrite") {
          beginAdvancedFullDraftCheckout(nextDraft);
          return;
        }
        if (pendingResume === "upgrade_complete_agreement") {
          await handleUpgradeToFullDraft(nextDraft);
          return;
        }
        if (pendingResume === "premium_original_wording_checkout") {
          beginPremiumOriginalWordingCheckout(nextDraft);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.error("[party_modal_resume]", e);
        setHardError("Something went wrong after saving names — your draft is still here. Try the button again.");
      }
    })();
  }, [
    draft,
    modalParty1Name,
    modalParty2Name,
    modalParty1Role,
    modalParty2Role,
    modalParty1Email,
    modalParty2Email,
    setDraft,
    setAgreementDocumentText,
    setRecipient1Name,
    setRecipient2Name,
    setRecipient1Email,
    setRecipient2Email,
    handOffProductionDraftToRecipients,
    beginAdvancedFullDraftCheckout,
    handleUpgradeToFullDraft,
    beginPremiumOriginalWordingCheckout,
    buildPreviewForCurrentTier,
  ]);

  const focusFirstMissingRecipientRequirement = React.useCallback(() => {
    const r1n = recipient1Name.trim();
    const r1e = stripRecipientEmailNoise(recipient1Email);
    if (!r1n) {
      if (focusVisibleRecipientInput("r1-name")) return;
    }
    if (!looksLikeEmail(r1e)) {
      if (focusVisibleRecipientInput("r1-email")) return;
    }
    const r2e = stripRecipientEmailNoise(recipient2Email);
    if (recipient2Name.trim() && !looksLikeEmail(r2e)) {
      if (focusVisibleRecipientInput("r2-email")) return;
    }
    scrollVisibleRecipientSetupIntoView("center");
  }, [recipient1Name, recipient1Email, recipient2Name, recipient2Email]);

  const executePrimaryCta = (cta: PrimaryCtaState) => {
    console.log("[CTA EXECUTE]", {
      stage: createUiStage,
      action: cta.action,
      label: cta.label,
      disabled: cta.disabled,
    });
    if (import.meta.env.DEV) {
      devSendCtaTrace("executePrimaryCta", {
        action: cta.action,
        disabled: cta.disabled,
        label: cta.label,
        createUiStage,
      });
    }
    if (draftPreCommitFreeze) {
      setHardError(humanizePrimaryCtaBlockedReason("draft_pre_commit"));
      return;
    }
    void (async () => {
      try {
        if (cta.disabled) {
          if (cta.action === "fix_review" && draft) {
            const res = focusFirstBlockingReviewIssue();
            if (import.meta.env.DEV) console.debug("[fix_review] result (disabled path)", res);
            return;
          }
          setHardError(humanizePrimaryCtaBlockedReason(cta.reason));
          if (cta.action === "complete_recipient_details" || cta.reason === "recipient_email_or_defer") {
            setCreateFlowSendRecipientEditorOpen(true);
            focusFirstMissingRecipientRequirement();
          }
          return;
        }
        switch (cta.action) {
          case "fix_review": {
            const res = focusFirstBlockingReviewIssue();
            if (import.meta.env.DEV) console.debug("[fix_review] result", res);
            return;
          }
          case "complete_recipient_details": {
            setHardError(null);
            void finalizeIntakeCapture()
              .then(() => {
                if (premiumSignersSurfaceReady) {
                  if (draft) persistPremiumRecipientHandoffFromDraftAndUi(draft);
                  setPremiumSendConfirmOpen(true);
                } else {
                  void onGenerate();
                }
              })
              .catch((e) => {
                if (import.meta.env.DEV) console.error("[complete_recipient_details] advance", e);
                setHardError("Something went wrong. Your draft is still here — try again in a moment.");
              });
            return;
          }
          case "premium_continue_to_signers": {
            setHardError(null);
            handlePremiumReviewFirstContinueToSigners();
            return;
          }
          case "continue_to_recipients": {
            setHardError(null);
            if (
              createProductionTwoPane &&
              premiumPersistedFlowActive &&
              !peekPremiumRecipientsSurfaceReleased()
            ) {
              window.requestAnimationFrame(() => {
                document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                }) ??
                  document.getElementById("claw-simple-create-preview")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
              });
              return;
            }
            await handOffProductionDraftToRecipients();
            return;
          }
          case "continue_basic_draft": {
            console.log("[FSM] continue_basic_draft → RECIPIENTS");
            setHardError(null);
            clearUpgradeLockAndResume();
            await handOffProductionDraftToRecipients();
            return;
          }
          case "send_agreement": {
            logProductEvent("create_flow_cta_clicked", { cta_click_type: "send" });
            await finalizeIntakeCapture();
            if (!hasAnyValidRecipientEmail) {
              setHardError("Add at least one valid recipient email, then try again.");
              return;
            }
            const premiumSendConfirmGate =
              createProductionTwoPane &&
              createUiStage === CreateUiStage.RECIPIENTS &&
              premiumSignersSurfaceReady;
            if (premiumSendConfirmGate) {
              if (draft) persistPremiumRecipientHandoffFromDraftAndUi(draft);
              setPremiumSendConfirmOpen(true);
              return;
            }
            await onGenerate();
            return;
          }
          case "guided_continue": {
            if (createProductionTwoPane && createUiStage === CreateUiStage.INPUT && guidedStructureComplete) {
              console.debug("[handoff-start]", {
                source: "executePrimaryCta_INPUT_to_DRAFT",
                createUiStage,
                createFlowPhase_before: createFlowPhase,
                displayPhase_before: displayPhase,
              });
              setHardError(null);
              setCreateFlowPhase("generating_draft");
              setDisplayPhase("generating_draft");
              setCreateUiStage(CreateUiStage.DRAFT);
              setLoading(true);
              await finalizeIntakeCapture();
              trackFunnelEvent("generate_clicked", {
                ready_state: guidedStructureComplete && !isGenerating,
                intake_chars: intakeCombined.trim().length,
                max_step_reached: funnelMaxStepRef.current,
                production_phase: "local_draft_parse",
              });
              await runProductionLocalDraftParse({ handoffSource: "guided_input_generate" });
              return;
            }
            if (stageAInputFirst) {
              if (createProductionTwoPane) {
                console.debug("[handoff-start]", {
                  source: "executePrimaryCta_stageA",
                  createUiStage,
                  createFlowPhase_before: createFlowPhase,
                  displayPhase_before: displayPhase,
                });
                setHardError(null);
                setCreateFlowPhase("generating_draft");
                setDisplayPhase("generating_draft");
                setCreateUiStage(CreateUiStage.DRAFT);
                setLoading(true);
              }
              await finalizeIntakeCapture();
              const rawCommitted = intakeStepBuffer.trim();
              const didCommit = commitBaselineFromTypedDescription();
              if (createProductionTwoPane && didCommit) {
                trackFunnelEvent("generate_clicked", {
                  ready_state: guidedStructureComplete && !isGenerating,
                  intake_chars: rawCommitted.length,
                  max_step_reached: funnelMaxStepRef.current,
                  production_phase: "local_draft_parse",
                });
                await runProductionLocalDraftParse({ rawOverride: rawCommitted, handoffSource: "stageA_baseline" });
              } else if (createProductionTwoPane) {
                setLoading(false);
                setDisplayPhase("intake");
                setCreateFlowPhase("capturing_input");
                setCreateUiStage(CreateUiStage.INPUT);
              }
              return;
            }
            if (simpleProductFlow && liveWorkspaceTwoPane && guidedStructureComplete && !draftNowCommitted) {
              await finalizeIntakeCapture();
              handleDraftNowCommit();
              return;
            }
            if (
              createProductionTwoPane &&
              createUiStage === CreateUiStage.RECIPIENTS &&
              premiumSignersSurfaceReady
            ) {
              await finalizeIntakeCapture();
              if (!hasAnyValidRecipientEmail) {
                setHardError("Add at least one valid recipient email, then try again.");
                return;
              }
              if (draft) persistPremiumRecipientHandoffFromDraftAndUi(draft);
              setPremiumSendConfirmOpen(true);
              return;
            }
            if (createProductionTwoPane && createUiStage === CreateUiStage.DRAFT && draft) {
              if (import.meta.env.DEV) {
                console.warn(
                  "[CTA] guided_continue fallback: production DRAFT reached generic handler → recipients handoff",
                );
              }
              setHardError(null);
              await handOffProductionDraftToRecipients();
              return;
            }
            await onGenerate();
            return;
          }
          default:
            console.error("[CTA ERROR] Unknown action", cta);
            setHardError("This action is not available. Refresh and try again.");
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] executePrimaryCta error", err);
        setHardError("Something went wrong. Your draft is still here — try again in a moment.");
      }
    })();
  };

  const runPrimaryIntakeAction = () => {
    if (draftPreCommitFreeze) {
      if (simpleCreateUnifiedBottomCta) {
        setHardError(humanizePrimaryCtaBlockedReason("draft_pre_commit"));
      }
      if (import.meta.env.DEV) devSendCtaTrace("return sync: draftPreCommitFreeze");
      return;
    }
    if (stickyRecipientBlockedNudge) {
      setCreateFlowSendRecipientEditorOpen(true);
      focusFirstMissingRecipientRequirement();
      setHardError(humanizePrimaryCtaBlockedReason("recipient_email_or_defer"));
      if (import.meta.env.DEV) devSendCtaTrace("runPrimary: recipient nudge → focus first missing field");
      return;
    }
    if (simpleCreateUnifiedBottomCta) {
      console.log("[CTA CLICK]", unifiedPrimaryCta);
      executePrimaryCta(unifiedPrimaryCta);
      return;
    }
    if (import.meta.env.DEV) {
      devSendCtaTrace("runPrimaryIntakeAction scheduling async (legacy)", {
        createUiStage,
        createFlowPhase,
        guidedStructureComplete,
        createProductionTwoPane,
        simpleCreateReadyForSend,
        effectivePrimaryCtaDisabled,
        loading,
        isGenerating,
      });
    }
    void (async () => {
      try {
      /** Recipients-stage send must not depend on guided intake completeness (resume / empty intake buffers). */
      if (
        createProductionTwoPane &&
        createUiStage === CreateUiStage.RECIPIENTS &&
        draft &&
        agreementTypeAccepted &&
        (draft.parties?.length ?? 0) >= 1 &&
        (recipientsDeferred || hasAnyValidRecipientEmail)
      ) {
        if (import.meta.env.DEV) devSendCtaTrace("runPrimary: early RECIPIENTS → finalize + onGenerate");
        await finalizeIntakeCapture();
        if (!hasAnyValidRecipientEmail) {
          setHardError("Add at least one valid recipient email, then try again.");
          return;
        }
        if (premiumSignersSurfaceReady) {
          persistPremiumRecipientHandoffFromDraftAndUi(draft);
          setPremiumSendConfirmOpen(true);
          return;
        }
        await onGenerate();
        return;
      }
      if (stageAInputFirst) {
        if (createProductionTwoPane) {
          console.debug("[handoff-start]", {
            source: "runPrimary_stageA",
            createUiStage,
            createFlowPhase_before: createFlowPhase,
            displayPhase_before: displayPhase,
          });
          setHardError(null);
          setCreateFlowPhase("generating_draft");
          setDisplayPhase("generating_draft");
          setCreateUiStage(CreateUiStage.DRAFT);
          setLoading(true);
        }
        await finalizeIntakeCapture();
        const rawCommitted = intakeStepBuffer.trim();
        const didCommit = commitBaselineFromTypedDescription();
        if (createProductionTwoPane && didCommit) {
          trackFunnelEvent("generate_clicked", {
            ready_state: guidedStructureComplete && !isGenerating,
            intake_chars: rawCommitted.length,
            max_step_reached: funnelMaxStepRef.current,
            production_phase: "local_draft_parse",
          });
          await runProductionLocalDraftParse({ rawOverride: rawCommitted, handoffSource: "stageA_baseline" });
        } else if (createProductionTwoPane) {
          setLoading(false);
          setDisplayPhase("intake");
          setCreateFlowPhase("capturing_input");
          setCreateUiStage(CreateUiStage.INPUT);
        }
        return;
      }
      if (createProductionTwoPane && guidedStructureComplete) {
        if (createUiStage === CreateUiStage.INPUT) {
          console.debug("[handoff-start]", {
            source: "runPrimary_guided_input",
            createUiStage,
            createFlowPhase_before: createFlowPhase,
            displayPhase_before: displayPhase,
          });
          setHardError(null);
          setCreateFlowPhase("generating_draft");
          setDisplayPhase("generating_draft");
          setCreateUiStage(CreateUiStage.DRAFT);
          setLoading(true);
        }
        await finalizeIntakeCapture();
        if (createUiStage === CreateUiStage.INPUT) {
          trackFunnelEvent("generate_clicked", {
            ready_state: guidedStructureComplete && !isGenerating,
            intake_chars: intakeCombined.trim().length,
            max_step_reached: funnelMaxStepRef.current,
            production_phase: "local_draft_parse",
          });
          await runProductionLocalDraftParse({ handoffSource: "guided_input_generate" });
          return;
        }
        if (createUiStage === CreateUiStage.DRAFT) {
          if (missing.length > 0 && !createProductionTwoPane) {
            await runProductionLocalDraftParse({ handoffSource: "draft_reparse_missing" });
            return;
          }
          if (draft && draftHasPlaceholderParties(draft)) {
            setReviewPartyHighlightNonce((n) => n + 1);
            console.debug("[review-placeholder-guard]", {
              hasPlaceholderParties: true,
              hasPlaceholderFields: draftHasPlaceholderFieldsForRecipients(draft),
              continueAllowed: false,
            });
            window.requestAnimationFrame(() => {
              document.getElementById("claw-review-parties-row")?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            return;
          }
          if (intakeStepBufferRef.current.trim()) {
            const applied = await runProductionLocalDraftParse({ handoffSource: "draft_reparse_intake_buffer" });
            if (!applied) return;
          }
          if (upgradeLockActiveRef.current) return;
          if (draft) {
            const { n1, n2 } = getRecipientHandoffNamesFromDraft(draft);
            const next1 = pickRecipientNameForHandoff(recipient1Name, n1);
            const next2 = pickRecipientNameForHandoff(recipient2Name, n2);
            setRecipient1Name(next1);
            setRecipient2Name(next2);
            setRecipientSignerLabels((prev) =>
              pickRecipientSignerLabelsForHandoff(prev, next1, next2, {
                role1: draft.parties?.[0]?.role,
                role2: draft.parties?.[1]?.role,
              }),
            );
            try {
              agreementDocumentDirtyRef.current = false;
              setAgreementDocumentText(buildPreviewForCurrentTier(draft));
            } catch {
              /* ignore */
            }
            setReviewDocRefreshTick((tick) => tick + 1);
            setHardError(null);
            persistPremiumRecipientHandoffFromDraftAndUi(draft, { displayName1: next1, displayName2: next2 });
          }
          if (premiumPersistedFlowActive && !peekPremiumRecipientsSurfaceReleased()) {
            window.requestAnimationFrame(() => {
              document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }) ??
                document.getElementById("claw-simple-create-preview")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            });
            return;
          }
          setAgreementTypeAccepted(true);
          setCreateFlowPhase("recipient_setup_required");
          setCreateUiStage(CreateUiStage.RECIPIENTS);
          setMobileWorkspacePane("preview");
          window.requestAnimationFrame(() => {
            scrollVisibleRecipientSetupIntoView("start");
          });
          return;
        }
        if (createUiStage === CreateUiStage.RECIPIENTS) {
          if (import.meta.env.DEV) devSendCtaTrace("guided+RECIPIENTS inner fallback → finalize + onGenerate");
          await finalizeIntakeCapture();
          if (!hasAnyValidRecipientEmail) {
            setHardError("Add at least one valid recipient email, then try again.");
            return;
          }
          if (premiumSignersSurfaceReady) {
            if (draft) persistPremiumRecipientHandoffFromDraftAndUi(draft);
            setPremiumSendConfirmOpen(true);
            return;
          }
          await onGenerate();
          return;
        }
        if (import.meta.env.DEV) devSendCtaTrace("return: guidedStructureComplete block fell through", { createUiStage });
        return;
      }
      if (createProductionTwoPane) {
        if (createUiStage === CreateUiStage.DRAFT && draft) {
          if (premiumPersistedFlowActive && !peekPremiumRecipientsSurfaceReleased()) {
            window.requestAnimationFrame(() => {
              document.getElementById("claw-agreement-preview-editor")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              }) ??
                document.getElementById("claw-simple-create-preview")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
            });
            return;
          }
          try {
            await finalizeIntakeCapture();
            await handOffProductionDraftToRecipients();
          } catch (e) {
            if (import.meta.env.DEV) console.error("[CTA DEAD CLICK] legacy handOff fallback failed", e);
            setHardError("Could not continue — try again in a moment.");
          }
          return;
        }
        if (import.meta.env.DEV) {
          console.error("[CTA DEAD CLICK]", {
            stage: createUiStage,
            phase: createFlowPhase,
            lane: "legacy_runPrimary",
            guidedComplete: guidedStructureComplete,
            draft: Boolean(draft),
            reviewId: Boolean(reviewAgreementId?.trim()),
            displayPhase,
            showMainIntakeForm,
            simpleCreateUnifiedBottomCta,
          });
        }
        setHardError(
          "We couldn’t continue from here. Add a bit more detail above, or refresh the page and try again.",
        );
        return;
      }
      if (simpleProductFlow && liveWorkspaceTwoPane && guidedStructureComplete && !draftNowCommitted) {
        await finalizeIntakeCapture();
        handleDraftNowCommit();
        return;
      }
      await onGenerate();
      } catch (err) {
        if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] runPrimary async error", err);
        setHardError("Something went wrong. Your draft is still here — try again in a moment.");
      }
    })();
  };

  const handleReadyBarReview = () => {
    logProductEvent("create_flow_cta_clicked", { cta_click_type: "review" });
    setMobileWorkspacePane("preview");
    window.requestAnimationFrame(() => {
      document.getElementById("claw-simple-create-preview")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  const handleReadyBarAddMore = () => {
    logProductEvent("create_flow_cta_clicked", { cta_click_type: "add_more" });
    if (draftNowCommitted && createProductionTwoPane) {
      setIsEditingDescription(true);
      setMobileWorkspacePane("preview");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    if (draftNowCommitted) {
      handleUnlockDraftInput();
      return;
    }
    setMobileWorkspacePane("edit");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  function renderProductionStagedLeft(): React.ReactNode {
    if (!createProductionTwoPane) return null;
    if (stageAInputFirst && shouldShowProductionInputShell) return null;

    const productionMissingDetailsEditor = (
      <>
        <div className="mb-2 sm:mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-[11px]">Your agreement</p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-100 sm:text-lg">Details needed</h2>
          <p className="mt-1 text-xs leading-snug text-slate-500 sm:text-sm sm:leading-relaxed">
            Add what&apos;s missing below, then confirm to refresh your draft.
          </p>
        </div>
        <p className="mb-1.5 text-[11px] font-medium text-amber-200/90 sm:text-xs" role="status">
          A few details are still required — update below, then confirm.
        </p>
        <div className="relative pb-6">
          <VoiceAugmentedTextArea
            ref={textareaRef}
            value={intakeStepBuffer}
            onValueChange={handleIntakeStepBufferChange}
            onKeyDown={handleIntakeKeyDown}
            onBlur={handleIntakeBlur}
            onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
            dictationControlRef={dictationControlRef}
            onDictationPhaseChange={handleDictationPhaseChange}
            disabled={isGenerating || draftPreCommitFreeze}
            readOnly={draftPreCommitFreeze}
            voiceUiEnabled={!draftPreCommitFreeze}
            micIdleAttract={micIdleAttract}
            dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
            className={`min-h-[10rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-4 py-4 pb-12 pr-12 text-base leading-7 text-gray-100 caret-emerald-300 outline-none ring-offset-2 ring-offset-[#0a0e18] transition-[box-shadow,border-color,ring] duration-150 placeholder:text-gray-500 focus:border-emerald-400/95 focus:ring-2 focus:ring-emerald-400/55 disabled:opacity-60 sm:min-h-[12rem] sm:px-5 sm:py-5 sm:text-lg md:text-[1.0625rem] ${draftPreCommitFreeze ? "cursor-default opacity-95" : ""}`}
            placeholder={guidedQuestionPlaceholder}
          />
        </div>
      </>
    );

    if (createUiStage === CreateUiStage.INPUT) {
      if (!showLegacyIntakeShell) {
        if (missing.length > 0 && displayPhase === "followup_required") return productionMissingDetailsEditor;
        return null;
      }
      return (
        <>
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-xs">Your agreement</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">Describe your agreement</h2>
            <p className="mt-1 text-sm text-slate-500">Answer the prompt below in your own words.</p>
          </div>
          {showGuidedFlowProgressBar ? (
            <div
              className="mb-4"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(guidedProgressRatio * 100)}
              aria-label="Agreement intake progress"
            >
              <div className="h-[3px] w-full max-w-[6rem] overflow-hidden rounded-full bg-slate-800/90">
                <div
                  className="h-full rounded-full bg-emerald-500/45 motion-safe:transition-[width] motion-safe:duration-300"
                  style={{ width: `${Math.round(guidedProgressRatio * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          {voiceEntryHintVisible ? (
            <p className="mb-3 text-xs leading-relaxed text-emerald-200/90 sm:text-sm" role="status" aria-live="polite">
              Speak in short phrases. Tap the mic when you&apos;re done — we transcribe into the box.
            </p>
          ) : null}
          {!guidedStructureComplete && nextIntakeQuestion ? (
            <div className="mb-4 rounded-lg border border-emerald-500/15 bg-emerald-950/10 px-3 py-3 sm:px-4" role="region" aria-label="Current question">
              <p className="text-base font-semibold leading-snug text-slate-50 sm:text-[1.0625rem]">{nextIntakeQuestion.question}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">{nextIntakeQuestion.example}</p>
              {nextIntakeQuestion.quickReplies && nextIntakeQuestion.quickReplies.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick replies">
                  {nextIntakeQuestion.quickReplies.map((qr) => (
                    <button
                      key={qr}
                      type="button"
                      className="rounded-full border border-slate-600/70 bg-slate-900/50 px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-slate-200 sm:text-xs"
                      onClick={() => {
                        const v = qr.trim();
                        if (!v) return;
                        markIntakeEdit();
                        setIntakeStepBuffer((prev) => {
                          const b = prev.trim();
                          if (!b) return v;
                          return `${b}\n${v}`;
                        });
                        textareaRef.current?.focus();
                      }}
                    >
                      {qr.startsWith("Mutual") ? "Mutual" : qr.startsWith("One-way") ? "One-way" : qr.length > 40 ? `${qr.slice(0, 38)}…` : qr}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {nextIntakeQuestion && !intakeGuidedComplete ? (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">Your answer</p>
          ) : null}
          {nextIntakeQuestion && micNudgeVariant === "pulse" ? (
            <p className="mb-2 text-xs text-emerald-400/55 sm:text-[0.8125rem]">Try voice to answer faster</p>
          ) : null}
          <div className="relative pb-8">
            <VoiceAugmentedTextArea
              ref={textareaRef}
              value={intakeStepBuffer}
              onValueChange={handleIntakeStepBufferChange}
              onKeyDown={handleIntakeKeyDown}
              onBlur={handleIntakeBlur}
              onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
              dictationControlRef={dictationControlRef}
              onDictationPhaseChange={handleDictationPhaseChange}
              disabled={isGenerating || draftPreCommitFreeze}
              readOnly={draftPreCommitFreeze}
              voiceUiEnabled={!draftPreCommitFreeze}
              micIdleAttract={micIdleAttract}
              dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
              className={`min-h-[18rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-5 py-5 pb-14 pr-14 text-lg leading-7 text-gray-100 caret-emerald-300 outline-none ring-offset-2 ring-offset-[#0a0e18] transition-[box-shadow,border-color,ring] duration-150 placeholder:text-gray-500 focus:border-emerald-400/95 focus:ring-2 focus:ring-emerald-400/55 disabled:opacity-60 sm:min-h-[20.5rem] sm:text-lg md:text-[1.125rem] md:leading-[1.85] lg:text-xl lg:leading-[2rem] ${draftPreCommitFreeze ? "cursor-default opacity-95" : ""}`}
              placeholder={guidedQuestionPlaceholder}
            />
          </div>
          {createProductionTwoPane &&
          createFlowPhase === "capturing_input" &&
          livePreviewModel.extraction?.termInferred &&
          ((livePreviewModel.termLine || "") + (livePreviewModel.scheduleLine || "")).trim().length > 0 ? (
            <p className="mt-2 text-[11px] leading-snug text-slate-500 sm:text-xs" aria-live="polite">
              Detected timing details — you can refine them in review.
            </p>
          ) : null}
          {!hideIntakeMicrocopy ? (
            <p
              className={`mt-3 text-xs sm:text-sm ${isGenerating ? "text-slate-500" : confidenceHint ? "font-medium text-emerald-400/85" : "text-slate-600"}`}
              aria-live="polite"
            >
              {isGenerating
                ? null
                : confidenceHint
                  ? confidenceHint
                  : intakeDictationPhase === "processing"
                    ? "Finishing transcription…"
                    : intakeDictationPhase === "recording"
                      ? "Recording — speak at your own pace"
                      : "Describe your agreement in plain English. We'll structure it instantly."}
            </p>
          ) : null}
          {intakeCombined.trim() && !isGenerating && !hideIntakeMicrocopy && !guidedStructureComplete ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-emerald-400/90" aria-live="polite">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/90" />
              {structuringHint}
            </p>
          ) : null}
        </>
      );
    }
    if (createUiStage === CreateUiStage.DRAFT) {
      if (
        !draft &&
        !reviewWorkspaceBootstrapping &&
        !reviewAgreementId?.trim() &&
        createFlowPhase !== "generating_draft"
      ) {
        return null;
      }
      if (!createProductionTwoPane && missing.length > 0) {
        return productionMissingDetailsEditor;
      }
      return null;
    }
    if (createUiStage === CreateUiStage.RECIPIENTS) {
      const isPremiumRecipientSurface = premiumSignersSurfaceReady;
      const showProTierAdvanced = tierAllowsAdvancedFullDraftReveal(tier);
      return (
        <CreateFlowSendRecipientsPanel
          variant="staged"
          isPremiumRecipientSurface={isPremiumRecipientSurface}
          showProTierAdvanced={showProTierAdvanced}
          productionReadyForPersist={productionReadyForPersist}
          draft={draft}
          effectivePremiumSendMode={effectivePremiumSendMode}
          onPremiumSendModePick={handlePremiumSendModePick}
          recipient1Name={recipient1Name}
          setRecipient1Name={setRecipient1Name}
          recipient1Email={recipient1Email}
          setRecipient1Email={setRecipient1Email}
          recipient2Name={recipient2Name}
          setRecipient2Name={setRecipient2Name}
          recipient2Email={recipient2Email}
          setRecipient2Email={setRecipient2Email}
          recipientSignerLabels={recipientSignerLabels}
          setRecipientSignerLabels={setRecipientSignerLabels}
          reviewHandoffAgreementEcho={reviewHandoffAgreementEcho}
          showStarterRecipientsReassurance={showStarterRecipientsReassurance}
          editorOpen={createFlowSendRecipientEditorOpen}
          setEditorOpen={setCreateFlowSendRecipientEditorOpen}
          onDeferRecipients={() => setRecipientsDeferred(true)}
          hideDeferOption={isPremiumRecipientSurface}
          onSendClick={runPrimaryIntakeAction}
          sendDisabled={effectivePrimaryCtaDisabled}
          sendRequiresConfirmStep={premiumSendConfirmGateActive}
          stripRecipientEmailNoise={stripRecipientEmailNoise}
          looksLikeEmail={looksLikeEmail}
        />
      );
    }
    return null;
  }

  return (
    <section className={className ?? DEFAULT_SECTION}>
      {!workspaceUi ? (
        <div className="text-xs text-slate-400 sm:text-sm sm:leading-relaxed md:text-[0.9375rem] lg:text-[1rem] lg:leading-relaxed lg:text-slate-300/90">
          <span>
            Draft ready for review. {STRUCTURED_DRAFT_ASSIST_SHORT}
          </span>
          <details className="mt-1.5 rounded-md border border-slate-800/50 bg-slate-950/30 px-2 py-1.5 sm:mt-2 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:hidden hover:text-slate-400 sm:text-xs">
              Learn more
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 sm:text-xs">{PRODUCT_NOT_LAW_FIRM}</p>
          </details>
        </div>
      ) : null}

      {resumeNotice ? (
        <p className="mt-2 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-sm leading-relaxed text-slate-300 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-[1.55]">
          {resumeNotice}
        </p>
      ) : null}

      {continuitySourcePanel ? (
        <div className="mt-2 rounded-lg border border-slate-700/80 bg-slate-900/45 px-3 py-3 sm:px-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:text-xs lg:text-[0.8125rem] lg:tracking-[0.08em] lg:text-slate-400">
            {continuitySourcePanel.label}
          </p>
          <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-relaxed text-slate-200 whitespace-pre-wrap sm:max-h-36 lg:text-[0.9375rem] lg:leading-[1.55]">
            {continuitySourcePanel.text}
          </p>
        </div>
      ) : null}

      {createRetryAgreementId?.trim() && onRetryHydrateCreate ? (
        <div
          className={
            workspaceUi
              ? "mt-3 rounded-lg border border-sky-800/50 bg-sky-950/25 px-4 py-3 text-sm text-sky-100 sm:text-[0.9375rem] lg:text-base lg:leading-relaxed"
              : "mt-3 rounded border border-sky-700/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-100"
          }
        >
          <p
            className={
              workspaceUi ? "font-medium text-sky-50/95 lg:text-[1.0625rem]" : "font-medium text-sky-50/95"
            }
          >
            Finish opening your agreement
          </p>
          <p className="mt-1 text-xs leading-snug text-sky-100/80 sm:text-[0.8125rem] sm:leading-relaxed md:text-sm lg:text-[0.9375rem] lg:leading-relaxed lg:text-sky-100/90">
            We saved your wording. Load the agreement you just created, or edit and tap{" "}
            {simpleProductFlow ? simpleProductFlowSubmitLabel : "Create Draft"} again.
          </p>
          <button
            type="button"
            className={
              workspaceUi
                ? "btn mt-3 rounded-md bg-sky-600 px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-sky-500 sm:text-sm lg:px-5 lg:text-[0.9375rem]"
                : "btn mt-2 text-xs"
            }
            onClick={() => void onRetryHydrateCreate(createRetryAgreementId.trim())}
          >
            Retry loading agreement
          </button>
        </div>
      ) : null}

      {firstLawdogSession && simpleProductFlow && !streamlineFirstRunReviewUi ? (
        <p className="mt-2 text-xs text-slate-500 sm:text-[0.8125rem] lg:text-sm">
          Used by creators across CSN Spaces
        </p>
      ) : null}

      {showMainIntakeForm ? (
        liveWorkspaceTwoPane ? (
          <>
            {simpleProductFlow && createProductionTwoPane && premiumPostCheckoutPhase ? (
              <div
                className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0a0e18]/92 px-4 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby={
                  premiumPostCheckoutPhase === "awaiting_gaps"
                    ? "claw-premium-finish-facts-title"
                    : "claw-premium-processing-title"
                }
              >
                <div className="w-full max-w-2xl rounded-2xl border border-emerald-500/25 bg-slate-950/95 p-8 shadow-2xl shadow-black/60 sm:p-10">
                  {premiumPostCheckoutPhase === "awaiting_gaps" ? (
                    <PremiumFinishAgreementGapsPanel
                      questions={premiumGapQuestions}
                      oneField={premiumGapOneField}
                      onOneField={setPremiumGapOneField}
                      onContinue={() => {
                        const r = runPremiumModelPassRef.current;
                        if (!r) return;
                        const t = premiumGapOneField.trim();
                        premiumLastGapAnswersRef.current = t;
                        if (import.meta.env.DEV) {
                          console.info("[gap-trace] stage=gap_modal_submit_payload", {
                            button_used: "build_my_agreement",
                            raw_textarea_value: premiumGapOneField,
                            trimmed_textarea_value: t,
                            textarea_len: t.length,
                            needles_hit: gapTraceNeedlesHit(t),
                          });
                        }
                        const base = premiumGapBaseIntakeRef.current;
                        const intake = t
                          ? `${base}\n\n— Finish your agreement (user details):\n${t}`
                          : base;
                        void r({
                          intakeText: intake,
                          userGapAnswers: t || null,
                          gapResolverSkippedWithDefaults: false,
                        });
                      }}
                      onUseDefaults={() => {
                        const r = runPremiumModelPassRef.current;
                        if (!r) return;
                        premiumLastGapAnswersRef.current = "";
                        if (import.meta.env.DEV) {
                          console.info("[gap-trace] stage=gap_modal_submit_payload", {
                            button_used: "use_defaults",
                            raw_textarea_value: premiumGapOneField,
                            trimmed_textarea_value: "",
                            textarea_len: 0,
                            needles_hit: [],
                          });
                        }
                        void r({
                          intakeText: premiumGapBaseIntakeRef.current,
                          userGapAnswers: null,
                          gapResolverSkippedWithDefaults: true,
                        });
                      }}
                      onDismiss={() => {
                        stripPremiumCompletionQueryParam();
                        setHardError(
                          "The post-checkout form was closed before your full agreement was generated. Your draft on screen is unchanged — use “Use defaults” or “Build my agreement” if this step appears again.",
                        );
                        setPremiumPostCheckoutPhase(null);
                        setPremiumGapQuestions([]);
                        setPremiumGapOneField("");
                        runPremiumModelPassRef.current = null;
                      }}
                      continueDisabled={false}
                    />
                  ) : (
                    <>
                      <h2
                        id="claw-premium-processing-title"
                        className="text-center text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
                      >
                        {CLAW_PREMIUM_PREPARING_AGREEMENT_COPY}
                      </h2>
                      <p className="mt-3 text-center text-sm leading-relaxed text-slate-400 sm:text-base">
                        We&apos;re strengthening terms and formatting — your upgraded agreement will appear in the
                        preview as soon as this step finishes.
                      </p>
                      {premiumPipelineUserMessage &&
                      premiumPipelineUserMessage !== CLAW_PREMIUM_PREPARING_AGREEMENT_COPY ? (
                        <p className="mt-3 text-center text-sm font-medium text-amber-200/95" role="status">
                          {premiumPipelineUserMessage}
                        </p>
                      ) : null}
                      <div className="mt-8 flex justify-center" aria-hidden>
                        <div className="h-12 w-12 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 motion-safe:animate-spin" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
            {showWorkspacePreview &&
            !complexityGateActive &&
            (!(createProductionTwoPane && !stageAInputFirst) || createUiStage === CreateUiStage.INPUT) ? (
              <div
                className="mb-3 flex rounded-lg border border-slate-800/90 bg-slate-950/40 p-1 lg:hidden"
                role="tablist"
                aria-label="Draft workspace view"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileWorkspacePane === "edit"}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                    mobileWorkspacePane === "edit"
                      ? "bg-slate-800/90 text-emerald-200 shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => setMobileWorkspacePane("edit")}
                >
                  Details
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileWorkspacePane === "preview"}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                    mobileWorkspacePane === "preview"
                      ? "bg-slate-800/90 text-emerald-200 shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                  onClick={() => setMobileWorkspacePane("preview")}
                >
                  Document
                </button>
              </div>
            ) : null}

            <div
              className={
                (showWorkspacePreview
                  ? `mx-auto w-full ${simpleCreateWorkspaceOuterMaxClass} ${
                      createProductionTwoPane && createUiStage !== CreateUiStage.INPUT
                        ? `flex flex-col-reverse gap-6 lg:grid lg:gap-8 lg:items-start ${
                            createUiStage === CreateUiStage.DRAFT && draft
                              ? productionDraftPrimaryReviewSurface
                                ? "lg:grid-cols-1"
                                : freshSimpleCreateUx
                                  ? "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
                                  : "lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]"
                              : "lg:grid-cols-2"
                          }`
                        : freshSimpleCreateUx && createUiStage === CreateUiStage.INPUT
                          ? complexityGateActive
                            ? "lg:grid lg:grid-cols-1 lg:gap-6 lg:items-stretch"
                            : "lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-10 lg:items-start"
                          : complexityGateActive
                            ? "lg:grid lg:grid-cols-1 lg:gap-6 lg:items-stretch"
                            : "lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start"
                    }`
                  : `mx-auto w-full ${simpleCreateWorkspaceOuterMaxClass} motion-safe:transition-[max-width] motion-safe:duration-200`) +
                (simpleCreateStickyBottomBarVisible
                  ? simpleCreateReadyForSend
                    ? " pb-[calc(11rem+24px+11rem)] sm:pb-[calc(12rem+24px+11rem)]"
                    : showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                      ? " pb-[calc(14rem+48px)] sm:pb-[calc(15rem+48px)]"
                      : " pb-[calc(11rem+24px)] sm:pb-[calc(12rem+24px)]"
                  : "")
              }
              >
              {!productionDraftPrimaryReviewSurface ? (
              <div
                className={
                  complexityGateActive
                    ? "hidden"
                    : showWorkspacePreview
                      ? createProductionTwoPane && createUiStage !== CreateUiStage.INPUT
                        ? "block min-w-0"
                        : mobileWorkspacePane === "edit"
                          ? "block min-w-0"
                          : "hidden min-w-0 lg:block"
                      : "block min-w-0"
                }
              >
                <div
                  className={
                    createProductionTwoPane && createUiStage !== CreateUiStage.INPUT
                      ? "rounded-xl bg-slate-950/40 p-4 ring-1 ring-slate-800/30 sm:p-5"
                      : "rounded-xl border border-slate-800/55 bg-slate-950/75 p-4 shadow-md shadow-black/15 sm:p-5"
                  }
                >
                  {productionUseStagedLeftColumn ? (
                    <div
                      ref={createStageScrollRef}
                      className={
                        createUiStage === CreateUiStage.DRAFT && draft
                          ? freshSimpleCreateUx
                            ? "min-w-0 lg:max-w-none lg:justify-self-start"
                            : "min-w-0 lg:max-w-sm lg:justify-self-start"
                          : "min-w-0"
                      }
                    >
                      {renderProductionStagedLeft()}
                    </div>
                  ) : !createProductionTwoPane || showLegacyIntakeShell ? (
                    <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {stageAInputFirst ? (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-[11px] md:text-xs lg:text-sm lg:text-slate-500">
                            Continue here
                          </p>
                          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-200 sm:text-xl md:text-[1.25rem]">
                            Say or type your agreement
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-[0.9375rem]">
                            Plain English is perfect. We&apos;ll structure it for you.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 sm:text-[11px] md:text-xs lg:text-sm lg:text-slate-500">
                            Your words
                          </p>
                          <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-300 md:text-[1.0625rem] lg:text-[1.125rem]">
                            {continuitySourcePanel ? "Adjust or add detail" : "Your agreement description"}
                          </h2>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600 sm:text-[0.9375rem] md:text-[0.9375rem] lg:text-[1rem] lg:leading-[1.55] lg:text-slate-500">
                            {continuitySourcePanel
                              ? "Your starting text is captured above — the preview updates as you edit."
                              : useGuidedSplitIntake && intakeBaselineCommitted.trim()
                                ? freshSimpleCreateUx && !showWorkspacePreview
                                  ? "Answer below — we’ll reveal a light draft preview after your first answer."
                                  : "Answer each question in the box below. The preview on the right updates as you go."
                                : "Everything you type or dictate stays on this side. The structured draft forms in the preview on the right."}
                          </p>
                        </>
                      )}
                    </div>
                    {showGuidedFlowProgressBar ? (
                      <div
                        className="mt-1 shrink-0 pt-0.5"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(guidedProgressRatio * 100)}
                        aria-label="Agreement intake progress"
                      >
                        <div className="h-[3px] w-[4.25rem] overflow-hidden rounded-full bg-slate-800/90 sm:w-[5.25rem]">
                          <div
                            className="h-full rounded-full bg-emerald-500/45 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
                            style={{ width: `${Math.round(guidedProgressRatio * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {voiceEntryHintVisible ? (
                    <p
                      className="mb-3 text-xs leading-relaxed text-emerald-200/90 sm:text-sm"
                      role="status"
                      aria-live="polite"
                    >
                      Speak in short phrases. Tap the mic again when you&apos;re done — we transcribe into the box.
                    </p>
                  ) : null}
                  {simpleProductFlow &&
                  liveWorkspaceTwoPane &&
                  !hardError &&
                  !loading &&
                  !isGenerating &&
                  !stageAInputFirst &&
                  ((useGuidedSplitIntake &&
                    (baselineActionAck ||
                      intakeBaselineCommitted.trim() ||
                      intakeAckLine ||
                      nextIntakeQuestion ||
                      guidedStructureComplete)) ||
                    (!useGuidedSplitIntake && (intakeAckLine || nextIntakeQuestion || guidedStructureComplete))) ? (
                    <div
                      className="mb-4 rounded-lg border border-emerald-500/12 bg-emerald-950/8 px-3 py-3 sm:px-4"
                      role="region"
                      aria-label="Next step"
                    >
                      {useGuidedSplitIntake && intakeBaselineCommitted.trim() ? (
                        <div className={baselineActionAck ? "mt-0" : ""}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                            Started from:
                          </p>
                          <blockquote className="mt-1.5 border-l-2 border-emerald-600/35 pl-3 text-xs italic leading-relaxed text-slate-300 sm:text-[0.8125rem] lg:text-sm">
                            {intakeBaselineCommitted.length > 220
                              ? `${intakeBaselineCommitted.slice(0, 217)}…`
                              : intakeBaselineCommitted}
                          </blockquote>
                        </div>
                      ) : null}
                      {baselineActionAck ? (
                        <p
                          className={`text-sm font-medium text-emerald-200/95 sm:text-[0.9375rem] ${useGuidedSplitIntake && intakeBaselineCommitted.trim() ? "mt-3" : ""}`}
                          aria-live="polite"
                        >
                          {baselineActionAck}
                        </p>
                      ) : null}
                      {intakeAckLine ? (
                        <p
                          className={`text-sm font-medium text-emerald-300/95 sm:text-[0.9375rem] ${baselineActionAck || intakeBaselineCommitted.trim() || guidedSplitProgressActive ? "mt-3" : ""}`}
                          aria-live="polite"
                        >
                          {intakeAckLine}
                        </p>
                      ) : null}
                      {guidedStructureComplete && !draftNowCommitted ? (
                        <div
                          className={
                            intakeAckLine ||
                            baselineActionAck ||
                            intakeBaselineCommitted.trim() ||
                            guidedSplitProgressActive
                              ? "mt-3"
                              : ""
                          }
                        >
                          <p className="text-sm font-medium leading-snug text-slate-300 sm:text-[0.9375rem]">
                            {createProductionTwoPane ? (
                              <>
                                We&apos;ve captured the basics.{" "}
                                <span className="text-slate-100">Next: generate your draft</span> when you&apos;re
                                ready.
                              </>
                            ) : (
                              <>
                                Everything&apos;s captured — tap <span className="text-slate-100">Continue</span> when you
                                want to lock and review.
                              </>
                            )}
                          </p>
                        </div>
                      ) : null}
                      {guidedStructureComplete && draftNowCommitted && !createProductionTwoPane ? (
                        <div
                          className={
                            intakeAckLine ||
                            baselineActionAck ||
                            intakeBaselineCommitted.trim() ||
                            guidedSplitProgressActive
                              ? "mt-3"
                              : ""
                          }
                        >
                          <ul
                            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 sm:text-xs"
                            aria-label="Agreement essentials"
                          >
                            <li className="flex items-center gap-1.5">
                              <span className="text-emerald-400/90" aria-hidden>
                                ✓
                              </span>{" "}
                              Parties
                            </li>
                            <li className="flex items-center gap-1.5">
                              <span className="text-emerald-400/90" aria-hidden>
                                ✓
                              </span>{" "}
                              Scope
                            </li>
                            <li className="flex items-center gap-1.5">
                              <span className="text-emerald-400/90" aria-hidden>
                                ✓
                              </span>{" "}
                              Payment
                            </li>
                          </ul>
                          {!readyFieldChecklist.term ? (
                            <button
                              type="button"
                              className="mt-2 text-left text-[11px] font-medium text-emerald-400/85 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-300 sm:text-xs"
                              onClick={() => {
                                logProductEvent("create_flow_cta_clicked", { cta_click_type: "add_more" });
                                setMobileWorkspacePane("edit");
                                window.requestAnimationFrame(() => textareaRef.current?.focus());
                              }}
                            >
                              Add term (optional)
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {!guidedStructureComplete && nextIntakeQuestion ? (
                        <div
                          className={
                            intakeAckLine ||
                            baselineActionAck ||
                            intakeBaselineCommitted.trim() ||
                            guidedSplitProgressActive
                              ? "mt-3"
                              : ""
                          }
                        >
                          <p className="text-base font-semibold leading-snug text-slate-50 sm:text-[1.0625rem]">
                            {nextIntakeQuestion.question}
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-[0.8125rem] lg:text-sm">
                            {nextIntakeQuestion.example}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">You can refine this later.</p>
                          {nextIntakeQuestion.quickReplies && nextIntakeQuestion.quickReplies.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick replies">
                              {nextIntakeQuestion.quickReplies.map((qr) => (
                                <button
                                  key={qr}
                                  type="button"
                                  className="rounded-full border border-slate-600/70 bg-slate-900/50 px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 transition-colors hover:border-emerald-500/40 hover:text-slate-200 sm:text-xs"
                                  onClick={() => {
                                    const v = qr.trim();
                                    if (!v) return;
                                    markIntakeEdit();
                                    setIntakeStepBuffer((prev) => {
                                      const b = prev.trim();
                                      if (!b) return v;
                                      return `${b}\n${v}`;
                                    });
                                    textareaRef.current?.focus();
                                  }}
                                >
                                  {qr.startsWith("Mutual") ? "Mutual" : qr.startsWith("One-way") ? "One-way" : qr.length > 40 ? `${qr.slice(0, 38)}…` : qr}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {useGuidedSplitIntake && intakeBaselineCommitted.trim() && nextIntakeQuestion && !intakeGuidedComplete ? (
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:text-xs">
                      Your answer
                    </p>
                  ) : null}
                  {nextIntakeQuestion && micNudgeVariant === "pulse" ? (
                    <p className="mb-2 text-xs text-emerald-400/55 sm:text-[0.8125rem]">Try voice to answer faster</p>
                  ) : null}
                  <div className="relative pb-8">
                    {simpleCreateDraftInputLocked || draftPreCommitFreeze ? (
                      <div
                        className="absolute inset-0 z-[2] flex flex-col justify-between rounded-lg border border-slate-600/25 bg-slate-950/35 p-3 shadow-inner shadow-black/20 ring-1 ring-inset ring-slate-500/20 backdrop-blur-[0.5px]"
                        aria-live="polite"
                      >
                        <div className="max-w-[90%] text-xs leading-snug text-slate-400/95 sm:text-sm">
                          {draftPreCommitFreeze && !simpleCreateDraftInputLocked ? (
                            <p>One moment…</p>
                          ) : createProductionTwoPane && isGenerating ? (
                            <>
                              <p className="font-medium text-slate-200/95">Creating your agreement…</p>
                              <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-400 sm:text-xs">
                                <li>✓ Structured draft being prepared</li>
                                <li>✓ Nothing is being sent</li>
                                <li>✓ You can edit everything next</li>
                              </ul>
                            </>
                          ) : createProductionTwoPane && createFlowPhase !== "capturing_input" ? (
                            <p>Next: review and confirm details in the draft on the right.</p>
                          ) : (
                            <p>Draft locked — you can still edit</p>
                          )}
                        </div>
                        <div className="flex justify-end">
                          {simpleCreateDraftInputLocked ? (
                            <button
                              type="button"
                              className="rounded-md border border-slate-500/45 bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-emerald-100/95 shadow-sm hover:border-emerald-400/45 hover:bg-slate-800/95 sm:text-sm"
                              onClick={() => {
                                if (createProductionTwoPane) {
                                  setIsEditingDescription(true);
                                  setMobileWorkspacePane("preview");
                                  window.requestAnimationFrame(() => textareaRef.current?.focus());
                                  return;
                                }
                                handleUnlockDraftInput();
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <VoiceAugmentedTextArea
                      ref={textareaRef}
                      value={intakeStepBuffer}
                      onValueChange={handleIntakeStepBufferChange}
                      onKeyDown={simpleProductFlow && liveWorkspaceTwoPane ? handleIntakeKeyDown : undefined}
                      onBlur={simpleProductFlow && liveWorkspaceTwoPane ? handleIntakeBlur : undefined}
                      onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
                      dictationControlRef={dictationControlRef}
                      onDictationPhaseChange={handleDictationPhaseChange}
                      disabled={isGenerating || draftPreCommitFreeze}
                      readOnly={simpleCreateDraftInputLocked || draftPreCommitFreeze}
                      voiceUiEnabled={!simpleCreateDraftInputLocked && !draftPreCommitFreeze}
                      micIdleAttract={micIdleAttract}
                      dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
                      className={`min-h-[18rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-5 py-5 pb-14 pr-14 text-lg leading-7 text-gray-100 caret-emerald-300 outline-none ring-offset-2 ring-offset-[#0a0e18] transition-[box-shadow,border-color,ring] duration-150 placeholder:text-gray-500 focus:border-emerald-400/95 focus:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_28px_-6px_rgba(52,211,153,0.55)] focus:ring-2 focus:ring-emerald-400/55 disabled:opacity-60 sm:min-h-[20.5rem] sm:text-lg sm:leading-7 md:text-[1.125rem] md:leading-[1.85] lg:text-xl lg:leading-[2rem] lg:placeholder:text-gray-500 ${stageAInputFirst ? "min-h-[21.5rem] sm:min-h-[24rem]" : ""} ${simpleCreateDraftInputLocked || draftPreCommitFreeze ? "cursor-default opacity-95" : ""}`}
                      placeholder={guidedQuestionPlaceholder}
                    />
                  </div>
                  {simpleProductFlow &&
                  liveWorkspaceTwoPane &&
                  !createProductionTwoPane &&
                  !isGenerating &&
                  displayLivePreviewModel.extraction?.scopeInferred &&
                  (displayLivePreviewModel.scopeLine || "").trim().length > 8 &&
                  !scopeGuessConfirmed ? (
                    <div
                      className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-3 text-left shadow-sm shadow-black/20 sm:px-4"
                      role="region"
                      aria-label="Confirm detected scope"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90 sm:text-[0.8125rem]">
                        Quick check
                      </p>
                      <p className="mt-1.5 text-sm text-slate-100/95 sm:text-[0.9375rem]">We think your scope is:</p>
                      <p className="mt-1 border-l-2 border-amber-400/50 pl-3 text-sm font-medium leading-relaxed text-emerald-50/95 sm:text-base">
                        → &ldquo;{(displayLivePreviewModel.scopeLine || "").trim()}&rdquo;
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow hover:bg-emerald-400 sm:text-sm"
                          onClick={() => setScopeGuessConfirmed(true)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-500/60 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-emerald-400/50 sm:text-sm"
                          onClick={() => {
                            setScopeGuessConfirmed(true);
                            window.requestAnimationFrame(() => textareaRef.current?.focus());
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {createProductionTwoPane &&
                  createFlowPhase === "capturing_input" &&
                  livePreviewModel.extraction?.termInferred &&
                  ((livePreviewModel.termLine || "") + (livePreviewModel.scheduleLine || "")).trim().length > 0 ? (
                    <p className="mt-2 text-[11px] leading-snug text-slate-500 sm:text-xs" aria-live="polite">
                      Detected timing details — you can refine them in review.
                    </p>
                  ) : null}
                  {showWhatWeUnderstood ? (
                    <WhatWeUnderstoodBlock
                      bullets={whatWeUnderstoodDisplayBullets}
                      onCommitInline={(field, next) => handleInlinePreviewCommit(field, next)}
                      disabled={whatWeUnderstoodInlineDisabled}
                      title={createProductionTwoPane ? "We captured:" : undefined}
                      editDetailsLabel={createProductionTwoPane ? "Edit details" : undefined}
                      onFocusMainInput={() => {
                        setMobileWorkspacePane("edit");
                        window.requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                    />
                  ) : null}
                  {showUnifiedClauseSuggestions ? (
                    <IntakeClauseSuggestionRow
                      items={unifiedClauseSuggestionItems}
                      disabled={clauseSuggestionRowDisabled}
                      onApply={handleClauseSuggestionRowApply}
                      addedToastChip={intakeClauseAddedToast}
                    />
                  ) : null}
                    </>
                  ) : null}
                </div>
                {!(createProductionTwoPane && !stageAInputFirst) && !hideIntakeMicrocopy ? (
                  <p
                    className={`mt-2 text-xs sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem] ${isGenerating && liveWorkspaceTwoPane ? "text-slate-500 lg:text-slate-400" : confidenceHint ? "font-medium text-emerald-400/85" : "text-slate-600 lg:text-slate-500"}`}
                    aria-live="polite"
                  >
                    {isGenerating && liveWorkspaceTwoPane
                      ? null
                      : confidenceHint
                        ? confidenceHint
                        : intakeDictationPhase === "processing"
                          ? "Finishing transcription…"
                          : intakeDictationPhase === "recording"
                            ? "Recording — speak at your own pace"
                            : "Describe your agreement in plain English. We'll structure it instantly."}
                  </p>
                ) : null}
                {intakeRefinementWarning && !hideIntakeMicrocopy && !isGenerating ? (
                  <p
                    className="mt-1.5 text-xs font-medium leading-snug text-amber-200/90 sm:text-[0.8125rem] md:text-sm"
                    role="status"
                    aria-live="polite"
                  >
                    {intakeRefinementWarning}
                  </p>
                ) : null}
                {intakeCombined.trim() && !isGenerating && !hideIntakeMicrocopy && !guidedStructureComplete ? (
                  <p
                    className="mt-2 flex items-center gap-2 text-xs text-emerald-400/90 sm:text-[0.8125rem] md:text-sm lg:text-[0.9375rem]"
                    aria-live="polite"
                  >
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/90" />
                    {structuringHint}
                  </p>
                ) : null}
                {simpleProductFlow && liveWorkspaceTwoPane && (isUserTyping || showParseUpdatedLabel) ? (
                  <p className="mt-1 text-[10px] text-slate-500/70 opacity-55" aria-live="polite">
                    {isUserTyping ? "Typing…" : "Updated"}
                  </p>
                ) : null}
              </div>
              ) : null}

              {showWorkspacePreview ? (
                <div
                  id="claw-simple-create-preview"
                  className={
                    (complexityGateActive
                      ? `mt-4 block w-full min-w-0 lg:mt-0 motion-safe:opacity-100 motion-safe:transition-opacity motion-safe:duration-150${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`
                      : createProductionTwoPane && createUiStage !== CreateUiStage.INPUT
                        ? `mt-4 block min-w-0 lg:mt-0 motion-safe:opacity-100 motion-safe:transition-opacity motion-safe:duration-150${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`
                        : mobileWorkspacePane === "preview"
                          ? `mt-4 block min-w-0 lg:mt-0 motion-safe:opacity-100 motion-safe:transition-opacity motion-safe:duration-150${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`
                          : `mt-4 hidden min-w-0 lg:mt-0 lg:block motion-safe:opacity-100 motion-safe:transition-opacity motion-safe:duration-150${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`) +
                    (simpleProductFlow && liveWorkspaceTwoPane ? " opacity-90" : "")
                  }
                >
                  {createProductionTwoPane &&
                  createFlowPhase === "complexity_choice_required" &&
                  complexityPendingParsed ? (
                    <div
                      className="mb-4 space-y-1 rounded-lg bg-slate-900/35 p-4 sm:p-5"
                      role="region"
                      aria-labelledby="agreement-complexity-gate-title"
                    >
                      <h2
                        id="agreement-complexity-gate-title"
                        className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl"
                      >
                        {summarizeComplexityGateIntent(
                          intakeCombined.trim(),
                          complexityPendingParsed.agreement_family,
                        )}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">
                        This request appears more advanced than standard instant drafts. Unlock the complete version for
                        full protections, or try a simplified starting point you can still review before sending.
                      </p>
                      <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          className="min-h-[2.75rem] w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 sm:min-w-[12rem] sm:flex-1"
                          onClick={() => void resolveComplexityChoice("pro")}
                        >
                          Unlock full version
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <button
                            type="button"
                            className="min-h-[2.75rem] rounded-lg border border-slate-600/70 bg-slate-900/75 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800/80"
                            onClick={() => void resolveComplexityChoice("simplified")}
                          >
                            Try simplified starting point
                          </button>
                          <p className="text-[11px] leading-snug text-slate-500 sm:text-xs">
                            Broad instant template — not a substitute for a full custom operating or governance
                            instrument. You can upgrade after review.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {!productionDraftPrimaryReviewSurface && simpleProductFlow && liveWorkspaceTwoPane ? (
                    <p
                      className="mb-2 text-[11px] font-medium text-slate-600 sm:text-xs lg:text-[0.8125rem] lg:text-slate-500"
                      role="note"
                    >
                      {createProductionTwoPane && createFlowPhase === "complexity_choice_required"
                        ? "Choose a starting point — then review and continue to recipients."
                        : createProductionTwoPane &&
                            createUiStage === CreateUiStage.INPUT &&
                            createFlowPhase === "generating_draft"
                          ? "Creating your agreement…"
                          : createProductionTwoPane &&
                              createUiStage === CreateUiStage.RECIPIENTS &&
                              premiumSignersSurfaceReady
                            ? "Review signers, confirm details, then send for signature."
                          : createProductionTwoPane && createUiStage === CreateUiStage.RECIPIENTS
                            ? "Same agreement — add signers below, then send for signature when ready."
                            : createProductionTwoPane && createUiStage === CreateUiStage.DRAFT && draft
                              ? "Review the preview, edit anything, then tap Continue when you're ready."
                              : createProductionTwoPane && draft && isCreateFlowPastCapture(createFlowPhase)
                                ? "Review the preview, edit anything, then tap Continue when you're ready."
                                : "Updates after you finish typing"}
                    </p>
                  ) : null}
                  {((productionDraftPrimaryReviewSurface &&
                    createUiStage === CreateUiStage.DRAFT &&
                    (draft !== null || createFlowPhase === "generating_draft")) ||
                    (draft &&
                      ((createProductionTwoPane &&
                        (createUiStage === CreateUiStage.DRAFT || createUiStage === CreateUiStage.RECIPIENTS)) ||
                        (createProductionTwoPane && stageAInputFirst && isCreateFlowPastCapture(createFlowPhase)) ||
                        (simpleProductFlow &&
                          liveWorkspaceTwoPane &&
                          !createProductionTwoPane &&
                          isCreateFlowPastCapture(createFlowPhase))))) ? (
                    <>
                      {!draft && createFlowPhase === "generating_draft" && productionDraftPrimaryReviewSurface ? (
                        <div
                          className="mb-4 motion-safe:animate-pulse rounded-xl border border-emerald-500/20 bg-slate-950/60 p-5 shadow-md shadow-emerald-950/10 sm:p-6"
                          role="status"
                          aria-live="polite"
                          aria-busy="true"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90 sm:text-[11px]">
                            Review
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-200 sm:text-base">Creating your agreement…</p>
                          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
                            <li>✓ Structured draft being prepared</li>
                            <li>✓ Nothing is being sent</li>
                            <li>✓ You can edit everything next</li>
                          </ul>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
                            Hang tight — your agreement opens here in a moment.
                          </p>
                          <div className="mt-5 space-y-3">
                            <div className="h-3 w-3/4 rounded bg-slate-800/90" />
                            <div className="h-3 w-full rounded bg-slate-800/70" />
                            <div className="h-3 w-[92%] rounded bg-slate-800/70" />
                            <div className="h-24 w-full rounded-lg border border-slate-800/60 bg-[#0d1424]/80" />
                          </div>
                        </div>
                      ) : null}
                      {draft ? (
                        <>
                      {fullDraftUpgradeBannerVisible &&
                      productionDraftPrimaryReviewSurface &&
                      createUiStage === CreateUiStage.DRAFT ? (
                        <div
                          role="status"
                          className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-4 py-3 shadow-md shadow-emerald-950/25 sm:px-5"
                        >
                          <p className="text-sm font-semibold text-emerald-50 sm:text-base">✓ Complete version unlocked</p>
                          <p className="mt-1 text-sm leading-relaxed text-emerald-100/90">
                            Your agreement now includes full protections and is ready to send.
                          </p>
                        </div>
                      ) : null}
                      {createProductionTwoPane &&
                      simpleProductFlow &&
                      premiumPostCheckoutSummaryVisible &&
                      premiumProTruthGate?.successBannerAllowed ? (
                        <div
                          className="mb-4 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-3 sm:px-5"
                          role="status"
                          aria-live="polite"
                          aria-label="LawDog Pro unlocked"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/95">
                            LawDog Pro unlocked
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-100 sm:text-base">
                            Your LawDog Pro agreement is ready for review.
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
                            {formatPremiumRevealDeltaRow(premiumFinalizeAudit)}
                          </p>
                          <button
                            type="button"
                            className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 sm:w-auto sm:min-w-[14rem]"
                            onClick={() => handlePremiumReviewFirstContinueToSigners()}
                          >
                            Continue to recipient setup
                          </button>
                        </div>
                      ) : null}
                      {productionDraftPrimaryReviewSurface ? (
                        <div
                          className={
                            showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                              ? "mb-0 sm:mb-0.5"
                              : "mb-3"
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {createUiStage === CreateUiStage.RECIPIENTS ? (
                              <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                {premiumSignersSurfaceReady ? premiumRecipientSetupTitle : "Add recipients"}
                              </h2>
                            ) : streamlineFirstRunReviewUi ? (
                              starterReviewEditableHelperSurface ? (
                                <>
                                  <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                    {STARTER_REVIEW_HEADLINE}
                                  </h2>
                                  <p className="mt-1 text-sm leading-snug text-slate-400 sm:text-[0.9375rem]">
                                    {STARTER_REVIEW_SUBLINE}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                    Draft ready for review
                                  </h2>
                                  <p className="mt-1 text-sm leading-snug text-slate-400 sm:text-[0.9375rem]">
                                    Review the preview, then continue to send. Editable until sent — nothing is sent
                                    automatically.
                                  </p>
                                </>
                              )
                            ) : showUpgradeToFullDraftOnReview ? (
                              <>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                  You have a starter draft ready to review.
                                </h2>
                                <p className="mt-1 text-sm leading-snug text-slate-400 sm:text-[0.9375rem]">
                                  Review details, edit anything, then tap Continue. Nothing is sent automatically.
                                </p>
                                <p className="mt-1 text-xs leading-snug text-slate-500 sm:text-sm">
                                  You can keep going with this version or compare an upgrade below for fuller
                                  protections — upgrading is optional, not required to continue.
                                </p>
                              </>
                            ) : premiumPostCheckoutSummaryVisible ? (
                              <>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                  Agreement document
                                </h2>
                                <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">
                                  Scroll the upgraded text below and edit in place. When you are satisfied, continue
                                  to recipient setup (review-first; nothing sends automatically).
                                </p>
                              </>
                            ) : (
                              <>
                                <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                  {premiumPersistedFlowActive && !peekPremiumRecipientsSurfaceReleased()
                                    ? "Your upgraded agreement is ready"
                                    : "Your agreement is ready"}
                                </h2>
                                <p className="mt-1 text-sm leading-snug text-slate-400 sm:text-[0.9375rem]">
                                  {premiumPersistedFlowActive && !peekPremiumRecipientsSurfaceReleased() ? (
                                    <>
                                      Reviewed, stronger, editable, and ready for counterparties. Nothing sends until
                                      you confirm.
                                    </>
                                  ) : (
                                    "Review details, edit anything, then choose if you want to send."
                                  )}
                                </p>
                              </>
                            )}
                            {reviewShowsSimplifiedAdvancedDraft &&
                            !streamlineFirstRunReviewUi &&
                            !(
                              createUiStage === CreateUiStage.RECIPIENTS && premiumSignersSurfaceReady
                            ) ? (
                              <>
                                <span className="rounded-full border border-slate-600/70 bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  Simplified draft
                                </span>
                                <button
                                  type="button"
                                  className="text-[11px] font-medium text-emerald-400/90 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-300 sm:text-xs"
                                  onClick={() => {
                                    logProductEvent("paywall_triggered", {
                                      surface: "agreement_advanced_full_draft",
                                      code: "premium_agreement_template",
                                      via: "review_inline_unlock",
                                    });
                                    const raw = intakeCombined.trim();
                                    if (draft && raw) {
                                      setPendingUpgradePrompt(raw);
                                      pendingUpgradePromptRef.current = raw;
                                      setUpgradeIntentDetected(true);
                                      syncUpgradeIntentRefs(true);
                                      stashCreateComplexityResume({
                                        rawIntake: raw,
                                        pending: draft,
                                        awaitingProCheckout: true,
                                        resume_kind: "optional_full_upgrade",
                                      });
                                      stashUpgradeCheckoutContext(upgradeContextReasons, {
                                        completionLabel: buildUpgradeCheckoutCompletionLabel(draft),
                                        intentSignals: detectUpgradeIntentSignals(`${raw}\n${agreementDocumentText}`),
                                      });
                                    } else {
                                      stashUpgradeCheckoutContext(upgradeContextReasons, {
                                        completionLabel: buildUpgradeCheckoutCompletionLabel(draft),
                                        intentSignals: detectUpgradeIntentSignals(
                                          `${intakeCombined.trim()}\n${agreementDocumentText}`,
                                        ),
                                      });
                                    }
                                    setAdvancedFullDraftPaywallOpen(true);
                                  }}
                                >
                                  Complete version
                                </button>
                              </>
                            ) : null}
                          </div>
                          <p
                            className={
                              createUiStage === CreateUiStage.RECIPIENTS
                                ? "mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm"
                                : showUpgradeToFullDraftOnReview
                                  ? "mt-0.5 text-sm leading-snug text-slate-400"
                                  : "mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm"
                            }
                          >
                            {createUiStage === CreateUiStage.RECIPIENTS ? (
                              <>
                                {premiumSignersSurfaceReady ? (
                                  <span className="block text-slate-400">
                                    {premiumRecipientSetupSubcopy}
                                    {premiumRouteMomentumRibbon ? (
                                      <span className="mt-2 block rounded-lg border border-cyan-500/25 bg-cyan-950/20 px-3 py-2 text-[11px] leading-snug text-cyan-100/90 sm:text-xs">
                                        <span className="font-semibold text-cyan-50">{premiumRouteMomentumRibbon.title}</span>
                                        <span className="mt-1 block text-cyan-100/85">{premiumRouteMomentumRibbon.body}</span>
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <>
                                    Add signer emails below, then use the button at the bottom when you&apos;re ready.
                                    {showStarterRecipientsReassurance ? (
                                      <>
                                        {" "}
                                        You can send this starter draft now, or upgrade anytime for stronger terms and tracked e-signing.
                                      </>
                                    ) : null}
                                  </>
                                )}
                              </>
                            ) : streamlineFirstRunReviewUi ? (
                              <span className="block text-slate-500">
                                You choose when to send. Optional upgrades stay available later.
                              </span>
                            ) : showUpgradeToFullDraftOnReview ? (
                              <>When you&apos;re happy here, use Continue at the bottom to add recipients — still no
                              automatic sends.</>
                            ) : (
                              <>Edit anything, then continue to recipients to send for signature.</>
                            )}
                          </p>
                          {upgradeLockActive &&
                          productionDraftPrimaryReviewSurface &&
                          createUiStage === CreateUiStage.DRAFT ? (
                            <div
                              ref={upgradeRequiredBlockRef}
                              className="mx-auto mb-3 w-full max-w-none px-4 sm:px-0"
                              role="region"
                              aria-label={STARTER_REVIEW_PREMIUM_HEADLINE}
                            >
                              <div className={`p-5 sm:p-6 ${STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME}`}>
                                <h3 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                                  {STARTER_REVIEW_PREMIUM_HEADLINE}
                                </h3>
                                <ul className="mt-3 space-y-2 text-sm leading-snug text-slate-200/95 sm:text-base sm:leading-relaxed">
                                  {STARTER_REVIEW_PREMIUM_BULLETS.map((b) => (
                                    <li key={b} className="flex gap-2">
                                      <span className={STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME} aria-hidden>
                                        •
                                      </span>
                                      <span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                                  <button
                                    type="button"
                                    className={`min-h-[2.85rem] w-full px-5 py-3 text-center text-sm sm:w-auto sm:min-w-[14rem] sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
                                    onClick={() => void handleUpgradeToFullDraft()}
                                  >
                                    {STARTER_REVIEW_PREMIUM_CTA}
                                  </button>
                                  <button
                                    type="button"
                                    className="min-h-[2.85rem] w-full rounded-lg border border-slate-600/70 bg-slate-800/80 px-5 py-3 text-center text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
                                    onClick={clearUpgradeLockAndResume}
                                  >
                                    Continue with this draft
                                  </button>
                                </div>
                                <p className="mt-3 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">
                                  {STARTER_REVIEW_PREMIUM_MICROCOPY}
                                </p>
                              </div>
                            </div>
                          ) : null}
                          {createUiStage === CreateUiStage.RECIPIENTS &&
                          reviewHandoffAgreementEcho &&
                          !productionDraftPrimaryReviewSurface ? (
                            <p className="mt-2 rounded-md border border-slate-700/50 bg-slate-900/55 px-2.5 py-1.5 text-[11px] leading-snug text-slate-300 sm:text-xs">
                              {reviewHandoffAgreementEcho}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {productionDraftPrimaryReviewSurface && createUiStage === CreateUiStage.RECIPIENTS ? (
                        <div className="mb-4" role="region" aria-label="Agreement summary">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px]">
                            Agreement summary
                          </p>
                          <CreateDraftReviewCard
                            draft={reviewDraft ?? draft}
                            prepareCompact
                            sanitizeStarterPaymentTerms={false}
                            onInlineCommit={undefined}
                            partyHighlightNonce={reviewPartyHighlightNonce}
                            onNavigateToAgreementDocument={undefined}
                            className="rounded-xl border border-slate-700/60 bg-slate-950/85 p-3 shadow-md shadow-black/15 sm:p-4"
                          />
                        </div>
                      ) : (
                        <div
                          className={
                            createProductionTwoPane &&
                            createUiStage === CreateUiStage.DRAFT &&
                            !showUpgradeToFullDraftOnReview
                              ? "relative mb-4 rounded-xl bg-slate-950/45 p-4 ring-1 ring-slate-800/25 sm:p-5"
                              : `rounded-xl border bg-slate-950/90 p-4 shadow-inner shadow-black/20 sm:p-5 ${
                                  showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                                    ? "mb-3 sm:mb-3"
                                    : "mb-4"
                                } ${
                                  productionDraftPrimaryReviewSurface
                                    ? showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                                      ? "border-slate-700/55 ring-0"
                                      : "border-emerald-500/25 ring-1 ring-emerald-500/15"
                                    : "border-slate-700/60"
                                } ${
                                  showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                                    ? "relative"
                                    : ""
                                }`
                          }
                          role="region"
                          aria-label="Agreement text preview"
                        >
                          {reviewShowsSimplifiedAdvancedDraft && createUiStage === CreateUiStage.DRAFT
                            ? (() => {
                                const rawSimplifiedBanner = intakeCombined.trim();
                                const fam = draft?.agreement_family;
                                const lim = getSimplifiedAdvancedLimitationCopy(rawSimplifiedBanner, fam);
                                const cta = getSimplifiedAdvancedUpgradeCtaCopy(rawSimplifiedBanner, fam);
                                return (
                                  <div
                                    role="region"
                                    aria-label="Simplified draft notice"
                                    className="mb-3 rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-3 sm:px-4 sm:py-3.5"
                                  >
                                    <p className="text-xs leading-snug text-amber-200/90 sm:text-sm">{lim.text}</p>
                                    <p className="mt-2.5 border-t border-amber-500/20 pt-2.5 text-sm font-medium leading-snug text-amber-100/95 sm:text-[0.9375rem]">
                                      This instant draft is a starting point. Your request may need the Complete
                                      Version for custom protections.
                                    </p>
                                    <button
                                      type="button"
                                      className="mt-3 text-sm font-semibold text-emerald-300 underline decoration-emerald-500/45 underline-offset-2 hover:text-emerald-200"
                                      onClick={() => {
                                        logProductEvent("paywall_triggered", {
                                          surface: "agreement_advanced_full_draft",
                                          code: "premium_agreement_template",
                                          via: "simplified_post_draft_banner",
                                        });
                                        const raw = intakeCombined.trim();
                                        if (draft && raw) {
                                          setPendingUpgradePrompt(raw);
                                          pendingUpgradePromptRef.current = raw;
                                          setUpgradeIntentDetected(true);
                                          syncUpgradeIntentRefs(true);
                                          stashCreateComplexityResume({
                                            rawIntake: raw,
                                            pending: draft,
                                            awaitingProCheckout: true,
                                            resume_kind: "optional_full_upgrade",
                                          });
                                          stashUpgradeCheckoutContext(upgradeContextReasons, {
                                            completionLabel: buildUpgradeCheckoutCompletionLabel(draft),
                                            intentSignals: detectUpgradeIntentSignals(`${raw}\n${agreementDocumentText}`),
                                          });
                                        } else {
                                          stashUpgradeCheckoutContext(upgradeContextReasons, {
                                            completionLabel: buildUpgradeCheckoutCompletionLabel(draft),
                                            intentSignals: detectUpgradeIntentSignals(
                                              `${intakeCombined.trim()}\n${agreementDocumentText}`,
                                            ),
                                          });
                                        }
                                        setAdvancedFullDraftPaywallOpen(true);
                                      }}
                                    >
                                      {cta.label}
                                    </button>
                                    <p className="mt-2 text-[11px] leading-snug text-amber-200/80 sm:text-xs">
                                      {cta.trustLine}
                                    </p>
                                  </div>
                                );
                              })()
                            : null}
                          {showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT ? (
                            <div
                              id="watermark"
                              className="pointer-events-none absolute top-3 right-3 z-[2] text-[10px] font-medium uppercase tracking-wide text-slate-500/90"
                            >
                              Starter draft
                            </div>
                          ) : null}
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-[11px]">
                            {premiumPaidDocumentSurface ? "Agreement package (LawDog Pro)" : "Edit your agreement"}
                          </p>
                          <p
                            className={
                              showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                                ? "mt-0.5 text-[11px] leading-snug text-slate-500 sm:text-xs"
                                : premiumPaidDocumentSurface
                                  ? "mt-1.5 max-w-[72ch] text-xs leading-relaxed text-slate-400 sm:text-sm"
                                  : "mt-1 text-[11px] leading-relaxed text-slate-500 sm:text-xs"
                            }
                          >
                            {premiumPaidDocumentSurface
                              ? "Use Edit wording for the text editor, then use Finalize your agreement below to refine and pick review or signature. Not legal advice."
                              : "Not legal advice. Signer lines are added when you send."}
                          </p>
                          <div
                            id="fadeWrapper"
                            className={
                              showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT
                                ? "relative mt-1.5 sm:mt-2"
                                : premiumPaidDocumentSurface
                                  ? "mt-4 rounded-2xl border border-stone-800/20 bg-gradient-to-b from-stone-900/35 to-slate-950 px-1 py-6 sm:mt-5 sm:px-3 sm:py-8"
                                  : "mt-3"
                            }
                          >
                            {premiumPaidDocumentSurface ? (
                              <>
                                {showStrictRetryNeedsDetailsPanel ? (
                                <div className="mx-auto w-full max-w-[850px] px-0 sm:px-1">
                                  <div
                                    className="rounded-lg border border-amber-500/45 bg-amber-950/25 px-4 py-5 sm:px-6 sm:py-6"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    <p className="text-sm font-medium leading-relaxed text-amber-100/95 sm:text-[0.9375rem]">
                                      {proFullDraftCustomGateMessage ||
                                        "Your LawDog Pro agreement is ready for review. If something looks off, you can add detail and use Retry Pro draft, or keep editing in place. Nothing is sent until you continue."}
                                    </p>
                                    <p className="mt-2 text-xs leading-relaxed text-amber-200/90 sm:text-sm">
                                      Nothing is sent from this step until you choose to continue.
                                    </p>
                                    {import.meta.env.DEV ? (
                                      <p className="mt-2 text-[10px] font-mono text-amber-200/80">
                                        {lastPremiumPipelineRenderSourceRef.current || "—"} | intake{" "}
                                        {shortIntakeFingerprint(currentPremiumMergedIntakeKey)}
                                      </p>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/25"
                                      onClick={handleRetryProFullDraft}
                                    >
                                      Retry Pro draft
                                    </button>
                                  </div>
                                </div>
                                ) : null}
                                {!proFullDraftQualityRetry ? (
                                <div className="mx-auto w-full max-w-[850px] px-0 sm:px-1">
                                  {premiumServerGenerationDegraded ? (
                                    <div
                                      className="mb-4 rounded-lg border border-sky-500/40 bg-slate-900/50 px-4 py-3 sm:px-5 sm:py-3.5"
                                      role="status"
                                      aria-live="polite"
                                    >
                                      <p className="text-sm font-medium leading-relaxed text-slate-100">
                                        Your agreement is ready. You can refine any wording below.
                                      </p>
                                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                                        Your upgrade is on file. You can also try{" "}
                                        <span className="font-medium text-slate-200">Retry Pro draft</span> in a few
                                        minutes for another full pass, if you want.
                                      </p>
                                    </div>
                                  ) : null}
                                  <div className="w-full max-w-[850px] rounded-sm border border-stone-200/90 bg-[#faf7f0] text-left text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_22px_48px_-8px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.07]">
                                    <div className="flex flex-col gap-3 border-b border-stone-200/95 bg-gradient-to-b from-[#f4f0e6] to-[#ebe6dc] px-[clamp(1.35rem,4.5vw,2.65rem)] py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                                          LawDog Pro
                                        </p>
                                        {showStrictBlockedDraftPreviewLabel || premiumProTruthGate?.state === "premium_fallback_preview_allowed" ? (
                                          <p className="mt-0.5 text-[10px] font-medium text-amber-800/90">
                                            Review mode — you can add detail and use Retry Pro draft, or keep editing
                                            the text.
                                          </p>
                                        ) : null}
                                        <p className="mt-1 font-serif text-base font-semibold tracking-tight text-stone-900">
                                          Agreement
                                        </p>
                                        {import.meta.env.DEV ? (
                                          <p className="mt-1 text-[10px] font-medium tracking-wide text-stone-600">
                                            Render source: {premiumPaidReadonlyPick.sourceUsed} | hash{" "}
                                            {liveTraceHash(premiumPaidReadonlyPick.plainText)}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2.5">
                                        <button
                                          type="button"
                                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition sm:text-[13px] ${
                                            premiumReviewDocEditorOpen
                                              ? "border-amber-600/55 bg-amber-50 text-amber-950 hover:bg-amber-100/90"
                                              : "border-stone-300/90 bg-white/80 text-stone-800 hover:bg-white"
                                          }`}
                                          onClick={() => {
                                            if (!premiumReviewDocEditorOpen && !agreementDocumentDirtyRef.current) {
                                              const snapObj = readPremiumCompletionSnapshot();
                                              const snap = snapObj?.premiumReadonlyPlainText?.trim() ?? "";
                                              const winner = snapObj?.premiumWinningBodyText?.trim() ?? "";
                                              const pick = pickPremiumPaidReadonlyPlainText({
                                                premiumWinningBodyText: winner,
                                                premiumReadonlySnapshotText: snap,
                                                draft,
                                                agreementDocumentText,
                                                intakeText: intakeCombined,
                                              });
                                              if (
                                                pick.plainText.trim() &&
                                                scorePremiumReadonlyCorpusCandidate(pick.plainText) >
                                                  scorePremiumReadonlyCorpusCandidate(agreementDocumentText)
                                              ) {
                                                setAgreementDocumentText(pick.plainText);
                                              }
                                            }
                                            setPremiumReviewDocEditorOpen((o) => !o);
                                          }}
                                        >
                                          {premiumReviewDocEditorOpen ? "View document" : "Edit wording"}
                                        </button>
                                      </div>
                                    </div>
                                    {premiumReviewDocEditorOpen ? (
                                      <textarea
                                        ref={agreementPreviewEditorRef}
                                        id="claw-agreement-preview-editor"
                                        className="min-h-[min(68vh,44rem)] max-h-[min(78vh,54rem)] w-full resize-y border-0 bg-transparent px-[clamp(1.35rem,4.5vw,2.65rem)] pb-14 pt-9 font-serif text-[15px] leading-[1.88] tracking-[0.012em] text-stone-900 antialiased outline-none [text-wrap:pretty] selection:bg-amber-200/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/90 sm:text-[15.5px] sm:leading-[1.9]"
                                        style={{ fontFeatureSettings: '"kern" 1, "liga" 1, "onum" 1' }}
                                        value={agreementDocumentText}
                                        onChange={(e) => {
                                          agreementDocumentDirtyRef.current = true;
                                          setAgreementDocumentText(e.target.value);
                                          scheduleAgreementDocSync(e.target.value);
                                        }}
                                        onBlur={(e) => {
                                          const raw = e.target.value;
                                          const next = stripPremiumInstructionNoiseForDocument(raw);
                                          if (next !== raw) {
                                            agreementDocumentDirtyRef.current = true;
                                            setAgreementDocumentText(next);
                                            scheduleAgreementDocSync(next);
                                          }
                                        }}
                                        spellCheck
                                        disabled={(isGenerating && !draft) || upgradeLockActive}
                                        aria-label="Agreement document"
                                      />
                                    ) : (
                                      <PremiumAgreementReadonlyView html={premiumReadonlyAgreementHtml} />
                                    )}
                                  </div>
                                </div>
                                ) : null}
                              </>
                            ) : productionDraftPrimaryReviewSurface ? (
                              <div
                                className={`rounded-lg transition-[box-shadow,ring-color] duration-500 ${
                                  !hasFullDraftAccess
                                    ? "rounded-xl border border-slate-800/45 bg-slate-950/15 p-0.5"
                                    : ""
                                }`}
                              >
                                <textarea
                                  ref={agreementPreviewEditorRef}
                                  id="claw-agreement-preview-editor"
                                  className={(() => {
                                    const teaseReading =
                                      showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT;
                                    const deliverableReading = hasFullDraftAccess && !teaseReading;
                                    const starterUpgradeTease =
                                      "max-h-[min(42rem,72vh)] min-h-[clamp(13rem,42vh,22rem)] w-full resize-y overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800/80 bg-[#0d1424] p-4 font-serif text-[13px] leading-[1.65] text-slate-200/95 outline-none focus:border-slate-500/55 focus:ring-2 focus:ring-slate-500/20 sm:min-h-[clamp(16rem,48vh,26rem)] sm:max-h-[min(44rem,74vh)] sm:text-sm sm:leading-relaxed";
                                    const freeCompact =
                                      "max-h-[min(28rem,55vh)] min-h-[14rem] w-full max-w-none resize-y overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800/80 bg-[#0d1424] px-5 py-5 font-serif text-[13.5px] leading-[1.72] tracking-normal text-slate-200/90 antialiased outline-none [text-wrap:pretty] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/25 sm:px-6 sm:text-[14px] sm:leading-[1.78]";
                                    const paidDeliverable =
                                      "min-h-[clamp(18rem,52vh,32rem)] max-h-[min(56rem,84vh)] w-full max-w-[min(100%,58rem)] resize-y overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-600/50 bg-[#101c30] px-7 py-8 font-serif text-[16px] leading-[1.92] text-slate-100/95 antialiased outline-none [text-wrap:pretty] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:border-emerald-500/55 focus:ring-2 focus:ring-emerald-400/30 sm:px-9 sm:py-9 sm:text-[17px] sm:leading-[1.95] md:max-w-[60rem]";
                                    if (teaseReading) return starterUpgradeTease;
                                    if (deliverableReading) return paidDeliverable;
                                    return freeCompact;
                                  })()}
                                  value={agreementDocumentText}
                                  onChange={(e) => {
                                    agreementDocumentDirtyRef.current = true;
                                    setAgreementDocumentText(e.target.value);
                                    scheduleAgreementDocSync(e.target.value);
                                  }}
                                  spellCheck
                                  disabled={(isGenerating && !draft) || upgradeLockActive}
                                  aria-label="Agreement document"
                                />
                              </div>
                            ) : (
                              <pre className="max-h-[min(28rem,55vh)] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800/80 bg-[#0d1424] p-4 font-serif text-[13px] leading-[1.65] text-slate-200/95 sm:text-sm sm:leading-relaxed">
                                {buildPreviewForCurrentTier(draft)}
                              </pre>
                            )}
                            {showUpgradeToFullDraftOnReview && createUiStage === CreateUiStage.DRAFT ? (
                              <div
                                className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1] h-12 rounded-b-lg bg-gradient-to-t from-black/55 to-transparent"
                                aria-hidden
                              />
                            ) : null}
                          </div>
                            {showFinalizeYourAgreement ? (
                              <div className="mt-5 w-full sm:pr-0 md:max-w-3xl">
                                <FinalizeYourAgreementPanel
                                  draft={reviewDraft ?? draft}
                                  currentDocumentText={agreementDocumentText}
                                  intakeText={intakeCombined.trim()}
                                  review={premiumRefineReview}
                                  finalizeAudit={premiumFinalizeAudit}
                                  reviewRoute={premiumReviewRoute}
                                  routePrimaryActionNonce={finalizeRoutePrimaryActionNonce}
                                  onRouteFixPrimary={bumpFinalizeRoutePrimaryActionNonce}
                                  onApplyDocumentText={(t) => {
                                    setAgreementDocumentText(t);
                                    scheduleAgreementDocSync(t);
                                  }}
                                  markDocumentDirty={() => {
                                    agreementDocumentDirtyRef.current = true;
                                  }}
                                  onSendForSignature={() => handleFinalizeRoutePrimaryAction("signature")}
                                  onReadyForReview={() => handleFinalizeRoutePrimaryAction("review")}
                                  sendMode={effectivePremiumSendMode}
                                  sendModeTouched={premiumSendModeTouched}
                                  disabled={(isGenerating && !draft) || upgradeLockActive}
                                />
                              </div>
                            ) : null}
                        </div>
                      )}
                      {productionDraftPrimaryReviewSurface ? (
                        showUpgradeToFullDraftOnReview &&
                        createUiStage === CreateUiStage.DRAFT &&
                        showFullDraftDiffPreview &&
                        !streamlineFirstRunReviewUi ? (
                          <div ref={fullDraftUpgradeReviewCardRef} className="mt-3 sm:mt-4">
                            <FullDraftUpgradeDiffPreview
                              rows={fullDraftComparisonRows}
                              onGenerate={handleUpgradeToFullDraft}
                              showGhostClausePreview={showUpgradeToFullDraftOnReview}
                              intentSignals={upgradeIntentSignals}
                            />
                          </div>
                        ) : null
                      ) : (
                        <div className="mb-4" role="region" aria-label="Structured fields reference">
                          <CreateDraftReviewCard
                            draft={reviewDraft ?? draft}
                            sanitizeStarterPaymentTerms={true}
                            onInlineCommit={undefined}
                            partyHighlightNonce={reviewPartyHighlightNonce}
                            onNavigateToAgreementDocument={undefined}
                          />
                        </div>
                      )}
                      {productionDraftPrimaryReviewSurface && createUiStage !== CreateUiStage.RECIPIENTS ? (
                        <>
                          {showUpgradeToFullDraftOnReview &&
                          createUiStage === CreateUiStage.DRAFT &&
                          !streamlineFirstRunReviewUi ? (
                            <>
                              <details
                                ref={editOriginalWordingDetailsRef}
                                className={
                                  originalWordingIsPremiumOnlyOnStarter
                                    ? "mt-2 rounded-lg border border-amber-500/40 bg-amber-950/15 p-2 ring-1 ring-amber-500/20 sm:mt-2 sm:p-2.5"
                                    : "mt-2 rounded-lg border border-slate-800/60 bg-slate-950/40 p-2 sm:mt-2 sm:p-2.5"
                                }
                              >
                                <summary
                                  className={`cursor-pointer list-none text-[11px] font-medium uppercase tracking-wide marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-xs ${
                                    originalWordingIsPremiumOnlyOnStarter
                                      ? "text-amber-200/95 focus-visible:outline-amber-500/40"
                                      : "text-slate-500 focus-visible:outline-slate-500/35"
                                  }`}
                                >
                                  {originalWordingIsPremiumOnlyOnStarter
                                    ? PREMIUM_ORIGINAL_WORDING_DETAILS_SUMMARY
                                    : "Regenerate from original wording (optional)"}
                                </summary>
                                <div
                                  className={
                                    originalWordingIsPremiumOnlyOnStarter
                                      ? "mt-2 pt-1"
                                      : "mt-2 border-t border-slate-800/50 pt-3"
                                  }
                                >
                                  {originalWordingIsPremiumOnlyOnStarter ? (
                                    premiumOriginalWordingStarterPanel
                                  ) : (
                                    <div role="region" aria-label="Regenerate from new wording">
                                      <p className="text-xs font-medium text-slate-400">Regenerate from new wording</p>
                                      <p className="mt-1 text-[11px] leading-snug text-slate-500">
                                        Use this only if you want to rewrite your original request.
                                      </p>
                                      {starterSafeEditHelperEl}
                                      <div className="mt-2" role="region" aria-label="Agreement description">
                                        {!isEditingDescription ? (
                                          <button
                                            type="button"
                                            className="text-left text-sm font-medium text-slate-400 underline decoration-slate-600/55 underline-offset-2 hover:text-slate-300"
                                            onClick={() => {
                                              if (editOriginalWordingDetailsRef.current) {
                                                editOriginalWordingDetailsRef.current.open = true;
                                              }
                                              setIsEditingDescription(true);
                                              window.requestAnimationFrame(() => textareaRef.current?.focus());
                                            }}
                                          >
                                            Edit description
                                          </button>
                                        ) : (
                                          <div className="rounded-lg border border-slate-700/55 bg-slate-950/80 p-3 shadow-inner shadow-black/15 sm:p-4">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                              Original wording
                                            </p>
                                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                              Update your plain-English description, then apply to refresh the structured
                                              draft below.
                                            </p>
                                            <div className="relative mt-2 pb-8 sm:mt-3">
                                              <VoiceAugmentedTextArea
                                                ref={textareaRef}
                                                value={intakeStepBuffer}
                                                onValueChange={handleIntakeStepBufferChange}
                                                onKeyDown={handleIntakeKeyDown}
                                                onBlur={handleIntakeBlur}
                                                onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
                                                dictationControlRef={dictationControlRef}
                                                onDictationPhaseChange={handleDictationPhaseChange}
                                                disabled={isGenerating || upgradeLockActive}
                                                voiceUiEnabled={!isGenerating && !upgradeLockActive}
                                                micIdleAttract={micIdleAttract}
                                                dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
                                                wrapperClassName="w-full"
                                                className="min-h-[10rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-4 py-3 pb-12 pr-12 text-sm leading-relaxed text-gray-100 caret-slate-300 outline-none focus:border-slate-500/70 focus:ring-2 focus:ring-slate-500/25"
                                                placeholder="Describe your agreement in plain English…"
                                                aria-label="Edit agreement description"
                                              />
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-500 disabled:opacity-50"
                                                disabled={
                                                  isGenerating || !intakeCombined.trim() || upgradeLockActive
                                                }
                                                onClick={() => void handleProductionInlineWordingSubmit()}
                                              >
                                                Update draft from wording
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-lg border border-slate-600/70 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
                                                disabled={isGenerating || upgradeLockActive}
                                                onClick={() => setIsEditingDescription(false)}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </details>
                              {starterStrongProtectionsUpsellEl}
                            </>
                          ) : suppressSimpleFirstPassReviewExtras ? null : (
                            <>
                              <div className="mt-4" role="region" aria-label="Agreement description">
                                {originalWordingIsPremiumOnlyOnStarter ? (
                                  !isEditingDescription ? (
                                    <button
                                      type="button"
                                      className="text-left text-sm font-semibold text-amber-300/95 underline decoration-amber-500/45 underline-offset-2 hover:text-amber-200"
                                      onClick={() => {
                                        setPremiumOriginalWordingBuffer((prev) =>
                                          prev.trim() ? prev : intakeCombined,
                                        );
                                        setIsEditingDescription(true);
                                      }}
                                    >
                                      {PREMIUM_ORIGINAL_WORDING_DETAILS_SUMMARY}
                                    </button>
                                  ) : (
                                    premiumOriginalWordingStarterPanel
                                  )
                                ) : !isEditingDescription ? (
                                  <button
                                    type="button"
                                    className="text-left text-sm font-semibold text-emerald-400/95 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-300"
                                    onClick={() => {
                                      setIsEditingDescription(true);
                                      window.requestAnimationFrame(() => textareaRef.current?.focus());
                                    }}
                                  >
                                    Edit description
                                  </button>
                                ) : (
                                  <div className="rounded-xl border border-emerald-500/35 bg-slate-950/85 p-4 shadow-inner shadow-black/20 sm:p-5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Original wording
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                      Update your plain-English description, then apply to refresh the structured draft
                                      below.
                                    </p>
                                    {starterSafeEditHelperEl}
                                    <div className="relative mt-3 pb-8">
                                      <VoiceAugmentedTextArea
                                        ref={textareaRef}
                                        value={intakeStepBuffer}
                                        onValueChange={handleIntakeStepBufferChange}
                                        onKeyDown={handleIntakeKeyDown}
                                        onBlur={handleIntakeBlur}
                                        onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
                                        dictationControlRef={dictationControlRef}
                                        onDictationPhaseChange={handleDictationPhaseChange}
                                        disabled={isGenerating || upgradeLockActive}
                                        voiceUiEnabled={!isGenerating && !upgradeLockActive}
                                        micIdleAttract={micIdleAttract}
                                        dictationStartNonce={freshSimpleCreateUx ? dictationStartNonce : 0}
                                        wrapperClassName="w-full"
                                        className="min-h-[10rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-4 py-3 pb-12 pr-12 text-sm leading-relaxed text-gray-100 caret-emerald-300 outline-none focus:border-emerald-400/90 focus:ring-2 focus:ring-emerald-400/45"
                                        placeholder="Describe your agreement in plain English…"
                                        aria-label="Edit agreement description"
                                      />
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
                                        disabled={
                                          isGenerating || !intakeCombined.trim() || upgradeLockActive
                                        }
                                        onClick={() => void handleProductionInlineWordingSubmit()}
                                      >
                                        Update draft from wording
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-slate-600/70 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500"
                                        disabled={isGenerating || upgradeLockActive}
                                        onClick={() => setIsEditingDescription(false)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {starterStrongProtectionsUpsellEl}
                            </>
                          )}
                        </>
                      ) : null}
                  {!(
                    createProductionTwoPane &&
                    !stageAInputFirst &&
                    (createUiStage === CreateUiStage.DRAFT || createUiStage === CreateUiStage.RECIPIENTS)
                  ) &&
                  !(productionDraftPrimaryReviewSurface && createUiStage === CreateUiStage.RECIPIENTS) &&
                  createProductionTwoPane &&
                  draft &&
                  (createFlowPhase === "recipient_setup_required" || createFlowPhase === "ready_to_send") ? (
                    <div className="mb-4">
                      <CreateFlowSendRecipientsPanel
                        variant="workspace"
                        isPremiumRecipientSurface={premiumSignersSurfaceReady}
                        showProTierAdvanced={tierAllowsAdvancedFullDraftReveal(tier)}
                        productionReadyForPersist={productionReadyForPersist}
                        draft={draft}
                        effectivePremiumSendMode={effectivePremiumSendMode}
                        onPremiumSendModePick={handlePremiumSendModePick}
                        recipient1Name={recipient1Name}
                        setRecipient1Name={setRecipient1Name}
                        recipient1Email={recipient1Email}
                        setRecipient1Email={setRecipient1Email}
                        recipient2Name={recipient2Name}
                        setRecipient2Name={setRecipient2Name}
                        recipient2Email={recipient2Email}
                        setRecipient2Email={setRecipient2Email}
                        recipientSignerLabels={recipientSignerLabels}
                        setRecipientSignerLabels={setRecipientSignerLabels}
                        reviewHandoffAgreementEcho={reviewHandoffAgreementEcho}
                        showStarterRecipientsReassurance={showStarterRecipientsReassurance}
                        editorOpen={createFlowSendRecipientEditorOpen}
                        setEditorOpen={setCreateFlowSendRecipientEditorOpen}
                        onDeferRecipients={() => {
                          setRecipientsDeferred(true);
                          setCreateFlowPhase("ready_to_send");
                        }}
                        hideDeferOption={premiumSignersSurfaceReady}
                        onSendClick={runPrimaryIntakeAction}
                        sendDisabled={effectivePrimaryCtaDisabled}
                        sendRequiresConfirmStep={premiumSendConfirmGateActive}
                        stripRecipientEmailNoise={stripRecipientEmailNoise}
                        looksLikeEmail={looksLikeEmail}
                      />
                    </div>
                  ) : null}
                  {!(
                    createProductionTwoPane &&
                    draft &&
                    (createUiStage === CreateUiStage.DRAFT || createUiStage === CreateUiStage.RECIPIENTS)
                  ) ? (
                    <div
                      className={`motion-reduce:transition-none${createProductionTwoPane && draft && isCreateFlowPastCapture(createFlowPhase) ? " mt-1 opacity-80" : ""}`}
                      style={simpleProductFlow && liveWorkspaceTwoPane ? livePreviewSurfaceStyle : undefined}
                    >
                      <LiveAgreementPreview
                        model={displayLivePreviewModel}
                        intakeLen={intakeCombined.trim().length}
                        dictationPhase={isGenerating ? "idle" : intakeDictationPhase}
                        workspaceWorking={isGenerating}
                        formationPhase={formationPhaseForPreview}
                        {...livePreviewExtras}
                      />
                    </div>
                  ) : null}
                    </>
                  ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {intakeReadiness && !freshSimpleCreateUx && !createProductionTwoPane ? (
              <div className="mt-5 lg:max-w-4xl">
                <AgreementReadinessCard
                  result={intakeReadiness}
                  surface="agreement_intake"
                  compact
                  flowPhase="intake"
                  showCtaHelper
                />
              </div>
            ) : null}

            {liveWorkspaceTwoPane && displayPhase === "generating_draft" && !freshSimpleCreateUx && !createProductionTwoPane ? (
              <div
                className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-4 py-3 text-left shadow-sm shadow-emerald-950/20 lg:max-w-xl"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-emerald-100/95 sm:text-[0.9375rem]">
                  Creating your agreement…
                </p>
                <ul className="mt-2 space-y-0.5 text-xs leading-relaxed text-slate-300 sm:text-[0.8125rem] lg:text-[0.9375rem]">
                  <li>✓ Structured draft being prepared</li>
                  <li>✓ Nothing is being sent</li>
                  <li>✓ You can edit everything next</li>
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-[0.8125rem] lg:text-[0.9375rem] lg:text-slate-300">
                  Watch the preview on the right fill in.
                </p>
              </div>
            ) : null}

            {import.meta.env.DEV && simpleProductFlow && liveWorkspaceTwoPane && showMainIntakeForm ? (
              <div
                className="pointer-events-none fixed bottom-24 left-2 z-[55] max-w-[min(calc(100vw-1rem),21rem)] rounded-md border border-amber-500/45 bg-slate-950/95 px-2.5 py-2 font-mono text-[10px] leading-snug text-amber-50/95 shadow-lg backdrop-blur-sm"
                aria-hidden
              >
                <div className="mb-1 font-semibold uppercase tracking-wide text-amber-200/90">Dev · send CTA</div>
                <div>sticky: {simpleCreateStickyBottomBarVisible ? "yes" : "no"}</div>
                <div>inline fallback: {simpleCreateUnifiedBottomCta && !simpleCreateStickyBottomBarVisible ? "yes" : "no"}</div>
                <div>label: {simpleCreateBottomPrimaryLabel}</div>
                <div>action: {simpleCreateUnifiedBottomCta ? unifiedPrimaryCta.action : "—"}</div>
                <div>disabled: {effectivePrimaryCtaDisabled ? "yes" : "no"}</div>
                {simpleCreateUnifiedBottomCta && unifiedPrimaryCta.reason ? (
                  <div>reason: {unifiedPrimaryCta.reason}</div>
                ) : null}
                <div>stage: {createUiStage}</div>
                <div>phase: {createFlowPhase}</div>
                <div>displayPhase: {displayPhase}</div>
                <div>prodShell: {productionCreateWorkspaceShellActive ? "yes" : "no"}</div>
                <div>readyForSend: {simpleCreateReadyForSend ? "yes" : "no"}</div>
                <div>guidedComplete: {guidedStructureComplete ? "yes" : "no"}</div>
                <div>draft: {draft ? "yes" : "no"}</div>
                <div>reviewId: {reviewAgreementId?.trim() ? "yes" : "no"}</div>
                <div>r1 email: {recipient1Email.trim() ? "yes" : "no"}</div>
                <div>defer: {recipientsDeferred ? "yes" : "no"}</div>
                <div>loading: {loading ? "yes" : "no"}</div>
                <div>prod2pane: {createProductionTwoPane ? "yes" : "no"}</div>
              </div>
            ) : null}

            {simpleCreateStickyBottomBarVisible ? (
              <div
                ref={simpleCreateActionBarRef}
                className={`fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-[box-shadow] duration-300 motion-safe:transition-all ${
                  simpleCreateBarCoolToneForBasicContinuePath
                    ? "border-t border-slate-700/70 bg-gradient-to-t from-slate-950 via-slate-900/98 to-slate-900/90 shadow-md shadow-black/35"
                    : "border-t border-emerald-400/30 bg-gradient-to-t from-emerald-950 via-emerald-900/98 to-emerald-800/90 shadow-md shadow-black/25"
                } ${
                  simpleCreateReadyForSend && readyIdleForAction && !createProductionTwoPane
                    ? "ring-2 ring-emerald-400/40 ring-offset-0"
                    : ""
                }`}
                role="region"
                aria-label={
                  stickyProductionAgreementCreationLoading
                    ? stickyProductionAgreementCreatingLabel
                    : unifiedPrimaryCta.label || "Agreement intake"
                }
              >
                <div className={`mx-auto w-full px-4 ${simpleCreateWorkspaceOuterMaxClass}`}>
                  {simpleCreateUnifiedBottomCta &&
                  createProductionTwoPane &&
                  (createUiStage === CreateUiStage.INPUT ||
                    createUiStage === CreateUiStage.DRAFT ||
                    (createUiStage === CreateUiStage.RECIPIENTS && !productionReadyForPersist)) &&
                  !simpleCreateReadyForSend &&
                  !stickyProductionAgreementCreationLoading ? (
                    <p className="mb-2 text-center text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">
                      {NOTHING_SENT_UNTIL_CONFIRM}
                    </p>
                  ) : null}
                  {showUpgradeIntakeFullDraftCallout &&
                  createProductionTwoPane &&
                  createUiStage === CreateUiStage.INPUT &&
                  !hideIntakeMicrocopy &&
                  !isGenerating ? (
                    <div className="mb-3">
                      <FullDraftUpgradeIntakeCallout onUpgrade={handleUpgradeToFullDraft} />
                    </div>
                  ) : null}
                  {productionReviewReadyToSendLine ? (
                    <div className="mb-2 text-center" role="status" aria-live="polite">
                      <p
                        className={
                          simpleCreateBarCoolToneForBasicContinuePath
                            ? "text-sm font-semibold text-slate-100 sm:text-[0.9375rem]"
                            : "text-sm font-semibold text-emerald-50/95 sm:text-[0.9375rem]"
                        }
                      >
                        Ready for final send
                      </p>
                      <p
                        className={
                          simpleCreateBarCoolToneForBasicContinuePath
                            ? "mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs"
                            : "mt-0.5 text-[11px] leading-snug text-emerald-100/75 sm:text-xs"
                        }
                      >
                        Add recipients next, then confirm before anything is sent.
                      </p>
                    </div>
                  ) : null}
                  {simpleCreateReadyForSend && preSendTrustLayer ? (
                    createProductionTwoPane ? (
                      <p className="mb-2 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">
                        Before sending:
                        {preSendTrustLayer.missingItems.length > 0 ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="font-medium text-slate-300 underline decoration-slate-500/50 decoration-1 underline-offset-2 hover:text-emerald-200/90 hover:decoration-emerald-400/50"
                              onClick={() => handlePreSendTrustGapClick(preSendTrustLayer.missingItems[0].key)}
                            >
                              {preSendTrustLayer.missingItems[0].label.toLowerCase()}
                            </button>{" "}
                            may need attention.
                          </>
                        ) : (
                          <> consider adding a custom termination clause if your deal is non-standard.</>
                        )}
                      </p>
                    ) : (
                      <div
                        className="mb-3 rounded-xl border border-slate-600/35 bg-slate-950/45 px-3.5 py-3 shadow-inner shadow-black/20 backdrop-blur-sm sm:px-4 sm:py-3.5"
                        aria-live="polite"
                        role="region"
                        aria-label="Send confidence checklist"
                      >
                        <p className="text-sm font-semibold tracking-tight text-slate-100 sm:text-[0.9375rem]">
                          Send confidence check
                        </p>
                        <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-slate-300/95 sm:text-sm">
                          <li className="flex gap-2">
                            <span className="shrink-0 text-emerald-400/90" aria-hidden>
                              {preSendTrustLayer.partiesDefined ? "✓" : "·"}
                            </span>
                            <span className={preSendTrustLayer.partiesDefined ? "text-slate-200/95" : "text-slate-400/90"}>
                              Parties defined
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 text-emerald-400/90" aria-hidden>
                              {preSendTrustLayer.paymentIncluded ? "✓" : "·"}
                            </span>
                            <span
                              className={preSendTrustLayer.paymentIncluded ? "text-slate-200/95" : "text-slate-400/90"}
                            >
                              Payment terms included
                            </span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 text-emerald-400/90" aria-hidden>
                              {preSendTrustLayer.durationSet ? "✓" : "·"}
                            </span>
                            <span className={preSendTrustLayer.durationSet ? "text-slate-200/95" : "text-slate-400/90"}>
                              Duration set
                            </span>
                          </li>
                        </ul>
                        {preSendTrustLayer.missingItems.length > 0 ? (
                          <div className="mt-2.5 border-t border-slate-600/25 pt-2.5">
                            <p className="text-[11px] font-medium text-amber-100/80 sm:text-xs">⚠ Missing</p>
                            <ul className="mt-1.5 space-y-1">
                              {preSendTrustLayer.missingItems.map((item) => (
                                <li key={item.key}>
                                  <button
                                    type="button"
                                    className="group w-full rounded-md px-1 py-1 text-left text-[13px] text-slate-200/95 transition hover:bg-emerald-950/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400/50 sm:text-sm"
                                    onClick={() => handlePreSendTrustGapClick(item.key)}
                                  >
                                    <span className="text-amber-200/80" aria-hidden>
                                      →{" "}
                                    </span>
                                    <span className="underline decoration-slate-500/50 decoration-1 underline-offset-2 group-hover:decoration-emerald-400/50">
                                      {item.label}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-slate-400/95 sm:text-xs">
                          {preSendTrustLayer.nominalPercent >= 70
                            ? "Looks send-ready."
                            : preSendTrustLayer.missingItems.length > 0
                              ? "Quick polish recommended before send."
                              : "Consider one more pass before sending."}
                        </p>
                      </div>
                    )
                  ) : null}
                  {simpleCreateUnifiedBottomCta &&
                  createProductionTwoPane &&
                  createUiStage === CreateUiStage.DRAFT &&
                  (unifiedPrimaryCta.action === "continue_to_recipients" ||
                    unifiedPrimaryCta.action === "continue_basic_draft") ? (
                    <div className="mb-3 space-y-1 text-center">
                      <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
                        Nothing is sent automatically.
                        <br />
                        You&apos;ll review recipients and send when ready.
                      </p>
                      <p className="text-[11px] text-slate-400 sm:text-xs">
                        You&apos;ll add emails and send for signature next
                      </p>
                      {unifiedPrimaryCta.action === "continue_basic_draft" ? (
                        <p className="text-[10px] leading-snug text-slate-500 sm:text-[11px]">
                          {STARTER_CONTINUE_TO_SEND_UPGRADE_NUDGE}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {showPartyNamesPlaceholderHint ? (
                    <p className="mb-2 text-center text-xs leading-relaxed text-slate-400 sm:text-sm">
                      You can complete final details before sending.
                    </p>
                  ) : null}
                  {simpleCreateUnifiedBottomCta &&
                  stageAInputFirst &&
                  effectivePrimaryCtaDisabled &&
                  (unifiedPrimaryCta.reason === "stage_a_short_input" ||
                    unifiedPrimaryCta.reason === "stage_a_needs_clearer_request") ? (
                    <p className="mb-2 text-center text-xs leading-relaxed text-slate-400 sm:text-sm">
                      {humanizePrimaryCtaBlockedReason(unifiedPrimaryCta.reason)}
                    </p>
                  ) : null}
                  {showProductionPremiumInlineSendSuccess ? (
                    <div className="w-full py-1 text-center" role="status" aria-live="polite">
                      <p className="text-base font-semibold text-emerald-50 sm:text-[1.0625rem]">
                        <span className="mr-1.5 text-emerald-300/95" aria-hidden>
                          ✔
                        </span>
                        Agreement sent
                      </p>
                      <p className="mt-1 text-sm text-emerald-100/80 sm:text-[0.9375rem]">Recipients have been notified</p>
                      <button
                        type="button"
                        className="mt-3 text-sm font-medium text-emerald-100/95 underline decoration-emerald-300/55 underline-offset-[3px] hover:text-white"
                        onClick={() => {
                          if (!productionSendBarAgreementId) return;
                          navigate(`/app/send/${encodeURIComponent(productionSendBarAgreementId)}`);
                        }}
                      >
                        View status
                      </button>
                    </div>
                  ) : showRetryAsPrimaryCta ? (
                    <div className="w-full py-1 text-center">
                      <button
                        type="button"
                        className="w-full rounded-lg border border-amber-500/60 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/30"
                        onClick={handleRetryProFullDraft}
                      >
                        Retry Pro draft
                      </button>
                      <p className="mt-2 text-xs leading-relaxed text-amber-100/90 sm:text-sm">
                        Nothing is sent from this step until you continue. You can edit your agreement first.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-busy={isGenerating || draftPreCommitFreeze || showProductionPremiumInlineSendLoading}
                      aria-disabled={effectivePrimaryCtaDisabled}
                      className={`${simpleCreateBottomPrimaryClass}${isGenerating ? " motion-safe:animate-pulse" : ""}${
                        stickyRecipientBlockedNudge ? " opacity-90 ring-1 ring-amber-400/40 ring-offset-2 ring-offset-slate-950" : ""
                      }`}
                      onClick={() => {
                        try {
                          if (import.meta.env.DEV) {
                            devSendCtaTrace("sticky primary onClick", {
                              simpleCreateReadyForSend,
                              effectivePrimaryCtaDisabled,
                              stickyRecipientBlockedNudge,
                            });
                          }
                          runPrimaryIntakeAction();
                        } catch (e) {
                          if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] sticky onClick", e);
                        }
                      }}
                      disabled={stickyPrimaryButtonNativeDisabled}
                    >
                      {stickyProductionAgreementCreationLoading ? (
                        stickyProductionAgreementCreatingLabel
                      ) : (
                        <span className="inline-flex items-center justify-center gap-2">
                          {showProductionPremiumInlineSendLoading ? (
                            <span
                              className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-emerald-200/25 border-t-emerald-50 motion-safe:animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          <span>{simpleCreateBottomPrimaryLabel}</span>
                        </span>
                      )}
                    </button>
                  )}
                  {simpleCreateReadyForSend && !createProductionTwoPane ? (
                    <p className="mt-2 text-center text-xs leading-snug text-emerald-100/80 sm:text-[0.8125rem]">
                      You can review or edit before sending
                    </p>
                  ) : null}
                  {simpleCreateReadyForSend && !createProductionTwoPane ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between sm:gap-3">
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-300/35 bg-emerald-950/50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-50 backdrop-blur-sm hover:bg-emerald-950/75 disabled:opacity-50 sm:flex-1"
                        onClick={handleReadyBarReview}
                        disabled={isGenerating}
                      >
                        Review & edit
                      </button>
                      <button
                        type="button"
                        className="py-2.5 text-center text-sm font-medium text-emerald-100/95 underline decoration-emerald-300/60 underline-offset-[3px] hover:text-white disabled:opacity-50 sm:flex-1 sm:self-center"
                        onClick={handleReadyBarAddMore}
                        disabled={isGenerating}
                      >
                        Add more details
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {showPartyNamesPlaceholderHint ? (
                  <p className="mb-2 text-center text-xs leading-relaxed text-slate-400 sm:text-sm">
                    You can complete final details before sending.
                  </p>
                ) : null}
                {showProductionPremiumInlineSendSuccess ? (
                  <div className="mt-6 w-full py-1 text-center" role="status" aria-live="polite">
                    <p className="text-base font-semibold text-emerald-50 sm:text-[1.0625rem]">
                      <span className="mr-1.5 text-emerald-300/95" aria-hidden>
                        ✔
                      </span>
                      Agreement sent
                    </p>
                    <p className="mt-1 text-sm text-emerald-100/80 sm:text-[0.9375rem]">Recipients have been notified</p>
                    <button
                      type="button"
                      className="mt-3 text-sm font-medium text-emerald-100/95 underline decoration-emerald-300/55 underline-offset-[3px] hover:text-white"
                      onClick={() => {
                        if (!productionSendBarAgreementId) return;
                        navigate(`/app/send/${encodeURIComponent(productionSendBarAgreementId)}`);
                      }}
                    >
                      View status
                    </button>
                  </div>
                ) : showRetryAsPrimaryCta ? (
                  <div className="mt-6 w-full py-1 text-center">
                    <button
                      type="button"
                      className="w-full rounded-lg border border-amber-500/60 bg-amber-500/20 px-4 py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/30"
                      onClick={handleRetryProFullDraft}
                    >
                      Retry Pro draft
                    </button>
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/90 sm:text-sm">
                      Nothing is sent from this step until you continue. You can edit your agreement first.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-busy={isGenerating || showProductionPremiumInlineSendLoading}
                    aria-disabled={effectivePrimaryCtaDisabled}
                    className={`${intakeMainCtaClass} mt-6 w-full justify-center motion-safe:transition-opacity ${simpleProductFlow ? "min-h-[3rem] lg:min-h-[3.25rem]" : ""} ${isGenerating ? "motion-safe:animate-pulse disabled:opacity-80" : ""}${
                      stickyRecipientBlockedNudge ? " opacity-90 ring-1 ring-amber-400/40 ring-offset-2 ring-offset-slate-950" : ""
                    }`}
                    onClick={() => {
                      try {
                        if (import.meta.env.DEV) {
                          devSendCtaTrace("inline primary onClick (sticky hidden)", {
                            label: simpleCreateBottomPrimaryLabel,
                            effectivePrimaryCtaDisabled,
                            stickyRecipientBlockedNudge,
                          });
                        }
                        runPrimaryIntakeAction();
                      } catch (e) {
                        if (import.meta.env.DEV) console.error("[AgreementIntake:send-cta] inline primary onClick", e);
                      }
                    }}
                    disabled={stickyPrimaryButtonNativeDisabled}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {showProductionPremiumInlineSendLoading ? (
                        <span
                          className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-emerald-200/25 border-t-emerald-50 motion-safe:animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      <span>{simpleCreateBottomPrimaryLabel}</span>
                    </span>
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <VoiceAugmentedTextArea
              ref={textareaRef}
              value={intakeStepBuffer}
              onValueChange={handleIntakeStepBufferChange}
              onKeyDown={simpleProductFlow && liveWorkspaceTwoPane ? handleIntakeKeyDown : undefined}
              onBlur={simpleProductFlow && liveWorkspaceTwoPane ? handleIntakeBlur : undefined}
              onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
              dictationControlRef={dictationControlRef}
              onDictationPhaseChange={handleDictationPhaseChange}
              disabled={isGenerating}
              wrapperClassName={workspaceUi ? "mt-2" : "mt-3"}
              className={
                workspaceUi
                  ? "min-h-[17rem] w-full rounded-lg border border-slate-600/65 bg-[#141d32] px-5 py-5 pb-12 pr-12 text-lg leading-7 text-gray-100 caret-emerald-300 outline-none ring-offset-2 ring-offset-[#0a0e18] transition-[box-shadow,border-color,ring] duration-150 placeholder:text-gray-500 focus:border-emerald-400/95 focus:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_28px_-6px_rgba(52,211,153,0.55)] focus:ring-2 focus:ring-emerald-400/55 disabled:opacity-60 md:text-[1.0625rem] md:leading-7 lg:text-xl lg:leading-[2rem] lg:placeholder:text-gray-500"
                  : "min-h-[15.5rem] w-full rounded border border-slate-600/65 bg-[#141d32] px-4 py-4 pb-12 pr-12 text-base leading-7 text-gray-100 caret-emerald-300 outline-none placeholder:text-gray-500 transition-[box-shadow,border-color,ring] duration-150 focus:border-emerald-400/95 focus:shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_24px_-8px_rgba(52,211,153,0.5)] focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-60"
              }
              placeholder={
                simpleProductFlow
                  ? guidedQuestionPlaceholder
                  : workspaceUi
                    ? "Describe the deal in plain language."
                    : "Describe your agreement..."
              }
            />
            <div className={`mt-4 flex flex-wrap items-center gap-2 ${workspaceUi ? "justify-end sm:justify-start" : ""}`}>
              <button
                className={primaryBtn}
                onClick={() => void onGenerate()}
                disabled={isGenerating || intakeDictationPhase === "processing" || !intakeCombined.trim()}
              >
                {isGenerating
                  ? primaryBusyLabel
                  : simpleProductFlow
                    ? simpleProductFlowSubmitLabel
                    : workspaceUi
                      ? "Create Draft"
                      : "Create Draft"}
              </button>
            </div>
          </>
        )
      ) : null}

      {showFollowUpOnly ? (
        liveWorkspaceTwoPane ? (
          <>
            <div
              className="mb-3 flex rounded-lg border border-slate-800/90 bg-slate-950/40 p-1 lg:hidden"
              role="tablist"
              aria-label="Draft workspace view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileWorkspacePane === "edit"}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mobileWorkspacePane === "edit"
                    ? "bg-slate-800/90 text-emerald-200 shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setMobileWorkspacePane("edit")}
              >
                Edit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileWorkspacePane === "preview"}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  mobileWorkspacePane === "preview"
                    ? "bg-slate-800/90 text-emerald-200 shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setMobileWorkspacePane("preview")}
              >
                Preview
              </button>
            </div>

            <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
              <div className={mobileWorkspacePane === "edit" ? "block min-w-0" : "hidden min-w-0 lg:block"}>
                <div className="mt-2 space-y-5">
                  <div
                    className={
                      workspaceUi
                        ? "rounded-xl border border-slate-700/85 bg-slate-950 p-4 sm:p-5"
                        : "rounded border border-slate-700/80 bg-slate-950/90 px-3 py-2"
                    }
                  >
                    <p
                      className={
                        workspaceUi
                          ? "text-sm font-semibold text-slate-100 lg:text-[0.9375rem]"
                          : "text-xs font-semibold text-slate-100"
                      }
                    >
                      A few details needed to continue
                    </p>
                    <p
                      className={
                        workspaceUi
                          ? "mt-1 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:leading-[1.5] lg:text-slate-400"
                          : "mt-1 text-[11px] leading-relaxed text-slate-500"
                      }
                    >
                      Answer below to keep structuring your draft. Your description is saved in this session.
                    </p>
                    <div
                      className={
                        workspaceUi
                          ? "mt-3 max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm leading-relaxed text-slate-100 lg:text-[0.9375rem] lg:leading-[1.55]"
                          : "mt-3 max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm leading-relaxed text-slate-100"
                      }
                    >
                      {intakeCombined.trim() || "—"}
                    </div>
                    <button
                      type="button"
                      className={
                        workspaceUi
                          ? "mt-3 text-sm font-semibold text-emerald-400/95 hover:text-emerald-300 lg:text-[0.9375rem]"
                          : "mt-3 text-xs font-semibold text-emerald-400/95 hover:text-emerald-300"
                      }
                      onClick={handleFollowUpOrLegacyEditDescriptionClick}
                    >
                      Edit description
                    </button>
                  </div>

                  <div
                    className={
                      workspaceUi
                        ? "rounded-xl border border-slate-700/80 bg-slate-900/45 p-4 sm:p-5"
                        : "rounded border border-slate-700/80 bg-slate-900/50 p-3"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={
                          workspaceUi
                            ? "text-xs font-semibold uppercase tracking-wide text-slate-500 lg:text-sm lg:text-slate-400"
                            : "text-xs font-semibold uppercase tracking-wide text-slate-500"
                        }
                      >
                        Quick question
                      </div>
                      {followUpDetailTotal > 0 && missing.length > 0 ? (
                        <div
                          className="mt-0.5 shrink-0"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(followUpProgressRatio * 100)}
                          aria-label="Follow-up details progress"
                        >
                          <div className="h-[3px] w-[4.25rem] overflow-hidden rounded-full bg-slate-800/90 sm:w-[5.25rem]">
                            <div
                              className="h-full rounded-full bg-emerald-500/45 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
                              style={{ width: `${Math.round(followUpProgressRatio * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <p
                      className={
                        workspaceUi
                          ? "mt-1.5 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:leading-[1.5] lg:text-slate-400"
                          : "mt-1.5 text-[11px] leading-relaxed text-slate-500"
                      }
                    >
                      We need this to keep structuring your draft.
                    </p>
                    <div
                      className={
                        workspaceUi
                          ? "mt-3 text-sm font-medium leading-snug text-slate-100 lg:text-[0.9375rem] lg:leading-[1.45]"
                          : "mt-3 text-sm font-medium leading-snug text-slate-100"
                      }
                    >
                      {missingKey ? FIELD_QUESTION[missingKey] : null}
                    </div>
                    {missingKey && FIELD_CHIPS[missingKey].length > 0 ? (
                      <>
                        <p
                          className={
                            workspaceUi
                              ? "mt-4 text-xs font-medium text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:text-slate-400"
                              : "mt-4 text-[11px] font-medium text-slate-500"
                          }
                        >
                          Choose or type your answer
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3.5">
                          {FIELD_CHIPS[missingKey].map((chip) => (
                            <button
                              type="button"
                              key={chip}
                              className={
                                workspaceUi
                                  ? "min-h-[2.75rem] rounded-lg border border-slate-600 bg-slate-800/90 px-4 py-2.5 text-sm font-medium text-slate-50 transition-colors active:scale-[0.99] hover:border-emerald-500/55 hover:bg-slate-800 disabled:opacity-50 lg:min-h-[2.875rem] lg:text-[0.9375rem]"
                                  : "rounded-full border border-slate-600 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800/80"
                              }
                              onClick={() => void applyMissingAnswer(chip)}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    <div className={`mt-5 flex flex-col gap-3 sm:flex-row sm:items-end ${workspaceUi ? "" : "mt-3"}`}>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <VoiceAugmentedInput
                          wrapperClassName="min-w-0 w-full"
                          className={
                            workspaceUi
                              ? "min-h-[3.25rem] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 pb-10 pr-11 text-base leading-relaxed text-slate-50 caret-emerald-400 lg:text-[1.0625rem] lg:leading-[1.55]"
                              : "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 pb-8 pr-10 text-xs"
                          }
                          placeholder="Type your answer…"
                          value={missingAnswer}
                          onValueChange={setMissingAnswer}
                          onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
                          dictationControlRef={followUpDictationControlRef}
                          disabled={loading}
                          onKeyDown={handleFollowUpAnswerKeyDown}
                        />
                        {followUpEnterReady && missingAnswer.trim() && !loading ? (
                          <p
                            className={
                              workspaceUi
                                ? "text-xs leading-tight text-slate-600 lg:text-sm lg:leading-snug lg:text-slate-500"
                                : "text-[10px] leading-tight text-slate-600"
                            }
                          >
                            Press Enter
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={followUpContinueBtnClass}
                        onClick={() => void applyMissingAnswer(missingAnswer)}
                        disabled={loading || !missingAnswer.trim()}
                      >
                        {simpleProductFlow ? simpleProductFollowUpSubmitLabel : "Continue"}
                      </button>
                    </div>
                    <p
                      className={
                        workspaceUi
                          ? "mt-4 text-xs leading-relaxed text-slate-500 lg:text-sm lg:text-slate-400"
                          : "mt-4 text-[11px] leading-relaxed text-slate-500"
                      }
                    >
                      {FOLLOWUP_PLACEHOLDER_HELPER}
                    </p>
                    <button
                      type="button"
                      className={
                        workspaceUi
                          ? "btn mt-2 w-full rounded-lg border border-slate-600/80 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 hover:border-emerald-500/45 hover:bg-slate-800/80 disabled:opacity-50 sm:w-auto"
                          : "btn mt-2 w-full rounded border border-slate-600/80 bg-slate-800/40 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800/70 disabled:opacity-50"
                      }
                      disabled={loading}
                      onClick={() => void continueWithPlaceholderFill()}
                    >
                      Use placeholders
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={
                  mobileWorkspacePane === "preview"
                    ? `mt-4 block min-w-0 lg:mt-0${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`
                    : `mt-4 hidden min-w-0 lg:mt-0 lg:block${continuitySourcePanel ? " simple-flow-preview-continuity-fade" : ""}`
                }
              >
                {simpleProductFlow && liveWorkspaceTwoPane ? (
                  <p
                    className="mb-2 text-[11px] font-medium text-slate-500 sm:text-xs lg:text-[0.8125rem] lg:text-slate-400"
                    role="note"
                  >
                    Updates after you finish typing
                  </p>
                ) : null}
                <div
                  className="motion-reduce:transition-none"
                  style={simpleProductFlow && liveWorkspaceTwoPane ? livePreviewSurfaceStyle : undefined}
                >
                  <LiveAgreementPreview
                    model={displayLivePreviewModel}
                    intakeLen={intakeCombined.trim().length}
                    dictationPhase={isGenerating ? "idle" : intakeDictationPhase}
                    workspaceWorking={isGenerating}
                    formationPhase={formationPhaseForPreview}
                    {...livePreviewExtras}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-2 space-y-5">
            <div
              className={
                workspaceUi
                  ? "rounded-xl border border-slate-700/85 bg-slate-950 p-4 sm:p-5"
                  : "rounded border border-slate-700/80 bg-slate-950/90 px-3 py-2"
              }
            >
              <p
                className={
                  workspaceUi ? "text-sm font-semibold text-slate-100 lg:text-[0.9375rem]" : "text-xs font-semibold text-slate-100"
                }
              >
                A few details needed to continue
              </p>
              <p
                className={
                  workspaceUi
                    ? "mt-1 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:leading-[1.5] lg:text-slate-400"
                    : "mt-1 text-[11px] leading-relaxed text-slate-500"
                }
              >
                Answer below to keep structuring your draft. Your description is saved in this session.
              </p>
              <div
                className={
                  workspaceUi
                    ? "mt-3 max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm leading-relaxed text-slate-100 lg:text-[0.9375rem] lg:leading-[1.55]"
                    : "mt-3 max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5 text-sm leading-relaxed text-slate-100"
                }
              >
                {intakeCombined.trim() || "—"}
              </div>
              <button
                type="button"
                className={
                  workspaceUi
                    ? "mt-3 text-sm font-semibold text-emerald-400/95 hover:text-emerald-300 lg:text-[0.9375rem]"
                    : "mt-3 text-xs font-semibold text-emerald-400/95 hover:text-emerald-300"
                }
                onClick={handleFollowUpOrLegacyEditDescriptionClick}
              >
                Edit description
              </button>
            </div>

            <div
              className={
                workspaceUi
                  ? "rounded-xl border border-slate-700/80 bg-slate-900/45 p-4 sm:p-5"
                  : "rounded border border-slate-700/80 bg-slate-900/50 p-3"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={
                    workspaceUi
                      ? "text-xs font-semibold uppercase tracking-wide text-slate-500 lg:text-sm lg:text-slate-400"
                      : "text-xs font-semibold uppercase tracking-wide text-slate-500"
                  }
                >
                  Quick question
                </div>
                {followUpDetailTotal > 0 && missing.length > 0 ? (
                  <div
                    className="mt-0.5 shrink-0"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(followUpProgressRatio * 100)}
                    aria-label="Follow-up details progress"
                  >
                    <div className="h-[3px] w-[4.25rem] overflow-hidden rounded-full bg-slate-800/90 sm:w-[5.25rem]">
                      <div
                        className="h-full rounded-full bg-emerald-500/45 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
                        style={{ width: `${Math.round(followUpProgressRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <p
                className={
                  workspaceUi
                    ? "mt-1.5 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:leading-[1.5] lg:text-slate-400"
                    : "mt-1.5 text-[11px] leading-relaxed text-slate-500"
                }
              >
                We need this to complete your agreement.
              </p>
              <div
                className={
                  workspaceUi
                    ? "mt-3 text-sm font-medium leading-snug text-slate-100 lg:text-[0.9375rem] lg:leading-[1.45]"
                    : "mt-3 text-sm font-medium leading-snug text-slate-100"
                }
              >
                {missingKey ? FIELD_QUESTION[missingKey] : null}
              </div>
              {missingKey && FIELD_CHIPS[missingKey].length > 0 ? (
                <>
                  <p
                    className={
                      workspaceUi
                        ? "mt-4 text-xs font-medium text-slate-500 sm:text-[0.8125rem] lg:text-sm lg:text-slate-400"
                        : "mt-4 text-[11px] font-medium text-slate-500"
                    }
                  >
                    Choose or type your answer
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3.5">
                    {FIELD_CHIPS[missingKey].map((chip) => (
                      <button
                        type="button"
                        key={chip}
                        className={
                          workspaceUi
                            ? "min-h-[2.75rem] rounded-lg border border-slate-600 bg-slate-800/90 px-4 py-2.5 text-sm font-medium text-slate-50 transition-colors active:scale-[0.99] hover:border-emerald-500/55 hover:bg-slate-800 lg:min-h-[2.875rem] lg:text-[0.9375rem]"
                            : "rounded-full border border-slate-600 px-3 py-2 text-xs text-slate-100 hover:bg-slate-800/80"
                        }
                        onClick={() => void applyMissingAnswer(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <div className={`mt-5 flex flex-col gap-3 sm:flex-row sm:items-end ${workspaceUi ? "" : "mt-3"}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <VoiceAugmentedInput
                    wrapperClassName="min-w-0 w-full"
                    className={
                      workspaceUi
                        ? "min-h-[3.25rem] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 pb-10 pr-11 text-base leading-relaxed text-slate-50 caret-emerald-400 lg:text-[1.0625rem] lg:leading-[1.55]"
                        : "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 pb-8 pr-10 text-xs"
                    }
                    placeholder="Type your answer…"
                    value={missingAnswer}
                    onValueChange={setMissingAnswer}
                    onVoiceError={(m) => setVoiceError(humanizeVoiceErrorMessage(m))}
                    dictationControlRef={followUpDictationControlRef}
                    disabled={loading}
                    onKeyDown={handleFollowUpAnswerKeyDown}
                  />
                  {followUpEnterReady && missingAnswer.trim() && !loading ? (
                    <p
                      className={
                        workspaceUi
                          ? "text-xs leading-tight text-slate-600 lg:text-sm lg:leading-snug lg:text-slate-500"
                          : "text-[10px] leading-tight text-slate-600"
                      }
                    >
                      Press Enter
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={followUpContinueBtnClass}
                  onClick={() => void applyMissingAnswer(missingAnswer)}
                  disabled={loading || !missingAnswer.trim()}
                >
                  {simpleProductFlow ? simpleProductFollowUpSubmitLabel : "Continue"}
                </button>
              </div>
              <p
                className={
                  workspaceUi
                    ? "mt-4 text-xs leading-relaxed text-slate-500 lg:text-sm lg:text-slate-400"
                    : "mt-4 text-[11px] leading-relaxed text-slate-500"
                }
              >
                {FOLLOWUP_PLACEHOLDER_HELPER}
              </p>
              <button
                type="button"
                className={
                  workspaceUi
                    ? "btn mt-2 w-full rounded-lg border border-slate-600/80 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 hover:border-emerald-500/45 hover:bg-slate-800/80 disabled:opacity-50 sm:w-auto"
                    : "btn mt-2 w-full rounded border border-slate-600/80 bg-slate-800/40 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800/70 disabled:opacity-50"
                }
                disabled={loading}
                onClick={() => void continueWithPlaceholderFill()}
              >
                Use placeholders
              </button>
            </div>
          </div>
        )
      ) : null}

      {displayPhase === "generating_draft" && !liveWorkspaceTwoPane && !showFollowUpOnly ? (
        <p className="mt-4 text-center text-sm text-slate-400 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed lg:text-slate-300">
          {paneBusyMessage}
        </p>
      ) : null}
      {displayPhase === "hydrating_generated" && !liveWorkspaceTwoPane ? (
        <p className="mt-4 text-center text-sm text-slate-400 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed lg:text-slate-300">
          {hydrateBusyMessage}
        </p>
      ) : null}

      {displayPhase === "preparing_review" ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-900/95 px-10 py-8 shadow-xl">
            <span
              className="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400"
              aria-hidden
            />
            <p className="text-center text-sm font-medium text-slate-200">{hydrateBusyMessage}</p>
          </div>
        </div>
      ) : null}

      {premiumSendConfirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-6"
          role="presentation"
          onClick={() => {
            if (!loading) setPremiumSendConfirmOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-send-confirm-title"
            className="w-full max-w-md rounded-xl border border-slate-600/80 bg-slate-900 px-5 py-6 shadow-2xl shadow-black/40 sm:px-6 sm:py-7"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="premium-send-confirm-title" className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
              {effectivePremiumSendMode === "review" ? "Confirm review link" : "Confirm signing link"}
            </h2>
            {effectivePremiumSendMode === "signature" ? (
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-200 sm:text-[0.9375rem]">
                Final step before a tracked signing link goes out.
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-200 sm:text-[0.9375rem]">
                Final step before a review link goes out.
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-[0.9375rem]">
              {effectivePremiumSendMode === "review"
                ? "A secure review link will go to:"
                : "A secure signing link will go to:"}
            </p>
            {effectivePremiumSendMode === "signature" ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-2.5 py-1 text-slate-300">
                  Recipients confirmed
                </span>
                <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-2.5 py-1 text-slate-300">
                  Signer tracking enabled
                </span>
                <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-2.5 py-1 text-slate-300">
                  Proof record available
                </span>
              </div>
            ) : null}
            <ul className="mt-3 list-none space-y-1.5 text-left text-sm text-slate-200 sm:text-[0.9375rem]">
              {[recipient1Email, recipient2Email]
                .map((e) => String(e ?? "").trim())
                .filter((e) => looksLikeEmail(e))
                .map((e) => (
                  <li key={e} className="flex gap-2">
                    <span className="shrink-0 text-slate-500" aria-hidden>
                      •
                    </span>
                    <span className="break-all">{e}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">
              {effectivePremiumSendMode === "review"
                ? "They can read the agreement and request changes. Nothing is emailed until you confirm below."
                : "They read the final terms, then sign when ready. Nothing is emailed until you confirm below."}
            </p>
            {draft ? (
              <div className="mt-4 rounded-lg border border-slate-700/60 bg-slate-950/70 px-3.5 py-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  {(draft.title || "").trim() || "Your agreement"}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Parties</p>
                <p className="mt-1 text-sm text-slate-200">
                  <span className="font-medium text-slate-100">
                    {(draft.parties?.[0]?.name || "").trim() || "Party A"}
                  </span>
                  <span className="mx-1.5 text-slate-500" aria-hidden>
                    ↔
                  </span>
                  <span className="font-medium text-slate-100">
                    {(draft.parties?.[1]?.name || "").trim() || "Party B"}
                  </span>
                </p>
              </div>
            ) : null}
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-left text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
                checked={premiumSendCcSelf}
                onChange={(e) => setPremiumSendCcSelf(e.target.checked)}
              />
              <span>Send me a copy</span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                className="min-h-[2.65rem] w-full rounded-lg border border-slate-600/70 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
                disabled={loading}
                onClick={() => setPremiumSendConfirmOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="min-h-[2.65rem] w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-60 sm:w-auto sm:min-w-[11rem]"
                disabled={loading}
                onClick={() => {
                  if (loading) return;
                  if (premiumSendCcSelf) {
                    logProductEvent("create_flow_cta_clicked", {
                      cta_click_type: "send_cc_self",
                      surface: "premium_send_confirm_modal",
                    });
                  }
                  setPremiumSendConfirmOpen(false);
                  void onGenerate();
                }}
              >
                {effectivePremiumSendMode === "review" ? "Confirm and send review link" : "Confirm and send signing link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hardErrorForUi ? (
        <div
          className={`mt-4 rounded-lg border px-3 py-3 text-sm sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed ${
            errorIsHydrate
              ? "border-rose-900/50 bg-rose-950/20 text-rose-200"
              : "border-slate-700/85 bg-slate-900/55 text-slate-300"
          }`}
          role="alert"
        >
          <p className="whitespace-pre-line leading-relaxed">{hardErrorForUi}</p>
          {hardErrorForUi.includes("Retry loading below") ? null : (
            <button
              type="button"
              className={
                workspaceUi
                  ? `btn mt-3 w-full min-h-[2.75rem] rounded-lg border px-4 text-[0.9375rem] font-semibold sm:w-auto lg:text-base ${
                      errorIsHydrate
                        ? "border-rose-800/60 bg-rose-950/40 text-rose-100 hover:border-rose-700/70 hover:bg-rose-950/55"
                        : "border-slate-600/80 bg-slate-800/70 text-slate-100 hover:border-slate-500/70 hover:bg-slate-800/90"
                    }`
                  : `btn mt-3 rounded border px-3 py-2 text-sm font-medium ${
                      errorIsHydrate
                        ? "border-rose-800/50 bg-rose-950/30 text-rose-100 hover:bg-rose-950/45"
                        : "border-slate-600/70 bg-slate-800/60 text-slate-100 hover:bg-slate-800/80"
                    }`
              }
              onClick={() => {
                setHardError(null);
                textareaRef.current?.focus();
              }}
            >
              Try again
            </button>
          )}
        </div>
      ) : null}
      {voiceError ? (
        <div className="mt-2 text-sm text-rose-300 sm:text-[0.9375rem] md:text-base lg:text-[1.0625rem] lg:leading-relaxed">
          {voiceError}
        </div>
      ) : null}
      {workspaceUi && !hideWorkspaceComplianceFootnote ? (
        <p className="mt-6 text-center text-xs leading-snug text-slate-500 sm:text-[0.75rem] md:text-sm lg:text-[0.875rem] lg:leading-relaxed lg:text-slate-400">
          Outputs are structured drafts for your review — refine, then continue to send or sign when ready.{" "}
          {STRUCTURED_DRAFT_ASSIST_SHORT} {PRODUCT_NOT_LAW_FIRM} {NO_ATTORNEY_CLIENT}
        </p>
      ) : null}
      {createProductionTwoPane && simpleProductFlow && recipientPartyDetailsModalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="claw-recipient-party-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => {
              partyDetailsModalPendingResumeRef.current = null;
              setRecipientPartyDetailsModalOpen(false);
            }}
          />
          <div className="relative z-[1] w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-950 p-5 shadow-2xl sm:p-6">
            <h2 id="claw-recipient-party-modal-title" className="text-lg font-semibold tracking-tight text-slate-50">
              Add recipient details
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Legal names as they should appear on the agreement. You can add or adjust emails before sending.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p1-name">
                  Party 1 name
                </label>
                <input
                  id="claw-modal-p1-name"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty1Name}
                  onChange={(e) => setModalParty1Name(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p1-email">
                  Party 1 email
                </label>
                <input
                  id="claw-modal-p1-email"
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty1Email}
                  onChange={(e) => setModalParty1Email(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p1-role">
                  Role (optional)
                </label>
                <input
                  id="claw-modal-p1-role"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty1Role}
                  onChange={(e) => setModalParty1Role(e.target.value)}
                  placeholder="e.g. Client"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p2-name">
                  Party 2 name
                </label>
                <input
                  id="claw-modal-p2-name"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty2Name}
                  onChange={(e) => setModalParty2Name(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p2-email">
                  Party 2 email (optional)
                </label>
                <input
                  id="claw-modal-p2-email"
                  type="email"
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty2Email}
                  onChange={(e) => setModalParty2Email(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="claw-modal-p2-role">
                  Role (optional)
                </label>
                <input
                  id="claw-modal-p2-role"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                  value={modalParty2Role}
                  onChange={(e) => setModalParty2Role(e.target.value)}
                  placeholder="e.g. Consultant"
                />
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-900"
                onClick={() => {
                  partyDetailsModalPendingResumeRef.current = null;
                  setRecipientPartyDetailsModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                onClick={() => commitRecipientPartyDetailsModal()}
              >
                Save and continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {createProductionTwoPane && simpleProductFlow ? (
        <AdvancedFullDraftPaywallModal
          open={advancedFullDraftPaywallOpen}
          onClose={() => {
            setAdvancedFullDraftPaywallOpen(false);
          }}
          onStayWithStarter={dismissPaywallStayStarter}
          onContinueToCompleteVersion={beginAdvancedFullDraftCheckout}
          onViewPlans={beginAdvancedFullDraftBilling}
          contextReasons={upgradeContextReasons}
          agreementPreviewText={
            agreementDocumentText.trim() || (draft ? buildPreviewForCurrentTier(draft) : "")
          }
        />
      ) : null}
    </section>
  );
};

export default AgreementBuilderIntake;
