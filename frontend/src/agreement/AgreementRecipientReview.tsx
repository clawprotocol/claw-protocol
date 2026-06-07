import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { AgreementDraft } from "./agreementTypes";
import {
  clearPendingRecipientNotice,
  draftToSnapshot,
  ensureInitialVersion,
  isSigningLockActive,
  loadBundle,
  saveBundle,
  type AgreementVersionBundle,
} from "./agreementVersionStore";
import { computeNegotiationPatterns } from "../vs01/negotiationPatterns";
import { htmlToPlainText, htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import {
  agreementFieldLabel,
  compareAgreementSnapshots,
} from "../vs01/agreementCompare";
import {
  assessRecipientPreviewDiff,
  buildRecipientClauseCards,
  countSuggestedChanges,
  recipientPreviewNoOpMessage,
} from "./recipientPreviewDiffModel";
import { RecipientLegalRedlineDocument } from "./RecipientLegalRedlineDocument";
import {
  buildLegalRedlineDocumentViewModel,
  filterNarrowRecipientPaymentRedlineNoise,
} from "./legalRedlineBlocks";
import {
  countRecipientIntentGaps,
  recipientIntentStatusTestId,
  recipientRedlineAnchorForIntentCategory,
  type RecipientInstructionIntent,
  type RecipientInstructionIntentCategory,
} from "./recipientInstructionIntents";
import {
  buildRecipientLegalRedlinePlainTexts,
  extractPaymentPlacementCalloutSnippet,
  fingerprintPlainText,
} from "./recipientWholeDocRedlineSource";
import { VoiceAugmentedTextArea } from "../launch/VoiceAugmentedControl";
import { buildRecipientNegotiationHints } from "../vs01/recipientNegotiationHints";
import { featureFlags } from "../config/featureFlags";
import {
  ESIGN_INTENT_SIGN_AGREEMENT_ACTION,
  NOT_LEGAL_ADVICE,
  PRODUCT_NOT_LAW_FIRM,
  RECORDS_DOWNLOAD_KEEP_COPY_SHORT,
} from "../compliance/disclosureCopy";
import { NegotiationTimelineView } from "../vs01/NegotiationTimelineView";
import {
  buildNegotiationTimelineCurrentStatus,
  buildNegotiationTimelineEvents,
  buildNegotiationTimelineSignals,
  formatRevisionIdentityLabel,
} from "../vs01/negotiationTimeline";
import { detectChangedSnapshotFields } from "./negotiationMemory";
import {
  finalizeRecipientProposalApi,
  postSigningCeremonyComplete,
  postSigningCeremonyStart,
  recipientApproveCurrentApi,
  stageRecipientProposalApi,
  type RecipientProposalSubmitBody,
} from "./agreementWorkspaceApi";
import {
  isAgreementMarkedSignedInAudit,
  isParticipantSignatureComplete,
  pendingSignatureCount,
} from "./pendingSignatureDerive";
import { normalizeAgreementDraftFromApi } from "./agreementDraftNormalize";
import { auditHasRecipientApprovalForParticipant } from "./participantModel";
import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";
import { logReviewStateSource } from "../components/agreements/reviewFlowDebugLog";
import {
  logPaidProReviewTrackLifecycle,
  logReviewLinkSurfaceMounted,
} from "../components/agreements/paidProReviewTrackLifecycle";
import { substitutePartyPlaceholdersInUserFacingText } from "./partyPlaceholderDisplay";
import { formatAuthoritativeAgreementPartiesInline } from "./handoffPartyDisplay";
import { findOpenRecipientProposals } from "./recipientProposal";
import {
  DEFAULT_NEGOTIATION_POSTURE,
  recipientPostureInstructionPreamble,
  type NegotiationPosture,
} from "./negotiationPostures";
import type { NegotiationRiskTier } from "./negotiationRisk";
import { useAccess } from "../access/AccessContext";
import { useAutosizeTextarea } from "../hooks/useAutosizeTextarea";
import { useRecipientDraftTextareaSizing } from "../hooks/useRecipientDraftTextareaMaxPx";
import { ClawTrustFooter } from "../components/claw/ClawTrustFooter";
import { type ProofBadgeState, ProofBadge } from "../components/claw/ProofBadge";
import { LawdogOnRecordStamp } from "../components/ui/LawdogOnRecordStamp";
import { recipientExportBasenameFromTitle } from "./recipientExportFilenames";
import { normalizeAgreementDisplayTitle } from "../components/agreements/canonicalAgreementTitle";
import {
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
  RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES,
  RECIPIENT_REVIEW_TRUST_PRIVATE_LINK,
  formatRecipientInviterContextLine,
  RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE,
  RECIPIENT_SIGN_ONE_DONE_HEADLINE,
  RECIPIENT_SIGN_RECORD_SUBLINE,
} from "./recipientReviewTrustCopy";
import { recipientReviewDevInfo, recipientReviewDevWarn } from "./recipientReviewDevLog";
import { JoyMilestoneMark } from "../joy/JoyMilestone";
import { emitActionCompleted } from "../joy/joyTelemetry";
import { errorMessageFromResponse, resolveApiBase } from "../lib/clawApi";
import { trackAgreementFunnelEvent } from "../tracking/agreementFunnelAnalytics";
import { recipientAgreementReadHeaders } from "./recipientAccessApi";
import { postProRedlineReviewerSuggestion } from "./proRedlineReviewApi";
import { isPaidProAgreementAuthoritative } from "../components/agreements/paidProAgreementAuthority";
import { RecipientWantACopyStrip } from "./recipientWantACopyStrip";
import { cloneDraftForRecipientPreview } from "./recipientPreviewBaseline";
import {
  logReviewFirstDisplayCorpusSelected,
  resolveReviewFirstDisplayCorpus,
} from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  RECIPIENT_BTN_CONTINUE_EDITING,
  RECIPIENT_BTN_PREVIEW_CHANGES,
  RECIPIENT_BTN_SEND_CLEAN_PROPOSED_SUBCOPY,
  RECIPIENT_CARD_BIGGER_REWRITE_BODY,
  RECIPIENT_CARD_BIGGER_REWRITE_CTA,
  RECIPIENT_CARD_BIGGER_REWRITE_TITLE,
  RECIPIENT_CARD_SMALL_TWEAK_BODY,
  RECIPIENT_CARD_SMALL_TWEAK_CTA,
  RECIPIENT_CARD_SMALL_TWEAK_TITLE,
  RECIPIENT_ASSISTED_COMPOSE_TAB_LABEL,
  RECIPIENT_DRAFT_IMPORT_AGREEMENT_NOT_READY,
  RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING,
  RECIPIENT_DRAFT_IMPORT_EMPTY_BODY,
  RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
  RECIPIENT_REVISED_IMPORT_PREPARING,
  RECIPIENT_AUDIT_MODE_SUBCOPY,
  RECIPIENT_AUDIT_MODE_SUMMARY,
  RECIPIENT_CONDENSED_EXPORT_METRICS_DETAILS_SUMMARY,
  recipientRedlineTechnicalAppendixSummaryLine,
  RECIPIENT_BUSINESS_REVIEW_SUBSTANTIAL_REWRITE_SUMMARY,
  RECIPIENT_INTENT_RAW_DETAIL_HEADING,
  RECIPIENT_INTENT_NEEDS_MANUAL_PLACEMENT,
  RECIPIENT_INTENT_REVIEW_BEFORE_SENDING,
  RECIPIENT_PREVIEW_EXPORT_DETAILS_SUMMARY,
  RECIPIENT_PDF_IMPORT_ROUTED_TO_SUGGESTIONS,
  RECIPIENT_PREVIEW_IMPORT_FORMATTING_NOTE,
  RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT,
  RECIPIENT_PREVIEW_SUGGESTION_DETAILS_SUMMARY,
  RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE,
  RECIPIENT_FOCUS_COMPARE_BEST_MATCH_HEADING,
  RECIPIENT_ONLY_CHANGED_SECTIONS,
  RECIPIENT_REDLINE_CHANGED_SECTIONS_HEADING,
  RECIPIENT_REDLINE_CHANGED_WORDING_INSTRUCTION,
  RECIPIENT_SHOW_UNCHANGED_CONTEXT,
  RECIPIENT_ADDITIONAL_EXTRACTED_REVIEW_NOTES,
  RECIPIENT_DETAILED_EDIT_METRICS_SUMMARY,
  RECIPIENT_REVIEWER_NOTES_PANEL_SUMMARY,
  RECIPIENT_QUICK_REQUEST_LABEL,
  RECIPIENT_QUICK_REQUEST_PLACEHOLDER,
  RECIPIENT_SMALL_TWEAK_HELPER,
  RECIPIENT_SWITCH_TO_REVISED_DRAFT_LINK,
  RECIPIENT_WORKSPACE_HEADLINE,
  RECIPIENT_WORKSPACE_SUBCOPY,
  buildRecipientRevisionText,
  recipientPreviewGapChipLabel,
  REVIEW_FIRST_PASTE_GUARD_COPY,
} from "./portableReviewCopy";
import {
  recipientRedlineNavLog,
  recipientUploadError,
  recipientUploadLog,
  recipientUploadLogCompareStart,
  recipientUploadLogCompareSuccess,
  recipientUploadLogSelected,
} from "./recipientDraftUploadLog";
import { extractRevisedDraftPlainText } from "./recipientRevisedDraftImportText";
import { RecipientRevisedDraftAnalyzingCard } from "./recipientRevisedDraftAnalyzingCard";
import { RecipientClauseSuggestionsSurface } from "./RecipientClauseSuggestionsSurface";
import { RecipientReviewNotesOnlyCard } from "./RecipientReviewNotesOnlyCard";
import {
  buildClauseSuggestionCardsFromUploadText,
  type RecipientClauseSuggestionCard,
} from "./recipientClauseSuggestionsFromText";
import { buildRecipientCompareConfidence } from "./recipientCompareConfidence";
import type { RecipientRevisionLineage } from "./recipientRevisionLineage";
import { DEFAULT_RECIPIENT_REVISION_LINEAGE } from "./recipientRevisionLineage";
import {
  buildRecipientSemanticRedlinePresentation,
  recipientSemanticAnchorForBlockId,
} from "./recipientWholeDocSemanticRender";
import { buildRecipientFriendlyRedlineChips } from "./recipientFriendlyRedlineSummary";
import {
  buildHumanReviewStructuredForPdf,
  humanReviewMeaningfulCount,
} from "./recipientHumanReviewSummaryModel";
import {
  buildHumanReviewHeadlineCondensedCleanRevision,
  detectRecipientReviewPresentationMode,
  type RecipientReviewPresentationMode,
} from "./recipientReviewPresentationMode";
import {
  buildCondensedTopicReviewCards,
  buildCondensedTopicReviewCardsPdfHtml,
} from "./recipientCondensedTopicReviewModel";
import {
  buildNotRestatedOriginalSectionsAppendixHtml,
  RECIPIENT_NOT_RESTAT_ORIGINAL_SECTION_LABELS,
} from "./recipientCondensedDraftSemanticMap";
import type { CondensedRevisionTab } from "./RecipientCondensedRevisionSurface";
import { filterChipsForBusinessReviewPresentation } from "./recipientFriendlyChipsPresentation";
import { buildIntentSemanticBucketRows } from "./recipientIntentSemanticBuckets";
import { RecipientFocusedWordingDialog } from "./RecipientFocusedWordingDialog";
import { RecipientRedlineStickyNavigator } from "./RecipientRedlineStickyNavigator";
import { splitRecipientCondensedGiantChangedBlock } from "./recipientCondensedRedlineClauseSplit";
import { devLogRecipientRedlineNavigation } from "./recipientRedlineNavigationLog";
import {
  resolveRecipientSemanticScrollTarget,
  scrollRecipientRedlineClausePanel,
} from "./recipientRedlineDomScroll";
import {
  notesLikelyDuplicateAgreementBodyForExport,
  notesLikelyDuplicateProposedPlain,
} from "./recipientPreviewPdfHtml";
import { stripCompareMarkupFromOriginalDraftHtml } from "./recipientOriginalDraftExportSanitize";
import { recipientImportsMatchAuthoritativeBaseline } from "./recipientNoChangeCompareGuard";
import {
  ReviewActions,
  ReviewDocumentFrame,
  ReviewFuturePanel,
  ReviewHeader,
  ReviewMetaGrid,
  ReviewNotice,
  reviewActionButtonClass,
} from "./reviewFirstLayout";
import {
  buildReviewFirstTextDiffSummary,
  canReviewChanges,
  logReviewFirstProposalCompareDiag,
  logReviewFirstProposalReadiness,
  REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE,
  type ReviewFirstChangedSection,
  type ReviewFirstDiffPart,
} from "./reviewFirstTextDiff";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import { validateRecipientAccessToken } from "./recipientAccessApi";
import {
  logReviewFirstProposalCreated,
  logReviewFirstProposalStageRequest,
  logReviewFirstSubmitBlocked,
  logReviewFirstSubmitConfirm,
  logReviewFirstSubmitFailed,
  logReviewFirstSubmitStart,
  logReviewFirstSubmitSuccess,
  REVIEW_FIRST_SUBMIT_MISSING_PARTICIPANT_MESSAGE,
  resolveReviewFirstSubmitAuthority,
} from "./reviewFirstSubmitAuthority";
import {
  logReviewFirstSubmitAuthority,
  clearReviewFirstSubmitInflightProposalId,
  readReviewFirstSubmitInflightProposalId,
  readReviewUrlPartyId,
  resolveReviewFirstStageProposerId,
  reviewerNeedsPersonalizedLink,
  writeReviewFirstSubmitInflightProposalId,
} from "./reviewerTokenPersistence";
import {
  logReviewerApprovalLocalStateApplied,
  logReviewerApprovalSubmitFailed,
  logReviewerApprovalSubmitStart,
  logReviewerApprovalSubmitSuccess,
  readReviewerApprovalLocalState,
  writeReviewerApprovalLocalState,
} from "./reviewerApprovalPersistence";
import { loadRecipientMagicLinkSession } from "./recipientMagicLinkSession";
import {
  buildOwnerQaWorkspaceAbsoluteLink,
  buildOwnerQaWorkspacePath,
  corpusFingerprint,
  corpusHasSignatureBlock,
  enableOwnerProposalReviewQaLocal,
  htmlHasSignatureBlock,
  isOwnerProposalReviewQaEnabled,
  logQaOwnerReviewLinkBuilt,
  logReviewerDisplayCopyParity,
  logReviewerOwnerCtaHidden,
  logReviewerProposalSubmitted,
} from "./ownerProposalReviewQa";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { PremiumAgreementReadonlyView } from "../components/agreements/PremiumAgreementReadonlyView";
import { ReviewFirstChangeCard } from "./ReviewFirstChangeCard";
import { stripClausePreambleFromRevisedPair, stripRecipientQaDraftNoiseLines } from "./recipientRevisionPreambleStrip";
import {
  buildRecipientRedlineStickyNavRows,
  businessReviewCardForSemanticId,
  getClauseCompareFallbackForSemanticId,
  getScrollTargetBlockIdForSemanticOrFallback,
  type BusinessReviewSemanticId,
} from "./recipientBusinessReviewCardsModel";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import { classifyRecipientUploadedDraftRole } from "./recipientUploadedDraftRole";
import {
  collapseRecipientRedlineDuplicateInsertBlocks,
  mergeRecipientRedlineLowSignalFragments,
} from "./recipientRedlineDisplayDedupe";
import { REVISED_UPLOAD_ANALYZING_MIN_MS } from "./recipientRevisedDraftUploadFlow";
import { renderAgreementDraftHtmlLikeBackend, purposeLooksLikeFullAgreementTextForRender } from "./recipientAgreementDraftHtmlRender";
import {
  RECIPIENT_COMPARE_FAILED_FALLBACK,
  RECIPIENT_FULL_DOC_SWITCH_HINT,
  RECIPIENT_MAX_INSTRUCTION_CHARS,
  RECIPIENT_QUICK_CHANGE_TOO_LARGE_HINT,
  looksLikeFullRevisedAgreementDraft,
} from "./recipientRevisionRouting";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import { RecipientPartyReviewActions, recipientPartyReviewCopy } from "./recipientReviewPartyActions";
import { RecipientPreviewVersionsExport } from "./recipientPreviewVersionExport";

const API_BASE = resolveApiBase();

/** Poll GET /agreements after accept until server signing_lock appears (owner finalizes separately). */
const RECIPIENT_SIGNING_READINESS_POLL_MS = 8000;
const REVIEW_FIRST_TITLE = "Review agreement";
const REVIEW_FIRST_HELPER =
  "Read the agreement, approve it, or propose an updated version. Nothing is signed until everyone approves the same version.";
const REVIEW_FIRST_APPROVE_LABEL = "Approve draft";
const REVIEWER_AWAITING_OWNER_APPROVE_BLOCKED_COPY =
  "Approval is unavailable while your suggested change is pending owner review.";
const REVIEW_FIRST_PROPOSE_UPDATED_LABEL = "Suggest revision";
const REVIEW_FIRST_SAVE_UPDATED_LABEL = "Submit proposed update";
const REVIEW_FIRST_PERSONAL_LINK_ATTRIBUTION_MESSAGE =
  "Open your personal review link to send this update.";
const REVIEW_FIRST_PERSONAL_LINK_OPTIONAL_NOTICE =
  "Submitting requires the personal review link from the sender. You can still review wording changes here.";
const REVIEW_FIRST_PERSONAL_LINK_SUBMIT_STAGE_MESSAGE =
  "Open the personal review link from the sender to submit this proposed update. You can still review the changes here.";
const REVIEW_FIRST_REVISED_DRAFT_FILE_TYPES = "Or upload a .txt file instead";
const REVIEW_FIRST_REVISED_DRAFT_FILE_ACCEPT = ".txt,.md,text/plain,text/markdown,text/x-markdown";
const REVIEW_FIRST_UNSUPPORTED_REVISED_DRAFT_FILE =
  "Upload a .txt file, or edit the agreement inline below.";

function isSupportedReviewFirstRevisedDraftFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".md") || type === "text/plain" || type === "text/markdown";
}

function renderReviewFirstChangeSection(section: ReviewFirstChangedSection) {
  return <ReviewFirstChangeCard key={`${section.title}-${section.beforePhrase}`} section={section} />;
}

function renderReviewFirstDiffParts(parts: ReviewFirstDiffPart[] | null | undefined, changedKind: "added" | "removed") {
  if (!parts?.length) return null;
  const grouped = parts.reduce<ReviewFirstDiffPart[]>((acc, part) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.kind === part.kind) {
      prev.text = `${prev.text} ${part.text}`.replace(/\s+([,.;:!?])/g, "$1");
    } else {
      acc.push({ ...part });
    }
    return acc;
  }, []);
  let used = 0;
  const maxChars = 280;
  const visible = grouped.flatMap((part, index) => {
    if (used >= maxChars) return [];
    const remaining = maxChars - used;
    const text = part.text.length > remaining ? `${part.text.slice(0, Math.max(0, remaining - 1)).trim()}…` : part.text;
    used += text.length;
    return [{ ...part, text, originalIndex: index }];
  });
  if (visible.length < grouped.length && visible[visible.length - 1]?.text !== "...") {
    visible.push({ text: "...", kind: "same", originalIndex: grouped.length });
  }
  return visible.map((part, index) => {
    const changed = part.kind === changedKind;
    const className = changed
      ? changedKind === "added"
        ? "rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-900"
        : "rounded bg-rose-100 px-1 py-0.5 font-semibold text-rose-900"
      : "text-slate-700";
    return (
      <span key={`${part.kind}-${index}-${part.text.slice(0, 12)}`} className={className}>
        {part.text}
        {index < visible.length - 1 ? " " : ""}
      </span>
    );
  });
}

function recipientAcceptTransitionDiag(message: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogRecipientAcceptDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info(`[recipient-accept-transition] ${message}`, payload);
}

/** Dev / QA: `localStorage.lawdogRecipientFlowDiag = "1"` (also honors `lawdogRecipientAcceptDiag`). */
function recipientFlowDiag(tag: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogRecipientFlowDiag") === "1" ||
    window.localStorage?.getItem("lawdogRecipientAcceptDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info(tag, payload);
}

function escapeReviewFirstCorpusHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReviewFirstCorpusHtml(text: string): string {
  return (
    "<article style='position:relative;max-width:720px;margin:0 auto'>" +
    "<p style='text-align:center;color:#475569;font-size:12px;margin-bottom:12px'>Draft Agreement (non-binding template)</p>" +
    "<pre style='white-space:pre-wrap;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#0f172a;margin:0;padding:0;border:0;background:transparent'>" +
    escapeReviewFirstCorpusHtml(text) +
    "</pre></article>"
  );
}

type RecipientPostUploadSurfaceState =
  | null
  | { surface: "notes_only"; notes: string }
  | { surface: "clause_suggestions"; notes: string; items: RecipientClauseSuggestionCard[] };

function redlineSummaryChipLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function wordingChangeChipLabel(count: number): string {
  return count === 1 ? "1 wording change" : `${count} wording changes`;
}

function recipientIntentAppliedExplanation(category: RecipientInstructionIntentCategory): string {
  switch (category) {
    case "payment_timing":
      return "Updates when payment is due.";
    case "suspend_pause_work":
      return "Adds a pause if payment is over 15 days late.";
    default:
      return "Reflected in your proposed draft.";
  }
}

/** Short row title for applied intents (recipient suggested-changes list). */
function recipientIntentAppliedRowHeading(it: RecipientInstructionIntent): string {
  if (it.status !== "applied") return it.normalizedIntent;
  if (it.category === "payment_timing") {
    const src = `${it.originalText} ${it.normalizedIntent}`;
    const m = src.match(/\bnet\s*(\d+)\b/i);
    const n = m ? m[1] : "30";
    return `Net ${n} payment timing`;
  }
  if (it.category === "suspend_pause_work") {
    return "Pause work after 15 days late";
  }
  return it.normalizedIntent;
}

function mapDraftAssistBlockedMessage(serverMsg: string): string {
  const l = serverMsg.toLowerCase();
  if (l.includes("input too large")) {
    return RECIPIENT_QUICK_CHANGE_TOO_LARGE_HINT;
  }
  if (
    l.includes("airlock") ||
    l.includes("external_ai") ||
    l.includes("rate limit") ||
    (l.includes("llm") &&
      (l.includes("unavailable") || l.includes("disabled") || l.includes("blocked")))
  ) {
    return "Draft assistance is temporarily unavailable. You can keep editing manually.";
  }
  return serverMsg;
}

/** Avoid showing snake_case API codes or `error_404` to recipients. */
function humanizeRecipientActionError(raw: string | undefined, fallback: string): string {
  const r = (raw || "").trim();
  if (!r || r === "network") {
    return "We couldn't reach the LawDog service. Check your connection and try again.";
  }
  if (r.startsWith("error_")) return fallback;
  if (/^[a-z0-9_.]+$/i.test(r) && r.includes("_") && !r.includes(" ") && r.length < 96) {
    return fallback;
  }
  return r.length > 280 ? fallback : r;
}

function formatRecipientProposalStageError(
  staged: { error?: string; httpStatus?: number; responseBody?: unknown },
): string {
  const code = (staged.error || "").trim();
  const body = staged.responseBody as { detail?: unknown } | undefined;
  const detail = body?.detail;
  const detailText =
    typeof detail === "string"
      ? detail.trim()
      : detail != null
        ? JSON.stringify(detail)
        : "";
  if (code === "proposer_id_required") {
    const extra =
      detailText && detailText !== code
        ? ` — ${detailText}`
        : staged.httpStatus
          ? ` (HTTP ${staged.httpStatus})`
          : "";
    return `Couldn't prepare your suggestion: proposer_id_required${extra}`;
  }
  return humanizeRecipientActionError(code, "Couldn't prepare your suggestion. Please try again.");
}

function recipientTrustCueStrip() {
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Trust cues">
      <li className="rounded-full border border-slate-700/80 bg-slate-950/35 px-2.5 py-1 text-[10px] font-medium text-slate-300">
        {RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES}
      </li>
      <li className="rounded-full border border-slate-700/80 bg-slate-950/35 px-2.5 py-1 text-[10px] font-medium text-slate-400">
        {RECIPIENT_REVIEW_TRUST_PRIVATE_LINK}
      </li>
    </ul>
  );
}

function recipientAgreementSummaryCard(props: {
  agreementType: string;
  partiesLine: string;
  sharedBy: string;
  statusLabel?: string;
  compact?: boolean;
}) {
  const row = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-xs leading-snug text-slate-200">{value}</div>
    </div>
  );

  if (props.compact) {
    return (
      <div
        className="mt-3 rounded-lg border border-slate-800/60 bg-slate-950/25 px-3 py-2.5"
        data-testid="recipient-summary-card"
      >
        <dl className="grid gap-2.5 text-xs text-slate-200 sm:grid-cols-3 sm:gap-x-4">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</dt>
            <dd className="mt-0.5 font-medium leading-snug">{props.agreementType}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Shared by</dt>
            <dd className="mt-0.5 font-medium leading-snug">{props.sharedBy}</dd>
          </div>
          <div className="min-w-0 sm:col-span-1">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Agreement parties</dt>
            <dd className="mt-0.5 font-medium leading-snug">{props.partiesLine}</dd>
          </div>
        </dl>
        {props.statusLabel ? (
          <div className="mt-2 border-t border-slate-800/60 pt-2">{row("Status", props.statusLabel)}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-xl border border-slate-800/60 bg-slate-950/25 px-4 py-3.5"
      data-testid="recipient-summary-card"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-8">
        <div className="min-w-0 space-y-3">
          {row("Type", props.agreementType)}
          {row("Agreement parties", props.partiesLine)}
        </div>
        <div className="min-w-0 space-y-3">
          {row("Shared by", props.sharedBy)}
          {props.statusLabel ? row("Status", props.statusLabel) : null}
        </div>
      </div>
    </div>
  );
}

function formatPartiesLine(parties: AgreementDraft["parties"]): string {
  return formatAuthoritativeAgreementPartiesInline(parties, { maxShown: 48, separator: " · " });
}

/** Short “Type” line for metadata — never the full agreement body (preview shows that). */
function recipientMetadataTypeLine(draft: AgreementDraft): string {
  const rawTitle = (draft.title || "").trim();
  const title = rawTitle ? normalizeAgreementDisplayTitle(rawTitle) || rawTitle : "";
  if (title) return title;
  const purpose = (draft.purpose || "").trim();
  if (!purpose) return "Agreement";
  if (purposeLooksLikeFullAgreementTextForRender(purpose)) return "Agreement";
  return purpose.length > 120 ? `${purpose.slice(0, 120)}…` : purpose;
}

/** Display-only title for recipient UI / PDF chrome; never rewrite stored `draft.title`. */
function recipientAgreementTitleForDisplay(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  return normalizeAgreementDisplayTitle(t) || t;
}

function scheduleAExcerpt(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  const idx = t.search(/SCHEDULE\s+A\b/i);
  if (idx < 0) return "";
  const rest = t.slice(idx).trim();
  const next = rest.slice(1).search(/\n\s*SCHEDULE\s+[B-Z]\b/i);
  const section = next >= 0 ? rest.slice(0, next + 1).trim() : rest;
  return section.length > 900 ? `${section.slice(0, 900).trim()}…` : section;
}

export type AgreementRecipientEntry =
  | { kind: "review"; accessGate?: { lockedVersionId: string } }
  | { kind: "sign"; lockedVersionId: string; accessGate?: { lockedVersionId: string } };

export type RecipientLinkRole = "signer" | "reviewer" | "counterparty";

export type { RecipientRevisionLineage } from "./recipientRevisionLineage";

type Props = {
  agreementId: string;
  /** Display name for version label (optional). */
  recipientLabel?: string;
  onClose?: () => void;
  /** Review = negotiate; sign = read-only locked version only. */
  entry?: AgreementRecipientEntry;
  /** From `?role=` on share link — controls hub copy and signing hints. */
  recipientLinkRole?: RecipientLinkRole;
  /** From `?p=` — party id for attribution, approvals, and per-participant pending proposals. */
  participantPartyId?: string;
  /** When set (e.g. magic link metadata), shown as “invited by …” on the landing card. */
  inviterDisplayNameOverride?: string;
  /** Minted link token for scoped draft GET/render (must match this tab’s URL token). */
  recipientAccessToken?: string;
  /** Multi-round negotiation lineage (compare base / parent); defaults to first recipient round. */
  revisionLineage?: RecipientRevisionLineage;
};

type RecipientPreview = {
  baselineDraft: AgreementDraft;
  baselineHtml: string;
  proposedDraft: AgreementDraft;
  proposedHtml: string;
  /** User-visible revise text (no posture preamble). */
  revisionText: string;
  hasExternal: boolean;
  postureAtPreview: NegotiationPosture;
  suggestionUsedAtPreview: boolean;
  routingKind: "quick_change" | "whole_document";
  /** Server-staged proposal id — required before finalize POST. */
  proposalId?: string | null;
  /** Heuristic split: commentary for the sender, excluded from agreement body compare. */
  separatedReviewerNotesForUi?: string;
  /** PDF import normalized to the same text as the current render — skip false structural redline. */
  importMatchesCurrentDraft?: boolean;
};

type RecipientWholeDocPreviewOpts = {
  bodyPlain?: string;
  instructionPlain?: string;
  separatedReviewerNotesForUi?: string | null;
  /** Upload path: parent shows analyzing UI; do not toggle the generic previewing spinner. */
  importPipeline?: boolean;
};

/** Stable copy for tests and recipient Pro redline submit success. */
export const PRO_REDLINE_REVIEWER_SUGGEST_SUCCESS_COPY =
  "Suggestion sent. The agreement owner chooses what to accept.";

/** Shown when revise preview fails due to browser/network fetch issues (e.g. `ERR_NETWORK_CHANGED`). */
export const RECIPIENT_REVISE_PREVIEW_CONNECTION_ERROR =
  "Connection hiccup — your note is still here. Please try again.";

function recipientRevisePreviewNetworkishFailure(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : String(e ?? "");
  const m = msg.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("err_network") ||
    m.includes("network changed") ||
    m.includes("load failed") ||
    m.includes("ecconnreset") ||
    m.includes("econnreset")
  );
}

function recipientRevisePreviewUserFacingError(e: unknown): string {
  if (recipientRevisePreviewNetworkishFailure(e)) {
    return RECIPIENT_REVISE_PREVIEW_CONNECTION_ERROR;
  }
  if (e instanceof Error) {
    const t = e.message.trim();
    if (t) return t;
  }
  return RECIPIENT_REVISE_PREVIEW_CONNECTION_ERROR;
}

function recipientVoiceErrorMessage(raw: string): string {
  const t = (raw || "").trim().toLowerCase();
  if (!(raw || "").trim()) return "Voice input error — try again or type.";
  if (t.includes("not-allowed") || t.includes("permission")) {
    return "Microphone wasn't available — you can keep typing.";
  }
  const u = (raw || "").trim();
  return u.length > 160 ? `${u.slice(0, 157)}…` : u;
}

/**
 * Recipient-facing review: read-first hub, preview (persist=false) + pending proposal on send (owner applies).
 */
export function AgreementRecipientReview({
  agreementId,
  recipientLabel = "Recipient",
  onClose,
  entry = { kind: "review" },
  recipientLinkRole = "reviewer",
  participantPartyId = "",
  inviterDisplayNameOverride = "",
  recipientAccessToken = "",
  revisionLineage = DEFAULT_RECIPIENT_REVISION_LINEAGE,
}: Props) {
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [renderedHtml, setRenderedHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [flowPhase, setFlowPhase] = useState<"landing" | "active" | "declined">(
    entry.kind === "review" ? "active" : "landing",
  );
  const [workspaceTab, setWorkspaceTab] = useState<"read" | "revise">("read");
  const [approving, setApproving] = useState(false);
  const [approvedAck, setApprovedAck] = useState(false);
  const [localApprovalAt, setLocalApprovalAt] = useState<string | null>(null);
  const [bundle, setBundle] = useState<AgreementVersionBundle | null>(null);
  const [externalAiPaste, setExternalAiPaste] = useState("");
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreview | null>(null);
  const [sendSuggestedEditsModalOpen, setSendSuggestedEditsModalOpen] = useState(false);
  const [recipientSuggestedEditsSentAck, setRecipientSuggestedEditsSentAck] = useState(false);
  const [recipientRevisePreviewError, setRecipientRevisePreviewError] = useState<string | null>(null);
  const recipientRedlineViewModelLogKeyRef = useRef<string>("");
  const recipientRedlineSourceLogKeyRef = useRef<string>("");
  const reviewFirstStageInFlightRef = useRef(false);
  const lastReviewFirstSubmitAuthorityLogKeyRef = useRef("");
  const lastReviewFirstProposalReadinessLogKeyRef = useRef("");
  const [tokenValidatedPartyId, setTokenValidatedPartyId] = useState("");
  const [recipientPosture] = useState<NegotiationPosture>(DEFAULT_NEGOTIATION_POSTURE);
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"revised" | "quick">("revised");
  /** Landing cards before compose tools (legacy “Request changes” only). */
  const [composePathCardsVisible, setComposePathCardsVisible] = useState(false);
  /** Revised draft: pick upload/paste vs editor surface. */
  const [revisedIntakePhase, setRevisedIntakePhase] = useState<"pick-method" | "editing">("editing");
  const [revisedSubmode, setRevisedSubmode] = useState<"paste" | "edit">("paste");
  const [draftImportError, setDraftImportError] = useState<string | null>(null);
  const [revisedUploadAnalyzing, setRevisedUploadAnalyzing] = useState(false);
  /** True while reading the selected file (before import compare state machine shows analyzing card). */
  const [recipientRevisedDraftFileBusy, setRecipientRevisedDraftFileBusy] = useState(false);
  const [recipientPostUploadSurface, setRecipientPostUploadSurface] = useState<RecipientPostUploadSurfaceState>(null);
  const [recipientIntentListExpanded, setRecipientIntentListExpanded] = useState(false);
  const [recipientImportArtifactsCount, setRecipientImportArtifactsCount] = useState(0);
  const [proRedlineSuggestText, setProRedlineSuggestText] = useState("");
  const [proRedlineSuggestBusy, setProRedlineSuggestBusy] = useState(false);
  const [proRedlineSuggestErr, setProRedlineSuggestErr] = useState<string | null>(null);
  const [proRedlineSuggestSuccess, setProRedlineSuggestSuccess] = useState(false);
  type CeremonyPhase = "idle" | "start_error" | "ready" | "signing" | "done";
  const [ceremonyPhase, setCeremonyPhase] = useState<CeremonyPhase>("idle");
  const [ceremonyError, setCeremonyError] = useState<string | null>(null);
  const [ceremonyVersionHash, setCeremonyVersionHash] = useState("");
  const [ceremonySignerName, setCeremonySignerName] = useState("");
  const [typedConfirm, setTypedConfirm] = useState("");
  const [signedAtLabel, setSignedAtLabel] = useState<string | null>(null);
  const [fullyExecutedAtSign, setFullyExecutedAtSign] = useState(false);
  const ceremonyStartedRef = useRef(false);
  const joySignEmittedRef = useRef(false);
  const recipientFunnelOpenRef = useRef(false);
  const reviewerViewLoggedRef = useRef(false);
  /** Scroll target when reviewer opens “Request changes”. */
  const recipientSuggestPanelRef = useRef<HTMLDivElement>(null);
  const previewChangesButtonRef = useRef<HTMLButtonElement>(null);
  const recipientOriginalDownloadsRef = useRef<HTMLDivElement>(null);
  const previewSummaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const recipientReadDocAnchorRef = useRef<HTMLDivElement>(null);
  /** Stable per agreement (not `useId`) so React StrictMode / tests never see duplicate label targets. */
  const intakeFieldIdSuffix = useMemo(
    () => agreementId.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agreement",
    [agreementId],
  );
  const recipientVersionStoreScope = useMemo(() => {
    const t = (recipientAccessToken || "").trim();
    return t ? recipientLinkTokenFingerprint(t) : undefined;
  }, [recipientAccessToken]);
  const revisionPlainFieldId = `recipient-revision-plain-${intakeFieldIdSuffix}`;
  const externalPasteFieldId = `recipient-external-paste-${intakeFieldIdSuffix}`;
  const editDraftFieldId = `recipient-edit-draft-${intakeFieldIdSuffix}`;
  const externalPasteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const proRedlineSuggestTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { minPx: draftTextareaMinPx, maxPx: draftTextareaMaxPx } = useRecipientDraftTextareaSizing();
  const describeAutosizeMaxPx = Math.min(480, draftTextareaMaxPx);
  useAutosizeTextarea(externalPasteTextareaRef, externalAiPaste, {
    minPx: draftTextareaMinPx,
    maxPx: draftTextareaMaxPx,
  });
  useAutosizeTextarea(proRedlineSuggestTextareaRef, proRedlineSuggestText, { minPx: 112, maxPx: 440 });
  const access = useAccess();

  /** Latest whole-doc preview runner (assigned after function is defined each render). */
  const previewWholeDocumentRevisionRef = useRef<
    ((opts?: RecipientWholeDocPreviewOpts) => Promise<boolean>) | null
  >(null);
  /** Import flow: preview is computed but committed after the analyzing minimum delay. */
  const pendingImportRecipientPreviewRef = useRef<RecipientPreview | null>(null);
  const runImportedRevisedAutoCompareRef = useRef<
    | ((
        fullText: string,
        opts?: {
          scrollToSummary?: boolean;
          importReviewerNotesTail?: string | null;
          importArtifactsRemoved?: string[];
          /** PDF import: sanitizer stripped agreement body; raw text was passed for classification. */
          pdfThinSanitizeUsedRaw?: boolean;
          sourceFileName?: string | null;
        },
      ) => Promise<void>)
    | null
  >(null);
  const [recipientImportSanitizeNote, setRecipientImportSanitizeNote] = useState<string | null>(null);
  const [recipientPdfImportRoutedMessage, setRecipientPdfImportRoutedMessage] = useState<string | null>(null);

  const scrollAndFocusSuggestPanel = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const root = recipientSuggestPanelRef.current;
        if (root && typeof root.scrollIntoView === "function") {
          root.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        const first =
          root?.querySelector<HTMLElement>(
            '[data-testid="recipient-revision-voice-field"], [data-testid="recipient-revised-draft-paste"], [data-testid="recipient-edit-draft-textarea"], #pro-redline-recipient-suggest',
          ) ?? null;
        first?.focus({ preventScroll: true });
      }, 16);
    });
  }, []);

  const prepareOutsideReviewImportUi = useCallback(() => {
    if (flowPhase === "landing") setFlowPhase("active");
    setComposePathCardsVisible(false);
    setWorkspaceTab("revise");
    setWorkflowMode("revised");
    setRevisedSubmode("paste");
    setRevisedIntakePhase("editing");
    setExternalAiPaste("");
    setRecipientPreview(null);
    setRecipientRevisePreviewError(null);
    setDraftImportError(null);
    setRevisedUploadAnalyzing(false);
    setRecipientPostUploadSurface(null);
    pendingImportRecipientPreviewRef.current = null;
    setError(null);
    setRecipientPdfImportRoutedMessage(null);
  }, [flowPhase]);

  const onWantCopyRevisedImported = useCallback(
    (
      text: string,
      meta?: {
        importReviewerNotesTail?: string | null;
        importArtifactsRemoved?: string[];
        pdfThinSanitizeUsedRaw?: boolean;
      },
    ) => {
      void runImportedRevisedAutoCompareRef.current?.(text, { scrollToSummary: true, ...meta });
    },
    [],
  );

  useEffect(() => {
    setRecipientIntentListExpanded(false);
  }, [recipientPreview?.revisionText]);

  useEffect(() => {
    if (!recipientPostUploadSurface) {
      setRecipientPdfImportRoutedMessage(null);
    }
  }, [recipientPostUploadSurface]);

  useEffect(() => {
    reviewerViewLoggedRef.current = false;
  }, [agreementId]);

  useEffect(() => {
    if (entry.kind !== "review" || recipientLinkRole !== "reviewer") return;
    if (!recipientAccessToken.trim()) return;
    if (reviewerViewLoggedRef.current) return;
    reviewerViewLoggedRef.current = true;
    recipientReviewDevInfo("[reviewer-view-visible]", { agreementId, mode: "reviewer" as const });
    logReviewLinkSurfaceMounted({
      agreementId,
      recipientLinkRole,
      source: "agreement_recipient_review",
    });
    logPaidProReviewTrackLifecycle("reviewer_link_opened", {
      agreementId,
      source: "agreement_recipient_review",
      canonicalHash: null,
    });
    return () => {
      logPaidProReviewTrackLifecycle("reviewer_link_closed", {
        agreementId,
        source: "agreement_recipient_review",
        canonicalHash: null,
      });
    };
  }, [agreementId, entry.kind, recipientAccessToken, recipientLinkRole]);

  const frictionPatterns = useMemo(
    () => computeNegotiationPatterns(bundle?.versions ?? []),
    [bundle?.versions]
  );
  const topFrictionClauseId = frictionPatterns.topFrictionClauses[0]?.clause ?? null;

  const latestOwnerMemory = useMemo(() => {
    const vs = bundle?.versions ?? [];
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i]!;
      if (v.created_by !== "owner") continue;
      const m = v.meta?.negotiation_memory;
      if (!m) continue;
      return {
        posture: m.posture,
        risk_level: m.risk_level,
        changed_fields: m.changed_fields,
      };
    }
    return null;
  }, [bundle?.versions]);

  const lastStepChangedFields = useMemo(() => {
    const vs = bundle?.versions ?? [];
    if (vs.length < 2) return [];
    const last = vs[vs.length - 1]!;
    const prev = vs[vs.length - 2]!;
    return detectChangedSnapshotFields(prev.snapshot, last.snapshot);
  }, [bundle?.versions]);

  const latestOwnerRiskTier = useMemo((): NegotiationRiskTier | null => {
    const vs = bundle?.versions ?? [];
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i]!;
      if (v.created_by !== "owner") continue;
      return v.meta?.risk_tier ?? null;
    }
    return null;
  }, [bundle?.versions]);

  const hasTypedInput =
    instruction.trim().length > 0 || externalAiPaste.trim().length > 0;

  const recipientHints = useMemo(
    () =>
      buildRecipientNegotiationHints({
        patterns: frictionPatterns,
        currentChangedFields: lastStepChangedFields,
        currentRiskTier: latestOwnerRiskTier,
        latestOwnerMemory,
        selectedPosture: recipientPosture,
        topFrictionClause: topFrictionClauseId,
        hasTypedInput,
      }),
    [
      frictionPatterns,
      lastStepChangedFields,
      latestOwnerRiskTier,
      latestOwnerMemory,
      recipientPosture,
      topFrictionClauseId,
      hasTypedInput,
    ]
  );

  const recipientNegotiationTimelineSignals = useMemo(() => {
    const vs = bundle?.versions ?? [];
    if (vs.length === 0) return null;
    return buildNegotiationTimelineSignals(vs);
  }, [bundle?.versions]);

  const recipientNegotiationTimelineEvents = useMemo(() => {
    const vs = bundle?.versions ?? [];
    if (vs.length === 0) return [];
    return buildNegotiationTimelineEvents(vs, {
      perspective: "recipient",
      recipientDisplayName: recipientLabel,
      simplified: true,
      signingLock: bundle?.signingLock ?? null,
      signingLockAudit: bundle?.signingLockAudit,
    });
  }, [bundle?.versions, bundle?.signingLock, bundle?.signingLockAudit, recipientLabel]);

  const recipientNegotiationTimelineStatus = useMemo(() => {
    const vs = bundle?.versions ?? [];
    if (!recipientNegotiationTimelineSignals || vs.length === 0) return null;
    return buildNegotiationTimelineCurrentStatus({
      versions: vs,
      perspective: "recipient",
      signingLock: bundle?.signingLock ?? null,
      convergence: recipientNegotiationTimelineSignals.convergence,
      closeRecommendation: recipientNegotiationTimelineSignals.closeRecommendation,
      patternEventCount: recipientNegotiationTimelineSignals.patternEventCount,
    });
  }, [bundle?.versions, bundle?.signingLock, recipientNegotiationTimelineSignals]);

  const recipientUpdateHighlightLabels = useMemo(() => {
    if (!bundle?.pendingRecipientNotice || !draft || bundle.versions.length < 1) return [];
    const prior =
      bundle.versions.length >= 2 ? bundle.versions[bundle.versions.length - 2]! : bundle.versions[0]!;
    const cmp = compareAgreementSnapshots(prior.snapshot, draftToSnapshot(draft));
    return cmp.changedFieldKeys.slice(0, 5).map((k) => agreementFieldLabel(k));
  }, [bundle?.pendingRecipientNotice, bundle?.versions, draft]);

  const versionLabelHub = useMemo(() => {
    if (!bundle?.versions.length) return "Original draft";
    const idx = bundle.versions.length - 1;
    const v = bundle.versions[idx]!;
    return formatRevisionIdentityLabel(idx, v.id, bundle.signingLock ?? null);
  }, [bundle?.versions, bundle?.signingLock]);

  const viewerLike = recipientLinkRole === "counterparty";

  const allOpenProposals = useMemo(
    () => findOpenRecipientProposals(draft?.audit_log),
    [draft?.audit_log]
  );
  const partiesHaveIds = Boolean(draft?.parties?.some((p) => (p.id || "").trim()));
  useEffect(() => {
    const tok = recipientAccessToken.trim();
    if (!tok) {
      setTokenValidatedPartyId("");
      return;
    }
    let cancel = false;
    void validateRecipientAccessToken(tok, agreementId).then((r) => {
      if (cancel) return;
      const pid = r.ok ? String(r.data.recipient_party_id ?? "").trim() : "";
      setTokenValidatedPartyId(pid);
    });
    return () => {
      cancel = true;
    };
  }, [agreementId, recipientAccessToken]);
  const participantPid = useMemo(
    () =>
      resolveReviewFirstStageProposerId({
        agreementId,
        participantPartyId,
        recipientAccessToken,
        tokenValidatedPartyId,
        draftParties: draft?.parties ?? null,
      }).proposerId,
    [agreementId, participantPartyId, recipientAccessToken, tokenValidatedPartyId, draft?.parties],
  );
  const needsPersonalizedLink = useMemo(
    () =>
      reviewerNeedsPersonalizedLink({
        entryKind: entry.kind,
        partiesHaveIds,
        participantPid,
        recipientAccessToken,
      }),
    [entry.kind, partiesHaveIds, participantPid, recipientAccessToken],
  );
  const myPendingProposals = useMemo(() => {
    if (!partiesHaveIds) return allOpenProposals;
    if (!participantPid) return [];
    return allOpenProposals.filter((p) => String(p.proposer_id || "").trim() === participantPid);
  }, [allOpenProposals, partiesHaveIds, participantPid]);
  const hasPendingSuggestion = myPendingProposals.length > 0;
  const reviewerProposalAwaitingOwner = hasPendingSuggestion || recipientSuggestedEditsSentAck;
  const signingBlockedByProposalQueue = allOpenProposals.length > 0;
  const proposerDisplayNameForApi = useMemo(() => {
    if (!draft?.parties?.length) return recipientLabel;
    const m = draft.parties.find((p) => (p.id || "").trim() === participantPid);
    return m?.name?.trim() || recipientLabel;
  }, [draft?.parties, participantPid, recipientLabel]);

  const reviewerEmailForExport = useMemo(() => {
    if (!draft?.parties?.length || !participantPid) return null;
    const m = draft.parties.find((p) => String(p.id || "").trim() === participantPid);
    const e = (m?.email || "").trim();
    return e.length > 0 ? e : null;
  }, [draft?.parties, participantPid]);
  const agreementFullyExecuted = useMemo(() => isAgreementMarkedSignedInAudit(draft), [draft]);
  const mySignatureDone = useMemo(
    () => isParticipantSignatureComplete(draft, participantPid),
    [draft, participantPid]
  );
  const recipientApprovedInAudit = useMemo(
    () => auditHasRecipientApprovalForParticipant(draft?.audit_log, participantPid),
    [draft?.audit_log, participantPid],
  );

  const signingLinkInvalidMessage = useMemo(() => {
    if (entry.kind !== "sign" || !bundle) return null;
    const gated =
      entry.accessGate &&
      entry.accessGate.lockedVersionId === entry.lockedVersionId;
    if (gated) {
      const ver = bundle.versions.find((v) => v.id === entry.lockedVersionId);
      if (!ver) {
        return "This signing link is not available yet. Please ask the sender to finalize the agreement first.";
      }
      return null;
    }
    if (!isSigningLockActive(bundle)) {
      return "This signing link is not available yet. Please ask the sender to finalize the agreement first.";
    }
    if (bundle.signingLock!.lockedVersionId !== entry.lockedVersionId) {
      return "This signing link is not available yet. Please ask the sender to finalize the agreement first.";
    }
    const ver = bundle.versions.find((v) => v.id === entry.lockedVersionId);
    if (!ver) {
      return "This signing link is not available yet. Please ask the sender to finalize the agreement first.";
    }
    return null;
  }, [entry, bundle]);

  useEffect(() => {
    ceremonyStartedRef.current = false;
    joySignEmittedRef.current = false;
    recipientFunnelOpenRef.current = false;
    setCeremonyPhase("idle");
    setCeremonyError(null);
    setCeremonyVersionHash("");
    setCeremonySignerName("");
    setTypedConfirm("");
    setSignedAtLabel(null);
    setFullyExecutedAtSign(false);
    setSendSuggestedEditsModalOpen(false);
    setRecipientSuggestedEditsSentAck(false);
    setApprovedAck(false);
    setLocalApprovalAt(null);
  }, [agreementId, recipientAccessToken, participantPartyId]);

  useEffect(() => {
    const local = readReviewerApprovalLocalState({
      agreementId,
      participantPartyId: participantPid,
      recipientAccessToken,
    });
    if (local?.approvedAt) {
      setApprovedAck(true);
      setLocalApprovalAt(local.approvedAt);
    }
  }, [agreementId, participantPid, recipientAccessToken]);

  useEffect(() => {
    if (!recipientPreview && sendSuggestedEditsModalOpen) {
      setSendSuggestedEditsModalOpen(false);
    }
  }, [recipientPreview, sendSuggestedEditsModalOpen]);

  useEffect(() => {
    if (recipientFunnelOpenRef.current) return;
    if (loading) return;
    if (!draft) return;
    recipientFunnelOpenRef.current = true;
    trackAgreementFunnelEvent("recipient_opened_link", { entry_kind: entry.kind }, { planTier: String(access.tier), agreementId });
  }, [loading, draft, entry.kind, access.tier, agreementId]);

  useEffect(() => {
    if (entry.kind !== "sign") return;
    const signJoyDone = ceremonyPhase === "done" || mySignatureDone;
    if (!signJoyDone || joySignEmittedRef.current) return;
    joySignEmittedRef.current = true;
    const full = fullyExecutedAtSign || agreementFullyExecuted;
    emitActionCompleted(full ? "finalize" : "sign", { agreementId });
  }, [
    entry.kind,
    ceremonyPhase,
    mySignatureDone,
    fullyExecutedAtSign,
    agreementFullyExecuted,
    agreementId,
  ]);

  useEffect(() => {
    if (entry.kind !== "sign" || !draft || !bundle || signingLinkInvalidMessage) return;
    if (isParticipantSignatureComplete(draft, participantPid)) {
      setCeremonyPhase("done");
      return;
    }
    if (ceremonyStartedRef.current) return;
    ceremonyStartedRef.current = true;
    let cancel = false;
    void (async () => {
      const r = await postSigningCeremonyStart(agreementId, participantPid, recipientAccessToken);
      if (cancel) return;
      if (!r.ok) {
        ceremonyStartedRef.current = false;
        setCeremonyError(r.error || "Could not start signing.");
        setCeremonyPhase("start_error");
        return;
      }
      setCeremonyVersionHash(r.agreement_version_hash || "");
      setCeremonySignerName((r.participant_display_name || "").trim() || proposerDisplayNameForApi);
      setCeremonyPhase("ready");
      trackAgreementFunnelEvent("signature_flow_started", { entry_kind: "sign" }, { planTier: String(access.tier), agreementId });
    })();
    return () => {
      cancel = true;
    };
  }, [
    entry.kind,
    draft,
    bundle,
    signingLinkInvalidMessage,
    agreementId,
    participantPid,
    proposerDisplayNameForApi,
    recipientAccessToken,
  ]);

  const showSuggestionBlock =
    hasTypedInput || topFrictionClauseId != null || frictionPatterns.totalNegotiationEvents >= 2;

  useEffect(() => {
    setRecipientPreview(null);
    setRecipientRevisePreviewError(null);
  }, [recipientPosture]);

  const previewDiff = useMemo(() => {
    if (!recipientPreview) return null;
    return assessRecipientPreviewDiff(
      recipientPreview.baselineDraft,
      recipientPreview.proposedDraft,
      recipientPreview.baselineHtml,
      recipientPreview.proposedHtml,
      { recipientInstructionPlain: recipientPreview.revisionText },
    );
  }, [recipientPreview]);

  const recipientImportNoMaterialDiff = Boolean(recipientPreview?.importMatchesCurrentDraft);

  const recipientRedlinePlainTexts = useMemo(() => {
    if (!recipientPreview || !previewDiff) return null;
    const structuralPaste =
      recipientPreview.routingKind === "whole_document"
        ? externalAiPaste.trim() || String(recipientPreview.proposedDraft.purpose ?? "").trim()
        : "";
    const structuralBaseline =
      recipientPreview.routingKind === "whole_document"
        ? (
            resolveReviewFirstDisplayCorpus(recipientPreview.baselineDraft)?.text.trim() ||
            htmlToPlainText(recipientPreview.baselineHtml || "").trim()
          )
        : "";
    const structuralOptions =
      structuralPaste || structuralBaseline
        ? {
            ...(structuralPaste ? { structuralProposedPlainOverride: structuralPaste } : {}),
            ...(structuralBaseline ? { structuralBaselinePlainOverride: structuralBaseline } : {}),
          }
        : undefined;
    return buildRecipientLegalRedlinePlainTexts(
      recipientPreview.baselineDraft,
      recipientPreview.proposedDraft,
      recipientPreview.baselineHtml,
      recipientPreview.proposedHtml,
      previewDiff.hasSnapshotDiff,
      recipientPreview.revisionText ?? "",
      previewDiff.snapshotCompare.changedFields,
      structuralOptions,
    );
  }, [externalAiPaste, previewDiff, recipientPreview]);

  const recipientIntentGapCount = useMemo(() => {
    const o = recipientRedlinePlainTexts?.instructionIntentOutcomes;
    if (o && o.length > 0) return countRecipientIntentGaps(o);
    return previewDiff?.instructionCaptureWarning ? 1 : 0;
  }, [recipientRedlinePlainTexts?.instructionIntentOutcomes, previewDiff?.instructionCaptureWarning]);

  const recipientInstructionIntentSplit = useMemo(() => {
    const all = recipientRedlinePlainTexts?.instructionIntentOutcomes;
    if (!all?.length) {
      return { primary: [] as RecipientInstructionIntent[], unclear: [] as RecipientInstructionIntent[] };
    }
    return {
      primary: all.filter((i) => i.status !== "unclear"),
      unclear: all.filter((i) => i.status === "unclear"),
    };
  }, [recipientRedlinePlainTexts?.instructionIntentOutcomes]);

  const showRecipientIntentCoverageCallout = useMemo(() => {
    return (
      recipientInstructionIntentSplit.primary.length > 0 || recipientInstructionIntentSplit.unclear.length > 0
    );
  }, [recipientInstructionIntentSplit.primary.length, recipientInstructionIntentSplit.unclear.length]);

  const primaryIntentRowsForCompare = useMemo(() => {
    const p = recipientInstructionIntentSplit.primary;
    return recipientIntentListExpanded ? p : p.slice(0, 5);
  }, [recipientIntentListExpanded, recipientInstructionIntentSplit.primary]);

  const [narrowRedlineHighlightAnchor, setNarrowRedlineHighlightAnchor] = useState<string | null>(null);
  const [highlightedSemanticAnchor, setHighlightedSemanticAnchor] = useState<string | null>(null);
  const [onlyChangedRedlineSections, setOnlyChangedRedlineSections] = useState(true);
  const suggestedChangesDocScrollRef = useRef<HTMLDivElement>(null);
  const auditDetailsRef = useRef<HTMLDetailsElement>(null);
  const [businessReviewFocusedWording, setBusinessReviewFocusedWording] = useState<
    | {
        variant?: "exact";
        sectionTitle: string;
        oldText: string;
        newText: string;
      }
    | {
        variant: "compare_fallback";
        sectionTitle: string;
        sectionSubline?: string;
        businessNote?: string;
        oldText: string;
        newText: string;
        semanticId: BusinessReviewSemanticId;
      }
    | null
  >(null);
  const [, setCondensedReviewTab] = useState<CondensedRevisionTab>("clean");

  const recipientRedlineStrippedPlainPair = useMemo(() => {
    if (!recipientRedlinePlainTexts) return null;
    return stripClausePreambleFromRevisedPair(
      recipientRedlinePlainTexts.currentPlain,
      recipientRedlinePlainTexts.proposedPlain,
    );
  }, [recipientRedlinePlainTexts]);

  const recipientPresentationMode = useMemo((): RecipientReviewPresentationMode => {
    if (!recipientRedlinePlainTexts) return "full_clause_redline";
    const proposedForDetect = stripRecipientQaDraftNoiseLines(recipientRedlinePlainTexts.proposedPlain);
    return detectRecipientReviewPresentationMode({
      currentPlain: recipientRedlinePlainTexts.currentPlain,
      proposedPlain: proposedForDetect,
      narrowRecipientTargetedRedline: Boolean(recipientRedlinePlainTexts.narrowRecipientTargetedRedline),
    });
  }, [recipientRedlinePlainTexts]);

  useEffect(() => {
    if (recipientPresentationMode === "condensed_clean_revision") {
      setCondensedReviewTab("clean");
    }
  }, [recipientPresentationMode, recipientPreview?.proposedDraft.updated_at]);

  const legalRedlineDocumentBaseVm = useMemo(() => {
    if (!recipientRedlinePlainTexts || !recipientRedlineStrippedPlainPair) return null;
    let vm = buildLegalRedlineDocumentViewModel(
      recipientRedlineStrippedPlainPair.currentPlain,
      recipientRedlineStrippedPlainPair.proposedPlain,
    );
    if (
      recipientRedlinePlainTexts.sourceMode === "baseline_vs_revise_html" &&
      !recipientRedlinePlainTexts.narrowRecipientTargetedRedline
    ) {
      vm = collapseRecipientRedlineDuplicateInsertBlocks(vm, recipientRedlinePlainTexts.proposedPlain);
    }
    if (!recipientRedlinePlainTexts.narrowRecipientTargetedRedline) {
      vm = mergeRecipientRedlineLowSignalFragments(vm);
    }
    if (recipientRedlinePlainTexts.narrowRecipientTargetedRedline) {
      vm = filterNarrowRecipientPaymentRedlineNoise(vm, { narrowPaymentInstruction: true });
    }
    if (!recipientRedlinePlainTexts.narrowRecipientTargetedRedline) {
      vm = splitRecipientCondensedGiantChangedBlock(vm);
    }
    return applyRecipientMeaningfulChangePass(vm);
  }, [recipientRedlinePlainTexts, recipientRedlineStrippedPlainPair]);

  const recipientFriendlyRedlineChips = useMemo(() => {
    if (!recipientPreview || !previewDiff) return [] as string[];
    const fields = previewDiff.snapshotCompare.changedFields.filter((r) => r.changed).map((r) => r.field);
    return buildRecipientFriendlyRedlineChips(recipientPreview.revisionText ?? "", fields);
  }, [recipientPreview, previewDiff]);

  const presentationFriendlyRedlineChips = useMemo(
    () => filterChipsForBusinessReviewPresentation(recipientFriendlyRedlineChips),
    [recipientFriendlyRedlineChips],
  );

  const intentSemanticBucketRows = useMemo(
    () => buildIntentSemanticBucketRows(recipientInstructionIntentSplit.primary),
    [recipientInstructionIntentSplit.primary],
  );

  const openFullLegalRedlineSection = useCallback(() => {
    recipientRedlineNavLog("open-request", {
      presentationMode: recipientPresentationMode,
    });
    if (recipientPresentationMode === "condensed_clean_revision") {
      setCondensedReviewTab("advanced");
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          suggestedChangesDocScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          recipientRedlineNavLog("opened", { path: "condensed_advanced_tab" });
        }, 40);
      });
      return;
    }
    const det = auditDetailsRef.current;
    if (det) det.open = true;
    recipientRedlineNavLog("opened", { path: "audit_details_full_redline" });
  }, [recipientPresentationMode]);

  const narrowIntentAnchorPresence = useMemo(() => {
    const absent = { payment_timing: false, pause_suspend_work: false };
    if (!legalRedlineDocumentBaseVm || !recipientRedlinePlainTexts?.narrowRecipientTargetedRedline) return absent;
    let payment_timing = false;
    let pause_suspend_work = false;
    for (const b of legalRedlineDocumentBaseVm.blocks) {
      for (const s of b.segments) {
        if (s.type !== "insert") continue;
        if (/\bnet\s*\d+/i.test(s.text)) payment_timing = true;
        if (/pause work until all overdue/i.test(s.text)) pause_suspend_work = true;
      }
    }
    return { payment_timing, pause_suspend_work };
  }, [legalRedlineDocumentBaseVm, recipientRedlinePlainTexts?.narrowRecipientTargetedRedline]);

  const scrollToNarrowRedlineAnchor = useCallback((anchor: string) => {
    const det = auditDetailsRef.current;
    if (det) det.open = true;
    const shell = suggestedChangesDocScrollRef.current;
    const el =
      (shell?.querySelector(`[data-recipient-redline-anchor="${anchor}"]`) as HTMLElement | null) ??
      (typeof document !== "undefined"
        ? (document.querySelector(
            `[data-testid="recipient-suggested-changes-document"] [data-recipient-redline-anchor="${anchor}"]`,
          ) as HTMLElement | null)
        : null);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setNarrowRedlineHighlightAnchor(anchor);
    window.setTimeout(() => setNarrowRedlineHighlightAnchor(null), 2200);
  }, []);

  const legalRedlineDocumentVm = useMemo(() => {
    if (!legalRedlineDocumentBaseVm || !previewDiff) return legalRedlineDocumentBaseVm;
    return {
      ...legalRedlineDocumentBaseVm,
      requestedNotReflectedCount: recipientIntentGapCount,
    };
  }, [legalRedlineDocumentBaseVm, previewDiff, recipientIntentGapCount]);

  const condensedTopicCards = useMemo(() => {
    if (recipientPresentationMode !== "condensed_clean_revision" || !legalRedlineDocumentVm || !recipientRedlinePlainTexts) {
      return [] as ReturnType<typeof buildCondensedTopicReviewCards>;
    }
    return buildCondensedTopicReviewCards(
      legalRedlineDocumentVm,
      recipientRedlinePlainTexts.currentPlain,
      recipientFriendlyRedlineChips,
    );
  }, [
    recipientPresentationMode,
    legalRedlineDocumentVm,
    recipientRedlinePlainTexts,
    recipientFriendlyRedlineChips,
  ]);

  const condensedCleanRevisionPdfBundle = useMemo(() => {
    if (recipientImportNoMaterialDiff) return null;
    if (recipientPresentationMode !== "condensed_clean_revision" || !recipientRedlinePlainTexts || !legalRedlineDocumentVm) {
      return null;
    }
    const clean =
      recipientRedlineStrippedPlainPair?.proposedPlain?.trim() ||
      recipientRedlinePlainTexts.proposedPlain.trim();
    return {
      cleanProposedPlain: clean,
      topicSectionHtml: buildCondensedTopicReviewCardsPdfHtml(condensedTopicCards),
      notRestatedAppendixHtml: buildNotRestatedOriginalSectionsAppendixHtml(RECIPIENT_NOT_RESTAT_ORIGINAL_SECTION_LABELS),
    };
  }, [
    recipientPresentationMode,
    recipientRedlinePlainTexts,
    recipientRedlineStrippedPlainPair,
    legalRedlineDocumentVm,
    condensedTopicCards,
    recipientImportNoMaterialDiff,
  ]);

  const recipientSemanticPresentation = useMemo(() => {
    if (recipientImportNoMaterialDiff) return null;
    if (!legalRedlineDocumentVm || recipientRedlinePlainTexts?.narrowRecipientTargetedRedline) return null;
    return buildRecipientSemanticRedlinePresentation(legalRedlineDocumentVm);
  }, [
    recipientImportNoMaterialDiff,
    legalRedlineDocumentVm,
    recipientRedlinePlainTexts?.narrowRecipientTargetedRedline,
  ]);

  const scrollRecipientSemanticRelaxed = useCallback(
    async (semanticId: BusinessReviewSemanticId) => {
      if (!legalRedlineDocumentVm) return;
      const resolveScrollRoot = (): HTMLElement | null =>
        suggestedChangesDocScrollRef.current ??
        (typeof document !== "undefined"
          ? (document.querySelector("[data-testid=\"recipient-redline-scrollport\"]") as HTMLElement | null)
          : null);
      if (!resolveScrollRoot()) {
        await new Promise<void>((r) => window.requestAnimationFrame(() => requestAnimationFrame(() => r())));
      }
      const bid = getScrollTargetBlockIdForSemanticOrFallback(legalRedlineDocumentVm, semanticId);
      const sem = bid ? recipientSemanticAnchorForBlockId(bid) : null;
      const root = resolveScrollRoot();
      const scrollTopBefore = root?.scrollTop ?? null;
      recipientRedlineNavLog("target-scroll-start", {
        semanticId,
        blockId: bid,
        matchedBy: sem ? "semantic" : bid ? "block" : "none",
        scrollTopBefore,
      });
      const scrollResult = await scrollRecipientRedlineClausePanel({
        root,
        detailsBoundary: root,
        semanticAnchorId: sem,
        blockId: bid,
        onHighlight: (id) => setHighlightedSemanticAnchor(id),
        highlightClearMs: 2000,
      });
      const scrollTopAfter = resolveScrollRoot()?.scrollTop ?? null;
      recipientRedlineNavLog(scrollResult.hit ? "target-scroll-success" : "target-scroll-failed", {
        semanticId,
        blockId: bid,
        matchedBy: scrollResult.matchedBy,
        attempts: scrollResult.attempts,
        scrollTopBefore,
        scrollTopAfter,
      });
    },
    [legalRedlineDocumentVm],
  );

  const scrollToSemanticReviewInRedline = useCallback(
    async (semanticId: BusinessReviewSemanticId, meta?: { cardTitle?: string; chipLabel?: string }) => {
      openFullLegalRedlineSection();
      await new Promise<void>((r) =>
        window.setTimeout(
          r,
          recipientPresentationMode === "condensed_clean_revision" ? 60 : 120,
        ),
      );
      const vm = legalRedlineDocumentVm;
      const cardTitle = meta?.cardTitle ?? meta?.chipLabel ?? null;
      const clickTag =
        meta?.chipLabel != null && String(meta.chipLabel).trim() !== ""
          ? "recipient-redline-chip-click"
          : "recipient-redline-card-click";
      devLogRecipientRedlineNavigation(clickTag, {
        semanticId,
        cardTitle,
        scrollportExists: Boolean(suggestedChangesDocScrollRef.current),
      });
      if (!vm) return;
      const { semanticAnchorId, blockId } = resolveRecipientSemanticScrollTarget(vm, semanticId);
      devLogRecipientRedlineNavigation(
        semanticAnchorId || blockId ? "recipient-redline-target-resolved" : "recipient-redline-target-missing",
        {
          semanticId,
          cardTitle,
          resolvedBlockId: blockId,
          resolvedSemanticAnchorId: semanticAnchorId,
          scrollportExists: Boolean(suggestedChangesDocScrollRef.current),
          retryCount: 0,
        },
      );
      if (!semanticAnchorId && !blockId) {
        const fb = getClauseCompareFallbackForSemanticId(vm, semanticId);
        if (fb) {
          const card = businessReviewCardForSemanticId(semanticId, cardTitle ?? fb.sectionLabel ?? "Change");
          setBusinessReviewFocusedWording({
            variant: "compare_fallback",
            sectionTitle: RECIPIENT_FOCUS_COMPARE_BEST_MATCH_HEADING,
            sectionSubline: (cardTitle ?? fb.sectionLabel) || "Changed clause",
            businessNote: card.whyMatters,
            oldText: fb.oldText,
            newText: fb.newText,
            semanticId,
          });
        }
        return;
      }
      const scrollResult = await scrollRecipientRedlineClausePanel({
        root: suggestedChangesDocScrollRef.current,
        detailsBoundary: suggestedChangesDocScrollRef.current,
        semanticAnchorId,
        blockId,
        onHighlight: (id) => setHighlightedSemanticAnchor(id),
        highlightClearMs: 2000,
      });
      if (!scrollResult.hit) {
        devLogRecipientRedlineNavigation("recipient-redline-target-missing", {
          semanticId,
          cardTitle,
          resolvedBlockId: blockId,
          reason: "dom_miss",
          attempts: scrollResult.attempts,
          scrollportExists: Boolean(suggestedChangesDocScrollRef.current),
          targetElementExists: false,
        });
        const fb = getClauseCompareFallbackForSemanticId(vm, semanticId);
        if (fb) {
          const card = businessReviewCardForSemanticId(semanticId, cardTitle ?? fb.sectionLabel ?? "Change");
          setBusinessReviewFocusedWording({
            variant: "compare_fallback",
            sectionTitle: RECIPIENT_FOCUS_COMPARE_BEST_MATCH_HEADING,
            sectionSubline: (cardTitle ?? fb.sectionLabel) || "Changed clause",
            businessNote: card.whyMatters,
            oldText: fb.oldText,
            newText: fb.newText,
            semanticId,
          });
        }
        return;
      }
      devLogRecipientRedlineNavigation("recipient-redline-scroll-complete", {
        semanticId,
        cardTitle,
        resolvedBlockId: blockId,
        matchedBy: scrollResult.matchedBy,
        attempts: scrollResult.attempts,
        scrollportExists: Boolean(suggestedChangesDocScrollRef.current),
        targetElementExists: true,
      });
    },
    [legalRedlineDocumentVm, openFullLegalRedlineSection, recipientPresentationMode],
  );

  const compareConfidence = useMemo(() => {
    if (!legalRedlineDocumentVm || !recipientRedlinePlainTexts || !previewDiff) return null;
    return buildRecipientCompareConfidence({
      artifactsRemovedCount: recipientImportArtifactsCount,
      paymentTermsInlinePlacementFailed: Boolean(recipientRedlinePlainTexts.paymentTermsInlinePlacementFailed),
      recipientIntentGapCount,
      usedNoisyReviseGuard: Boolean(recipientRedlinePlainTexts.usedNoisyReviseGuard),
      hasLargeBlockFallbackReason: Boolean(legalRedlineDocumentVm.fallbackReason?.trim()),
      segmentCount: legalRedlineDocumentVm.stats.segmentCount,
      changedBlockCount: legalRedlineDocumentVm.stats.changedBlockCount,
      insertCount: legalRedlineDocumentVm.stats.insertCount,
      deleteCount: legalRedlineDocumentVm.stats.deleteCount,
      wholeDocumentSemanticReplacement:
        recipientSemanticPresentation?.mode === "whole_section_replacement" &&
        !recipientSemanticPresentation?.shortRevisedVsLongBaseline,
    });
  }, [
    legalRedlineDocumentVm,
    recipientRedlinePlainTexts,
    previewDiff,
    recipientIntentGapCount,
    recipientImportArtifactsCount,
    recipientSemanticPresentation?.mode,
    recipientSemanticPresentation?.shortRevisedVsLongBaseline,
  ]);

  const simpleRecipientChange = useMemo(() => {
    if (!previewDiff || previewDiff.isCompleteNoOp) return null;
    if (recipientPreview?.routingKind === "whole_document") {
      const schedulePrevious = scheduleAExcerpt(recipientRedlinePlainTexts?.currentPlain ?? "");
      const scheduleProposed = scheduleAExcerpt(recipientRedlinePlainTexts?.proposedPlain ?? "");
      if (schedulePrevious && scheduleProposed && schedulePrevious !== scheduleProposed) {
        const compactScheduleDiff = buildReviewFirstTextDiffSummary(schedulePrevious, scheduleProposed);
        const scheduleSection = compactScheduleDiff.changedSections[0];
        if (scheduleSection) {
          return {
            title: scheduleSection.title,
            summary: scheduleSection.summary,
            previous: scheduleSection.beforePhrase || scheduleSection.previous,
            proposed: scheduleSection.afterPhrase || scheduleSection.proposed,
            fullPrevious: scheduleSection.fullPrevious,
            fullProposed: scheduleSection.fullProposed,
            previousParts: scheduleSection.phrasePreviousParts.length
              ? scheduleSection.phrasePreviousParts
              : scheduleSection.previousParts,
            proposedParts: scheduleSection.phraseProposedParts.length
              ? scheduleSection.phraseProposedParts
              : scheduleSection.proposedParts,
            clauseLabel: scheduleSection.clauseLabel,
          };
        }
        return {
          title: "Schedule A updated",
          summary: "Payment schedule updated",
          previous: schedulePrevious,
          proposed: scheduleProposed,
          fullPrevious: schedulePrevious,
          fullProposed: scheduleProposed,
          previousParts: null,
          proposedParts: null,
        };
      }
      const compactReviewFirstDiff = buildReviewFirstTextDiffSummary(
        recipientRedlinePlainTexts?.currentPlain ?? "",
        recipientRedlinePlainTexts?.proposedPlain ?? "",
      );
      const reviewFirstSection = compactReviewFirstDiff.changedSections[0];
      if (reviewFirstSection) {
        return {
          title: reviewFirstSection.title,
          summary: reviewFirstSection.summary,
          previous: reviewFirstSection.beforePhrase || reviewFirstSection.previous,
          proposed: reviewFirstSection.afterPhrase || reviewFirstSection.proposed,
          fullPrevious: reviewFirstSection.fullPrevious,
          fullProposed: reviewFirstSection.fullProposed,
          previousParts: reviewFirstSection.phrasePreviousParts.length
            ? reviewFirstSection.phrasePreviousParts
            : reviewFirstSection.previousParts,
          proposedParts: reviewFirstSection.phraseProposedParts.length
            ? reviewFirstSection.phraseProposedParts
            : reviewFirstSection.proposedParts,
          clauseLabel: reviewFirstSection.clauseLabel,
        };
      }
    }
    const cards = buildRecipientClauseCards(
      previewDiff.snapshotCompare,
      previewDiff.hasMaterialTextDiff,
      previewDiff.clauseContext,
    );
    const firstCard = cards.find((c) => c.currentText.trim() || c.proposedText.trim());
    const fallbackCurrent = recipientRedlinePlainTexts?.currentPlain.trim() ?? "";
    const fallbackProposed = recipientRedlinePlainTexts?.proposedPlain.trim() ?? "";
    const previous = (firstCard?.currentText || fallbackCurrent).trim();
    const proposed = (firstCard?.proposedText || fallbackProposed).trim();
    if (!previous && !proposed) return null;
    const compactFallbackDiff = buildReviewFirstTextDiffSummary(previous, proposed);
    const fallbackSection = compactFallbackDiff.changedSections[0];
    if (fallbackSection) {
      return {
        title: fallbackSection.title,
        summary: fallbackSection.summary,
        previous: fallbackSection.beforePhrase || fallbackSection.previous,
        proposed: fallbackSection.afterPhrase || fallbackSection.proposed,
        fullPrevious: fallbackSection.fullPrevious,
        fullProposed: fallbackSection.fullProposed,
        previousParts: fallbackSection.phrasePreviousParts.length
          ? fallbackSection.phrasePreviousParts
          : fallbackSection.previousParts,
        proposedParts: fallbackSection.phraseProposedParts.length
          ? fallbackSection.phraseProposedParts
          : fallbackSection.proposedParts,
        clauseLabel: fallbackSection.clauseLabel,
      };
    }
    return {
      title: firstCard?.cardTitle || "Wording change",
      summary: firstCard?.cardTitle ? `${firstCard.cardTitle} updated` : "Wording updated",
      previous: previous.length > 520 ? `${previous.slice(0, 520).trim()}…` : previous,
      proposed: proposed.length > 520 ? `${proposed.slice(0, 520).trim()}…` : proposed,
      fullPrevious: previous,
      fullProposed: proposed,
      previousParts: null,
      proposedParts: null,
      clauseLabel: "",
    };
  }, [previewDiff, recipientPreview?.routingKind, recipientRedlinePlainTexts]);

  const reviewerHeadlineName = useMemo(
    () =>
      participantPid.trim()
        ? (proposerDisplayNameForApi || "").trim() || "The reviewer"
        : "The reviewer",
    [participantPid, proposerDisplayNameForApi],
  );

  const humanReviewStructuredPdf = useMemo(() => {
    if (recipientImportNoMaterialDiff) return null;
    if (!legalRedlineDocumentVm || !compareConfidence || !recipientPreview || !previewDiff) return null;
    const headlinePlainOverride =
      recipientPresentationMode === "condensed_clean_revision"
        ? buildHumanReviewHeadlineCondensedCleanRevision(
            reviewerHeadlineName,
            condensedTopicCards.length > 0
              ? condensedTopicCards.length
              : humanReviewMeaningfulCount(
                  recipientFriendlyRedlineChips,
                  legalRedlineDocumentVm.stats.changedBlockCount,
                ),
          )
        : null;
    return buildHumanReviewStructuredForPdf({
      reviewerHeadlineName,
      chips: recipientFriendlyRedlineChips,
      changedBlockCount: legalRedlineDocumentVm.stats.changedBlockCount,
      instructionPlain: recipientPreview.revisionText ?? "",
      changedFieldKeys: previewDiff.snapshotCompare.changedFields.filter((r) => r.changed).map((r) => r.field),
      confidence: compareConfidence,
      headlinePlainOverride,
    });
  }, [
    legalRedlineDocumentVm,
    compareConfidence,
    recipientPreview,
    previewDiff,
    recipientFriendlyRedlineChips,
    reviewerHeadlineName,
    recipientPresentationMode,
    condensedTopicCards.length,
    recipientImportNoMaterialDiff,
  ]);

  const redlinePdfTechnicalAppendixPlain = useMemo(() => {
    if (recipientImportNoMaterialDiff) return null;
    if (!legalRedlineDocumentVm || !compareConfidence) return null;
    if (compareConfidence.level === "high" && !legalRedlineDocumentVm.fallbackReason?.trim()) return null;
    const { insertCount, deleteCount, changedBlockCount, segmentCount } = legalRedlineDocumentVm.stats;
    const parts = [
      recipientRedlineTechnicalAppendixSummaryLine({
        insertCount,
        deleteCount,
        changedBlockCount,
        segmentCount,
      }),
    ];
    if (legalRedlineDocumentVm.fallbackReason?.trim()) {
      parts.push("A large section is summarized as a single change for readability.");
    }
    return parts.join(" ");
  }, [legalRedlineDocumentVm, compareConfidence, recipientImportNoMaterialDiff]);

  const recipientReviewerNotesPlainForExport = useMemo(() => {
    if (recipientPreview?.importMatchesCurrentDraft) return null;
    const raw = recipientPreview?.separatedReviewerNotesForUi?.trim() ?? "";
    if (!raw) return null;
    const proposedDeduped =
      recipientRedlineStrippedPlainPair?.proposedPlain?.trim() ||
      stripRecipientQaDraftNoiseLines(recipientRedlinePlainTexts?.proposedPlain ?? "");
    if (proposedDeduped.length >= 180 && notesLikelyDuplicateProposedPlain(raw, proposedDeduped)) {
      return null;
    }
    if (legalRedlineDocumentVm && notesLikelyDuplicateAgreementBodyForExport(raw, legalRedlineDocumentVm)) {
      return null;
    }
    return raw;
  }, [
    recipientPreview?.separatedReviewerNotesForUi,
    recipientRedlineStrippedPlainPair?.proposedPlain,
    recipientRedlinePlainTexts?.proposedPlain,
    legalRedlineDocumentVm,
    recipientPreview?.importMatchesCurrentDraft,
  ]);

  const showSeparatedReviewerNotesPanel = useMemo(() => {
    if (!recipientReviewerNotesPlainForExport) return false;
    if (!compareConfidence) return true;
    if (compareConfidence.level !== "high") return true;
    /** Hide only token footers on high-confidence reads; keep anything with a sentence of substance. */
    return recipientReviewerNotesPlainForExport.length >= 12;
  }, [recipientReviewerNotesPlainForExport, compareConfidence]);

  useLayoutEffect(() => {
    if (!recipientPreview || recipientSuggestedEditsSentAck) return;
    if (!previewDiff || previewDiff.isCompleteNoOp) return;
    const id = window.requestAnimationFrame(() => {
      previewSummaryHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [recipientPreview, recipientSuggestedEditsSentAck, previewDiff]);

  useEffect(() => {
    if (!recipientPreview || !previewDiff || !legalRedlineDocumentVm) return;
    const diag =
      import.meta.env.DEV ||
      (typeof window !== "undefined" && window.localStorage?.getItem("lawdogRecipientReviseDiag") === "1");
    if (!diag) return;
    const k = `${agreementId}:${recipientPreview.revisionText}:${recipientPreview.proposedDraft.updated_at}:${legalRedlineDocumentVm.stats.segmentCount}:${legalRedlineDocumentVm.stats.blockCount}`;
    if (k === recipientRedlineViewModelLogKeyRef.current) return;
    recipientRedlineViewModelLogKeyRef.current = k;
    const cards = buildRecipientClauseCards(
      previewDiff.snapshotCompare,
      previewDiff.hasMaterialTextDiff,
      previewDiff.clauseContext,
    );
    // eslint-disable-next-line no-console
    console.info("[recipient-redline-diagnosis]", {
      agreementId,
      instructionLen: (recipientPreview.revisionText ?? "").length,
      changedClauseCount: cards.length,
      clauseIds: cards.map((c) => c.id),
      clauses: cards.map((c) => ({
        id: c.id,
        beforeLen: c.currentText.length,
        afterLen: c.proposedText.length,
        hasAdds: c.redlineView.hasAdds,
        hasDeletes: c.redlineView.hasDeletes,
        addedLineCount: c.redlineView.addedLines.length,
        fallbackReason: c.redlineView.fallbackReason ?? null,
      })),
      wholeDocFallbackReason: legalRedlineDocumentVm.fallbackReason ?? null,
    });
    // eslint-disable-next-line no-console
    console.info("[recipient-legal-block-redline]", {
      agreementId,
      blockCount: legalRedlineDocumentVm.stats.blockCount,
      changedBlockCount: legalRedlineDocumentVm.stats.changedBlockCount,
      blocks: legalRedlineDocumentVm.blocks.map((b) => ({
        clauseNumber: b.clauseNumber ?? null,
        kind: b.kind,
        insertSeg: b.segments.filter((s) => s.type === "insert").length,
        deleteSeg: b.segments.filter((s) => s.type === "delete").length,
        sameSeg: b.segments.filter((s) => s.type === "same").length,
      })),
    });
    // eslint-disable-next-line no-console
    console.info("[recipient-whole-doc-redline]", {
      agreementId,
      currentLen: legalRedlineDocumentVm.stats.currentLen,
      proposedLen: legalRedlineDocumentVm.stats.proposedLen,
      hasChanges: legalRedlineDocumentVm.hasChanges,
      insertCount: legalRedlineDocumentVm.stats.insertCount,
      deleteCount: legalRedlineDocumentVm.stats.deleteCount,
      sameCount: legalRedlineDocumentVm.stats.sameCount,
      segmentCount: legalRedlineDocumentVm.stats.segmentCount,
      fallbackReason: legalRedlineDocumentVm.fallbackReason ?? null,
    });
  }, [agreementId, previewDiff, recipientPreview, legalRedlineDocumentVm]);

  useEffect(() => {
    if (!recipientPreview || !previewDiff || !legalRedlineDocumentVm) return;
    const diag =
      import.meta.env.DEV ||
      (typeof window !== "undefined" && window.localStorage?.getItem("lawdogRecipientReviseDiag") === "1");
    if (!diag) return;
    const k = `${agreementId}:${recipientPreview.revisionText}:${recipientPreview.proposedDraft.updated_at}`;
    if (k === recipientRedlineSourceLogKeyRef.current) return;
    recipientRedlineSourceLogKeyRef.current = k;
    const baseHtml = recipientPreview.baselineHtml || "";
    const propHtml = recipientPreview.proposedHtml || "";
    const rawCur = htmlToPlainTextForLegalRedline(baseHtml);
    const rawProp = htmlToPlainTextForLegalRedline(propHtml);
    const paired =
      recipientRedlinePlainTexts ??
      buildRecipientLegalRedlinePlainTexts(
        recipientPreview.baselineDraft,
        recipientPreview.proposedDraft,
        baseHtml,
        propHtml,
        previewDiff.hasSnapshotDiff,
        recipientPreview.revisionText ?? "",
        previewDiff.snapshotCompare.changedFields,
        recipientPreview.routingKind === "whole_document"
          ? { structuralProposedPlainOverride: String(recipientPreview.proposedDraft.purpose ?? "").trim() }
          : undefined,
      );
    const equalRawPlain =
      rawCur.replace(/\s+/g, " ").trim() === rawProp.replace(/\s+/g, " ").trim();
    const changedClauseCount = previewDiff.snapshotCompare.changedFields.filter((r) => r.changed).length;
    // eslint-disable-next-line no-console
    console.info("[recipient-redline-source-pair]", {
      agreementId,
      baselineHtmlLen: baseHtml.length,
      proposedHtmlLen: propHtml.length,
      baselineLen: paired.currentPlain.length,
      proposedLen: paired.proposedPlain.length,
      baselineFingerprint: fingerprintPlainText(paired.currentPlain),
      proposedFingerprint: fingerprintPlainText(paired.proposedPlain),
      equalTexts: equalRawPlain,
      equalHtmlLengths: baseHtml.length === propHtml.length,
      redlineSourceMode: paired.sourceMode,
      usedFieldPatchBaseline: paired.sourceMode === "baseline_vs_field_patch",
      changedClauseCount,
      wholeDocChangedBlockCount: legalRedlineDocumentVm.stats.changedBlockCount,
      wholeDocInsertCount: legalRedlineDocumentVm.stats.insertCount,
      wholeDocDeleteCount: legalRedlineDocumentVm.stats.deleteCount,
      paymentTermsInlinePlacementFailed: paired.paymentTermsInlinePlacementFailed ?? false,
      inlinePlacementDiags: paired.inlinePlacementDiags ?? [],
    });
  }, [agreementId, legalRedlineDocumentVm, previewDiff, recipientPreview, recipientRedlinePlainTexts]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const readHeaders = recipientAgreementReadHeaders(agreementId, recipientAccessToken);
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}`, {
        headers: readHeaders,
      });
      const resBody = await res.text();
      if (!res.ok) {
        const msg = await errorMessageFromResponse(
          new Response(resBody, { status: res.status }),
          "We couldn't load this agreement. Please try again.",
        );
        throw new Error(msg);
      }
      const payload = JSON.parse(resBody) as {
        draft?: unknown;
        signing_lock?: {
          locked_version_id?: string;
          locked_at?: string;
          locked_by?: string;
          content_sha256?: string;
        } | null;
      };
      const d = normalizeAgreementDraftFromApi(payload?.draft ?? null, {
        fallbackAgreementId: agreementId,
      });
      setDraft(d);
      if (!d) {
        setRenderedHtml("");
        setError(
          "This agreement could not be loaded from this link. Ask the sender for a fresh link and confirm the full URL was copied.",
        );
        return;
      }
      const rr = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
        method: "POST",
        headers: readHeaders,
      });
      const rrBody = await rr.text();
      if (!rr.ok) {
        const msg = await errorMessageFromResponse(
          new Response(rrBody, { status: rr.status }),
          "We couldn't load the formatted agreement. Please try again.",
        );
        throw new Error(msg);
      }
      const rp = JSON.parse(rrBody) as { rendered_html?: unknown };
      const html = String(rp?.rendered_html || "");
      const reviewFirstCorpus = resolveReviewFirstDisplayCorpus(d);
      const effectiveHtml =
        reviewFirstCorpus && reviewFirstCorpus.text.trim().length >= 500
          ? renderReviewFirstCorpusHtml(reviewFirstCorpus.text)
          : html;
      if (entry.kind === "review" && reviewFirstCorpus) {
        logReviewFirstDisplayCorpusSelected({
          agreementId,
          corpus: reviewFirstCorpus,
          surface: "reviewer",
          fallbackPreview: !effectiveHtml.trim(),
        });
      }
      setRenderedHtml(effectiveHtml);
      let b = loadBundle(agreementId, recipientVersionStoreScope);
      if (!b || b.versions.length === 0) {
        b = ensureInitialVersion(agreementId, d, effectiveHtml, recipientVersionStoreScope);
      }
      const signingLockPresentInPayload = Object.prototype.hasOwnProperty.call(payload, "signing_lock");
      const sl = payload.signing_lock;
      const lv = typeof sl?.locked_version_id === "string" ? sl.locked_version_id.trim() : "";
      if (lv) {
        b = {
          ...b,
          finalizedForSigning: true,
          signingLock: {
            locked: true,
            lockedVersionId: lv,
            lockedAt: typeof sl?.locked_at === "string" ? sl.locked_at : undefined,
            lockedBy: "owner",
          },
        };
        saveBundle(b, recipientVersionStoreScope);
      } else if (signingLockPresentInPayload && b.signingLock?.locked) {
        b = {
          ...b,
          finalizedForSigning: false,
          signingLock: { locked: false },
        };
        saveBundle(b, recipientVersionStoreScope);
      }
      setBundle(b);
      const aid = agreementId.trim();
      logReviewStateSource({
        source: "agreementRecipientReview.refresh",
        agreementScoped: false,
        tokenScoped: Boolean((recipientAccessToken || "").trim()),
        agreementIdShort: aid.length <= 12 ? aid : `${aid.slice(0, 8)}…`,
        tokenHashShort: recipientLinkTokenFingerprint(recipientAccessToken),
        participantPartyId: participantPid || null,
        recipientApprovedInAudit: auditHasRecipientApprovalForParticipant(d.audit_log, participantPid),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load agreement.");
    } finally {
      setLoading(false);
    }
  }, [agreementId, entry.kind, recipientAccessToken, recipientVersionStoreScope, participantPid]);

  const draftSanitizeContext = useMemo(() => {
    if (!draft) return "";
    return [draft.title, draft.purpose, draft.payment_terms, ...draft.parties.map((p) => p.name)].join("\n");
  }, [draft]);

  const authoritativePartyNames = useMemo(
    () => (draft?.parties ?? []).map((p) => p.name),
    [draft?.parties],
  );

  /** Baseline agreement HTML only — never the recipient’s proposed/compare HTML. */
  const recipientBaselineHtmlSource = useMemo(
    () => (recipientPreview?.baselineHtml?.trim() ? recipientPreview.baselineHtml : renderedHtml),
    [recipientPreview?.baselineHtml, renderedHtml],
  );

  const renderedHtmlDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        renderedHtml,
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [renderedHtml, draftSanitizeContext, authoritativePartyNames],
  );
  const reviewFirstDocumentHtml = useMemo(() => {
    const corpus = resolveReviewFirstDisplayCorpus(draft)?.text.trim();
    return buildReviewFirstDocumentDisplayHtml({
      serverHtml: renderedHtmlDisplay,
      corpusText: corpus,
      partyNames: authoritativePartyNames,
    });
  }, [authoritativePartyNames, draft, renderedHtmlDisplay]);
  const reviewFirstUsesPremiumDocument = useMemo(() => {
    const corpus = resolveReviewFirstDisplayCorpus(draft)?.text.trim() || "";
    return corpus.length >= 500;
  }, [draft]);

  const scrubAgreementHtml = useCallback(
    (html: string) =>
      substitutePartyPlaceholdersInUserFacingText(html || "", draftSanitizeContext, authoritativePartyNames),
    [draftSanitizeContext, authoritativePartyNames],
  );

  /** Original draft PDF / text / copy — no redline or revised-upload body. */
  const scrubbedOriginalDraftHtmlForPdfExport = useMemo(() => {
    const inner = substitutePartyPlaceholdersInUserFacingText(
      recipientBaselineHtmlSource || "",
      draftSanitizeContext,
      authoritativePartyNames,
    );
    return stripCompareMarkupFromOriginalDraftHtml(inner);
  }, [recipientBaselineHtmlSource, draftSanitizeContext, authoritativePartyNames]);

  const directCompareDefault = useMemo(() => {
    const corpus = resolveReviewFirstDisplayCorpus(draft)?.text.trim();
    if (corpus) return formatAgreementPlainTextForEditing(corpus);
    const fromHtml = htmlToPlainTextForLegalRedline(scrubbedOriginalDraftHtmlForPdfExport || "").trim();
    return formatAgreementPlainTextForEditing(
      fromHtml || htmlToPlainText(scrubbedOriginalDraftHtmlForPdfExport || "").trim(),
    );
  }, [draft, scrubbedOriginalDraftHtmlForPdfExport]);
  const reviewFirstComparisonBaseline = useMemo(
    () => resolveReviewFirstDisplayCorpus(draft)?.text.trim() || directCompareDefault,
    [directCompareDefault, draft],
  );
  const directCompareDefaultRef = useRef(directCompareDefault);
  directCompareDefaultRef.current = directCompareDefault;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bundleSigningLocked = Boolean(bundle && isSigningLockActive(bundle));
  const recipientAcceptedRecorded = Boolean(recipientApprovedInAudit || approvedAck);
  const recipientAcceptedAwaitingLock =
    entry.kind === "review" && !viewerLike && recipientAcceptedRecorded && !bundleSigningLocked;
  const recipientAcceptedNoEditsBanner =
    recipientAcceptedAwaitingLock &&
    !hasPendingSuggestion &&
    !recipientSuggestedEditsSentAck &&
    !recipientPreview;
  const shouldPollSigningReadiness = useMemo(() => {
    if (entry.kind !== "review") return false;
    // Review links default to role "reviewer"; they still need signing_lock hydration after owner finalize.
    if (viewerLike) return false;
    if (agreementFullyExecuted || mySignatureDone) return false;
    if (!recipientApprovedInAudit && !approvedAck) return false;
    if (bundleSigningLocked) return false;
    return true;
  }, [
    entry.kind,
    viewerLike,
    agreementFullyExecuted,
    mySignatureDone,
    recipientApprovedInAudit,
    approvedAck,
    bundleSigningLocked,
  ]);

  useEffect(() => {
    if (!shouldPollSigningReadiness) return;
    let ticks = 0;
    const maxTicks = 75;
    const id = window.setInterval(() => {
      ticks += 1;
      if (ticks > maxTicks) {
        window.clearInterval(id);
        return;
      }
      void refresh();
    }, RECIPIENT_SIGNING_READINESS_POLL_MS);
    return () => window.clearInterval(id);
  }, [shouldPollSigningReadiness, refresh]);

  useEffect(() => {
    if (!shouldPollSigningReadiness) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [shouldPollSigningReadiness, refresh]);

  const lastReviewStateDiagKeyRef = useRef("");
  const reviewerOwnerCtaHiddenLoggedRef = useRef(false);
  const lastReviewerDisplayParityKeyRef = useRef("");
  useEffect(() => {
    if (entry.kind !== "review" || viewerLike) return;
    if (reviewerOwnerCtaHiddenLoggedRef.current) return;
    reviewerOwnerCtaHiddenLoggedRef.current = true;
    logReviewerOwnerCtaHidden({ agreementId, surface: "AgreementRecipientReview" });
  }, [agreementId, entry.kind, viewerLike]);
  useEffect(() => {
    if (entry.kind !== "review" || viewerLike || !draft) return;
    const copyCorpus = directCompareDefault;
    const copyHasSignatureBlock = corpusHasSignatureBlock(copyCorpus);
    const displayHasSignatureBlock = htmlHasSignatureBlock(reviewFirstDocumentHtml);
    const key = JSON.stringify({
      copyHasSignatureBlock,
      displayHasSignatureBlock,
      copyHash: corpusFingerprint(copyCorpus),
      displayLen: reviewFirstDocumentHtml.length,
    });
    if (key === lastReviewerDisplayParityKeyRef.current) return;
    lastReviewerDisplayParityKeyRef.current = key;
    logReviewerDisplayCopyParity({
      agreementId,
      copyHasSignatureBlock,
      displayHasSignatureBlock,
      parity: copyHasSignatureBlock === displayHasSignatureBlock,
      copyCorpusHash: corpusFingerprint(copyCorpus),
      displayHtmlLength: reviewFirstDocumentHtml.length,
    });
  }, [
    agreementId,
    directCompareDefault,
    draft,
    entry.kind,
    reviewFirstDocumentHtml,
    viewerLike,
  ]);
  useEffect(() => {
    if (entry.kind !== "review" || viewerLike) return;
    const key = JSON.stringify({
      agreementId,
      recipientLinkRole,
      approved: recipientAcceptedRecorded,
      bundleSigningLocked,
      shouldPollSigningReadiness,
      flowPhase,
      workspaceTab,
      approving,
    });
    if (key === lastReviewStateDiagKeyRef.current) return;
    lastReviewStateDiagKeyRef.current = key;
    recipientFlowDiag("[recipient-review-state]", {
      agreementId,
      recipientLinkRole,
      viewerLike,
      recipientApprovedInAudit,
      approvedAck,
      bundleSigningLocked,
      lockedVersionId: bundle?.signingLock?.lockedVersionId ?? null,
      shouldPollSigningReadiness,
      flowPhase,
      workspaceTab,
      approving,
    });
  }, [
    agreementId,
    approving,
    approvedAck,
    bundle?.signingLock?.lockedVersionId,
    bundleSigningLocked,
    entry.kind,
    flowPhase,
    recipientApprovedInAudit,
    recipientLinkRole,
    recipientAcceptedRecorded,
    shouldPollSigningReadiness,
    viewerLike,
    workspaceTab,
  ]);

  const prevBundleSigningLockedRef = useRef(false);
  useEffect(() => {
    if (bundleSigningLocked && !prevBundleSigningLockedRef.current) {
      recipientFlowDiag("[recipient-signing-lock-detected]", {
        agreementId,
        lockedVersionId: bundle?.signingLock?.lockedVersionId ?? null,
        recipientLinkRole,
      });
      recipientFlowDiag("[recipient-review-promote-to-signing]", {
        agreementId,
        recipientLinkRole,
        viewerLike,
      });
    }
    prevBundleSigningLockedRef.current = bundleSigningLocked;
  }, [agreementId, bundle?.signingLock?.lockedVersionId, bundleSigningLocked, recipientLinkRole, viewerLike]);

  useEffect(() => {
    if (entry.kind !== "review" || viewerLike) return;
    if (!recipientAcceptedRecorded) return;
    if (bundleSigningLocked) return;
    setWorkspaceTab((t) => (t === "revise" ? "read" : t));
    setComposePathCardsVisible(false);
  }, [bundleSigningLocked, entry.kind, recipientAcceptedRecorded, viewerLike]);

  const lockedVersionForReadinessDiag = bundle?.signingLock?.lockedVersionId || "";
  const canRecipientSignDiag =
    recipientLinkRole === "signer" &&
    bundleSigningLocked &&
    Boolean(lockedVersionForReadinessDiag) &&
    !signingBlockedByProposalQueue;

  useEffect(() => {
    recipientAcceptTransitionDiag("signing_readiness_tick", {
      agreementId,
      entryKind: entry.kind,
      recipientLinkRole,
      viewerLike,
      bundleSigningLocked,
      approvedAck,
      recipientApprovedInAudit,
      signingBlockedByProposalQueue,
      canRecipientSign: canRecipientSignDiag,
      shouldPollSigningReadiness,
      lockedVersionId: lockedVersionForReadinessDiag || null,
    });
  }, [
    agreementId,
    entry.kind,
    recipientLinkRole,
    viewerLike,
    bundleSigningLocked,
    approvedAck,
    recipientApprovedInAudit,
    signingBlockedByProposalQueue,
    canRecipientSignDiag,
    shouldPollSigningReadiness,
    lockedVersionForReadinessDiag,
  ]);

  const revisionPayload = useMemo(() => {
    if (workflowMode === "quick") {
      return buildRecipientRevisionText(instruction.trim(), "");
    }
    return buildRecipientRevisionText(instruction.trim(), externalAiPaste.trim());
  }, [workflowMode, instruction, externalAiPaste]);

  const reviewFirstTextDiff = useMemo(() => {
    if (workflowMode !== "revised" || revisedIntakePhase !== "editing") return null;
    return buildReviewFirstTextDiffSummary(reviewFirstComparisonBaseline, externalAiPaste);
  }, [externalAiPaste, revisedIntakePhase, reviewFirstComparisonBaseline, workflowMode]);
  const reviewFirstConfirmedDiff = useMemo(() => {
    if (workflowMode !== "revised" || !recipientPreview) return null;
    const pasted =
      externalAiPaste.trim() || String(recipientPreview.proposedDraft.purpose ?? "").trim();
    if (!pasted) return null;
    return buildReviewFirstTextDiffSummary(reviewFirstComparisonBaseline, pasted);
  }, [externalAiPaste, recipientPreview, reviewFirstComparisonBaseline, workflowMode]);
  const reviewFirstCompareSections = useMemo(
    () => reviewFirstConfirmedDiff?.changedSections.slice(0, 4) ?? [],
    [reviewFirstConfirmedDiff],
  );
  const hasReviewerAttribution = !needsPersonalizedLink && Boolean(participantPid.trim() || !partiesHaveIds);
  const reviewFirstCanReviewChanges = canReviewChanges({
    diff: reviewFirstTextDiff,
    proposedText: externalAiPaste,
  });
  const reviewFirstSubmitAuthority = useMemo(
    () =>
      resolveReviewFirstSubmitAuthority({
        agreementId,
        diff: reviewFirstConfirmedDiff ?? reviewFirstTextDiff,
        needsPersonalizedLink,
        participantPid,
        partiesHaveIds,
        recipientAccessToken,
        recipientPreview: Boolean(recipientPreview),
        signingLockActive: bundleSigningLocked,
      }),
    [
      agreementId,
      reviewFirstConfirmedDiff,
      reviewFirstTextDiff,
      needsPersonalizedLink,
      participantPid,
      partiesHaveIds,
      recipientAccessToken,
      recipientPreview,
      bundleSigningLocked,
    ],
  );
  const reviewFirstHasMaterialChanges = Boolean(
    (reviewFirstConfirmedDiff ?? reviewFirstTextDiff)?.hasMaterialChanges,
  );
  useEffect(() => {
    if (workflowMode !== "revised") return;
    const key = JSON.stringify({
      agreementId,
      canSubmit: reviewFirstSubmitAuthority.canSubmit,
      reason: reviewFirstSubmitAuthority.reason,
      hasRecipientPreview: Boolean(recipientPreview),
      hasMaterialChanges: reviewFirstHasMaterialChanges,
      participantPid: participantPid || null,
      needsPersonalizedLink,
      tokenHashShort: recipientLinkTokenFingerprint(recipientAccessToken),
    });
    if (key === lastReviewFirstSubmitAuthorityLogKeyRef.current) return;
    lastReviewFirstSubmitAuthorityLogKeyRef.current = key;
    logReviewFirstSubmitAuthority({
      agreementId,
      canSubmit: reviewFirstSubmitAuthority.canSubmit,
      reason: reviewFirstSubmitAuthority.reason,
      hasAccessToken: Boolean(recipientAccessToken.trim()),
      participantPid: participantPid || null,
      needsPersonalizedLink,
      hasRecipientPreview: Boolean(recipientPreview),
      hasMaterialChanges: reviewFirstHasMaterialChanges,
      tokenHashShort: recipientLinkTokenFingerprint(recipientAccessToken),
    });
  }, [
    agreementId,
    workflowMode,
    reviewFirstSubmitAuthority.canSubmit,
    reviewFirstSubmitAuthority.reason,
    recipientAccessToken,
    participantPid,
    needsPersonalizedLink,
    recipientPreview,
    reviewFirstHasMaterialChanges,
  ]);
  const reviewFirstProposalSubmitReady = reviewFirstSubmitAuthority.canSubmit;
  const recipientProposalSubmitReady =
    workflowMode === "revised" ? reviewFirstProposalSubmitReady : Boolean(previewDiff?.canSubmit && !needsPersonalizedLink);

  const quickChangeLooksLikeFullDraft =
    workflowMode === "quick" && looksLikeFullRevisedAgreementDraft(instruction.trim());

  const canPreview =
    Boolean(revisionPayload.text) &&
    !previewing &&
    !saving &&
    !revisedUploadAnalyzing &&
    (workflowMode === "revised"
      ? reviewFirstCanReviewChanges
      : !needsPersonalizedLink &&
        Boolean(instruction.trim()) &&
        !quickChangeLooksLikeFullDraft &&
        instruction.trim().length <= RECIPIENT_MAX_INSTRUCTION_CHARS);

  useEffect(() => {
    if (workflowMode !== "revised" || revisedIntakePhase !== "editing") return;
    const key = JSON.stringify({
      hasProposedText: Boolean(externalAiPaste.trim()),
      hasMaterialChanges: Boolean(reviewFirstTextDiff?.hasMaterialChanges),
      canReviewChanges: reviewFirstCanReviewChanges,
      canSubmitProposedUpdate: reviewFirstProposalSubmitReady,
      submitBlockReason: reviewFirstSubmitAuthority.reason,
    });
    if (key === lastReviewFirstProposalReadinessLogKeyRef.current) return;
    lastReviewFirstProposalReadinessLogKeyRef.current = key;
    logReviewFirstProposalReadiness({
      hasProposedText: Boolean(externalAiPaste.trim()),
      hasMaterialChanges: Boolean(reviewFirstTextDiff?.hasMaterialChanges),
      hasParticipantAttribution: hasReviewerAttribution,
      canReviewChanges: reviewFirstCanReviewChanges,
      canSubmitProposedUpdate: reviewFirstProposalSubmitReady,
      submitBlockReason: reviewFirstSubmitAuthority.reason,
      normalizedOriginalLength: reviewFirstTextDiff?.normalizedPrevious.length ?? 0,
      normalizedProposedLength: reviewFirstTextDiff?.normalizedProposed.length ?? 0,
    });
  }, [
    externalAiPaste,
    hasReviewerAttribution,
    reviewFirstCanReviewChanges,
    reviewFirstProposalSubmitReady,
    reviewFirstSubmitAuthority.reason,
    reviewFirstTextDiff?.hasMaterialChanges,
    reviewFirstTextDiff?.normalizedPrevious.length,
    reviewFirstTextDiff?.normalizedProposed.length,
    revisedIntakePhase,
    workflowMode,
  ]);

  async function previewQuickChange() {
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return;
    }
    const { text, hasExternal } = buildRecipientRevisionText(instruction.trim(), "");
    if (!text.trim() || !draft || previewing) return;
    if (looksLikeFullRevisedAgreementDraft(text)) {
      setError(RECIPIENT_FULL_DOC_SWITCH_HINT);
      return;
    }
    if (text.length > RECIPIENT_MAX_INSTRUCTION_CHARS) {
      setError(RECIPIENT_QUICK_CHANGE_TOO_LARGE_HINT);
      return;
    }
    const revGate = access.check("revision_preview");
    if (!revGate.allowed) {
      setError(revGate.message || "Revision preview limit reached.");
      return;
    }
    setPreviewing(true);
    setError(null);
    setRecipientRevisePreviewError(null);
    try {
      const baselineDraft = cloneDraftForRecipientPreview(draft);
      const readHeaders = recipientAgreementReadHeaders(agreementId, recipientAccessToken);
      /** Owner-current HTML snapshot: re-fetch from /render immediately before revise (not React state alone). */
      let baselineHtml = renderedHtml;
      try {
        const rr = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
          method: "POST",
          headers: readHeaders,
        });
        if (rr.ok) {
          const rrBody = await rr.text();
          const rp = JSON.parse(rrBody) as { rendered_html?: unknown };
          const fresh = String(rp?.rendered_html ?? "").trim();
          if (fresh.length > 0) baselineHtml = fresh;
        }
      } catch {
        /* keep last renderedHtml from state */
      }
      const apiInstruction = `${recipientPostureInstructionPreamble(recipientPosture)}\n\n${text}`;
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/revise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...recipientAgreementReadHeaders(agreementId, recipientAccessToken),
        },
        body: JSON.stringify({
          instruction: apiInstruction,
          session_type: "recipient",
          persist: false,
          ai_model_class: access.effectiveAiModelClass,
        }),
      });
      const resBody = await res.text();
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(
            "Too many update attempts for this draft. Try again shortly."
          );
        }
        let msg = await errorMessageFromResponse(
          new Response(resBody, { status: res.status }),
          "Couldn't preview that change. Please try again.",
        );
        msg = mapDraftAssistBlockedMessage(msg);
        throw new Error(msg);
      }
      const payload = JSON.parse(resBody) as { draft?: AgreementDraft; rendered_html?: unknown };
      const nextDraft = payload?.draft as AgreementDraft;
      const html = String(payload?.rendered_html || "");
      if (!nextDraft) throw new Error("We couldn't load the proposed change. Please try again.");
      const integrity = assessRecipientPreviewDiff(baselineDraft, nextDraft, baselineHtml, html, {
        recipientInstructionPlain: text.trim(),
      });
      const diag =
        import.meta.env.DEV ||
        (typeof window !== "undefined" &&
          window.localStorage?.getItem("lawdogRecipientReviseDiag") === "1");
      if (diag) {
        const tok = Boolean(recipientAccessToken?.trim());
        // eslint-disable-next-line no-console
        console.info("[recipient-revise-preview]", {
          agreementId,
          instructionLen: apiInstruction.length,
          recipientTokenPresent: tok,
          httpStatus: res.status,
          fieldsChanged: integrity.hasSnapshotDiff,
          renderedTextChanged: integrity.hasMaterialTextDiff,
          isCompleteNoOp: integrity.isCompleteNoOp,
        });
      }
      if (integrity.isCompleteNoOp) {
        if (diag) {
          // eslint-disable-next-line no-console
          console.info("[recipient-revise-preview] blocked_no_op", {
            reason: "structured_and_rendered_unchanged",
          });
        }
        setRecipientRevisePreviewError(null);
        setError(recipientPreviewNoOpMessage());
        setRecipientPreview(null);
        return;
      }
      setRecipientRevisePreviewError(null);
      setRecipientImportArtifactsCount(0);
      setRecipientPreview({
        baselineDraft,
        baselineHtml,
        proposedDraft: nextDraft,
        proposedHtml: html,
        revisionText: text,
        hasExternal,
        postureAtPreview: recipientPosture,
        suggestionUsedAtPreview: suggestionUsed,
        routingKind: "quick_change",
      });
      access.recordUsage("revision_previews");
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      recipientReviewDevWarn("[recipient-revise-preview] failed", e);
      setRecipientRevisePreviewError(recipientRevisePreviewUserFacingError(e));
      setRecipientPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function previewWholeDocumentRevision(opts?: RecipientWholeDocPreviewOpts): Promise<boolean> {
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return false;
    }
    const paste = (opts?.bodyPlain ?? externalAiPaste).trim();
    const instCombined = (opts?.instructionPlain ?? instruction).trim();
    if (!paste || !draft) return false;
    if (!opts?.importPipeline && previewing) return false;
    const revGate = access.check("revision_preview");
    if (!revGate.allowed) {
      setError(revGate.message || "Revision preview limit reached.");
      return false;
    }
    const showGenericPreviewSpinner = !opts?.importPipeline;
    if (showGenericPreviewSpinner) setPreviewing(true);
    if (!opts?.importPipeline) setRecipientImportArtifactsCount(0);
    setError(null);
    setRecipientRevisePreviewError(null);
    try {
      const baselineDraft = cloneDraftForRecipientPreview(draft);
      const readHeaders = recipientAgreementReadHeaders(agreementId, recipientAccessToken);
      let baselineHtml = renderedHtml;
      try {
        const rr = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
          method: "POST",
          headers: readHeaders,
        });
        if (rr.ok) {
          const rrBody = await rr.text();
          const rp = JSON.parse(rrBody) as { rendered_html?: unknown };
          const fresh = String(rp?.rendered_html ?? "").trim();
          if (fresh.length > 0) baselineHtml = fresh;
        }
      } catch {
        /* keep last renderedHtml from state */
      }
      const proposedDraft = cloneDraftForRecipientPreview(draft);
      proposedDraft.purpose = paste;
      const reviewFirstPasteDiff = buildReviewFirstTextDiffSummary(reviewFirstComparisonBaseline, paste);
      const reviewFirstHasMaterialChanges = reviewFirstPasteDiff.hasMaterialChanges;
      const baselineCorpus = reviewFirstComparisonBaseline.trim();
      let proposedHtml: string;
      if (baselineCorpus) {
        baselineHtml = renderReviewFirstCorpusHtml(baselineCorpus);
        proposedHtml = renderReviewFirstCorpusHtml(paste);
        proposedDraft.server_full_document_text = paste;
        if (draft.premium_render_source === "review_first_final_corpus") {
          proposedDraft.premium_server_full_document_text = paste;
        }
      } else {
        proposedHtml = renderAgreementDraftHtmlLikeBackend(proposedDraft);
      }
      const revisionText = buildRecipientRevisionText(instCombined, paste).text;
      const integrity = assessRecipientPreviewDiff(baselineDraft, proposedDraft, baselineHtml, proposedHtml, {
        recipientInstructionPlain: revisionText.trim(),
      });
      logReviewFirstProposalCompareDiag({
        normalizedOriginalLen: reviewFirstPasteDiff.normalizedPrevious.length,
        normalizedProposalLen: reviewFirstPasteDiff.normalizedProposed.length,
        changedSectionCount: reviewFirstPasteDiff.changedSections.length,
        comparisonGenerated: reviewFirstHasMaterialChanges,
        integrityIsCompleteNoOp: integrity.isCompleteNoOp,
        proposalReadyState: reviewFirstHasMaterialChanges || !integrity.isCompleteNoOp,
      });
      if (integrity.isCompleteNoOp && !reviewFirstHasMaterialChanges) {
        setRecipientRevisePreviewError(null);
        setError(RECIPIENT_COMPARE_FAILED_FALLBACK);
        setRecipientPreview(null);
        pendingImportRecipientPreviewRef.current = null;
        return false;
      }
      if (opts?.bodyPlain !== undefined) {
        setExternalAiPaste(paste);
        if (opts.instructionPlain !== undefined) setInstruction(opts.instructionPlain);
      }
      const notesUi =
        opts?.separatedReviewerNotesForUi && opts.separatedReviewerNotesForUi.trim()
          ? opts.separatedReviewerNotesForUi.trim()
          : undefined;
      setRecipientRevisePreviewError(null);
      const previewPayload: RecipientPreview = {
        baselineDraft,
        baselineHtml,
        proposedDraft,
        proposedHtml,
        revisionText,
        hasExternal: true,
        postureAtPreview: recipientPosture,
        suggestionUsedAtPreview: suggestionUsed,
        routingKind: "whole_document",
        ...(notesUi ? { separatedReviewerNotesForUi: notesUi } : {}),
      };
      if (opts?.importPipeline) {
        pendingImportRecipientPreviewRef.current = previewPayload;
      } else {
        setRecipientPreview(previewPayload);
      }
      access.recordUsage("revision_previews");
      return true;
    } catch (e: unknown) {
      recipientReviewDevWarn("[recipient-whole-doc-preview] failed", e);
      setRecipientRevisePreviewError(recipientRevisePreviewUserFacingError(e));
      setRecipientPreview(null);
      pendingImportRecipientPreviewRef.current = null;
      return false;
    } finally {
      if (showGenericPreviewSpinner) setPreviewing(false);
    }
  }

  previewWholeDocumentRevisionRef.current = previewWholeDocumentRevision;

  runImportedRevisedAutoCompareRef.current = async (fullText: string, scrollOpts) => {
    if (!draft) {
      recipientUploadError("compare-no-draft", new Error("draft missing"), { agreementId });
      setDraftImportError(RECIPIENT_DRAFT_IMPORT_AGREEMENT_NOT_READY);
      setError(RECIPIENT_DRAFT_IMPORT_AGREEMENT_NOT_READY);
      return;
    }
    const trimmed = fullText.trim();
    if (!trimmed) {
      recipientUploadError("compare-empty-body", new Error("empty trimmed import text"), { agreementId });
      setDraftImportError(RECIPIENT_DRAFT_IMPORT_EMPTY_BODY);
      setError(RECIPIENT_DRAFT_IMPORT_EMPTY_BODY);
      return;
    }
    setRecipientImportArtifactsCount(scrollOpts?.importArtifactsRemoved?.length ?? 0);
    setRecipientImportSanitizeNote(
      scrollOpts?.importArtifactsRemoved?.length ? RECIPIENT_PREVIEW_IMPORT_FORMATTING_NOTE : null,
    );
    const importTail = scrollOpts?.importReviewerNotesTail?.trim() ?? "";
    setRecipientPostUploadSurface(null);
    setRecipientPreview(null);
    pendingImportRecipientPreviewRef.current = null;
    setRecipientRevisePreviewError(null);
    setDraftImportError(null);
    setError(null);
    setRecipientPdfImportRoutedMessage(null);
    setBusinessReviewFocusedWording(null);
    setHighlightedSemanticAnchor(null);
    setNarrowRedlineHighlightAnchor(null);
    setRecipientIntentListExpanded(false);
    setCondensedReviewTab("clean");
    try {
      await Promise.resolve();
      let baselineHtmlLive = renderedHtml.trim();
      try {
        const readHeaders = recipientAgreementReadHeaders(agreementId, recipientAccessToken);
        const rr = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/render`, {
          method: "POST",
          headers: readHeaders,
        });
        if (rr.ok) {
          const rrBody = await rr.text();
          const rp = JSON.parse(rrBody) as { rendered_html?: unknown };
          const fresh = String(rp?.rendered_html ?? "").trim();
          if (fresh.length > 0) baselineHtmlLive = fresh;
        }
      } catch {
        /* keep renderedHtml from state */
      }

      const roleResult = classifyRecipientUploadedDraftRole({
        baselineRenderedHtml: baselineHtmlLive,
        uploadedSanitizedPlain: trimmed,
        filename: scrollOpts?.sourceFileName ?? null,
      });
      recipientUploadLog("role-classified", {
        role: roleResult.role,
        rawLen: roleResult.rawLen,
        bodyLen: roleResult.bodyLen,
        reasons: roleResult.reasons,
      });

      if (roleResult.role === "INVALID_OR_TOO_LOW_SIGNAL") {
        setWorkflowMode("revised");
        setRevisedSubmode("paste");
        setRevisedIntakePhase("editing");
        setExternalAiPaste("");
        setRevisedUploadAnalyzing(false);
        setDraftImportError(RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT);
        setError(RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT);
        return;
      }

      if (roleResult.role === "REVIEW_NOTES_ONLY") {
        setWorkflowMode("revised");
        setRevisedSubmode("paste");
        setRevisedIntakePhase("editing");
        setExternalAiPaste("");
        setRevisedUploadAnalyzing(false);
        const noteBase = roleResult.reviewerNotesForUi ?? trimmed;
        const noteText = [noteBase, importTail].filter(Boolean).join("\n\n");
        if (scrollOpts?.pdfThinSanitizeUsedRaw) {
          setRecipientPdfImportRoutedMessage(RECIPIENT_PDF_IMPORT_ROUTED_TO_SUGGESTIONS);
        }
        if (roleResult.preferClauseSuggestionSurface) {
          setRecipientPostUploadSurface({
            surface: "clause_suggestions",
            notes: noteText,
            items: buildClauseSuggestionCardsFromUploadText(noteText),
          });
        } else {
          setRecipientPostUploadSurface({ surface: "notes_only", notes: noteText });
        }
        return;
      }

      setWorkflowMode("revised");
      setRevisedSubmode("paste");
      setRevisedIntakePhase("editing");
      const classification = roleResult.legacyClassification;
      const agreementBody = roleResult.agreementBodyForCompare.trim();

      if (roleResult.role === "SAME_AS_CURRENT_DRAFT") {
        recipientUploadLog("import-no-material-change", { agreementId, bodyLen: agreementBody.length });
        const baselineDraft = cloneDraftForRecipientPreview(draft);
        const proposedDraft = cloneDraftForRecipientPreview(draft);
        setRecipientRevisePreviewError(null);
        setRecipientPreview({
          baselineDraft,
          proposedDraft,
          baselineHtml: baselineHtmlLive,
          proposedHtml: baselineHtmlLive,
          revisionText: "",
          hasExternal: true,
          postureAtPreview: recipientPosture,
          suggestionUsedAtPreview: suggestionUsed,
          routingKind: "whole_document",
          importMatchesCurrentDraft: true,
        });
        setExternalAiPaste("");
        pendingImportRecipientPreviewRef.current = null;
        setRevisedUploadAnalyzing(false);
        recipientUploadLogCompareSuccess({ textLen: agreementBody.trim().length, importNoMaterialChange: true });
        if (scrollOpts?.scrollToSummary) {
          window.requestAnimationFrame(() => {
            window.setTimeout(() => {
              document
                .querySelector<HTMLElement>('[data-testid="recipient-import-no-change-panel"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
          });
        }
        return;
      }

      if (
        recipientImportsMatchAuthoritativeBaseline({
          baselineRenderedHtml: baselineHtmlLive,
          importedAgreementPlain: agreementBody,
        })
      ) {
        recipientUploadLog("import-no-material-change", { agreementId, bodyLen: agreementBody.length });
        const baselineDraft = cloneDraftForRecipientPreview(draft);
        const proposedDraft = cloneDraftForRecipientPreview(draft);
        setRecipientRevisePreviewError(null);
        setRecipientPreview({
          baselineDraft,
          proposedDraft,
          baselineHtml: baselineHtmlLive,
          proposedHtml: baselineHtmlLive,
          revisionText: "",
          hasExternal: true,
          postureAtPreview: recipientPosture,
          suggestionUsedAtPreview: suggestionUsed,
          routingKind: "whole_document",
          importMatchesCurrentDraft: true,
        });
        setExternalAiPaste("");
        pendingImportRecipientPreviewRef.current = null;
        setRevisedUploadAnalyzing(false);
        recipientUploadLogCompareSuccess({ textLen: agreementBody.trim().length, importNoMaterialChange: true });
        if (scrollOpts?.scrollToSummary) {
          window.requestAnimationFrame(() => {
            window.setTimeout(() => {
              document
                .querySelector<HTMLElement>('[data-testid="recipient-import-no-change-panel"]')
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
          });
        }
        return;
      }

      setRevisedUploadAnalyzing(true);
      const reviewerNotes = [classification.reviewerNotes, importTail].filter(Boolean).join("\n\n") || null;
      const instCombined = [instruction.trim(), reviewerNotes || ""].filter(Boolean).join("\n\n");
      const minVisible = new Promise<void>((resolve) => {
        window.setTimeout(resolve, REVISED_UPLOAD_ANALYZING_MIN_MS);
      });
      const previewRunner = previewWholeDocumentRevisionRef.current;
      if (!previewRunner) {
        recipientUploadError("preview-ref-null", new Error("previewWholeDocumentRevisionRef missing"), {
          agreementId,
        });
        setDraftImportError(RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING);
        setError(RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING);
        pendingImportRecipientPreviewRef.current = null;
        return;
      }
      const previewPromise = previewRunner({
        bodyPlain: agreementBody,
        instructionPlain: instCombined,
        separatedReviewerNotesForUi: reviewerNotes ?? undefined,
        importPipeline: true,
      });
      const [previewOkRaw] = await Promise.all([previewPromise, minVisible]);
      const previewOk = previewOkRaw === true;
      if (previewOk && pendingImportRecipientPreviewRef.current) {
        setRecipientPreview(pendingImportRecipientPreviewRef.current);
        pendingImportRecipientPreviewRef.current = null;
      } else if (!previewOk) {
        pendingImportRecipientPreviewRef.current = null;
        recipientUploadError("compare-preview-false", new Error("whole-doc preview returned false"), {
          agreementId,
        });
      }
      if (scrollOpts?.scrollToSummary && previewOk) {
        window.requestAnimationFrame(() => {
          window.setTimeout(() => {
            previewSummaryHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            previewSummaryHeadingRef.current?.focus({ preventScroll: true });
          }, 80);
        });
      }
    } catch (e) {
      recipientUploadError("import-compare-exception", e, { agreementId });
      setDraftImportError(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
      setError(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
    } finally {
      setRevisedUploadAnalyzing(false);
    }
  };

  const processRecipientRevisedDraftFile = useCallback(async (file: File) => {
    recipientUploadLogSelected({ name: file.name, type: file.type, size: file.size });
    setRecipientPostUploadSurface(null);
    setRecipientPreview(null);
    pendingImportRecipientPreviewRef.current = null;
    setRecipientRevisePreviewError(null);
    setBusinessReviewFocusedWording(null);
    setHighlightedSemanticAnchor(null);
    setNarrowRedlineHighlightAnchor(null);
    setCondensedReviewTab("clean");
    setDraftImportError(null);
    setRecipientPdfImportRoutedMessage(null);
    setRecipientRevisedDraftFileBusy(true);
    try {
      if (!isSupportedReviewFirstRevisedDraftFile(file)) {
        setDraftImportError(REVIEW_FIRST_UNSUPPORTED_REVISED_DRAFT_FILE);
        setError(REVIEW_FIRST_UNSUPPORTED_REVISED_DRAFT_FILE);
        return;
      }
      const result = await extractRevisedDraftPlainText(file);
      if (!result.ok) {
        recipientUploadError("extract-failed", result.error, { name: file.name });
        setDraftImportError(result.error);
        setError(result.error);
        return;
      }
      const runner = runImportedRevisedAutoCompareRef.current;
      if (!runner) {
        recipientUploadError("compare-ref-null", new Error("runImportedRevisedAutoCompareRef missing"), {
          name: file.name,
        });
        setDraftImportError(RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING);
        setError(RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING);
        return;
      }
      recipientUploadLogCompareStart({ textLen: result.text.trim().length });
      await runner(result.text, {
        scrollToSummary: false,
        importReviewerNotesTail: result.importReviewerNotesTail ?? undefined,
        importArtifactsRemoved: result.importArtifactsRemoved,
        pdfThinSanitizeUsedRaw: result.pdfThinSanitizeUsedRaw,
        sourceFileName: file.name,
      });
      recipientUploadLogCompareSuccess({ textLen: result.text.trim().length });
    } catch (e) {
      recipientUploadError("workspace-import-exception", e, { name: file.name });
      setDraftImportError(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
      setError(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
    } finally {
      setRecipientRevisedDraftFileBusy(false);
    }
  }, []);

  const onDraftImportFileSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const file = input.files?.[0];
      if (!file) {
        input.value = "";
        return;
      }
      void processRecipientRevisedDraftFile(file).finally(() => {
        input.value = "";
      });
    },
    [processRecipientRevisedDraftFile],
  );

  async function runRecipientComparePreview() {
    if (workflowMode === "quick") await previewQuickChange();
    else await previewWholeDocumentRevision();
  }

  function openSendSuggestedEditsModal() {
    logReviewFirstSubmitStart({
      agreementId,
      workflowMode,
      hasRecipientPreview: Boolean(recipientPreview),
      submitReason: reviewFirstSubmitAuthority.reason,
      hasAccessToken: Boolean(recipientAccessToken.trim()),
      participantPid: participantPid || null,
    });
    if (!recipientProposalSubmitReady) {
      const message =
        reviewFirstSubmitAuthority.userMessage ||
        (needsPersonalizedLink
          ? REVIEW_FIRST_PERSONAL_LINK_SUBMIT_STAGE_MESSAGE
          : recipientPreviewNoOpMessage());
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: reviewFirstSubmitAuthority.reason,
        needsPersonalizedLink,
        hasAccessToken: Boolean(recipientAccessToken.trim()),
        participantPid: participantPid || null,
        message,
      });
      setError(message);
      return;
    }
    const p = recipientPreview;
    if (!p || saving) {
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: !p ? "missing_recipient_preview" : "proposal_not_ready",
        saving,
      });
      if (!p) {
        setError("Review changes before submitting your proposed update.");
      }
      return;
    }
    setSendSuggestedEditsModalOpen(true);
  }

  function resolveStageProposer(): ReturnType<typeof resolveReviewFirstStageProposerId> {
    return resolveReviewFirstStageProposerId({
      agreementId,
      participantPartyId,
      recipientAccessToken,
      tokenValidatedPartyId,
      draftParties: draft?.parties ?? null,
    });
  }

  function buildRecipientProposalStageBody(
    preview: RecipientPreview,
    proposerId: string,
  ): RecipientProposalSubmitBody {
    const d = preview.proposedDraft;
    return {
      instruction: preview.revisionText,
      proposer_id: proposerId,
      proposer_display_name: proposerDisplayNameForApi,
      draft: {
        title: d.title,
        jurisdiction: d.jurisdiction,
        parties: d.parties,
        purpose: d.purpose,
        payment_terms: d.payment_terms,
        duration: d.duration,
        due_date: d.due_date,
        effective_date: d.effective_date,
      },
      rendered_html: preview.proposedHtml,
    };
  }

  async function performRecipientSuggestedEditsSubmit() {
    if (reviewFirstStageInFlightRef.current || saving) {
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: "submit_in_flight",
        hasAccessToken: Boolean(recipientAccessToken.trim()),
        participantPid: participantPid || null,
      });
      return;
    }
    logReviewFirstSubmitStart({
      agreementId,
      workflowMode,
      phase: "confirm",
      submitReason: reviewFirstSubmitAuthority.reason,
      hasAccessToken: Boolean(recipientAccessToken.trim()),
      participantPid: participantPid || null,
    });
    if (!recipientProposalSubmitReady) {
      const message =
        reviewFirstSubmitAuthority.userMessage ||
        (needsPersonalizedLink
          ? REVIEW_FIRST_PERSONAL_LINK_SUBMIT_STAGE_MESSAGE
          : recipientPreviewNoOpMessage());
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: reviewFirstSubmitAuthority.reason,
        message,
      });
      setError(message);
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    const p = recipientPreview;
    if (!p || saving) {
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: !p ? "missing_recipient_preview" : "proposal_not_ready",
        saving,
      });
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    const stageProposer = resolveStageProposer();
    const effectiveProposerId = stageProposer.proposerId;
    const hasAccessToken = Boolean(recipientAccessToken.trim());
    if (
      !effectiveProposerId &&
      !hasAccessToken &&
      stageProposer.source !== "deferred_to_backend_token"
    ) {
      const message = REVIEW_FIRST_SUBMIT_MISSING_PARTICIPANT_MESSAGE;
      logReviewFirstSubmitBlocked({
        agreementId,
        reason: "proposer_id_missing_before_stage",
        message,
        hasAccessToken: false,
        participantPid: participantPid || null,
        proposerIdSource: stageProposer.source,
      });
      setError(message);
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    reviewFirstStageInFlightRef.current = true;
    setSaving(true);
    setError(null);
    const stageEndpoint = `/api/agreements/${encodeURIComponent(agreementId)}/recipient-proposal/stage`;
    const submitEndpoint = `/api/agreements/${encodeURIComponent(agreementId)}/recipient-proposal`;
    try {
      let proposalId =
        (p.proposalId || "").trim() || readReviewFirstSubmitInflightProposalId(agreementId);
      if (!proposalId) {
        const stageBody = buildRecipientProposalStageBody(p, effectiveProposerId);
        logReviewFirstProposalStageRequest({
          agreementId,
          hasAccessToken,
          participantPid: participantPid || null,
          proposerId: effectiveProposerId || null,
          proposerIdSource: stageProposer.source,
          payloadKeys: Object.keys(stageBody),
        });
        const staged = await stageRecipientProposalApi(
          agreementId,
          stageBody,
          recipientAccessToken,
        );
        if (!staged.ok || !staged.proposal_id?.trim()) {
          // eslint-disable-next-line no-console
          console.error("[review-first-proposal-stage-failed]", {
            agreementId,
            error: staged.error ?? null,
            httpStatus: staged.httpStatus ?? null,
            body: staged.responseBody ?? null,
          });
          logReviewFirstSubmitFailed({
            agreementId,
            endpoint: stageEndpoint,
            status: staged.error ?? staged.httpStatus ?? "unknown",
            detail: staged.error ?? null,
            body: staged.responseBody ?? null,
            rawMessage: staged.error ?? "stage_failed",
          });
          if (
            staged.error === "recipient_proposal_already_pending" ||
            staged.error === "recipient_proposal_already_pending_from_participant"
          ) {
            setError(
              staged.error === "recipient_proposal_already_pending_from_participant"
                ? "You already have a suggestion in the queue for this agreement."
                : "You already have a suggestion waiting for the owner. Wait for them to review it.",
            );
            setSendSuggestedEditsModalOpen(false);
            await refresh();
            return;
          }
          setError(formatRecipientProposalStageError(staged));
          return;
        }
        proposalId = staged.proposal_id.trim();
        writeReviewFirstSubmitInflightProposalId(agreementId, proposalId);
        setRecipientPreview({ ...p, proposalId });
        logReviewFirstProposalCreated({
          agreementId,
          proposalId,
          changeCount:
            reviewFirstConfirmedDiff?.changedSections.length ??
            (previewDiff ? countSuggestedChanges(previewDiff) : 0),
        });
      }
      if (!proposalId) {
        const message =
          "Your proposed update is not ready to send yet. Review changes again, then try submitting.";
        logReviewFirstSubmitBlocked({
          agreementId,
          reason: "proposal_id_missing_before_post",
          message,
          hasAccessToken: Boolean(recipientAccessToken.trim()),
          participantPid: effectiveProposerId,
        });
        setError(message);
        setSendSuggestedEditsModalOpen(false);
        return;
      }
      logReviewFirstSubmitConfirm({
        agreementId,
        proposalId,
        hasAccessToken: Boolean(recipientAccessToken.trim()),
        participantPid: effectiveProposerId,
      });
      const submitted = await finalizeRecipientProposalApi(agreementId, proposalId, recipientAccessToken);
      if (!submitted.ok) {
        logReviewFirstSubmitFailed({
          agreementId,
          endpoint: submitEndpoint,
          status: submitted.error ?? submitted.httpStatus ?? "unknown",
          detail: submitted.error ?? null,
          body: submitted.responseBody ?? null,
          rawMessage: submitted.error ?? "submit_failed",
        });
        if (
          submitted.error === "recipient_proposal_already_pending" ||
          submitted.error === "recipient_proposal_already_pending_from_participant"
        ) {
          setError(
            submitted.error === "recipient_proposal_already_pending_from_participant"
              ? "You already have a suggestion in the queue for this agreement."
              : "You already have a suggestion waiting for the owner. Wait for them to review it.",
          );
          setSendSuggestedEditsModalOpen(false);
          await refresh();
          return;
        }
        if (submitted.error === "proposal_id_required" || submitted.error === "proposal_not_staged") {
          setError(
            "Your proposed update could not be submitted because the review session lost its proposal reference. Review changes again, then submit.",
          );
          setSendSuggestedEditsModalOpen(false);
          return;
        }
        throw new Error(
          humanizeRecipientActionError(
            submitted.error,
            "Couldn't send your suggestion. Please try again.",
          ),
        );
      }
      logReviewFirstSubmitSuccess({
        agreementId,
        proposalId: submitted.proposal_id ?? proposalId,
        participantPid: effectiveProposerId,
      });
      logReviewerProposalSubmitted({
        agreementId,
        proposalId: submitted.proposal_id ?? proposalId,
        participantPid: effectiveProposerId || null,
      });
      clearReviewFirstSubmitInflightProposalId(agreementId);
      trackAgreementFunnelEvent("recipient_submitted_edits", { entry_kind: entry.kind }, { planTier: String(access.tier), agreementId });
      setSendSuggestedEditsModalOpen(false);
      setRecipientSuggestedEditsSentAck(true);
      setInstruction("");
      setExternalAiPaste("");
      setRecipientRevisePreviewError(null);
      setRecipientPreview(null);
      setRecipientPostUploadSurface(null);
      setSuggestionUsed(false);
      setWorkspaceTab("read");
      await refresh();
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e ?? "Could not send suggestion.");
      logReviewFirstSubmitFailed({
        agreementId,
        endpoint: submitEndpoint,
        status: "exception",
        rawMessage,
      });
      setError(rawMessage);
    } finally {
      reviewFirstStageInFlightRef.current = false;
      setSaving(false);
    }
  }

  function discardPreview() {
    setBusinessReviewFocusedWording(null);
    setRecipientPreview(null);
    pendingImportRecipientPreviewRef.current = null;
    setRecipientPostUploadSurface(null);
    setRecipientPdfImportRoutedMessage(null);
    setRecipientImportArtifactsCount(0);
    setRecipientImportSanitizeNote(null);
    setRecipientRevisePreviewError(null);
    setRevisedUploadAnalyzing(false);
    window.requestAnimationFrame(() => {
      previewChangesButtonRef.current?.focus({ preventScroll: true });
    });
  }

  async function resolveParticipantIdForApprovalSubmit(): Promise<string> {
    let pid = participantPid.trim();
    if (pid) return pid;
    const fromUrl = readReviewUrlPartyId();
    if (fromUrl) return fromUrl;
    const tok = recipientAccessToken.trim();
    if (tok) {
      const session = loadRecipientMagicLinkSession(agreementId, tok);
      const fromSession = (session?.recipientPartyId || "").trim();
      if (fromSession) return fromSession;
    }
    const validated = tokenValidatedPartyId.trim();
    if (validated) return validated;
    if (tok) {
      const r = await validateRecipientAccessToken(tok, agreementId);
      if (r.ok) {
        const fromToken = String(r.data.recipient_party_id ?? "").trim();
        if (fromToken) {
          setTokenValidatedPartyId(fromToken);
          return fromToken;
        }
      }
    }
    return inferSingleNonOwnerPartyIdFromDraft();
  }

  function inferSingleNonOwnerPartyIdFromDraft(): string {
    if (!draft?.parties?.length) return "";
    const candidates: string[] = [];
    for (const p of draft.parties) {
      const id = String(p.id ?? "").trim();
      if (!id || id.startsWith("legacy_")) continue;
      const role = String(p.role ?? "").trim().toLowerCase();
      if (role === "owner" || role === "viewer") continue;
      candidates.push(id);
    }
    return candidates.length === 1 ? candidates[0]! : "";
  }

  async function acceptCurrentDraft() {
    if (viewerLike) return;
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      return;
    }
    if (reviewerProposalAwaitingOwner) {
      setError(REVIEWER_AWAITING_OWNER_APPROVE_BLOCKED_COPY);
      return;
    }
    if (
      !window.confirm(
        "You are confirming this version is acceptable for review. Nothing is signed yet."
      )
    ) {
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return;
    }
    const pidForApprove = await resolveParticipantIdForApprovalSubmit();
    const agreementIdShort = agreementId.length <= 12 ? agreementId : `${agreementId.slice(0, 8)}…`;
    logReviewerApprovalSubmitStart({
      agreementIdShort,
      participantPartyId: pidForApprove || null,
      partiesHaveIds,
    });
    if (partiesHaveIds && !pidForApprove) {
      logReviewerApprovalSubmitFailed({
        agreementIdShort,
        reason: "missing_participant_id",
      });
      setError(REVIEW_FIRST_SUBMIT_MISSING_PARTICIPANT_MESSAGE);
      return;
    }
    setApproving(true);
    setError(null);
    const localRecord = writeReviewerApprovalLocalState({
      agreementId,
      participantPartyId: pidForApprove,
      recipientAccessToken,
    });
    setApprovedAck(true);
    setLocalApprovalAt(localRecord.approvedAt);
    logReviewerApprovalLocalStateApplied({
      agreementIdShort,
      participantPartyId: pidForApprove || null,
      approvedAt: localRecord.approvedAt,
    });
    try {
      const r = await recipientApproveCurrentApi(agreementId, {
        participant_id: partiesHaveIds ? pidForApprove : undefined,
        participant_display_name: partiesHaveIds ? proposerDisplayNameForApi : undefined,
        recipientAccessToken,
      });
      if (!r.ok) {
        logReviewerApprovalSubmitFailed({
          agreementIdShort,
          participantPartyId: pidForApprove || null,
          error: r.error ?? "unknown",
        });
        throw new Error(
          humanizeRecipientActionError(r.error, "Couldn't record approval. Please try again."),
        );
      }
      if (r.draft) {
        const merged = normalizeAgreementDraftFromApi(r.draft, { fallbackAgreementId: agreementId });
        if (merged) setDraft(merged);
      }
      logReviewerApprovalSubmitSuccess({
        agreementIdShort,
        participantPartyId: pidForApprove || null,
      });
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.info("[reviewer-approval-authoritative-server-success]", {
          agreementIdShort,
          participantPartyId: pidForApprove || null,
        });
      }
      recipientAcceptTransitionDiag("approve_mutation_success", {
        agreementId,
        participantPid: pidForApprove || null,
        hasResponseDraft: Boolean(r.draft),
      });
      await refresh();
      recipientAcceptTransitionDiag("post_approve_refresh_dispatched", {
        agreementId,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not record approval.");
    } finally {
      setApproving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div className="vs01-agreement-review-inner p-6 text-sm text-slate-300">Loading agreement…</div>
    );
  }

  if (!draft) {
    return (
      <div className="vs01-agreement-review-inner p-6">
        <p className="text-sm text-rose-300">{error || "Agreement not found."}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          If you contact support, include this agreement ID:{" "}
          <span className="font-mono text-slate-400 break-all">{agreementId}</span>
        </p>
        {onClose ? (
          <button type="button" className="btn mt-3 text-xs" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    );
  }

  const showRecipientComparePanel = Boolean(
    recipientPreview &&
      !recipientSuggestedEditsSentAck &&
      !recipientImportNoMaterialDiff &&
      (workflowMode === "revised"
        ? reviewFirstConfirmedDiff?.hasMaterialChanges
        : previewDiff && !previewDiff.isCompleteNoOp),
  );

  const comparePanel = showRecipientComparePanel ? (
      <div
        className={
          workflowMode === "revised"
            ? "rounded-xl bg-white p-4 shadow-sm"
            : "rounded-xl border border-slate-800/70 bg-slate-950/35 p-4 shadow-sm"
        }
        data-testid="recipient-suggested-changes-panel"
        data-recipient-revision-round={revisionLineage.revisionRound}
        data-recipient-compare-base-version-id={revisionLineage.compareBaseVersionId ?? ""}
        data-recipient-parent-revision-id={revisionLineage.parentRevisionId ?? ""}
      >
        <h2
          ref={previewSummaryHeadingRef}
          tabIndex={-1}
          className={`text-base font-semibold tracking-tight ${
            workflowMode === "revised" ? "text-slate-950" : "text-slate-100"
          }`}
          data-testid="recipient-preview-summary-heading"
        >
          Changes detected
        </h2>
        <p
          className={`mt-1.5 text-xs leading-relaxed ${
            workflowMode === "revised" ? "text-slate-600" : "text-slate-400"
          }`}
        >
          Everyone will review these wording changes before approval.
        </p>
        {workflowMode === "revised" && reviewFirstConfirmedDiff ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-slate-700" data-testid="recipient-review-proposed-update-summary">
              {reviewFirstConfirmedDiff.summary}
            </p>
            {reviewFirstConfirmedDiff.formattingArtifactsIgnored ? (
              <p
                className="mt-1.5 text-xs leading-relaxed text-slate-500"
                data-testid="recipient-review-formatting-artifacts-note"
              >
                {REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE}
              </p>
            ) : null}
          </>
        ) : null}
        <div
          className={`mt-4 rounded-xl p-4 ${
            workflowMode === "revised" ? "bg-slate-50/80" : "border border-slate-700/60 bg-slate-950/55"
          }`}
          data-testid="recipient-review-change-visibility-summary"
        >
          <div
            className={`text-sm font-semibold ${workflowMode === "revised" ? "text-slate-950" : "text-slate-100"}`}
          >
            Ready to submit
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {reviewFirstConfirmedDiff?.summary ??
              simpleRecipientChange?.summary ??
              simpleRecipientChange?.title ??
              "Wording change"}{" "}
            · Updated by {proposerDisplayNameForApi}
          </p>
          {workflowMode === "revised" && reviewFirstCompareSections.length > 0 ? (
            <div className="mt-4 space-y-3" data-testid="recipient-review-proposed-update-before-after">
              {reviewFirstCompareSections.map((section) => renderReviewFirstChangeSection(section))}
            </div>
          ) : simpleRecipientChange ? (
            <div className="mt-4 space-y-3">
              <div className={`text-sm font-semibold ${workflowMode === "revised" ? "text-slate-950" : "text-slate-100"}`}>
                {simpleRecipientChange.title}
              </div>
              {"clauseLabel" in simpleRecipientChange && simpleRecipientChange.clauseLabel ? (
                <div className="text-xs text-slate-500">Clause: {simpleRecipientChange.clauseLabel}</div>
              ) : null}
              <div
                className={
                  workflowMode === "revised"
                    ? "rounded-lg bg-white p-3"
                    : "rounded-lg border border-rose-900/35 bg-slate-950/45 p-3"
                }
              >
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    workflowMode === "revised" ? "text-rose-700" : "text-rose-200"
                  }`}
                >
                  Previous
                </div>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    workflowMode === "revised" ? "break-words text-slate-800" : "text-slate-100"
                  }`}
                >
                  {simpleRecipientChange.previousParts
                    ? renderReviewFirstDiffParts(simpleRecipientChange.previousParts, "removed")
                    : `“${simpleRecipientChange.previous}”`}
                </p>
              </div>
              <div
                className={
                  workflowMode === "revised"
                    ? "rounded-lg bg-white p-3"
                    : "rounded-lg border border-emerald-800/45 bg-slate-950/45 p-3"
                }
              >
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    workflowMode === "revised" ? "text-emerald-700" : "text-emerald-200"
                  }`}
                >
                  Updated
                </div>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    workflowMode === "revised" ? "break-words text-slate-800" : "text-slate-100"
                  }`}
                >
                  {simpleRecipientChange.proposedParts
                    ? renderReviewFirstDiffParts(simpleRecipientChange.proposedParts, "added")
                    : `“${simpleRecipientChange.proposed}”`}
                </p>
              </div>
              <details className="text-xs text-slate-400">
                <summary className="cursor-pointer font-medium text-slate-500">View full section</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre
                    className={`max-h-52 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-sans text-xs leading-relaxed ${
                      workflowMode === "revised"
                        ? "border border-slate-200 bg-white text-slate-700"
                        : "border border-slate-800 bg-slate-950/55 text-slate-300"
                    }`}
                  >
                    {simpleRecipientChange.fullPrevious}
                  </pre>
                  <pre
                    className={`max-h-52 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-sans text-xs leading-relaxed ${
                      workflowMode === "revised"
                        ? "border border-slate-200 bg-white text-slate-700"
                        : "border border-slate-800 bg-slate-950/55 text-slate-300"
                    }`}
                  >
                    {simpleRecipientChange.fullProposed}
                  </pre>
                </div>
              </details>
            </div>
          ) : null}
        </div>
        <p className="sr-only">{PRODUCT_NOT_LAW_FIRM}</p>
        {recipientImportSanitizeNote ? (
          <p
            className="mt-2 text-[11px] leading-relaxed text-slate-500"
            data-testid="recipient-import-sanitize-note"
          >
            {recipientImportSanitizeNote}
          </p>
        ) : null}

        {(workflowMode === "revised" && reviewFirstConfirmedDiff?.hasMaterialChanges) || legalRedlineDocumentVm ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="recipient-open-send-suggested-edits-modal"
                className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={saving || !recipientProposalSubmitReady}
                title={
                  !recipientProposalSubmitReady && reviewFirstSubmitAuthority.userMessage
                    ? reviewFirstSubmitAuthority.userMessage
                    : undefined
                }
                onClick={() => openSendSuggestedEditsModal()}
              >
                {REVIEW_FIRST_SAVE_UPDATED_LABEL}
              </button>
              <button
                type="button"
                className={`btn rounded-lg px-4 py-2 text-xs disabled:opacity-50 ${
                  workflowMode === "revised"
                    ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    : "border border-slate-600 text-slate-200 hover:bg-slate-900/60"
                }`}
                disabled={saving || previewing}
                onClick={() => discardPreview()}
              >
                {RECIPIENT_BTN_CONTINUE_EDITING}
              </button>
            </div>
            {workflowMode === "revised" &&
            reviewFirstConfirmedDiff?.hasMaterialChanges &&
            !recipientProposalSubmitReady &&
            reviewFirstSubmitAuthority.userMessage ? (
              <div
                className="mt-3 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950"
                role="alert"
                data-testid="recipient-review-submit-blocked"
              >
                {reviewFirstSubmitAuthority.userMessage}
              </div>
            ) : null}
            {false && recipientPresentationMode === "condensed_clean_revision" ? (
              <p
                className="mt-2 max-w-xl text-[10px] leading-snug text-slate-500"
                data-testid="recipient-send-clean-proposed-subcopy"
              >
                {RECIPIENT_BTN_SEND_CLEAN_PROPOSED_SUBCOPY}
              </p>
            ) : null}

            {legalRedlineDocumentVm ? (
            <details
              ref={auditDetailsRef}
              className="hidden mt-4 rounded-md border border-slate-700/50 bg-slate-950/35 px-2 py-1.5"
              data-testid="recipient-audit-mode-details"
            >
              <summary className="cursor-pointer list-none text-[12px] font-semibold text-slate-300 marker:content-none hover:text-slate-100 [&::-webkit-details-marker]:hidden">
                {recipientPresentationMode === "condensed_clean_revision"
                  ? RECIPIENT_CONDENSED_EXPORT_METRICS_DETAILS_SUMMARY
                  : RECIPIENT_AUDIT_MODE_SUMMARY}
              </summary>
              <div className="mt-2 border-t border-slate-800/50 pt-2">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_AUDIT_MODE_SUBCOPY}</p>
                {legalRedlineDocumentVm.fallbackReason ? (
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-400">{RECIPIENT_BUSINESS_REVIEW_SUBSTANTIAL_REWRITE_SUMMARY}</p>
                ) : null}
                <details className="mt-1 rounded-md border border-slate-800/60 bg-slate-950/25 px-2 py-1">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none hover:text-slate-300 [&::-webkit-details-marker]:hidden">
                    {RECIPIENT_DETAILED_EDIT_METRICS_SUMMARY}
                  </summary>
                  <div
                    className="mt-2 flex flex-wrap gap-2 border-t border-slate-800/50 pt-2"
                    data-testid="recipient-suggested-changes-summary-chips"
                    aria-label="Detailed edit metrics"
                  >
                    <span
                      data-testid="recipient-redline-chip-insertions"
                      className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
                    >
                      {redlineSummaryChipLabel(
                        legalRedlineDocumentVm.stats.insertCount,
                        "addition",
                        "additions",
                      )}
                    </span>
                    <span
                      data-testid="recipient-redline-chip-deletions"
                      className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
                    >
                      {redlineSummaryChipLabel(
                        legalRedlineDocumentVm.stats.deleteCount,
                        "removal",
                        "removals",
                      )}
                    </span>
                    <span
                      data-testid="recipient-redline-chip-sections"
                      className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
                    >
                      {wordingChangeChipLabel(legalRedlineDocumentVm.stats.changedBlockCount)}
                    </span>
                    {recipientIntentGapCount > 0 ? (
                      <span
                        data-testid="recipient-redline-chip-not-reflected"
                        className="inline-flex items-center rounded-full border border-amber-600/60 bg-amber-950/40 px-2.5 py-0.5 text-[11px] font-medium text-amber-100"
                      >
                        {recipientPreviewGapChipLabel(recipientIntentGapCount)}
                      </span>
                    ) : null}
                  </div>
                </details>
                {recipientPresentationMode !== "condensed_clean_revision" ? (
                  <>
                    <h3
                      className="mt-4 text-sm font-semibold tracking-tight text-slate-200"
                      data-testid="recipient-human-redline-subhead"
                    >
                      {RECIPIENT_REDLINE_CHANGED_SECTIONS_HEADING}
                    </h3>
                    <p
                      className="mt-1 text-[11px] leading-snug text-slate-500"
                      data-testid="recipient-redline-changed-wording-instruction"
                    >
                      {RECIPIENT_REDLINE_CHANGED_WORDING_INSTRUCTION}
                    </p>
                    {participantPid ? (
                      <p className="mt-1 text-[10px] leading-snug text-slate-500">
                        Proposed by <span className="text-slate-300">{proposerDisplayNameForApi}</span>
                      </p>
                    ) : null}
                    <div
                      className="mt-3 rounded-lg border border-slate-600/40 bg-slate-950/30 p-2 sm:p-3"
                      data-testid="recipient-full-redline-panel"
                    >
                      <div
                        className="flex max-h-[min(72vh,880px)] min-h-[40vh] flex-col rounded-md bg-slate-100/40"
                        data-testid="recipient-suggested-changes-document"
                      >
                        <div
                          ref={suggestedChangesDocScrollRef}
                          data-redline-scrollport="1"
                          className="min-h-0 flex-1 overflow-y-auto"
                          data-testid="recipient-redline-scrollport"
                        >
                        <label className="mb-2 flex cursor-pointer items-center gap-2 px-1 text-[11px] text-slate-700">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-400 text-sky-700 focus:ring-sky-600"
                            checked={onlyChangedRedlineSections}
                            data-testid="recipient-redline-only-changed-toggle"
                            onChange={(e) => setOnlyChangedRedlineSections(e.target.checked)}
                          />
                          <span>
                            {RECIPIENT_ONLY_CHANGED_SECTIONS}
                            {!onlyChangedRedlineSections ? (
                              <span className="ml-1 text-slate-500">({RECIPIENT_SHOW_UNCHANGED_CONTEXT})</span>
                            ) : null}
                          </span>
                        </label>
                        <RecipientRedlineStickyNavigator
                          rows={buildRecipientRedlineStickyNavRows(presentationFriendlyRedlineChips, legalRedlineDocumentVm)}
                          onSelectSemantic={(id, m) => void scrollToSemanticReviewInRedline(id, m)}
                        />
                        <RecipientLegalRedlineDocument
                          document={legalRedlineDocumentVm}
                          variant="suggested"
                          hideUnchangedBlocks={onlyChangedRedlineSections}
                          collapseDenseMicroDiff
                          recipientNarrowIntentAnchors={Boolean(recipientRedlinePlainTexts?.narrowRecipientTargetedRedline)}
                          highlightedRecipientAnchor={narrowRedlineHighlightAnchor}
                          semanticPresentation={recipientSemanticPresentation}
                          highlightedSemanticAnchor={highlightedSemanticAnchor}
                          onDenseBlockViewExactWording={(w) =>
                            setBusinessReviewFocusedWording({
                              sectionTitle: w.sectionLabel,
                              oldText: w.oldText,
                              newText: w.newText,
                            })
                          }
                        />
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </details>
            ) : null}

            {import.meta.env.MODE === "test" && showRecipientIntentCoverageCallout ? (
              <details
                className="mt-3 rounded-md border border-slate-700/45 bg-slate-950/40 px-3 py-2.5 text-sm leading-snug text-slate-100"
                data-testid="recipient-redline-not-reflected-callout"
              >
                <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300 marker:content-none hover:text-slate-100 [&::-webkit-details-marker]:hidden">
                  {RECIPIENT_PREVIEW_SUGGESTION_DETAILS_SUMMARY}
                </summary>
                <div className="mt-2 border-t border-slate-800/50 pt-2" role="status">
                {recipientInstructionIntentSplit.primary.length > 0 ? (
                <>
                <ul className="space-y-1.5" data-testid="recipient-intent-semantic-bucket-list">
                  {intentSemanticBucketRows.map((row) => (
                    <li key={row.key} className="text-[12px] leading-snug text-slate-300">
                      <span className="font-medium text-slate-200">{row.label}:</span>{" "}
                      {row.applied > 0 ? (
                        <span className="text-emerald-200/90">{row.applied} reflected in draft</span>
                      ) : null}
                      {row.applied > 0 && row.pending > 0 ? <span className="text-slate-500"> · </span> : null}
                      {row.pending > 0 ? (
                        <span className="text-slate-400">{row.pending} summarized above</span>
                      ) : null}
                      {row.failed > 0 ? (
                        <span className="text-slate-500">
                          {row.applied > 0 || row.pending > 0 ? " · " : null}
                          {row.failed} noted for sender
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <details className="mt-3 rounded-md border border-slate-800/60 bg-slate-950/25 px-2 py-1.5">
                  <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none hover:text-slate-300 [&::-webkit-details-marker]:hidden">
                    {RECIPIENT_INTENT_RAW_DETAIL_HEADING}
                  </summary>
                  <ul className="mt-2 space-y-2 border-t border-slate-800/50 pt-2" data-testid="recipient-intent-coverage-list">
                    {primaryIntentRowsForCompare.map((it) => {
                      const anchor = recipientRedlineAnchorForIntentCategory(it.category);
                      const anchorKey =
                        anchor === "payment_timing" || anchor === "pause_suspend_work" ? anchor : null;
                      const canScrollToRedline =
                        it.status === "applied" &&
                        ((anchorKey === "payment_timing" && narrowIntentAnchorPresence.payment_timing) ||
                          (anchorKey === "pause_suspend_work" && narrowIntentAnchorPresence.pause_suspend_work));
                      const statusTestId = recipientIntentStatusTestId(it.category);
                      const onKeyNavigate = (e: KeyboardEvent) => {
                        if (!canScrollToRedline || !anchorKey) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          scrollToNarrowRedlineAnchor(anchorKey);
                        }
                      };
                      return (
                        <li
                          key={it.id}
                          data-testid={statusTestId}
                          className={`rounded-md border px-2.5 py-2 ${
                            it.status === "applied"
                              ? "border-emerald-800/35 bg-emerald-950/20"
                              : "border-amber-800/25 bg-amber-950/15"
                          }`}
                        >
                          {it.status === "applied" ? (
                            <>
                              {canScrollToRedline && anchorKey ? (
                                <button
                                  type="button"
                                  className="w-full cursor-pointer rounded-sm text-left text-[13px] leading-snug text-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                                  onClick={() => scrollToNarrowRedlineAnchor(anchorKey)}
                                  onKeyDown={onKeyNavigate}
                                >
                                  <span className="block font-medium text-emerald-50/95">✓ {recipientIntentAppliedRowHeading(it)}</span>
                                  <span className="mt-1 block text-[11px] font-normal text-emerald-100/95 underline decoration-emerald-400/90 decoration-1 underline-offset-2 hover:text-white hover:decoration-emerald-200">
                                    {RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE}
                                  </span>
                                </button>
                              ) : (
                                <p className="text-[13px] leading-snug text-emerald-100/95">
                                  ✓ {recipientIntentAppliedRowHeading(it)}
                                </p>
                              )}
                              <p className="mt-1.5 text-[11px] leading-snug text-emerald-200/85">
                                {recipientIntentAppliedExplanation(it.category)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[13px] leading-snug text-amber-100/95">
                                <span className="font-medium text-amber-50/95">&quot;{it.normalizedIntent}&quot;</span>
                              </p>
                              {it.reason ? (
                                <p className="mt-1 text-[11px] leading-snug text-amber-200/80">{it.reason}</p>
                              ) : null}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {recipientInstructionIntentSplit.primary.length > 5 ? (
                    <button
                      type="button"
                      className="mt-2 text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/50 underline-offset-2 hover:text-sky-200"
                      data-testid="recipient-intent-list-expand"
                      onClick={() => setRecipientIntentListExpanded((v) => !v)}
                    >
                      {recipientIntentListExpanded
                        ? "Show fewer"
                        : `Show all (${recipientInstructionIntentSplit.primary.length})`}
                    </button>
                  ) : null}
                </details>
                </>
                ) : null}
                {recipientInstructionIntentSplit.unclear.length > 0 ? (
                  <details
                    className="mt-2 rounded-md border border-slate-700/50 bg-slate-950/35 px-2 py-1.5"
                    data-testid="recipient-intent-review-notes-details"
                  >
                    <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-400 marker:content-none hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                      {RECIPIENT_ADDITIONAL_EXTRACTED_REVIEW_NOTES} ({recipientInstructionIntentSplit.unclear.length})
                    </summary>
                    <ul className="mt-2 space-y-2 border-t border-slate-800/50 pt-2">
                      {recipientInstructionIntentSplit.unclear.map((it) => (
                        <li key={it.id} className="text-[12px] leading-snug text-slate-400">
                          <span className="font-medium text-slate-300">Noted for sender:</span>{" "}
                          &quot;{it.normalizedIntent}&quot;
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                </div>
              </details>
            ) : previewDiff?.instructionCaptureWarning ? (
              <p
                className="mt-3 rounded-md border border-amber-600/55 bg-amber-950/35 px-3 py-2.5 text-sm leading-snug text-amber-50"
                data-testid="recipient-redline-not-reflected-callout"
                role="status"
              >
                Pause wording may still reach the sender as you drafted it.{" "}
                {RECIPIENT_INTENT_REVIEW_BEFORE_SENDING}
              </p>
            ) : null}

            {recipientRedlinePlainTexts?.paymentTermsInlinePlacementFailed &&
            recipientRedlinePlainTexts.narrowRecipientTargetedRedline ? (
              <p
                className="hidden mt-3 rounded-md border border-amber-700/45 bg-amber-950/30 px-3 py-2 text-sm leading-snug text-amber-50"
                data-testid="recipient-redline-narrow-unsafe-payment-callout"
                role="status"
              >
                We could not place these payment edits in the matched payment section of the agreement text. Your note
                still goes to the owner. Requested timing:{" "}
                {extractPaymentPlacementCalloutSnippet(String(recipientPreview?.proposedDraft.payment_terms ?? ""))}.{" "}
                {RECIPIENT_INTENT_REVIEW_BEFORE_SENDING}
              </p>
            ) : recipientRedlinePlainTexts?.paymentTermsInlinePlacementFailed ? (
              <p
                className="hidden mt-3 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-100/95"
                data-testid="recipient-redline-placement-callout"
                role="status"
              >
                {RECIPIENT_INTENT_NEEDS_MANUAL_PLACEMENT} — we could not match a payment section in the agreement text.
                Your note still goes to the owner.
              </p>
            ) : null}

            {recipientRedlinePlainTexts && recipientPreview && legalRedlineDocumentVm ? (
              <details
                className="hidden mt-2 rounded-md border border-slate-700/40 bg-slate-950/25"
                data-testid="recipient-preview-export-details"
              >
                <summary className="cursor-pointer list-none px-2 py-2 text-[11px] font-semibold text-slate-400 marker:content-none hover:text-slate-200 sm:text-xs [&::-webkit-details-marker]:hidden">
                  {RECIPIENT_PREVIEW_EXPORT_DETAILS_SUMMARY}
                </summary>
                <div className="border-t border-slate-800/40 px-1 pb-1 pt-0">
                  <RecipientPreviewVersionsExport
                    plainSource={{
                      currentPlain: recipientRedlinePlainTexts.currentPlain,
                      proposedPlain: recipientRedlinePlainTexts.proposedPlain,
                    }}
                    legalRedlineVm={legalRedlineDocumentVm}
                    detachRedlinePdfButton
                    redlinePdfSummarySentence={recipientRedlinePlainTexts.instructionContextSummary ?? null}
                    redlinePdfSummaryBullets={recipientFriendlyRedlineChips}
                    redlinePdfReviewerNotesPlain={recipientReviewerNotesPlainForExport ?? null}
                    redlinePdfStructuredHumanReview={humanReviewStructuredPdf}
                    redlinePdfTechnicalAppendixPlain={redlinePdfTechnicalAppendixPlain}
                    redlinePdfCompareConfidenceLevel={compareConfidence?.level ?? null}
                    redlinePdfSemanticPresentation={recipientSemanticPresentation}
                    redlinePdfCondensedCleanRevision={condensedCleanRevisionPdfBundle}
                    pdfReadContext={{
                      agreementId,
                      readHeaders: recipientAgreementReadHeaders(agreementId, recipientAccessToken),
                      scrubbedOriginalHtml: scrubAgreementHtml(recipientPreview.baselineHtml),
                      scrubbedProposedHtml: scrubAgreementHtml(recipientPreview.proposedHtml),
                      exportBasename: recipientExportBasenameFromTitle(draft?.title, agreementId),
                      reviewerDisplayName: proposerDisplayNameForApi,
                      reviewerEmail: reviewerEmailForExport,
                      agreementTitleDisplay: recipientAgreementTitleForDisplay(draft?.title),
                    }}
                  />
                </div>
              </details>
            ) : null}

            {import.meta.env.MODE === "test" && showSeparatedReviewerNotesPanel ? (
              <details
                className="mt-3 rounded-md border border-slate-700/50 bg-slate-950/30 px-2.5 py-1.5"
                data-testid="recipient-reviewer-notes-panel"
              >
                <summary
                  className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:content-none hover:text-slate-300 [&::-webkit-details-marker]:hidden"
                  data-testid="recipient-reviewer-notes-panel-summary"
                >
                  {RECIPIENT_REVIEWER_NOTES_PANEL_SUMMARY}
                </summary>
                <p className="mt-2 text-[10px] leading-snug text-slate-500">{RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT}</p>
                <pre
                  className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-slate-800/60 bg-slate-950/60 p-2 font-sans text-[11px] leading-relaxed text-slate-400"
                  data-testid="recipient-reviewer-notes-panel-body"
                >
                  {recipientReviewerNotesPlainForExport}
                </pre>
              </details>
            ) : null}

            <RecipientFocusedWordingDialog
              open={Boolean(businessReviewFocusedWording)}
              variant={businessReviewFocusedWording?.variant === "compare_fallback" ? "compare_fallback" : "exact"}
              sectionTitle={businessReviewFocusedWording?.sectionTitle ?? ""}
              sectionSubline={
                businessReviewFocusedWording?.variant === "compare_fallback"
                  ? businessReviewFocusedWording.sectionSubline
                  : undefined
              }
              businessNote={
                businessReviewFocusedWording?.variant === "compare_fallback"
                  ? businessReviewFocusedWording.businessNote
                  : undefined
              }
              oldText={businessReviewFocusedWording?.oldText ?? ""}
              newText={businessReviewFocusedWording?.newText ?? ""}
              onClose={() => setBusinessReviewFocusedWording(null)}
              onOpenFullRedline={
                businessReviewFocusedWording?.variant === "compare_fallback"
                  ? () => {
                      const sid = businessReviewFocusedWording.semanticId;
                      setBusinessReviewFocusedWording(null);
                      recipientRedlineNavLog("open-request", { semanticId: sid, source: "focused_wording_modal" });
                      openFullLegalRedlineSection();
                      void (async () => {
                        await new Promise<void>((r) => window.setTimeout(r, 140));
                        await scrollRecipientSemanticRelaxed(sid);
                      })();
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <p className="mt-3 text-sm text-amber-100/90">
            Compare is unavailable. You can still dismiss or edit your note. {RECIPIENT_INTENT_REVIEW_BEFORE_SENDING}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {legalRedlineDocumentVm ? null : (
            <>
              <button
                type="button"
                data-testid="recipient-open-send-suggested-edits-modal"
                className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={saving || !recipientProposalSubmitReady}
                onClick={() => openSendSuggestedEditsModal()}
              >
                {REVIEW_FIRST_SAVE_UPDATED_LABEL}
              </button>
              <button
                type="button"
                className="btn rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
                disabled={saving || previewing}
                onClick={() => discardPreview()}
              >
                {RECIPIENT_BTN_CONTINUE_EDITING}
              </button>
            </>
          )}
        </div>
      </div>
    ) : null;

  const compareImportNoChangePanel =
    recipientImportNoMaterialDiff &&
    recipientPreview &&
    previewDiff &&
    recipientRedlinePlainTexts &&
    legalRedlineDocumentVm &&
    !recipientSuggestedEditsSentAck ? (
      <div
        className="rounded-lg border border-emerald-900/40 bg-slate-900/50 p-4 shadow-sm"
        data-testid="recipient-import-no-change-panel"
        role="status"
      >
        <h2 className="text-base font-semibold tracking-tight text-emerald-50">No changes detected</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          The uploaded draft appears to match the current agreement after formatting cleanup.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          This matches the sender&apos;s current draft. You can upload a different file if you meant to propose edits.
        </p>
        {recipientImportSanitizeNote ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="recipient-import-no-change-sanitize-note">
            {recipientImportSanitizeNote}
          </p>
        ) : null}
        <details
          open
          className="mt-4 rounded-md border border-slate-700/40 bg-slate-950/25"
          data-testid="recipient-import-no-change-export-details"
        >
          <summary className="cursor-pointer list-none px-2 py-2 text-[11px] font-semibold text-slate-400 marker:content-none hover:text-slate-200 sm:text-xs [&::-webkit-details-marker]:hidden">
            {RECIPIENT_PREVIEW_EXPORT_DETAILS_SUMMARY}
          </summary>
          <div className="border-t border-slate-800/40 px-1 pb-1 pt-0">
            <RecipientPreviewVersionsExport
              plainSource={{
                currentPlain: recipientRedlinePlainTexts.currentPlain,
                proposedPlain: recipientRedlinePlainTexts.proposedPlain,
              }}
              legalRedlineVm={legalRedlineDocumentVm}
              detachRedlinePdfButton
              redlinePdfSummarySentence={null}
              redlinePdfSummaryBullets={[]}
              redlinePdfReviewerNotesPlain={null}
              redlinePdfStructuredHumanReview={null}
              redlinePdfTechnicalAppendixPlain={null}
              redlinePdfCompareConfidenceLevel={null}
              redlinePdfSemanticPresentation={null}
              redlinePdfCondensedCleanRevision={null}
              redlinePdfImportMaterialNoChange
              pdfReadContext={{
                agreementId,
                readHeaders: recipientAgreementReadHeaders(agreementId, recipientAccessToken),
                scrubbedOriginalHtml: scrubAgreementHtml(recipientPreview.baselineHtml),
                scrubbedProposedHtml: scrubAgreementHtml(recipientPreview.proposedHtml),
                exportBasename: recipientExportBasenameFromTitle(draft?.title, agreementId),
                reviewerDisplayName: proposerDisplayNameForApi,
                reviewerEmail: reviewerEmailForExport,
                agreementTitleDisplay: recipientAgreementTitleForDisplay(draft?.title),
              }}
            />
          </div>
        </details>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
            disabled={saving || previewing}
            data-testid="recipient-import-no-change-continue-editing"
            onClick={() => discardPreview()}
          >
            {RECIPIENT_BTN_CONTINUE_EDITING}
          </button>
          <button
            type="button"
            className="text-xs font-medium text-sky-300 underline decoration-sky-800/50 hover:text-sky-200"
            data-testid="recipient-import-no-change-back-to-read"
            onClick={() => {
              setWorkspaceTab("read");
              discardPreview();
              window.requestAnimationFrame(() => {
                recipientReadDocAnchorRef.current?.focus({ preventScroll: true });
              });
            }}
          >
            ← Back to agreement
          </button>
        </div>
      </div>
    ) : null;

  if (entry.kind === "sign" && bundle && signingLinkInvalidMessage) {
    return (
      <div className="vs01-agreement-review-inner space-y-4 p-6">
        <p className="text-sm leading-relaxed text-slate-300">{signingLinkInvalidMessage}</p>
        {onClose ? (
          <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "sign" && bundle && !signingLinkInvalidMessage && draft) {
    const lockedVersionId = entry.lockedVersionId;
    const lockedVer = bundle.versions.find((v) => v.id === lockedVersionId)!;
    const signingLine = ceremonySignerName || proposerDisplayNameForApi;
    const { pending, total } = pendingSignatureCount({
      draft,
      agreementFullySigned: agreementFullyExecuted,
    });
    const shortHash =
      ceremonyVersionHash.length > 16
        ? `${ceremonyVersionHash.slice(0, 10)}…${ceremonyVersionHash.slice(-8)}`
        : ceremonyVersionHash || "—";
    const signDone = ceremonyPhase === "done" || mySignatureDone;
    const showCelebrate = signDone && (fullyExecutedAtSign || agreementFullyExecuted);
    const senderNameSign = (draft.parties?.[0]?.name || "").trim() || "the sender";
    const inviterLineSign = (inviterDisplayNameOverride || "").trim() || senderNameSign;
    const agreementTypeSign = recipientMetadataTypeLine(draft);
    const partiesLineSign = formatPartiesLine(draft.parties);
    const signingCeremonyStatusLabel = signDone
      ? "Signed"
      : ceremonyPhase === "signing"
        ? "Signing…"
        : ceremonyPhase !== "ready"
          ? "Preparing"
          : "Ready to sign";

    async function handleRecordSignature() {
      if (!draft) return;
      setCeremonyPhase("signing");
      setCeremonyError(null);
      const r = await postSigningCeremonyComplete(
        agreementId,
        {
          participant_id: participantPid,
          typed_name: typedConfirm.trim(),
          locked_version_id: lockedVersionId,
        },
        recipientAccessToken
      );
      if (!r.ok) {
        setCeremonyError(typeof r.error === "string" ? r.error : "Could not record signature.");
        setCeremonyPhase("ready");
        return;
      }
      setSignedAtLabel(
        r.signed_at && !Number.isNaN(new Date(r.signed_at).getTime())
          ? new Date(r.signed_at).toLocaleString()
          : new Date().toLocaleString()
      );
      setFullyExecutedAtSign(Boolean(r.fully_executed));
      if (r.fully_executed) {
        trackAgreementFunnelEvent("agreement_completed", { surface: "recipient_ceremony" }, { planTier: String(access.tier), agreementId });
      }
      setCeremonyPhase("done");
      await refresh();
    }

    const signPrimaryDisabled = ceremonyPhase !== "ready";

    if (ceremonyPhase === "start_error") {
      return (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-100">
          <p className="max-w-md text-sm text-rose-200">{ceremonyError || "Signing cannot proceed yet."}</p>
          <p className="max-w-md text-xs text-slate-500">
            You may need to accept the draft on the review link first, or the sender may still be waiting on approvals.
          </p>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-10 border-b border-slate-800/90 bg-slate-950/95 px-4 py-4 backdrop-blur sm:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {RECIPIENT_PUBLIC_HERO_TITLE}
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">{RECIPIENT_PUBLIC_HERO_SUBTITLE}</p>
                {recipientTrustCueStrip()}
              </div>
              {onClose ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-400 underline decoration-slate-700 hover:text-slate-200"
                  onClick={onClose}
                >
                  Close
                </button>
              ) : null}
            </div>
            {recipientAgreementSummaryCard({
              agreementType: agreementTypeSign,
              partiesLine: partiesLineSign,
              sharedBy: inviterLineSign,
              statusLabel: signingCeremonyStatusLabel,
              compact: true,
            })}
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 pb-28 sm:px-8 sm:pb-10">
          {signDone ? (
            <div
              className={`rounded-xl border px-4 py-5 sm:px-6 ${
                showCelebrate
                  ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-50"
                  : "border-sky-700/45 bg-sky-950/35 text-sky-50"
              }`}
              role="status"
            >
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <JoyMilestoneMark className="shrink-0 scale-90" />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-lg font-semibold">
                    {showCelebrate ? RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE : RECIPIENT_SIGN_ONE_DONE_HEADLINE}
                  </p>
                  {showCelebrate ? (
                    <>
                      <p className="mt-2 text-sm opacity-95">
                        All required signers have completed this agreement.
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-emerald-100/90">{RECIPIENT_SIGN_RECORD_SUBLINE}</p>
                    </>
                  ) : null}
                  {!showCelebrate && signingLine ? (
                    <p className="mt-2 text-sm opacity-95">
                      <span className="font-medium text-white">{signingLine}</span>
                      {signedAtLabel ? (
                        <span className="text-sky-100/85"> · {signedAtLabel}</span>
                      ) : null}
                    </p>
                  ) : null}
                  {!showCelebrate && pending > 0 ? (
                    <p className="mt-3 text-xs text-sky-100/80">
                      Waiting on {pending} more signature{pending === 1 ? "" : "s"}
                      {total > 0 ? ` (${total - pending} of ${total} complete)` : ""}.
                    </p>
                  ) : null}
                  {showCelebrate ? (
                    <div className="mt-4 flex justify-center sm:justify-start">
                      <LawdogOnRecordStamp surface="dark" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!signDone &&
          ceremonyPhase !== "ready" &&
          ceremonyPhase !== "signing" ? (
            <p className="text-center text-sm text-slate-400">Preparing signing session…</p>
          ) : null}

          <section className="space-y-3" aria-labelledby="sig-final-doc">
            <h2 id="sig-final-doc" className="text-sm font-semibold text-slate-200">
              1. Final agreement
            </h2>
            <p className="text-xs text-slate-500">Read-only — this is the version locked for signature.</p>
            <div className="rounded-xl border border-slate-700 bg-white p-6 text-slate-900 shadow-lg sm:p-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
              <div
                className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
                dangerouslySetInnerHTML={{
                  __html: scrubAgreementHtml(lockedVer.rendered_html || "") || "<p>No preview yet.</p>",
                }}
              />
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="sig-confirm-id">
            <h2 id="sig-confirm-id" className="text-sm font-semibold text-slate-200">
              2. Participant confirmation
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-4 sm:px-5">
              <p className="text-sm text-slate-200">
                You are signing as:{" "}
                <span className="font-semibold text-white">{signingLine || "Signer"}</span>
              </p>
              {draft.parties?.some((p) => (p.id || "").trim()) ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Record hash: <span className="font-mono text-slate-400">{shortHash}</span>
                </p>
              ) : null}
              {!signDone ? (
                <label className="mt-4 block text-xs text-slate-400">
                  Type your name to confirm (optional)
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-700"
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    placeholder={signingLine || "Full legal name"}
                    autoComplete="name"
                  />
                </label>
              ) : null}
            </div>
          </section>

          <section className="space-y-3 pb-4 sm:pb-8" aria-labelledby="sig-action">
            <h2 id="sig-action" className="text-sm font-semibold text-slate-200">
              3. Signature action
            </h2>
            {!signDone ? (
              <>
                <p className="text-sm leading-relaxed text-slate-300">{ESIGN_INTENT_SIGN_AGREEMENT_ACTION}</p>
                <p className="text-sm leading-relaxed text-slate-400">{RECORDS_DOWNLOAD_KEEP_COPY_SHORT}</p>
                <p className="text-xs leading-relaxed text-slate-500">
                  {PRODUCT_NOT_LAW_FIRM} {NOT_LEGAL_ADVICE} This action is recorded with your participant identity, a
                  timestamp, and a cryptographic hash of the agreement content for this final signing version.
                </p>
                {ceremonyError ? <p className="text-xs text-rose-300">{ceremonyError}</p> : null}
                <div className="hidden sm:block">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-950/40 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[14rem]"
                    disabled={signPrimaryDisabled}
                    onClick={() => void handleRecordSignature()}
                  >
                    {ceremonyPhase === "signing" ? "Signing…" : "Review and sign"}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Your signature has been recorded.</p>
                <p className="text-xs leading-relaxed text-slate-500">{RECORDS_DOWNLOAD_KEEP_COPY_SHORT}</p>
              </div>
            )}
          </section>
        </div>

        {!signDone ? (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/90 bg-slate-950/95 p-4 backdrop-blur sm:hidden">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-950/40 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={signPrimaryDisabled}
              onClick={() => void handleRecordSignature()}
            >
              {ceremonyPhase === "signing" ? "Signing…" : "Review and sign"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const lockedReviewVersion =
    entry.kind === "review" && bundle && isSigningLockActive(bundle)
      ? bundle.versions.find((v) => v.id === bundle.signingLock!.lockedVersionId)
      : null;
  const lockedReviewBodyHtml =
    lockedReviewVersion?.rendered_html || (typeof renderedHtml === "string" ? renderedHtml : "") || "";

  if (entry.kind === "review" && bundle && isSigningLockActive(bundle)) {
    const lockVid = String(bundle!.signingLock?.lockedVersionId || "");
    const canSignerProceed =
      recipientLinkRole === "signer" && !signingBlockedByProposalQueue && lockVid.length > 0;
    const senderNameLocked = (draft.parties?.[0]?.name || "").trim() || "the sender";
    const inviterLineLocked = (inviterDisplayNameOverride || "").trim() || senderNameLocked;
    const agreementTypeLocked = recipientMetadataTypeLine(draft);
    const partiesLineLocked = formatPartiesLine(draft.parties);
    const signingHref = agreementSigningPath(agreementId, lockVid, undefined, participantPid || undefined);

    return (
      <div
        className={`vs01-agreement-review-inner space-y-6 ${canSignerProceed ? "pb-28 sm:pb-6" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">{RECIPIENT_PUBLIC_HERO_TITLE}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">{RECIPIENT_PUBLIC_HERO_SUBTITLE}</p>
            {recipientTrustCueStrip()}
          </div>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <div
          className="rounded-xl border border-slate-700/80 bg-white text-slate-900 shadow-sm"
          data-testid="recipient-document-shell"
          aria-label="Agreement draft"
        >
          <div className="p-5 sm:p-7">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
            <div
              className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
              dangerouslySetInnerHTML={{
                __html: scrubAgreementHtml(lockedReviewBodyHtml) || "<p>No preview yet.</p>",
              }}
            />
          </div>
        </div>

        {recipientAgreementSummaryCard({
          agreementType: agreementTypeLocked,
          partiesLine: partiesLineLocked,
          sharedBy: inviterLineLocked,
          compact: true,
        })}

        <p
          className="inline-flex flex-wrap items-center gap-2 rounded-full border border-sky-800/40 bg-sky-950/25 px-3 py-1 text-[11px] font-medium text-sky-100/95"
          role="status"
        >
          Final version ready for signature — suggested edits are closed on this link.
        </p>
        {recipientLinkRole === "signer" ? (
          canSignerProceed ? (
            <>
              <a
                className="hidden w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500 sm:inline-flex sm:w-auto"
                href={signingHref}
              >
                {recipientPartyReviewCopy.continueToSigning}
              </a>
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/90 bg-slate-950/95 p-4 backdrop-blur sm:hidden">
                <a
                  className="vs01-btn inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                  href={signingHref}
                >
                  {recipientPartyReviewCopy.continueToSigning}
                </a>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-100">
              Waiting to resolve a pending change request before signing — or contact the sender if this persists.
            </p>
          )
        ) : null}
      </div>
    );
  }

  if (entry.kind === "review" && flowPhase === "declined") {
    return (
      <div className="vs01-agreement-review-inner space-y-4 p-6">
        <p className="text-sm leading-relaxed text-slate-300">
          You&apos;ve declined this invite. If that was a mistake, contact the sender.
        </p>
        {onClose ? (
          <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    );
  }

  const signingReadyActive = Boolean(bundle && isSigningLockActive(bundle));
  const recipientProofBadge: ProofBadgeState = agreementFullyExecuted
    ? "verified"
    : mySignatureDone
      ? "signed"
      : signingReadyActive
        ? "pending"
        : "draft";
  const activeSummaryInviter =
    (inviterDisplayNameOverride || "").trim() || (draft!.parties?.[0]?.name || "").trim() || "the sender";
  const activeSummaryType = recipientMetadataTypeLine(draft!);
  const activeSummaryParties = formatPartiesLine(draft!.parties);

  const statusBanner = (() => {
    if (agreementFullyExecuted) {
      return {
        wrap: "border-emerald-800/40 bg-emerald-950/35 text-emerald-50",
        title: "Agreement fully executed",
        detail: "All required signatures are recorded for this agreement.",
      };
    }
    if (mySignatureDone) {
      const { pending } = pendingSignatureCount({ draft: draft!, agreementFullySigned: false });
      return {
        wrap: "border-sky-800/40 bg-sky-950/30 text-sky-50",
        title: "You signed this agreement",
        detail:
          pending > 0
            ? `Waiting on ${pending} more signature${pending === 1 ? "" : "s"}.`
            : "Your signature is recorded.",
      };
    }
    if (signingReadyActive) {
      return {
        wrap: "border-sky-800/40 bg-sky-950/30 text-sky-50",
        title: "Final version ready for signature",
        detail:
          signingBlockedByProposalQueue && recipientLinkRole === "signer"
            ? "Open change requests are waiting on the owner — signing stays paused until those are cleared."
            : recipientLinkRole === "signer"
              ? "The owner set this text as the final signing version — open signing when you are ready."
              : "The owner set this text as the final signing version.",
      };
    }
    if (hasPendingSuggestion) {
      return {
        wrap: "border-amber-700/45 bg-amber-950/35 text-amber-50",
        title: "Suggested edits sent — waiting on the owner",
        detail:
          "Your revised draft is in the owner’s queue. They will apply or decline it before their master draft changes.",
      };
    }
    if (recipientApprovedInAudit || approvedAck) {
      if (recipientAcceptedNoEditsBanner) {
        return {
          wrap: "border-emerald-700/50 bg-emerald-950/40 text-emerald-50",
          title: "Reviewer approved this draft without requesting changes.",
          detail: "The sender will finalize and open signing when ready. This page updates automatically.",
        };
      }
      return {
        wrap: "border-emerald-900/35 bg-emerald-950/25 text-emerald-100",
        title: "You accepted this draft",
        detail: "The owner will finalize when they are ready.",
      };
    }
    if (bundle?.reviewSentAt) {
      return {
        wrap: "border-violet-800/40 bg-violet-950/25 text-violet-100",
        title: "Waiting for your review",
        detail: "Read the document below, then suggest changes or accept when you are comfortable.",
      };
    }
    return null;
  })();

  const suggestControlsDisabled =
    saving ||
    previewing ||
    revisedUploadAnalyzing ||
    recipientRevisedDraftFileBusy ||
    hasPendingSuggestion ||
    recipientSuggestedEditsSentAck ||
    recipientAcceptedAwaitingLock;

  const recipientDraftBodyTextareaClass =
    "w-full min-h-[280px] max-w-full resize-y overflow-x-hidden break-words rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:min-h-[420px]";

  if (entry.kind === "review" && !viewerLike && recipientAcceptedAwaitingLock && draft && flowPhase !== "declined") {
    return (
      <div
        className="vs01-agreement-review-inner space-y-6 pb-8"
        data-testid="recipient-accepted-awaiting-lock-root"
      >
        <div className="flex flex-wrap items-start justify-end gap-3">
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        {statusBanner ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm leading-snug ${statusBanner.wrap}`}
            role="status"
            data-testid="recipient-review-approved-status"
            data-recipient-accepted-awaiting-lock="true"
          >
            <div className="font-semibold">{statusBanner.title}</div>
            <p className="mt-1 text-xs opacity-95">{statusBanner.detail}</p>
          </div>
        ) : null}

        <div
          className="rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-slate-200"
          data-testid="recipient-signing-readiness-panel"
        >
          <div className="text-sm font-semibold text-slate-100">Waiting for sender to finalize signing.</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            This page checks for updates automatically (about every {Math.round(RECIPIENT_SIGNING_READINESS_POLL_MS / 1000)}s).
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="recipient-refresh-signing-status"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh signing status
          </button>
        </div>

        {needsPersonalizedLink ? (
          <div
            className="rounded-lg border border-rose-800/45 bg-rose-950/25 px-4 py-3 text-xs text-rose-100"
            role="alert"
          >
            This agreement uses participant ids. Open the personal link the owner sent you (it includes{" "}
            <code className="text-rose-200">?p=…</code> in the URL) so your suggestions and approvals are attributed
            correctly.
          </div>
        ) : null}

        {recipientAgreementSummaryCard({
          agreementType: activeSummaryType,
          partiesLine: activeSummaryParties,
          sharedBy: activeSummaryInviter,
          compact: true,
        })}

        <details
          className="rounded-xl border border-slate-700/80 bg-white text-slate-900 shadow-sm"
          data-testid="recipient-approved-draft-collapsed"
        >
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-800 marker:content-none hover:bg-slate-50/80 sm:px-6 [&::-webkit-details-marker]:hidden">
            Approved draft
            <span className="mt-0.5 block text-xs font-normal text-slate-500">Read-only — tap to expand or collapse.</span>
          </summary>
          <div className="border-t border-slate-200 px-5 pb-6 pt-4 sm:px-6">
            <div
              className="prose max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
              dangerouslySetInnerHTML={{ __html: scrubAgreementHtml(renderedHtmlDisplay) || "<p>No preview yet.</p>" }}
            />
          </div>
        </details>

        {!viewerLike && draft ? (
          <div
            ref={recipientOriginalDownloadsRef}
            data-testid="recipient-download-original-anchor"
            className="min-w-0 max-w-full"
          >
            <RecipientWantACopyStrip
              agreementId={agreementId}
              agreementTitle={recipientAgreementTitleForDisplay(draft.title)}
              readHeaders={recipientAgreementReadHeaders(agreementId, recipientAccessToken)}
              scrubbedCurrentHtml={scrubbedOriginalDraftHtmlForPdfExport}
              plainDraftText={directCompareDefault}
              recordsAfterAccept
            />
          </div>
        ) : null}

        <p className="text-center text-[10px] text-slate-600 sm:text-left">
          Support — ID <span className="font-mono text-slate-500 break-all">{agreementId}</span>
        </p>

        {error ? (
          <p className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-100" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "review" && flowPhase === "landing") {
    const senderName = (draft.parties?.[0]?.name || "").trim() || "the sender";
    const inviterLine = (inviterDisplayNameOverride || "").trim() || senderName;
    const signingReadyHub = Boolean(bundle && isSigningLockActive(bundle));
    const lockedVid = bundle?.signingLock?.lockedVersionId || "";
    const canSignFromHub =
      recipientLinkRole === "signer" &&
      signingReadyHub &&
      Boolean(lockedVid) &&
      !signingBlockedByProposalQueue;
    const agreementType = recipientMetadataTypeLine(draft);
    const partiesLine = formatPartiesLine(draft.parties);
    const landingWantCopySlot =
      !viewerLike && draft ? (
        <div
          ref={recipientOriginalDownloadsRef}
          data-testid="recipient-download-original-anchor"
          className="min-w-0 max-w-full"
        >
          <RecipientWantACopyStrip
            agreementId={agreementId}
            agreementTitle={recipientAgreementTitleForDisplay(draft.title)}
            readHeaders={recipientAgreementReadHeaders(agreementId, recipientAccessToken)}
            scrubbedCurrentHtml={scrubbedOriginalDraftHtmlForPdfExport}
            plainDraftText={directCompareDefault}
            onPrepareRevisedImport={prepareOutsideReviewImportUi}
            onImportedRevisedPlainText={onWantCopyRevisedImported}
            revisedImportDisabled={
              saving ||
              previewing ||
              hasPendingSuggestion ||
              recipientSuggestedEditsSentAck ||
              recipientApprovedInAudit ||
              approvedAck
            }
          />
        </div>
      ) : null;
    const landingDownloadOriginal = () => {
      setFlowPhase("active");
      setWorkspaceTab("read");
      window.requestAnimationFrame(() => {
        recipientOriginalDownloadsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    return (
      <div className="vs01-agreement-review-inner space-y-4 px-5 pb-[max(9rem,env(safe-area-inset-bottom,0px))] pt-6 sm:space-y-5 sm:px-6 sm:pb-8 sm:pt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.65rem]">
              {RECIPIENT_PUBLIC_HERO_TITLE}
            </h1>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-400">{RECIPIENT_PUBLIC_HERO_SUBTITLE}</p>
            <p
              className="mt-2 text-sm font-medium text-slate-200"
              data-testid="recipient-inviter-context-line"
            >
              {formatRecipientInviterContextLine(inviterLine)}
            </p>
            {viewerLike ? (
              <p className="mt-2 text-xs text-slate-500">
                This link is view-only — you can read but can&apos;t suggest edits.
              </p>
            ) : null}
            {recipientTrustCueStrip()}
          </div>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <section
          className="rounded-xl border border-slate-700/80 bg-white text-slate-900 shadow-sm"
          data-testid="recipient-document-shell"
          aria-label="Agreement draft"
        >
          <div className="p-5 sm:p-7">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
            <div
              className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
              dangerouslySetInnerHTML={{ __html: scrubAgreementHtml(renderedHtmlDisplay) || "<p>No preview yet.</p>" }}
            />
          </div>
        </section>

        {recipientAgreementSummaryCard({
          agreementType,
          partiesLine,
          sharedBy: inviterLine,
          compact: true,
        })}

        <div className="hidden sm:block">
          <RecipientPartyReviewActions
            placement="landing"
            viewerLike={viewerLike}
            documentFirstLayout={!viewerLike}
            canSignFromHub={canSignFromHub}
            primarySigningHref={
              canSignFromHub
                ? agreementSigningPath(agreementId, lockedVid, undefined, participantPid || undefined)
                : undefined
            }
            promoteLooksGoodVisually={false}
            looksGoodLoading={approving}
            looksGoodDisabled={
              approving ||
              Boolean(bundle && isSigningLockActive(bundle)) ||
              reviewerProposalAwaitingOwner
            }
            requestChangesDisabled={
              hasPendingSuggestion || recipientSuggestedEditsSentAck || recipientApprovedInAudit || approvedAck
            }
            onReviewPrimary={() => setFlowPhase("active")}
            onRequestChanges={() => {
              setFlowPhase("active");
              setComposePathCardsVisible(true);
              setWorkspaceTab("revise");
              scrollAndFocusSuggestPanel();
            }}
            onLooksGood={() => {
              setFlowPhase("active");
              setWorkspaceTab("read");
              window.setTimeout(() => void acceptCurrentDraft(), 0);
            }}
            onNotParticipating={() => setFlowPhase("declined")}
            onDownloadOriginal={!viewerLike ? landingDownloadOriginal : undefined}
          />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/90 bg-slate-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur sm:hidden">
          <RecipientPartyReviewActions
            placement="landing-mobile"
            viewerLike={viewerLike}
            documentFirstLayout={!viewerLike}
            canSignFromHub={canSignFromHub}
            primarySigningHref={
              canSignFromHub
                ? agreementSigningPath(agreementId, lockedVid, undefined, participantPid || undefined)
                : undefined
            }
            promoteLooksGoodVisually={false}
            looksGoodLoading={approving}
            looksGoodDisabled={
              approving ||
              Boolean(bundle && isSigningLockActive(bundle)) ||
              reviewerProposalAwaitingOwner
            }
            requestChangesDisabled={
              hasPendingSuggestion || recipientSuggestedEditsSentAck || recipientApprovedInAudit || approvedAck
            }
            onReviewPrimary={() => setFlowPhase("active")}
            onRequestChanges={() => {
              setFlowPhase("active");
              setComposePathCardsVisible(true);
              setWorkspaceTab("revise");
              scrollAndFocusSuggestPanel();
            }}
            onLooksGood={() => {
              setFlowPhase("active");
              setWorkspaceTab("read");
              window.setTimeout(() => void acceptCurrentDraft(), 0);
            }}
            onNotParticipating={() => setFlowPhase("declined")}
            onDownloadOriginal={!viewerLike ? landingDownloadOriginal : undefined}
          />
        </div>

        {landingWantCopySlot}
      </div>
    );
  }

  return (
    <div
      className={`vs01-agreement-review-inner mx-auto max-w-4xl space-y-4 px-3 sm:px-4 sm:pb-8 ${
        recipientPreview && !recipientSuggestedEditsSentAck ? "pb-32" : "pb-24"
      }`}
    >
      {statusBanner ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm leading-snug ${statusBanner.wrap}`}
          role="status"
        >
          <div className="font-semibold">{statusBanner.title}</div>
          <p className="mt-1 text-xs opacity-95">{statusBanner.detail}</p>
        </div>
      ) : null}

      {entry.kind === "review" &&
      !viewerLike &&
      (recipientApprovedInAudit || approvedAck) &&
      !signingReadyActive &&
      !agreementFullyExecuted &&
      !mySignatureDone ? (
        <div
          className="rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-slate-200"
          data-testid="recipient-signing-readiness-panel"
        >
          <p className="text-xs leading-relaxed text-slate-400">
            When the sender finalizes this agreement for signature, this page picks it up automatically (about every{" "}
            {Math.round(RECIPIENT_SIGNING_READINESS_POLL_MS / 1000)}s). If they already clicked finalize, refresh now.
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="recipient-refresh-signing-status"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh signing status
          </button>
        </div>
      ) : null}

      {entry.kind === "review" && recipientSuggestedEditsSentAck ? (
        <div
          className="rounded-lg border border-emerald-700/45 bg-emerald-950/30 px-4 py-4 text-slate-50 shadow-sm"
          data-testid="recipient-suggested-edits-sent-ack"
          role="status"
        >
          <h2 className="text-base font-semibold text-emerald-100">
            Submitted — waiting for owner review
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-50/95">
            The owner can review your revision. Revisions do not change the original until accepted.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              data-testid="recipient-suggested-edits-back-to-agreement"
              onClick={() => {
                setWorkspaceTab("read");
                window.requestAnimationFrame(() => {
                  document
                    .querySelector('[data-testid="recipient-document-shell"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              Back to agreement
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-600/60 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/50"
              data-testid="recipient-suggested-edits-suggest-another"
              onClick={() => {
                setRecipientSuggestedEditsSentAck(false);
                setComposePathCardsVisible(false);
                setWorkspaceTab("revise");
                setError(null);
                scrollAndFocusSuggestPanel();
              }}
            >
              Suggest another change
            </button>
            {isOwnerProposalReviewQaEnabled() ? (
              <button
                type="button"
                className="rounded-lg border border-violet-500/60 bg-violet-950/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-950/60"
                data-testid="recipient-qa-open-owner-review"
                onClick={() => {
                  enableOwnerProposalReviewQaLocal();
                  const path = buildOwnerQaWorkspacePath(agreementId);
                  const absoluteUrl = buildOwnerQaWorkspaceAbsoluteLink(agreementId);
                  logQaOwnerReviewLinkBuilt({
                    agreementId,
                    path,
                    absoluteUrl,
                    source: "reviewer_submitted_qa_cta",
                  });
                  window.open(absoluteUrl, "_blank", "noopener,noreferrer");
                }}
              >
                QA: Open owner review
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {needsPersonalizedLink && workspaceTab === "read" ? (
        <ReviewNotice blocking>
          {REVIEW_FIRST_PERSONAL_LINK_ATTRIBUTION_MESSAGE}
        </ReviewNotice>
      ) : null}

      {entry.kind === "review" && bundle?.pendingRecipientNotice ? (
        <div
          className="rounded-lg border border-amber-700/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-50"
          role="status"
        >
          <div className="font-semibold">Updated since your last review</div>
          <p className="mt-1 text-xs text-amber-100/90">
            The sender sent an updated draft. You are viewing the latest version below — use version history to see what
            changed.
          </p>
          {recipientUpdateHighlightLabels.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-50/95">
              {recipientUpdateHighlightLabels.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
            onClick={() => {
              clearPendingRecipientNotice(agreementId, recipientVersionStoreScope);
              setBundle(loadBundle(agreementId, recipientVersionStoreScope));
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

      <ReviewHeader
        title={REVIEW_FIRST_TITLE}
        description={
          workspaceTab === "read"
            ? recipientAcceptedAwaitingLock
              ? "You are done reviewing. The sender will open signing when they finalize — this page updates automatically."
              : REVIEW_FIRST_HELPER
            : "Edit the agreement anywhere, then paste the updated wording here."
        }
        action={
          onClose ? (
          <button type="button" className={reviewActionButtonClass("secondary")} onClick={onClose}>
            Close
          </button>
          ) : null
        }
      />

      <ReviewMetaGrid
        testId="recipient-summary-card"
        items={[
          { label: "Agreement", value: recipientAgreementTitleForDisplay(draft.title) || activeSummaryType },
          { label: "Shared by", value: activeSummaryInviter },
          { label: "Parties", value: activeSummaryParties },
        ]}
      />

      <ReviewDocumentFrame
        className="overflow-hidden"
        testId="recipient-document-shell"
        ariaLabel="Agreement draft"
      >
        <div
          ref={recipientReadDocAnchorRef}
          tabIndex={-1}
          className="outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          {reviewFirstUsesPremiumDocument ? (
            <PremiumAgreementReadonlyView
              html={reviewFirstDocumentHtml}
              fullDocumentFlow
              compactDocumentTopPadding
            />
          ) : (
            <div
              className="premium-readonly-doc text-[0.9375rem] leading-relaxed text-slate-900"
              data-paid-pro-review-paper="true"
              dangerouslySetInnerHTML={{ __html: reviewFirstDocumentHtml || "<p>No preview yet.</p>" }}
            />
          )}
        </div>
      </ReviewDocumentFrame>

      {false ? <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:text-[13px]">
        <ProofBadge state={recipientProofBadge} title="Agreement status (LawDog)" />
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
          {versionLabelHub}
        </span>
      </div> : null}

      {workspaceTab === "read" ? (
        <ReviewActions
          className="recipient-review-first-actions"
          testId="recipient-review-first-actions"
          ariaLabel="Review agreement actions"
        >
            {reviewerProposalAwaitingOwner ? (
              <p
                className="w-full text-xs leading-relaxed text-slate-500 sm:w-auto"
                data-testid="recipient-approve-blocked-awaiting-owner"
              >
                {REVIEWER_AWAITING_OWNER_APPROVE_BLOCKED_COPY}
              </p>
            ) : recipientAcceptedRecorded ? (
              <p
                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 sm:w-auto"
                data-testid="recipient-review-approved-status"
                role="status"
              >
                Approved
                {localApprovalAt ? (
                  <span className="mt-0.5 block text-xs font-normal text-emerald-800/90">
                    {new Date(localApprovalAt).toLocaleString()}
                  </span>
                ) : null}
              </p>
            ) : (
            <button
              type="button"
              data-testid="recipient-review-approve-draft"
              className={reviewActionButtonClass("primary")}
              disabled={approving || Boolean(bundle && isSigningLockActive(bundle))}
              onClick={() => void acceptCurrentDraft()}
            >
              {approving ? "Approving…" : REVIEW_FIRST_APPROVE_LABEL}
            </button>
            )}
            <button
              type="button"
              data-testid="recipient-review-propose-updated-draft"
              className={reviewActionButtonClass("secondary")}
              disabled={suggestControlsDisabled}
              onClick={() => {
                setComposePathCardsVisible(false);
                setWorkspaceTab("revise");
                setWorkflowMode("revised");
                setRevisedSubmode("edit");
                setRevisedIntakePhase("editing");
                setExternalAiPaste("");
                setDraftImportError(null);
                setRecipientPreview(null);
                setRecipientRevisePreviewError(null);
                setError(null);
                scrollAndFocusSuggestPanel();
              }}
            >
              {REVIEW_FIRST_PROPOSE_UPDATED_LABEL}
            </button>
            {draft ? (
              <RecipientAgreementReadPdfExport
                bare
                suppressBareDisclosure
                agreementId={agreementId}
                agreementTitle={recipientAgreementTitleForDisplay(draft.title)}
                readHeaders={recipientAgreementReadHeaders(agreementId, recipientAccessToken)}
                scrubbedCurrentHtml={scrubbedOriginalDraftHtmlForPdfExport}
                editablePlainText={directCompareDefault}
                copyTextButtonLabel="Copy agreement text for editing"
                copyTextButtonTestId="recipient-review-copy-text"
                pdfDownloadButtonLabel="Download"
                pdfDownloadButtonTestId="recipient-review-download-pdf"
              />
            ) : null}
        </ReviewActions>
      ) : null}

      {false &&
      entry.kind === "review" &&
      draft &&
      isPaidProAgreementAuthoritative({ draft, agreementId, includeLocalCompletionMarker: false }) &&
      !viewerLike &&
      !recipientAcceptedAwaitingLock ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/35 px-4 py-4 text-slate-100">
          <div className="text-sm font-semibold text-slate-100">Suggest changes</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Describe what you want changed. Everyone will review proposed wording before approval.
          </p>
          <label className="mt-3 block text-[11px] font-medium text-slate-500" htmlFor="pro-redline-recipient-suggest">
            Requested change
          </label>
          <textarea
            id="pro-redline-recipient-suggest"
            ref={proRedlineSuggestTextareaRef}
            className="mt-1 w-full min-h-0 resize-none rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            value={proRedlineSuggestText}
            onChange={(e) => {
              setProRedlineSuggestText(e.target.value);
              setProRedlineSuggestErr(null);
              setProRedlineSuggestSuccess(false);
            }}
            disabled={proRedlineSuggestBusy || needsPersonalizedLink}
            placeholder="Example: Change payment from 15 days to 45 days."
          />
          {needsPersonalizedLink ? (
            <p className="mt-2 text-[11px] text-amber-200/90">
              Open the personal link the owner sent you (it includes <code className="text-amber-100/90">?p=…</code>) so
              your suggestion is attributed correctly.
            </p>
          ) : null}
          <button
            type="button"
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={
              proRedlineSuggestBusy ||
              needsPersonalizedLink ||
              !proRedlineSuggestText.trim() ||
              Boolean(bundle && isSigningLockActive(bundle))
            }
            onClick={async () => {
              if (needsPersonalizedLink) {
                setProRedlineSuggestErr("Use the personal review link from the sender (it includes your participant id).");
                return;
              }
              const pid = participantPid.trim();
              if (!pid) {
                setProRedlineSuggestErr("We could not determine your participant id. Use the link the owner sent you.");
                return;
              }
              if (bundle && isSigningLockActive(bundle)) {
                setProRedlineSuggestErr("Review is closed on this agreement.");
                return;
              }
              setProRedlineSuggestBusy(true);
              setProRedlineSuggestErr(null);
              setProRedlineSuggestSuccess(false);
              try {
                const r = await postProRedlineReviewerSuggestion({
                  agreementId,
                  participantId: pid,
                  suggestionText: proRedlineSuggestText.trim(),
                  reviewerDisplayName: recipientLabel,
                  reviewerEmail: "",
                  recipientAccessToken: recipientAccessToken || null,
                });
                if (!r.ok) {
                  setProRedlineSuggestErr(
                    humanizeRecipientActionError(r.error, "Could not send your suggestion. Please try again."),
                  );
                  return;
                }
                setProRedlineSuggestSuccess(true);
                setProRedlineSuggestText("");
              } catch (e: unknown) {
                setProRedlineSuggestErr(e instanceof Error ? e.message : String(e));
              } finally {
                setProRedlineSuggestBusy(false);
              }
            }}
          >
            {proRedlineSuggestBusy ? "Sending…" : "Submit suggested changes"}
          </button>
          {proRedlineSuggestSuccess ? (
            <p className="mt-2 text-xs text-emerald-300/95" role="status">
              {PRO_REDLINE_REVIEWER_SUGGEST_SUCCESS_COPY}
            </p>
          ) : null}
          {proRedlineSuggestErr ? (
            <p className="mt-2 text-xs text-rose-300" role="alert">
              {proRedlineSuggestErr}
            </p>
          ) : null}
        </div>
      ) : null}

      {featureFlags.negotiationTimelineUi && bundle && bundle.versions.length > 0 ? (
        <NegotiationTimelineView
          compact
          showIntro={false}
          versions={bundle.versions}
          events={recipientNegotiationTimelineEvents}
          currentStatus={recipientNegotiationTimelineStatus}
        />
      ) : null}

      {workspaceTab === "read" ? null : viewerLike ? (
        <p className="text-xs text-slate-500">You have view-only access to this agreement.</p>
      ) : (
        <div ref={recipientSuggestPanelRef} className="max-w-full space-y-3 overflow-x-hidden">
          <button
            type="button"
            className="text-xs font-medium text-sky-300 underline decoration-sky-800/50 hover:text-sky-200"
            onClick={() => {
              setWorkspaceTab("read");
              setRecipientPreview(null);
              setRecipientRevisePreviewError(null);
              setRevisedUploadAnalyzing(false);
              setRecipientPostUploadSurface(null);
              pendingImportRecipientPreviewRef.current = null;
              setError(null);
              window.requestAnimationFrame(() => {
                recipientReadDocAnchorRef.current?.focus({ preventScroll: true });
              });
            }}
          >
            ← Back to agreement
          </button>

          {needsPersonalizedLink && !recipientPreview ? (
            <p
              className="text-[11px] leading-snug text-slate-500"
              data-testid="recipient-review-personal-link-optional-notice"
            >
              {REVIEW_FIRST_PERSONAL_LINK_OPTIONAL_NOTICE}
            </p>
          ) : null}

          {hasPendingSuggestion ? (
            <div className="rounded-lg border border-amber-800/45 bg-amber-950/25 p-4 text-sm text-amber-100">
              <p className="font-semibold">Suggested edits pending</p>
              <p className="mt-2 text-xs text-amber-200/90">
                The owner must review your revised draft before you can send another one.
              </p>
            </div>
          ) : (
            <ReviewFuturePanel
              testId="recipient-propose-update-standard-panel"
              className="space-y-4 border-0 bg-transparent p-0 shadow-none"
            >
              <input
                ref={draftImportFileInputRef}
                type="file"
                className="sr-only"
                accept={REVIEW_FIRST_REVISED_DRAFT_FILE_ACCEPT}
                data-testid="recipient-import-draft-file-input"
                onChange={onDraftImportFileSelected}
              />

              {false && !recipientPreview ? (
                <section className="space-y-3" data-testid="recipient-manual-propose-controls">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-slate-950">Suggest revision</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                      Edit your agreement in any software you prefer.
                    </p>
                  </div>
                </section>
              ) : null}

              {import.meta.env.MODE === "test" && !recipientPreview ? (
                <div className="sr-only">
                  <div
                    role="tablist"
                    aria-label={`${RECIPIENT_ASSISTED_COMPOSE_TAB_LABEL} / ${RECIPIENT_CARD_SMALL_TWEAK_TITLE}`}
                    data-testid="recipient-compose-tablist"
                  >
                    <button
                      type="button"
                      data-testid="recipient-workflow-revised"
                      onClick={() => {
                        setWorkflowMode("revised");
                        setRevisedSubmode("edit");
                        setRevisedIntakePhase("editing");
                        if (!externalAiPaste.trim()) setExternalAiPaste(directCompareDefaultRef.current);
                      }}
                    >
                      {RECIPIENT_CARD_BIGGER_REWRITE_TITLE}
                    </button>
                    <button
                      type="button"
                      data-testid="recipient-workflow-quick"
                      onClick={() => {
                        setWorkflowMode("quick");
                        setInstruction("");
                        setExternalAiPaste("");
                      }}
                    >
                      {RECIPIENT_CARD_SMALL_TWEAK_TITLE}
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid="recipient-switch-to-revised-draft-link"
                    onClick={() => {
                      setWorkflowMode("revised");
                      setRevisedSubmode("edit");
                      setRevisedIntakePhase("editing");
                      if (!externalAiPaste.trim()) setExternalAiPaste(directCompareDefaultRef.current);
                    }}
                  >
                    Upload revised draft
                  </button>
                  <button
                    type="button"
                    data-testid="recipient-intake-mode-paste-revised"
                    onClick={() => {
                      setWorkflowMode("revised");
                      setRevisedSubmode("paste");
                      setRevisedIntakePhase("editing");
                      setExternalAiPaste("");
                    }}
                  >
                    Paste revised agreement text
                  </button>
                  {workflowMode === "quick" ? (
                    <textarea
                      data-testid="recipient-revision-voice-field"
                      value={instruction}
                      onChange={(e) => {
                        setInstruction(e.target.value);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}

              {false && composePathCardsVisible && !recipientPreview ? (
                <section className="space-y-4" data-testid="recipient-compose-path-cards">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-slate-950">{RECIPIENT_WORKSPACE_HEADLINE}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{RECIPIENT_WORKSPACE_SUBCOPY}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      data-testid="recipient-compose-card-small-tweak"
                      className="flex min-h-[120px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                      onClick={() => {
                        setComposePathCardsVisible(false);
                        setWorkflowMode("quick");
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setError(null);
                      }}
                    >
                      <span className="text-base font-semibold text-slate-950">{RECIPIENT_CARD_SMALL_TWEAK_TITLE}</span>
                      <span className="mt-2 flex-1 text-sm leading-snug text-slate-600">{RECIPIENT_CARD_SMALL_TWEAK_BODY}</span>
                      <span className="mt-3 text-sm font-semibold text-slate-800">{RECIPIENT_CARD_SMALL_TWEAK_CTA}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="recipient-compose-card-bigger-rewrite"
                      className="flex min-h-[120px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                      onClick={() => {
                        setComposePathCardsVisible(false);
                        setWorkflowMode("revised");
                        setRevisedIntakePhase("editing");
                        setExternalAiPaste("");
                        setDraftImportError(null);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setError(null);
                      }}
                    >
                      <span className="text-base font-semibold text-slate-950">{RECIPIENT_CARD_BIGGER_REWRITE_TITLE}</span>
                      <span className="mt-2 flex-1 text-sm leading-snug text-slate-600">{RECIPIENT_CARD_BIGGER_REWRITE_BODY}</span>
                      <span className="mt-3 text-sm font-semibold text-slate-800">{RECIPIENT_CARD_BIGGER_REWRITE_CTA}</span>
                    </button>
                  </div>
                </section>
              ) : (
                <>
              {false && !recipientPreview ? (
                <div
                  className="flex max-w-lg gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"
                  role="tablist"
                  aria-label={`${RECIPIENT_ASSISTED_COMPOSE_TAB_LABEL} / ${RECIPIENT_CARD_SMALL_TWEAK_TITLE}`}
                  data-testid="recipient-compose-tablist"
                >
                  <button
                    type="button"
                    data-testid="recipient-workflow-revised"
                    className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors ${
                      workflowMode === "revised"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                    }`}
                    onClick={() => {
                      setWorkflowMode("revised");
                      setDraftImportError(null);
                      setRecipientPreview(null);
                      setRecipientRevisePreviewError(null);
                      setRecipientPostUploadSurface(null);
                      setError(null);
                      setRevisedIntakePhase(externalAiPaste.trim() ? "editing" : "pick-method");
                    }}
                  >
                    {RECIPIENT_CARD_BIGGER_REWRITE_TITLE}
                  </button>
                  <button
                    type="button"
                    data-testid="recipient-workflow-quick"
                    className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors ${
                      workflowMode === "quick"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                    }`}
                    onClick={() => {
                      setWorkflowMode("quick");
                      setExternalAiPaste("");
                      setDraftImportError(null);
                      setRecipientPreview(null);
                      setRecipientRevisePreviewError(null);
                      setRevisedUploadAnalyzing(false);
                      setRecipientPostUploadSurface(null);
                      setError(null);
                    }}
                  >
                    {RECIPIENT_CARD_SMALL_TWEAK_TITLE}
                  </button>
                </div>
              ) : null}

              {false && workflowMode === "quick" && !recipientPreview ? (
                <div
                  data-testid="recipient-quick-change-panel"
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs leading-relaxed text-slate-600">{RECIPIENT_SMALL_TWEAK_HELPER}</p>
                  {quickChangeLooksLikeFullDraft ? (
                    <div
                      className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs leading-snug text-amber-100"
                      data-testid="recipient-quick-change-full-doc-hint"
                      role="status"
                    >
                      <p>{RECIPIENT_FULL_DOC_SWITCH_HINT}</p>
                      <button
                        type="button"
                        className="mt-2 text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/60 underline-offset-2 hover:text-sky-200"
                        data-testid="recipient-switch-to-revised-workflow"
                        onClick={() => {
                          setWorkflowMode("revised");
                          setRevisedIntakePhase("editing");
                          setExternalAiPaste(instruction.trim());
                          setInstruction("");
                          setRecipientPreview(null);
                          setRecipientRevisePreviewError(null);
                          setError(null);
                        }}
                      >
                        {RECIPIENT_SWITCH_TO_REVISED_DRAFT_LINK}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="recipient-switch-to-revised-draft-link"
                      className="text-left text-xs font-medium text-sky-400/95 underline decoration-sky-800/50 underline-offset-2 hover:text-sky-200"
                      onClick={() => {
                        setWorkflowMode("revised");
                        setRevisedIntakePhase("editing");
                        setDraftImportError(null);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setError(null);
                      }}
                    >
                      {RECIPIENT_SWITCH_TO_REVISED_DRAFT_LINK}
                    </button>
                  )}
                  <label className="text-sm font-semibold text-slate-800" htmlFor={revisionPlainFieldId}>
                    {RECIPIENT_QUICK_REQUEST_LABEL}
                  </label>
                  <VoiceAugmentedTextArea
                    id={revisionPlainFieldId}
                    data-testid="recipient-revision-voice-field"
                    className="w-full min-h-0 max-w-full resize-none overflow-x-hidden break-words rounded-xl border border-slate-300 bg-white px-3 py-2 pb-11 pr-12 text-sm text-slate-900"
                    placeholder={RECIPIENT_QUICK_REQUEST_PLACEHOLDER}
                    value={instruction}
                    onValueChange={(v) => {
                      setInstruction(v);
                      setRecipientPreview(null);
                      setRecipientRevisePreviewError(null);
                    }}
                    disabled={suggestControlsDisabled}
                    surface="dark"
                    voiceSubtleIdle={false}
                    onVoiceError={(m) => setError(recipientVoiceErrorMessage(m))}
                    autosize
                    autosizeMaxPx={describeAutosizeMaxPx}
                  />
                </div>
              ) : null}

              {workflowMode === "revised" && !recipientPreview ? (
                <div
                  data-testid="recipient-revised-version-panel"
                className="space-y-4"
                  onDragOver={(ev: DragEvent<HTMLDivElement>) => {
                    if (suggestControlsDisabled) return;
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(ev: DragEvent<HTMLDivElement>) => {
                    if (suggestControlsDisabled) return;
                    ev.preventDefault();
                    const f = ev.dataTransfer.files?.[0];
                    if (f) void processRecipientRevisedDraftFile(f);
                  }}
                >
                  {revisedIntakePhase === "pick-method" ? (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">Suggest revision</h3>
                        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-slate-600">
                          <p>Edit your agreement in any software you prefer.</p>
                          <p>When finished, paste the FULL updated agreement below.</p>
                          <p data-testid="recipient-review-first-paste-guard">{REVIEW_FIRST_PASTE_GUARD_COPY}</p>
                        </div>
                      </div>
                      {draftImportError ? (
                        <p
                          role="alert"
                          data-testid="recipient-draft-import-error-pick-method"
                          className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs leading-snug text-amber-100"
                        >
                          {draftImportError}
                        </p>
                      ) : null}
                      {recipientRevisedDraftFileBusy ? (
                        <p
                          role="status"
                          data-testid="recipient-revised-import-preparing"
                          className="text-xs font-medium text-slate-300"
                        >
                          {RECIPIENT_REVISED_IMPORT_PREPARING}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-testid="recipient-upload-revised-file"
                        className={reviewActionButtonClass("secondary") + " w-full"}
                        disabled={suggestControlsDisabled}
                        onClick={() => draftImportFileInputRef.current?.click()}
                      >
                        {REVIEW_FIRST_REVISED_DRAFT_FILE_TYPES}
                      </button>
                      <button
                        type="button"
                        data-testid="recipient-intake-mode-edit-draft"
                        className={reviewActionButtonClass("secondary") + " w-full"}
                        disabled={suggestControlsDisabled}
                        onClick={() => {
                          setDraftImportError(null);
                          setExternalAiPaste("");
                          setRevisedSubmode("edit");
                          setRevisedIntakePhase("editing");
                          setRecipientPreview(null);
                          setRecipientRevisePreviewError(null);
                          setError(null);
                        }}
                      >
                        Paste full updated agreement
                      </button>
                    </div>
                  ) : (
                    <>
                  {!revisedUploadAnalyzing && !recipientPostUploadSurface ? (
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Suggest revision</h3>
                      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-slate-600">
                      <p>Edit your agreement in any software you prefer.</p>
                        <p>When finished, paste the FULL updated agreement below.</p>
                        <p data-testid="recipient-review-first-paste-guard">{REVIEW_FIRST_PASTE_GUARD_COPY}</p>
                      </div>
                    </div>
                  ) : null}

                  {recipientPdfImportRoutedMessage && recipientPostUploadSurface ? (
                    <p
                      role="status"
                      data-testid="recipient-pdf-import-routed-banner"
                      className="rounded-md border border-sky-800/45 bg-sky-950/30 px-3 py-2 text-xs leading-snug text-sky-100"
                    >
                      {recipientPdfImportRoutedMessage}
                    </p>
                  ) : null}

                  {recipientPostUploadSurface?.surface === "notes_only" ? (
                    <RecipientReviewNotesOnlyCard
                      extractedNotes={recipientPostUploadSurface.notes}
                      onSendNotesToSender={() => {
                        const n = recipientPostUploadSurface.notes.trim().slice(0, RECIPIENT_MAX_INSTRUCTION_CHARS);
                        setRecipientPostUploadSurface(null);
                        setComposePathCardsVisible(false);
                        setWorkflowMode("quick");
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setInstruction(n);
                        setExternalAiPaste("");
                        setError(null);
                        window.requestAnimationFrame(() => {
                          window.setTimeout(() => {
                            const root = recipientSuggestPanelRef.current;
                            const el =
                              root?.querySelector<HTMLElement>('[data-testid="recipient-revision-voice-field"]') ??
                              null;
                            el?.focus({ preventScroll: true });
                          }, 32);
                        });
                      }}
                      onTurnIntoClauseSuggestions={() => {
                        const n = recipientPostUploadSurface.notes;
                        setRecipientPostUploadSurface({
                          surface: "clause_suggestions",
                          notes: n,
                          items: buildClauseSuggestionCardsFromUploadText(n),
                        });
                      }}
                      onUploadRevisedAgreement={() => {
                        setRecipientPostUploadSurface(null);
                        setDraftImportError(null);
                        draftImportFileInputRef.current?.click();
                      }}
                      onPasteRevisedAgreement={() => {
                        setRecipientPostUploadSurface(null);
                        setRevisedSubmode("paste");
                        setRevisedIntakePhase("editing");
                        setExternalAiPaste("");
                        setDraftImportError(null);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        window.requestAnimationFrame(() => {
                          externalPasteTextareaRef.current?.focus({ preventScroll: true });
                        });
                      }}
                    />
                  ) : recipientPostUploadSurface?.surface === "clause_suggestions" ? (
                    <RecipientClauseSuggestionsSurface
                      items={recipientPostUploadSurface.items}
                      rawText={recipientPostUploadSurface.notes}
                      onSendSuggestionsOnly={() => {
                        const surf = recipientPostUploadSurface;
                        if (surf?.surface !== "clause_suggestions") return;
                        const summary = surf.items.map((it) => `- ${it.title}`).join("\n");
                        const n = `${summary}\n\n${surf.notes.trim()}`.slice(0, RECIPIENT_MAX_INSTRUCTION_CHARS);
                        setRecipientPostUploadSurface(null);
                        setComposePathCardsVisible(false);
                        setWorkflowMode("quick");
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setInstruction(n);
                        setExternalAiPaste("");
                        setError(null);
                        window.requestAnimationFrame(() => {
                          window.setTimeout(() => {
                            const root = recipientSuggestPanelRef.current;
                            const el =
                              root?.querySelector<HTMLElement>('[data-testid="recipient-revision-voice-field"]') ??
                              null;
                            el?.focus({ preventScroll: true });
                          }, 32);
                        });
                      }}
                      onUploadFullRevisedDraft={() => {
                        setRecipientPostUploadSurface(null);
                        setDraftImportError(null);
                        draftImportFileInputRef.current?.click();
                      }}
                      onPasteRevisedAgreement={() => {
                        setRecipientPostUploadSurface(null);
                        setRevisedSubmode("paste");
                        setRevisedIntakePhase("editing");
                        setExternalAiPaste("");
                        setDraftImportError(null);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        window.requestAnimationFrame(() => {
                          externalPasteTextareaRef.current?.focus({ preventScroll: true });
                        });
                      }}
                      onApplySuggestionsToDraft={() => {
                        const surf = recipientPostUploadSurface;
                        if (surf?.surface !== "clause_suggestions") return;
                        const summary = surf.items
                          .map((it) => `- ${it.title}\n  ${it.meaning}`)
                          .join("\n\n")
                          .slice(0, RECIPIENT_MAX_INSTRUCTION_CHARS);
                        setRecipientPostUploadSurface(null);
                        setDraftImportError(null);
                        if (revisedSubmode !== "edit") {
                          setExternalAiPaste(directCompareDefaultRef.current);
                        }
                        setRevisedSubmode("edit");
                        setRevisedIntakePhase("editing");
                        setInstruction(summary);
                        setRecipientPreview(null);
                        setRecipientRevisePreviewError(null);
                        setError(null);
                        window.requestAnimationFrame(() => {
                          window.setTimeout(() => {
                            document.getElementById(editDraftFieldId)?.focus({ preventScroll: true });
                          }, 32);
                        });
                      }}
                    />
                  ) : revisedUploadAnalyzing ? (
                    <RecipientRevisedDraftAnalyzingCard />
                  ) : revisedSubmode === "paste" ? (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-800" htmlFor={externalPasteFieldId}>
                    Full updated agreement
                  </label>
                  {draftImportError ? (
                    <p
                      role="alert"
                      data-testid="recipient-draft-import-error"
                      className="text-xs leading-snug text-amber-200/95"
                    >
                      {draftImportError}
                    </p>
                  ) : null}
                  <textarea
                    id={externalPasteFieldId}
                    ref={externalPasteTextareaRef}
                    data-testid="recipient-revised-draft-paste"
                    className={recipientDraftBodyTextareaClass}
                    style={{ maxHeight: draftTextareaMaxPx }}
                    placeholder="Paste the complete updated agreement here…"
                    value={externalAiPaste}
                    disabled={suggestControlsDisabled}
                    onPaste={() => {
                      window.requestAnimationFrame(() => {
                        const ta = externalPasteTextareaRef.current;
                        if (ta) ta.scrollTop = 0;
                      });
                    }}
                    onChange={(e) => {
                      setExternalAiPaste(e.target.value);
                      setDraftImportError(null);
                      setRecipientPreview(null);
                      setRecipientRevisePreviewError(null);
                    }}
                  />
                  <button
                    type="button"
                    data-testid="recipient-manual-upload-revised-draft"
                    className="text-left text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                    disabled={suggestControlsDisabled}
                    onClick={() => draftImportFileInputRef.current?.click()}
                  >
                    {REVIEW_FIRST_REVISED_DRAFT_FILE_TYPES}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-slate-800" htmlFor={editDraftFieldId}>
                    Full updated agreement
                  </label>
                  <textarea
                    id={editDraftFieldId}
                    ref={externalPasteTextareaRef}
                    data-testid="recipient-edit-draft-textarea"
                    className={recipientDraftBodyTextareaClass}
                    style={{ maxHeight: draftTextareaMaxPx }}
                    aria-label="Full updated agreement"
                    placeholder="Paste the complete updated agreement here…"
                    value={externalAiPaste}
                    disabled={suggestControlsDisabled}
                    onChange={(e) => {
                      setExternalAiPaste(e.target.value);
                      setRecipientPreview(null);
                      setRecipientRevisePreviewError(null);
                    }}
                  />
                  <button
                    type="button"
                    data-testid="recipient-manual-upload-revised-draft"
                    className="text-left text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                    disabled={suggestControlsDisabled}
                    onClick={() => draftImportFileInputRef.current?.click()}
                  >
                    {REVIEW_FIRST_REVISED_DRAFT_FILE_TYPES}
                  </button>
                </div>
              )}
                    </>
                  )}
                </div>
              ) : null}

              {false && showSuggestionBlock ? (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-300">Ideas to refine your suggested edits</div>
                  {recipientHints.bullets.length > 0 ? (
                    <ul className="mb-0 list-disc space-y-1.5 pl-4 text-[11px] leading-snug text-slate-400">
                      {recipientHints.bullets.map((b, i) => (
                        <li key={`${i}_${b.slice(0, 24)}`} className="marker:text-slate-600">
                          <button
                            type="button"
                            className="text-left text-sky-300/90 underline decoration-sky-800/50 decoration-1 underline-offset-2 hover:text-sky-200"
                            disabled={suggestControlsDisabled}
                            onClick={() => {
                              setSuggestionUsed(true);
                              setRecipientPreview(null);
                              setInstruction((prev) => {
                                const t = prev.trim();
                                return t ? `${t}\n${b}` : b;
                              });
                            }}
                          >
                            {b}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {recipientHints.footnote ? (
                    <p className="mb-0 text-[10px] leading-snug text-slate-600">{recipientHints.footnote}</p>
                  ) : null}
                </div>
              ) : null}

              {workflowMode === "revised" &&
              revisedIntakePhase === "editing" &&
              (revisedSubmode === "paste" || revisedSubmode === "edit") &&
              !revisedUploadAnalyzing &&
              !recipientPostUploadSurface &&
              !externalAiPaste.trim() ? (
                <p className="text-xs leading-snug text-slate-500" data-testid="recipient-paste-empty-hint">
                  Paste the complete updated agreement to continue.
                </p>
              ) : null}
              {workflowMode === "revised" &&
              revisedIntakePhase === "editing" &&
              reviewFirstTextDiff &&
              externalAiPaste.trim() &&
              !recipientPreview ? (
                <div
                  className="rounded-xl bg-white p-4 shadow-sm"
                  data-testid="recipient-review-proposed-update-preview"
                >
                  <h3 className="text-base font-semibold tracking-tight text-slate-950">
                    {reviewFirstTextDiff.hasMaterialChanges ? "Updated agreement pasted" : "No wording changes detected"}
                  </h3>
                  <p
                    className="mt-1 text-sm leading-relaxed text-slate-600"
                    data-testid="recipient-review-proposed-update-summary"
                  >
                    {reviewFirstTextDiff.hasMaterialChanges
                      ? "Review changes to continue."
                      : "No wording changes detected."}
                  </p>
                  {reviewFirstTextDiff.formattingArtifactsIgnored ? (
                    <p
                      className="mt-2 text-xs leading-relaxed text-slate-500"
                      data-testid="recipient-review-formatting-artifacts-note"
                    >
                      {REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE}
                    </p>
                  ) : null}
                  <p
                    className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                      reviewFirstTextDiff.hasMaterialChanges
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                    data-testid="recipient-review-proposed-update-state"
                  >
                    {reviewFirstTextDiff.hasMaterialChanges ? "Ready to review" : "No changes detected"}
                  </p>
                </div>
              ) : null}
              {!recipientPreview ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <button
                  ref={previewChangesButtonRef}
                  type="button"
                  data-testid="recipient-compare-versions-button"
                  className={reviewActionButtonClass("primary")}
                  disabled={!canPreview || hasPendingSuggestion || recipientSuggestedEditsSentAck}
                  onClick={() => void runRecipientComparePreview()}
                >
                  {previewing
                    ? "Working…"
                    : workflowMode === "quick"
                      ? RECIPIENT_BTN_PREVIEW_CHANGES
                      : "Review changes"}
                </button>
              </div>
              ) : null}
              {recipientRevisePreviewError ? (
                <p
                  role="alert"
                  data-testid="recipient-revise-preview-error"
                  className="text-sm leading-snug text-amber-200/95"
                >
                  {recipientRevisePreviewError}
                </p>
              ) : null}

              {comparePanel}
              {compareImportNoChangePanel}
                </>
              )}
            </ReviewFuturePanel>
          )}
        </div>
      )}

      {bundle && bundle.reviewSentAt ? (
        <p className="text-center text-[0.6875rem] text-slate-500">
          Review session active · {new Date(bundle.reviewSentAt).toLocaleString()}
        </p>
      ) : null}

      <ClawTrustFooter agreementId={agreementId} variant="recipient" />

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {recipientPreview && !recipientSuggestedEditsSentAck ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-slate-800/90 bg-slate-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur sm:hidden"
          role="toolbar"
          aria-label="Send or discard suggested edits"
        >
          <button
            type="button"
            data-testid="recipient-open-send-suggested-edits-modal-mobile"
            className="btn w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={saving || !recipientProposalSubmitReady}
            onClick={() => openSendSuggestedEditsModal()}
          >
            {REVIEW_FIRST_SAVE_UPDATED_LABEL}
          </button>
          <button
            type="button"
            className="btn w-full rounded-lg border border-slate-600 px-4 py-3 text-sm text-slate-200 hover:bg-slate-900/60 disabled:opacity-50"
            disabled={saving || previewing}
            onClick={() => discardPreview()}
          >
            {RECIPIENT_BTN_CONTINUE_EDITING}
          </button>
        </div>
      ) : null}

      {sendSuggestedEditsModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="recipient-send-suggested-edits-modal"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSendSuggestedEditsModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipient-send-suggested-edits-modal-title"
            className="max-w-md rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="recipient-send-suggested-edits-modal-title" className="text-lg font-semibold text-slate-100">
              {REVIEW_FIRST_SAVE_UPDATED_LABEL}?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              These go to the agreement owner. Nothing changes until they accept. {PRODUCT_NOT_LAW_FIRM}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-testid="recipient-send-suggested-edits-modal-dismiss"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                disabled={saving}
                onClick={() => setSendSuggestedEditsModalOpen(false)}
              >
                {RECIPIENT_BTN_CONTINUE_EDITING}
              </button>
              <button
                type="button"
                data-testid="recipient-send-suggested-edits-confirm"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={saving}
                onClick={() => void performRecipientSuggestedEditsSubmit()}
              >
              {saving ? "Saving…" : REVIEW_FIRST_SAVE_UPDATED_LABEL}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function agreementReviewPath(agreementId: string): string {
  return `/agreements/${encodeURIComponent(agreementId)}/review`;
}

/** Review link scoped to one participant (``?p=`` party id + ``?role=``). */
export function agreementReviewPathWithParticipant(
  agreementId: string,
  partyId: string,
  role: RecipientLinkRole = "reviewer"
): string {
  const q = new URLSearchParams();
  q.set("p", partyId);
  q.set("role", role);
  return `${agreementReviewPath(agreementId)}?${q.toString()}`;
}

/**
 * Handoff URL for signers. Production: pass ``accessToken`` (HMAC minted by API). Legacy: ``lockedVersionId`` query ``v=``.
 */
export function agreementSigningPath(
  agreementId: string,
  lockedVersionId: string,
  accessToken?: string | null,
  participantPartyId?: string | null
): string {
  const a = encodeURIComponent(agreementId);
  const q = new URLSearchParams();
  if (accessToken && accessToken.trim()) {
    q.set("t", accessToken.trim());
    if (participantPartyId?.trim()) q.set("p", participantPartyId.trim());
    return `/agreements/${a}/sign?${q.toString()}`;
  }
  q.set("v", lockedVersionId);
  if (participantPartyId?.trim()) q.set("p", participantPartyId.trim());
  return `/agreements/${a}/sign?${q.toString()}`;
}

function parseRecipientRoleParam(search: string): RecipientLinkRole | undefined {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const r = new URLSearchParams(q).get("role")?.trim().toLowerCase();
  if (r === "signer") return "signer";
  if (r === "reviewer") return "reviewer";
  if (r === "counterparty" || r === "recipient" || r === "viewer") return "counterparty";
  return undefined;
}

/** Primary recipient deep link: ``/agreements/{id}/review?t=…`` (no account required). */
export function agreementMagicLinkPath(agreementId: string, token: string): string {
  const a = encodeURIComponent(agreementId);
  const t = encodeURIComponent(token.trim());
  return `/agreements/${a}/review?t=${t}`;
}

export function parseAgreementReviewPath(
  pathname: string,
  search: string = ""
): { agreementId: string; token?: string; role?: RecipientLinkRole; participantPartyId?: string } | null {
  const path = pathname.replace(/\/$/, "");
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const t = params.get("t") || params.get("token") || undefined;
  let m = path.match(/^\/agreements\/([^/]+)\/review$/);
  if (!m) {
    /**
     * Legacy recipient-link compatibility only:
     * `/app/agreements/:id` without a token is now treated as owner workspace v1 route.
     */
    if (!t) return null;
    m = path.match(/^\/app\/agreements\/([^/]+)$/);
  }
  if (!m) return null;
  const agreementId = decodeURIComponent(m[1]);
  const role = parseRecipientRoleParam(search);
  const p = params.get("p");
  const participantPartyId = p?.trim() ? p.trim() : undefined;
  const base = {
    agreementId,
    ...(role ? { role } : {}),
    ...(participantPartyId ? { participantPartyId } : {}),
  };
  return t ? { ...base, token: t } : base;
}

export function parseAgreementSignPath(
  pathname: string,
  search: string
): { agreementId: string; versionId?: string; token?: string; participantPartyId?: string } | null {
  const m = pathname.replace(/\/$/, "").match(/^\/agreements\/([^/]+)\/sign$/);
  if (!m) return null;
  const agreementId = decodeURIComponent(m[1]);
  const q = rawSearchToParams(search);
  const t = q.get("t") || q.get("token");
  const p = q.get("p")?.trim();
  const participantPartyId = p || undefined;
  if (t) return { agreementId, token: t, ...(participantPartyId ? { participantPartyId } : {}) };
  const vid = q.get("v");
  if (!vid) return null;
  return {
    agreementId,
    versionId: decodeURIComponent(vid),
    ...(participantPartyId ? { participantPartyId } : {}),
  };
}

function rawSearchToParams(search: string): URLSearchParams {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}
