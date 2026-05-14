import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { trackAgreementFunnelEvent } from "../../tracking/agreementFunnelAnalytics";
import type { AgreementWorkspaceEntryMode } from "../../agreement/agreementLifecycle";
import { AI_ASSISTIVE_SHORT, NOT_LEGAL_ADVICE } from "../../compliance/disclosureCopy";
import { JOY_COPY } from "../../joy/clawJoyCopy";
import { CompletedAgreementPanel } from "../../agreement/CompletedAgreementPanel";
import { ClaimRecordCard } from "../../conversion/ClaimRecordCard";
import { deriveFinalVersionDisplay, proofSummaryLine } from "../../agreement/completedAgreementDerive";
import { PendingSignaturePanel } from "../../agreement/PendingSignaturePanel";
import {
  buildPendingSignerRows,
  findSignedAuditTimestamp,
  isAgreementMarkedSignedInAudit,
} from "../../agreement/pendingSignatureDerive";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  isAgreementDetailsStepReady,
  normalizeAgreementDraftFromApi,
} from "../../agreement/agreementDraftNormalize";
import {
  computeAgreementDraftReadiness,
  readinessCtaHelper,
  type AgreementReadinessLevel,
} from "../../agreement/agreementReadiness";
import { AgreementReadinessCard } from "./AgreementReadinessCard";
import { SIMPLE_HOME_REVISION_COMPARE_ANCHOR_ID } from "./simpleHomeRevisionCompareAnchor";
import { substitutePartyPlaceholdersInUserFacingText } from "../../agreement/partyPlaceholderDisplay";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";
import {
  appendVersion,
  applySigningLock,
  clearPendingRecipientNotice,
  clearSigningLock,
  draftToSnapshot,
  ensureInitialVersion,
  isSigningLockActive,
  loadBundle,
  mergeServerSigningLockIntoBundle,
  safeVersionInstructionSummary,
  setReviewSent,
  syncOwnerFromServerDraft,
  versionActionBadge,
  type AgreementSnapshot,
  type AgreementVersionBundle,
  type VersionMeta,
} from "../../agreement/agreementVersionStore";
import { agreementPublicVerifyPath } from "../../agreement/agreementPublicVerify";
import { buildAgreementSocialSummary, buildVersionShareText } from "../../agreement/agreementSharing";
import { ClawTrustFooter } from "../claw/ClawTrustFooter";
import { type ProofBadgeState, ProofBadge } from "../claw/ProofBadge";
import {
  agreementMagicLinkPath,
  agreementReviewPath,
  agreementReviewPathWithParticipant,
  agreementSigningPath,
} from "../../agreement/AgreementRecipientReview";
import { NegotiationAssistantPanel } from "../../agreement/NegotiationAssistantPanel";
import { draftExcerptForClause, htmlToPlainText } from "../../agreement/externalAiHandoff";
import {
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
  authoritativeProBypassSimpleSendPaywall,
  bypassSimpleHomeWatermarkSendGate,
  buildSendRouteReadonlyHtmlFromPlain,
  describePaidProSendModalBranch,
  mergePremiumRenderSourceField,
  pickAuthoritativePlainForSendHandoff,
  shouldMinimalProSendRecipientChrome,
  type PaidProSendBranchMeta,
} from "./sendHandoffAuthoritativeCorpus";
import { DirectComparePanel } from "../../agreement/DirectComparePanel";
import { MATERIAL_CHANGE_SUMMARY_LABEL } from "../../agreement/universalReviewIntakeCopy";
import {
  OWNER_CTA_ACCEPT_AND_CONTINUE,
  OWNER_CTA_MAKE_MORE_CHANGES,
  OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL,
  OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE,
  OWNER_CTA_DISMISS_SUCCESS,
  OWNER_CTA_GO_TO_SIGNERS,
  OWNER_CTA_REJECT_SUGGESTIONS,
  OWNER_CTA_REVIEW_SUGGESTED_CHANGES,
  OWNER_FINALIZE_LOCK_HINT,
  OWNER_LOCK_AND_CONTINUE_TO_SIGNING,
  OWNER_MAKE_MORE_CHANGES_LINE,
  OWNER_MULTIPLE_SUGGESTIONS_LABEL,
  OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND,
  OWNER_NEXT_LOCK_THEN_SEND,
  OWNER_NEXT_SEND_FOR_SIGNATURE,
  OWNER_POST_ACCEPT_LOCK_EXPLAINER,
  OWNER_REVIEW_BEFORE_SIGNING,
  OWNER_SEND_FOR_SIGNATURE,
  OWNER_SUGGESTED_CHANGES_NOT_SIGNED_LINE,
  OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE,
  OWNER_SUGGESTED_CHANGES_REVIEW_SUBTEXT,
} from "../../agreement/ownerRecipientSuggestedEditsCopy";
import {
  OWNER_PORTABLE_REVIEW_SUB,
  PORTABLE_REVIEW_HEADER,
  PORTABLE_REVIEW_OCR_FOOTNOTE,
  PORTABLE_REVIEW_PASTE_LABEL,
  PORTABLE_REVIEW_PASTE_PLACEHOLDER,
} from "../../agreement/portableReviewCopy";
import {
  buildNegotiationMemory,
  decisionFromResponseType,
  memoryRiskLabel,
} from "../../agreement/negotiationMemory";
import { DEFAULT_NEGOTIATION_POSTURE, postureLabelForHistory } from "../../agreement/negotiationPostures";
import type { NegotiationRiskAssessment } from "../../agreement/negotiationRisk";
import { riskLabelForHistory, riskToVersionMeta } from "../../agreement/negotiationRisk";
import type { NegotiationPosture } from "../../agreement/negotiationPostures";
import type { SuggestionContextMeta } from "../../vs01/negotiationSuggestions";
import {
  computeNegotiationPatterns,
  negotiationRowTrendSuffix,
  type ClauseFrictionId,
} from "../../vs01/negotiationPatterns";
import {
  agreementFieldLabel,
  compareAgreementSnapshots,
} from "../../vs01/agreementCompare";
import { buildAgreementRedline } from "../../vs01/agreementRedline";
import { featureFlags } from "../../config/featureFlags";
import { NegotiationTimelineView } from "../../vs01/NegotiationTimelineView";
import {
  buildNegotiationTimelineCurrentStatus,
  buildNegotiationTimelineEvents,
  buildNegotiationTimelineSignals,
  formatRevisionIdentityLabel,
} from "../../vs01/negotiationTimeline";
import {
  buildExecutionPacket,
  downloadExecutionPacketJson,
  downloadExecutionPacketSummaryTxt,
  type ExecutionPacketProof,
} from "../../vs01/executionPacket";
import { ExecutionPacketView } from "../../vs01/ExecutionPacketView";
import {
  fetchAgreementProofStatus,
  registerFinalizedAgreementReceipt,
} from "../../vs01/agreementProofApi";
import {
  applyRecipientProposalApi,
  postReviewSentServer,
  rejectRecipientProposalApi,
} from "../../agreement/agreementWorkspaceApi";
import { findOpenRecipientProposals } from "../../agreement/recipientProposal";
import {
  deriveParticipantRows,
  humanizePartyRoleForTable,
  missingSignerApprovals,
  participantDisplayName,
} from "../../agreement/participantModel";
import {
  emptyPaymentRequest,
  hydratePaymentFormFromApi,
  type PaymentRequestPayload,
} from "../../agreement/paymentRequestTypes";
import { SimplePaymentAttachCard } from "../../launch/simpleProduct/SimplePaymentAttachCard";
import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";
import { writePremiumSenderSignFirst } from "../../launch/simpleProduct/premiumSendIntent";
import {
  countReadyReviewLinkInviteParties,
  logReviewLinkRecipientEmailPreflight,
  mergeReviewLinkRecipientEmailsOntoHydratedDraft,
  resolveReviewLinkAssumedOwnerPartyIndex,
  rowReadyForReviewLinkInvite,
} from "../../launch/simpleProduct/reviewLinkRecipientEmailMerge";
import { isPaidProAgreementAuthoritative } from "./paidProAgreementAuthority";
import { ProRedlineOwnerPanel } from "./ProRedlineOwnerPanel";
import { normalizeStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";
import { mintRecipientAccessToken, putSigningLock } from "../../agreement/recipientAccessApi";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import {
  FUNNEL_CTA_SEND_WITH_PRO,
  FUNNEL_FREE_STARTER_BODY,
  FUNNEL_FREE_STARTER_HEADLINE,
  FUNNEL_PRO_ACTIVE_BODY,
  FUNNEL_PRO_ACTIVE_TITLE,
  FUNNEL_PRO_PHASE_READY_SIGNATURES,
  FUNNEL_PRO_PHASE_REVIEWER_SETUP,
  FUNNEL_PRO_VALUE_BULLETS,
  REVIEW_STRUCTURED_WIN_LINE,
  SIMPLE_HOME_AGREEMENT_READY_LINES,
} from "../../launch/pricingContent";
import { VoiceAugmentedTextArea } from "../../launch/VoiceAugmentedControl";
import { triggerPaywall } from "../../launch/triggerPaywall";
import {
  CONVERSION_GUARANTEE_INLINE,
  PAYWALL_DEFAULT_HEADLINE,
  PAYWALL_DEFAULT_SUB,
  PAYWALL_PAID_READY_CTA,
  PAYWALL_PAID_READY_HEADLINE,
  PAYWALL_PAID_READY_SUB_SIGNATURE,
} from "../../launch/paywallMessaging";
import { useAccess } from "../../access/AccessContext";
import {
  canAccessFullTimeline,
  readLawDogUserMonetizationState,
} from "../../monetization/lawDogMonetization";
import { usePowerPaywall } from "../../monetization/PowerPaywallContext";
import { UpgradeLimitNotice } from "../access/UpgradeLimitNotice";
import { errorMessageFromResponse, resolveApiBase } from "../../lib/clawApi";
import { canAccessSimpleSendActions, isSimpleSendPaywallActive } from "../../launch/simpleFlowSendUnlock";
import {
  clearPostProUnlockCelebrate,
  fetchWorkspaceProEntitlement,
  hasSessionAgreementSendUnlock,
  peekPostProUnlockCelebrate,
} from "../../agreement/agreementProFunnelGate";
import { LEGAL_GOVERNING_LAW_STATE } from "../../launch/legal/legalConstants";
import { US_STATE_NAMES_ENGLISH } from "./partyFormat";
import { humanizeRevisionValidationIssues } from "./revisionValidationLabels";

/** Plain-English mapping for policy / LLM blocks — avoid raw server codes in UI. */
function agreementPartiesWithEmailCount(parties: AgreementDraft["parties"] | undefined): number {
  return (parties ?? []).filter((p) => String(p?.email ?? "").trim().length > 0).length;
}

/** Lightweight bullets from common revision phrases (instruction text only; no LLM). */
function heuristicRevisionSummaryBullets(instruction: string): string[] {
  const ins = instruction.toLowerCase();
  const bullets: string[] = [];
  if (/\bcure\s+period\b|\bcure-period\b/.test(ins) || (/\bcure\b/.test(ins) && /\bperiod\b/.test(ins))) {
    bullets.push("Added cure period");
  }
  if (/non-disparagement|non\s+disparagement|nondisparagement/.test(ins)) {
    bullets.push("Added non-disparagement clause");
  }
  if (/\b45\s*days?\b|\bforty[-\s]?five\s+days?\b/.test(ins)) {
    bullets.push("Updated timeline");
  }
  if (/\bweekly\b/.test(ins) && /\b(progress|updates?)\b/.test(ins)) {
    bullets.push("Added reporting requirement");
  }
  if (/out-of-scope|out of scope/.test(ins) || /\b125\b/.test(ins)) {
    bullets.push("Added out-of-scope billing terms");
  }
  if (/payment\s+terms?\s+unchanged|keep\s+all\s+existing\s+payment/.test(ins)) {
    bullets.push("Preserved payment terms (per your note)");
  }
  return bullets;
}

function mapDraftAssistBlockedMessage(serverMsg: string): string {
  const l = serverMsg.toLowerCase();
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

function NegotiationTimelinePowerTeaser(props: { onUnlock: () => void }) {
  return (
    <div className="rounded-lg border border-violet-900/40 bg-violet-950/15 px-4 py-4">
      <p className="text-sm font-medium text-slate-200">Full record tracking</p>
      <p className="mt-1 text-xs text-slate-500">
        See every version, update, and status in one place — available on LawDog Power.
      </p>
      <button type="button" className="vs01-btn vs01-btn--secondary mt-3 text-xs" onClick={props.onUnlock}>
        Unlock full timeline
      </button>
    </div>
  );
}

type Party = { id?: string; name: string; role: string; email?: string; phone?: string };

type AgreementEconomicsOverlay = {
  watermark_required: boolean;
  free_draft_expires_at: string | null;
  free_draft_expired: boolean;
  tier: string;
};

function parseEconomicsPayload(raw: unknown): AgreementEconomicsOverlay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    watermark_required: Boolean(o.watermark_required),
    free_draft_expires_at: typeof o.free_draft_expires_at === "string" ? o.free_draft_expires_at : null,
    free_draft_expired: Boolean(o.free_draft_expired),
    tier: typeof o.tier === "string" ? o.tier : "unknown",
  };
}

/** Prefer client primed corpus when it is authoritative (≥500) or longer than GET. */
function preferLongerPlainCorpus(primed: string | null | undefined, fetched: string | null | undefined): string {
  const a = String(primed ?? "").trim();
  const b = String(fetched ?? "").trim();
  if (a.length >= 500 && a.length >= b.length) return a;
  if (b.length >= 500 && b.length > a.length) return b;
  if (b.length > a.length) return b;
  return a || b;
}

function mergeSimpleHomeHydrationDraft(
  agreementId: string,
  primedDraft: AgreementDraft | null,
  fetchedDraft: AgreementDraft,
): AgreementDraft {
  const id = String(agreementId || "").trim();
  const primed = primedDraft && String(primedDraft.id || "").trim() === id ? primedDraft : null;
  const emailMerged = mergeReviewLinkRecipientEmailsOntoHydratedDraft(fetchedDraft, primed);
  if (!primed) {
    return emailMerged;
  }
  const keepPrimed = (v: string | null | undefined): boolean => String(v ?? "").trim().length > 0;
  const nz = (s: string) => (s.trim() ? s : null);
  return {
    ...emailMerged,
    title: keepPrimed(primed.title) ? primed.title : emailMerged.title,
    purpose: nz(preferLongerPlainCorpus(primed.purpose, fetchedDraft.purpose)) ?? emailMerged.purpose,
    payment_terms: keepPrimed(primed.payment_terms) ? primed.payment_terms : emailMerged.payment_terms,
    jurisdiction: keepPrimed(primed.jurisdiction) ? primed.jurisdiction : emailMerged.jurisdiction,
    duration: keepPrimed(primed.duration) ? primed.duration : emailMerged.duration,
    due_date: keepPrimed(primed.due_date) ? primed.due_date : emailMerged.due_date,
    effective_date: keepPrimed(primed.effective_date) ? primed.effective_date : emailMerged.effective_date,
    premium_full_document_text: nz(
      preferLongerPlainCorpus(primed.premium_full_document_text, fetchedDraft.premium_full_document_text),
    ),
    premium_server_full_document_text: nz(
      preferLongerPlainCorpus(primed.premium_server_full_document_text, fetchedDraft.premium_server_full_document_text),
    ),
    server_full_document_text: nz(
      preferLongerPlainCorpus(primed.server_full_document_text, fetchedDraft.server_full_document_text),
    ),
    document_text: nz(preferLongerPlainCorpus(primed.document_text, fetchedDraft.document_text)),
    rendered_document_text: nz(
      preferLongerPlainCorpus(primed.rendered_document_text, fetchedDraft.rendered_document_text),
    ),
    premium_render_source: mergePremiumRenderSourceField(
      primed?.premium_render_source,
      fetchedDraft.premium_render_source,
    ),
  };
}

type PendingRevisionSource = "owner_manual" | "negotiation_response" | "external_ai_import";

type PendingRevision = {
  instruction: string;
  baselineDraft: AgreementDraft;
  baselineRenderedHtml: string;
  proposedDraft: AgreementDraft;
  proposedHtml: string;
  source: PendingRevisionSource;
  versionMeta?: VersionMeta;
  negotiationMemory?: {
    posture: NegotiationPosture;
    riskAssessment: NegotiationRiskAssessment | null;
    priorSnapshot: AgreementSnapshot | null;
  };
  suggestionContext?: SuggestionContextMeta;
};

function pendingRevisionSourceBadge(source: PendingRevisionSource): string {
  switch (source) {
    case "external_ai_import":
      return "Pasted review notes";
    case "negotiation_response":
      return "LawDog smart suggestions";
    case "owner_manual":
      return "Your instruction";
    default:
      return "Revision";
  }
}

export type AgreementReviewSection =
  | "all"
  | "details"
  | "draft"
  | "recipients"
  | "finalize"
  /** Marketing → create → send flow: two-column review + summary + recipients. */
  | "simpleHomeReview";

type SimpleReviewGap = {
  label: string;
  gapKey?: "jurisdiction" | "wording" | "effective_date" | "parties" | "recipient_email";
  partyIndex?: number;
};

type Props = {
  agreementId: string;
  onBackToNew?: () => void;
  onGoLegacy?: () => void;
  /** When set (not "all"), only that panel is rendered — used by {@link AgreementWizardShell}. */
  section?: AgreementReviewSection;
  /** Softer chrome when nested inside VS01 agreement card. */
  embeddedInCard?: boolean;
  /** Read-only surfaces when opening completed/archived agreements from My agreements. */
  workspaceEntryMode?: AgreementWorkspaceEntryMode;
  /** Fresh normalized draft from create+hydrate path — seeds state so Step 2 never mounts empty before GET completes. */
  initialDraftSnapshot?: AgreementDraft | null;
  /** After first successful GET normalize for this agreementId (parent may drop the snapshot). */
  onCanonicalDraftLoaded?: () => void;
  /** Workspace details step only: server payload could not be normalized to a safe shape — recover from Step 1. */
  onWorkspaceDetailsNotReady?: () => void;
  /** Simple launch flow: dominant footer action after review (e.g. continue to proof / done). */
  onSimpleFlowContinue?: () => void | Promise<void>;
  /** Parent-owned banner after review-link mint produced no usable URLs (stay on send). */
  reviewLinkMintFailureMessage?: string | null;
  /** Simple launch flow: quiet secondary back (e.g. to create). */
  onSimpleFlowBack?: () => void;
  /** Simple launch: REVIEW vs SEND column — controls footer labels and when sharing UI is shown. */
  simpleFlowPhase?: "review" | "send";
  /** Simple launch: session/checkout unlock for live links, send, and payment attach. */
  simpleSendActionsUnlocked?: boolean;
  /** Simple launch: navigate to upgrade bridge when send UI is locked. */
  onRequestSendUnlock?: () => void;
  /** Simple launch: primary CTA label on review step (default “Send”). */
  simpleFlowReviewPrimaryCtaLabel?: string;
  /** Simple launch: unlock / paywall CTA label (default “Unlock signing”). */
  simpleFlowUnlockCtaLabel?: string;
  /** First-run simple path: fewer banners, one send CTA, Free vs Pro framing from parent. */
  streamlinedSimpleFlow?: boolean;
  /** Premium create → send: intent captured before session clear (optional). */
  simpleFlowPremiumHandoffIntent?: PremiumSendIntent | null;
  /** Optional: run after user picks reviewer-handoff; parent may reset Pro celebration + phase. */
  onContinueToReviewerSetup?: () => void;
  /**
   * Workspace stepper: when `section` is `finalize` only, recipient UI is not mounted — use this to jump to the
   * Recipients step (e.g. after accepting edits, “Go to signers”).
   */
  onOwnerJumpToRecipientsStep?: () => void;
  /** Simple launch: paid-Pro send routing metadata — parent skips SendConversionModal when `bypass` is true. */
  onPaidProSendBranchMeta?: (meta: PaidProSendBranchMeta) => void;
  /** Paid Pro VS01 return: signature-first landing — avoid review-first status and negotiation-heavy chrome. */
  postVs01SignatureFirstLanding?: boolean;
  /**
   * Simple-home send: latest draft snapshot (including recipient emails from UI) for Paid Pro sender-first
   * VS01 bridge — parent reads synchronously when seed completes.
   */
  onBridgeHandoffDraftSnapshot?: (draft: AgreementDraft | null) => void;
};

const API_BASE = resolveApiBase();

/** Owner signing-lock failures sometimes return JSON-stringified detail — keep messages human and bounded. */
function humanizeOwnerSigningLockError(raw: string | undefined): string {
  const r = (raw || "").trim();
  if (!r) return "We could not finalize this version on the server. Please try again.";
  const lower = r.toLowerCase();
  if (lower.includes("approvals_incomplete")) {
    return "All signers must approve before locking for signing.";
  }
  if (r.startsWith("{")) {
    try {
      const o = JSON.parse(r) as { code?: string; message?: string };
      const msg = typeof o.message === "string" ? o.message.trim() : "";
      if (msg && !msg.startsWith("{")) {
        return msg.length > 280
          ? "We could not finalize this version on the server. Please try again."
          : msg;
      }
      const code = typeof o.code === "string" ? o.code : "";
      if (code === "approvals_incomplete") {
        return "All signers must approve before locking for signing.";
      }
    } catch {
      /* ignore */
    }
    return "We could not finalize this version on the server. Please try again.";
  }
  if (r.startsWith("error_")) return "We could not finalize this version on the server. Please try again.";
  if (/^[a-z0-9_.]+$/i.test(r) && r.includes("_") && !r.includes(" ") && r.length < 96) {
    return "We could not finalize this version on the server. Please try again.";
  }
  return r.length > 280 ? "We could not finalize this version on the server. Please try again." : r;
}

const WORKFLOW_ROLE_PRESETS = [
  { value: "owner", label: "Owner" },
  { value: "signer", label: "Signer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "viewer", label: "Viewer (read-only)" },
  /** Legacy alias — normalized as viewer in negotiation helpers. */
  { value: "counterparty", label: "Copy only (FYI)" },
];

function normalizeWorkflowRole(role: string): string {
  const r = (role || "").trim().toLowerCase();
  if (WORKFLOW_ROLE_PRESETS.some((p) => p.value === r)) return r;
  return "counterparty";
}

/** Table actions: personal URL vs clipboard “email draft” vary by workflow role. */
function recipientRowLinkActionLabels(wf: string): { copyPersonal: string; emailDraft: string } {
  if (wf === "signer") return { copyPersonal: "Copy signing link", emailDraft: "Email signing link" };
  if (wf === "reviewer") return { copyPersonal: "Copy review link", emailDraft: "Email review link" };
  return { copyPersonal: "Copy FYI link", emailDraft: "Email FYI copy" };
}

const SIMPLE_SEND_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recipientRoleNeedsContactInfo(role: string): boolean {
  const w = normalizeWorkflowRole(role);
  return w === "signer" || w === "reviewer";
}

function rowReadyForSignatureInvite(p: Party): boolean {
  if (!recipientRoleNeedsContactInfo(p.role)) return false;
  const name = (p.name || "").trim();
  const email = (p.email || "").trim();
  const phoneDigits = (p.phone || "").replace(/\D/g, "");
  return Boolean(
    name && email && SIMPLE_SEND_EMAIL_RE.test(email) && phoneDigits.length >= 10,
  );
}

function countContactRequiredParties(parties: Party[] | undefined): number {
  return (parties || []).filter((p) => recipientRoleNeedsContactInfo(p.role)).length;
}

function countReadyInviteParties(parties: Party[] | undefined): number {
  return (parties || []).filter((p) => rowReadyForSignatureInvite(p)).length;
}

/**
 * Lets owners send when at least one signer/reviewer row is complete; optional second signer can stay empty.
 * Rows that are partially filled still surface field errors.
 */
function validateRecipientContactForFlexibleSend(
  parties: Party[] | undefined,
  opts?: { reviewLinkEmailOnly?: boolean },
): Record<string, string> {
  const reviewOnly = opts?.reviewLinkEmailOnly === true;
  const err: Record<string, string> = {};
  const list = parties || [];
  const asParties = list as AgreementParty[];
  const ready = reviewOnly ? countReadyReviewLinkInviteParties(asParties) : countReadyInviteParties(list);

  if (reviewOnly) {
    const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(asParties);
    list.forEach((p, idx) => {
      if (idx === ownerIdx) return;
      const name = (p.name || "").trim();
      const email = (p.email || "").trim();
      if (email && !SIMPLE_SEND_EMAIL_RE.test(email)) {
        err[`${idx}-email`] = "Check that this email looks correct";
      }
      const started = Boolean(name || email);
      if (started) {
        if (!name) err[`${idx}-name`] = "Name is required";
        if (!email) err[`${idx}-email`] = err[`${idx}-email`] || "Email is required";
      }
    });
    if (ready < 1) {
      let firstIdx = list.findIndex(
        (p, i) => i !== ownerIdx && !rowReadyForReviewLinkInvite(p as AgreementParty, i, asParties),
      );
      if (firstIdx < 0) {
        firstIdx = list.findIndex((_, i) => i !== ownerIdx);
      }
      if (firstIdx >= 0) {
        const p = list[firstIdx];
        const name = (p.name || "").trim();
        const email = (p.email || "").trim();
        if (!name) err[`${firstIdx}-name`] = err[`${firstIdx}-name`] || "Name is required";
        if (!email) {
          err[`${firstIdx}-email`] =
            err[`${firstIdx}-email`] || "Add at least one recipient email to create a review link.";
        }
      }
    }
    return err;
  }

  list.forEach((p, idx) => {
    if (!recipientRoleNeedsContactInfo(p.role)) return;
    const name = (p.name || "").trim();
    const email = (p.email || "").trim();
    const phoneDigits = (p.phone || "").replace(/\D/g, "");
    if (email && !SIMPLE_SEND_EMAIL_RE.test(email)) {
      err[`${idx}-email`] = "Check that this email looks correct";
    }
    const started = Boolean(name || email || phoneDigits);
    if (started) {
      if (!name) err[`${idx}-name`] = "Name is required";
      if (!email) err[`${idx}-email`] = err[`${idx}-email`] || "Email is required to send for signature";
      if (phoneDigits.length < 10) err[`${idx}-phone`] = "Add a mobile number or email";
    }
  });
  if (ready < 1) {
    const firstIdx = list.findIndex((p) => recipientRoleNeedsContactInfo(p.role));
    if (firstIdx >= 0) {
      const p = list[firstIdx];
      const name = (p.name || "").trim();
      const email = (p.email || "").trim();
      const phoneDigits = (p.phone || "").replace(/\D/g, "");
      if (!name) err[`${firstIdx}-name`] = err[`${firstIdx}-name`] || "Name is required";
      if (!email) {
        err[`${firstIdx}-email`] = err[`${firstIdx}-email`] || "Add at least one signer email to send";
      }
      if (phoneDigits.length < 10) {
        err[`${firstIdx}-phone`] = err[`${firstIdx}-phone`] || "Add a mobile number or email";
      }
    }
  }
  return err;
}

function partyInviteDispatchRecorded(
  audit: AgreementDraft["audit_log"] | undefined,
  partyId: string,
): boolean {
  const pid = partyId.trim();
  if (!pid || pid.startsWith("legacy_")) return false;
  return (audit || []).some((e) => {
    const et = e.event_type || "";
    if (et !== "signature_request_sent" && et !== "recipient_invite_sent") return false;
    const v = e.value as { participant_id?: string; recipient_party_id?: string } | undefined;
    const id = String(v?.participant_id || v?.recipient_party_id || "").trim();
    return Boolean(id && id === pid);
  });
}

function sendStageEmailStatusLine(party: Party): string {
  const wf = normalizeWorkflowRole(party.role);
  if (wf === "owner") return "—";
  if (!recipientRoleNeedsContactInfo(party.role)) return "—";
  const email = (party.email || "").trim();
  if (!email) return "No email added";
  if (!SIMPLE_SEND_EMAIL_RE.test(email)) return "Fix email format";
  return email;
}

function sendStageDeliveryLine(
  draft: AgreementDraft,
  party: Party,
  idx: number,
  deriveRow: { status: string } | undefined, // ParticipantRow from deriveParticipantRows
): string {
  const wf = normalizeWorkflowRole(party.role);
  if (wf === "owner") return "Listed on agreement";
  if (!recipientRoleNeedsContactInfo(party.role)) return "No signature request";
  if (deriveRow?.status === "Signed") return "Signed";
  const partyId = String(party.id || "").trim() || `legacy_${idx}`;
  if (partyInviteDispatchRecorded(draft.audit_log, partyId)) return "Invite sent";
  if (rowReadyForSignatureInvite(party)) return "Ready to send invite";
  const email = (party.email || "").trim();
  if (!email) return "Not sending yet";
  if (!SIMPLE_SEND_EMAIL_RE.test(email)) return "Not sending yet";
  return "Not sending yet";
}

function contactPartyOrdinal(parties: Party[] | undefined, idx: number): number {
  const list = parties || [];
  if (!recipientRoleNeedsContactInfo(list[idx]?.role || "")) return 0;
  return list.slice(0, idx + 1).filter((p) => recipientRoleNeedsContactInfo(p.role)).length;
}

function contactWayfindLabel(
  idx: number,
  party: Party,
  ordinal: number,
  errs: Record<string, string>,
  attempted: boolean
): string | null {
  if (!attempted || ordinal < 1) return null;
  const w = normalizeWorkflowRole(party.role);
  const roleLabel = w === "signer" ? "Signer" : w === "reviewer" ? "Reviewer" : "Recipient";
  const ne = errs[`${idx}-name`];
  const ee = errs[`${idx}-email`];
  const pe = errs[`${idx}-phone`];
  if (!ne && !ee && !pe) return null;
  const first = ne ? "Name required" : ee ? "Email required" : "Mobile number required";
  return `${roleLabel} ${ordinal}: ${first}`;
}

const CONTACT_FIELD_ORDER = ["name", "email", "phone"] as const;

/** First invalid field per row: lowest party index, then name → email → phone. */
function firstContactValidationErrorKey(errs: Record<string, string>): string | null {
  const keys = Object.keys(errs);
  if (keys.length === 0) return null;
  keys.sort((a, b) => {
    const [ia, fa] = a.split("-", 2);
    const [ib, fb] = b.split("-", 2);
    const ni = Number(ia) - Number(ib);
    if (ni !== 0) return ni;
    return CONTACT_FIELD_ORDER.indexOf(fa as (typeof CONTACT_FIELD_ORDER)[number]) -
      CONTACT_FIELD_ORDER.indexOf(fb as (typeof CONTACT_FIELD_ORDER)[number]);
  });
  return keys[0] ?? null;
}

function scrollFocusPartyContactField(errorKey: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-party-contact="${errorKey}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      window.setTimeout(() => {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }, 350);
    }
  });
}

/** Scroll to, focus, and return the first invalid contact field key (name → email → phone per row). */
function scrollToFirstContactError(errs: Record<string, string>): string | null {
  const k = firstContactValidationErrorKey(errs);
  if (k) scrollFocusPartyContactField(k);
  return k;
}

function scrollToFirstIncompleteSignerEmail(parties: Party[] | undefined): void {
  const list = parties || [];
  const idx = list.findIndex((p) => recipientRoleNeedsContactInfo(p.role) && !rowReadyForSignatureInvite(p));
  if (idx < 0) return;
  scrollFocusPartyContactField(`${idx}-email`);
}

function auditEventLabel(eventType: string): string {
  switch (eventType) {
    case "signature_request_sent":
      return "Signature request sent";
    case "recipient_invite_sent":
      return "Recipient invite sent";
    case "participant_added":
      return "Participant added";
    case "participant_proposed_revision":
      return "Participant suggested edits";
    case "participant_approved":
      return "Participant approved draft";
    case "recipient_proposal_pending":
      return "Suggested edits waiting on owner";
    case "recipient_proposal_applied":
      return "Suggested edits applied";
    case "recipient_proposal_rejected":
      return "Suggested edits declined";
    case "recipient_proposal_superseded":
      return "Suggested edits replaced by a newer version";
    case "recipient_approved":
      return "Recipient approved (legacy)";
    case "signature_initiated":
      return "Signature initiated";
    case "signature_completed":
      return "Signature completed";
    default:
      return eventType;
  }
}

function workspaceStatusPillLabel(status: "Draft" | "Complete Draft" | "Signed"): string {
  if (status === "Complete Draft") return "Ready for review";
  if (status === "Signed") return "Sealed";
  return "Draft only";
}

const AgreementReview: React.FC<Props> = ({
  agreementId,
  onBackToNew,
  onGoLegacy,
  section = "all",
  embeddedInCard = false,
  workspaceEntryMode = "default",
  initialDraftSnapshot = null,
  onCanonicalDraftLoaded,
  onWorkspaceDetailsNotReady,
  onSimpleFlowContinue,
  onSimpleFlowBack,
  simpleFlowPhase = "review",
  simpleSendActionsUnlocked = true,
  onRequestSendUnlock,
  simpleFlowReviewPrimaryCtaLabel,
  simpleFlowUnlockCtaLabel,
  streamlinedSimpleFlow = false,
  simpleFlowPremiumHandoffIntent,
  onContinueToReviewerSetup,
  onPaidProSendBranchMeta,
  postVs01SignatureFirstLanding = false,
  onBridgeHandoffDraftSnapshot,
  reviewLinkMintFailureMessage = null,
  onOwnerJumpToRecipientsStep,
}) => {
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  /** Start true so we never render the error/empty branch before the first fetch runs. */
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Simple-home review: brief confirmation after revision preview succeeds (compare panel mounts below). */
  const [revisionPreviewFlash, setRevisionPreviewFlash] = useState(false);
  /** After owner applies a previewed revision: short field-level summary (no raw instruction text). */
  const [appliedRevisionBanner, setAppliedRevisionBanner] = useState<string | null>(null);
  /** Post-commit heuristic lines for “Changes applied” (from instruction phrases). */
  const [appliedRevisionHeuristicBullets, setAppliedRevisionHeuristicBullets] = useState<string[]>([]);
  /** Latest server revision_validation when ok === false (preview or last commit). */
  const [revisionValidation, setRevisionValidation] = useState<{ ok: boolean; issues: string[] } | null>(
    null
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const [status, setStatus] = useState<"Draft" | "Complete Draft" | "Signed">("Draft");
  const [editInstruction, setEditInstruction] = useState("");
  const [versionBundle, setVersionBundle] = useState<AgreementVersionBundle | null>(null);
  /** Latest GET `signing_lock` snapshot — applied when version bundle is rebuilt (avoids stale lock flash). */
  const [serverSigningLockHydrate, setServerSigningLockHydrate] = useState<{
    keyPresent: boolean;
    value: unknown;
  } | null>(null);
  /** null = show current_version from bundle */
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  /** Expanded “Why this change?” for negotiation_memory row */
  const [memoryDetailOpenId, setMemoryDetailOpenId] = useState<string | null>(null);
  const [externalAiPaste, setExternalAiPaste] = useState("");
  /** Optional two-paste direct compare; does not replace assisted preview. */
  const [portableTextMode, setPortableTextMode] = useState<"assisted" | "direct">("assisted");
  const [pendingRevision, setPendingRevision] = useState<PendingRevision | null>(null);
  const [negotiationCommitSeq, setNegotiationCommitSeq] = useState(0);
  const [compareViewMode, setCompareViewMode] = useState<"structured" | "redline">("structured");
  const [recipientProposalBusy, setRecipientProposalBusy] = useState<"apply" | "reject" | null>(null);
  /** After “Make more changes”, nudge owner toward editing before locking for signature. */
  const [ownerMakeMoreChangesHint, setOwnerMakeMoreChangesHint] = useState(false);
  /** After accepting recipient suggested edits — highlight finalize / signing handoff until lock or dismiss. */
  const [ownerPostAcceptSigningGuide, setOwnerPostAcceptSigningGuide] = useState(false);
  const recipientProposalDetailRef = useRef<HTMLDivElement | null>(null);
  const [rpCompareMode, setRpCompareMode] = useState<"structured" | "redline">("structured");
  const [copyDraftFlash, setCopyDraftFlash] = useState(false);
  const [copyClauseFlash, setCopyClauseFlash] = useState(false);
  const [shareFlash, setShareFlash] = useState<string | null>(null);
  const [reopenNegotiationConfirm, setReopenNegotiationConfirm] = useState(false);
  const [executionPacketOpen, setExecutionPacketOpen] = useState(false);
  /** Backend proof / anchor metadata merged into execution packet views. */
  const [proofOverlay, setProofOverlay] = useState<ExecutionPacketProof | null>(null);
  /** Minted ``t=`` signing URL segment when API + secrets are configured. */
  const [signingAccessToken, setSigningAccessToken] = useState<string | null>(null);
  const [recipientProposalFocusId, setRecipientProposalFocusId] = useState<string | null>(null);
  const [economicsOverlay, setEconomicsOverlay] = useState<AgreementEconomicsOverlay | null>(null);
  /** simpleHomeReview: first GET /api/agreements/:id finished (economics parsed); gates send-shell tier flip. */
  const [simpleHomeEconomicsHydrated, setSimpleHomeEconomicsHydrated] = useState(false);
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  const [governingLawModalOpen, setGoverningLawModalOpen] = useState(false);
  const [governingLawSelect, setGoverningLawSelect] = useState(LEGAL_GOVERNING_LAW_STATE);
  const [governingLawSaveBusy, setGoverningLawSaveBusy] = useState(false);
  const [watermarkSendModalOpen, setWatermarkSendModalOpen] = useState(false);
  const [watermarkModalSignFirst, setWatermarkModalSignFirst] = useState(false);
  /** Paid Pro review (non-authoritative happy path): confirm before mint — avoids duplicate “Create review link” chrome. */
  const [simpleReviewLinkConfirmModalOpen, setSimpleReviewLinkConfirmModalOpen] = useState(false);
  /** Paid authoritative send: auto-open paid-ready modal once per send-phase visit; reset when leaving send. */
  const autoPaidAuthoritativeSendConfirmPrimedKeyRef = useRef<string | null>(null);
  const [simpleSendValidateAttempted, setSimpleSendValidateAttempted] = useState(false);
  const [simpleSendRecipientEditorOpen, setSimpleSendRecipientEditorOpen] = useState(false);
  const [simpleSendFieldErrors, setSimpleSendFieldErrors] = useState<Record<string, string>>({});
  /** Bumps on each failed send validation so rows reset “typing” error chrome. */
  const [contactValidationSeq, setContactValidationSeq] = useState(0);
  const [shakeContactFieldKey, setShakeContactFieldKey] = useState<string | null>(null);
  /** Prevents double submit on simple-home send / payment handoff (savingField clears between chained saves). */
  const [simpleFlowAdvanceBusy, setSimpleFlowAdvanceBusy] = useState(false);
  /** Workspace: finalize-for-signing in flight (server lock + follow-up mint/register). */
  const [signingLockBusy, setSigningLockBusy] = useState(false);
  const relieveContactFieldError = useCallback((idx: number, field: "name" | "email" | "phone") => {
    setSimpleSendFieldErrors((prev) => {
      const k = `${idx}-${field}`;
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);
  const previewInFlightRef = useRef(false);
  const revisionCommitInFlightRef = useRef(false);
  const simpleHomeEditLoggedRef = useRef(false);
  const expiryWarnLoggedRef = useRef(false);
  const watermarkShownLoggedRef = useRef(false);
  const initialDraftSnapshotRef = useRef(initialDraftSnapshot);
  initialDraftSnapshotRef.current = initialDraftSnapshot;
  const onCanonicalDraftLoadedRef = useRef(onCanonicalDraftLoaded);
  onCanonicalDraftLoadedRef.current = onCanonicalDraftLoaded;
  const onWorkspaceDetailsNotReadyRef = useRef(onWorkspaceDetailsNotReady);
  onWorkspaceDetailsNotReadyRef.current = onWorkspaceDetailsNotReady;
  /** Latest posture + triage from negotiation panel (for manual revise after recipient version). */
  const negotiationPanelCtxRef = useRef<{
    posture: NegotiationPosture;
    riskAssessment: NegotiationRiskAssessment | null;
  }>({ posture: DEFAULT_NEGOTIATION_POSTURE, riskAssessment: null });
  const access = useAccess();
  const { openPowerPaywall } = usePowerPaywall();
  const monetizationState = useMemo(
    () => readLawDogUserMonetizationState(access.tier, access.usage),
    [access.tier, access.usage]
  );
  const fullTimelineUnlocked = canAccessFullTimeline(monetizationState);

  const isSimpleHomeReview = section === "simpleHomeReview";

  useEffect(() => {
    if (!onBridgeHandoffDraftSnapshot || !isSimpleHomeReview) return;
    onBridgeHandoffDraftSnapshot(draft ?? initialDraftSnapshot ?? null);
  }, [draft, initialDraftSnapshot, isSimpleHomeReview, onBridgeHandoffDraftSnapshot]);

  useEffect(() => {
    if (!onPaidProSendBranchMeta || !isSimpleHomeReview) return;
    const source = draft ?? initialDraftSnapshot;
    onPaidProSendBranchMeta(describePaidProSendModalBranch(source, { agreementId }));
  }, [agreementId, draft, initialDraftSnapshot, isSimpleHomeReview, onPaidProSendBranchMeta]);

  const simpleHomePaidAuthoritativeAgreementPreview = useMemo(
    () => Boolean(isSimpleHomeReview && draft && authoritativeProBypassSimpleSendPaywall(draft)),
    [isSimpleHomeReview, draft],
  );

  const isWorkspace =
    (embeddedInCard && section !== "all") || isSimpleHomeReview;
  /** Free/starter simple-home send intentionally hides rich history widgets for stability. */
  const showWorkspaceRichHistory = Boolean(isWorkspace && !isSimpleHomeReview);
  const collaborationReadOnly = Boolean(
    isWorkspace && workspaceEntryMode === "read_only_completed" && section === "draft"
  );
  const finalizeReadOnly = Boolean(
    isWorkspace &&
      (workspaceEntryMode === "read_only_completed" || workspaceEntryMode === "read_only_archived")
  );

  const onNegotiationMemoryContext = useCallback((ctx: {
    posture: NegotiationPosture;
    riskAssessment: NegotiationRiskAssessment | null;
  }) => {
    negotiationPanelCtxRef.current = ctx;
  }, []);

  const requiredComplete = useMemo(() => {
    if (!draft) return false;
    return (
      Boolean((draft.title || "").trim()) &&
      (draft.parties || []).length >= 2 &&
      Boolean((draft.purpose || "").trim()) &&
      Boolean((draft.payment_terms || "").trim()) &&
      Boolean((draft.duration || "").trim()) &&
      (draft.parties || []).length >= 2 &&
      Boolean((draft.jurisdiction || "").trim()) &&
      Boolean((draft.effective_date || "").trim())
    );
  }, [draft]);

  const simpleReviewGaps = useMemo(() => {
    if (!draft) return [] as SimpleReviewGap[];
    const g: SimpleReviewGap[] = [];
    if (!(draft.title || "").trim()) g.push({ label: "Agreement title", gapKey: "wording" });
    if (!(draft.jurisdiction || "").trim()) {
      g.push({ label: "Jurisdiction / governing law", gapKey: "jurisdiction" });
    }
    if (!(draft.effective_date || "").trim()) {
      g.push({ label: "Effective date", gapKey: "effective_date" });
    }
    if (!(draft.purpose || "").trim()) g.push({ label: "Scope / purpose", gapKey: "wording" });
    if (!(draft.payment_terms || "").trim()) g.push({ label: "Payment terms", gapKey: "wording" });
    if (!(draft.duration || "").trim()) g.push({ label: "Duration or term", gapKey: "wording" });
    if ((draft.parties || []).length < 2) {
      g.push({ label: "At least two parties with names", gapKey: "parties" });
    } else {
      const parties = draft.parties || [];
      const missIdx = parties.findIndex(
        (p) => recipientRoleNeedsContactInfo(p.role) && !(p.email || "").trim(),
      );
      if (missIdx >= 0) {
        g.push({
          label: "Recipient email for delivery",
          gapKey: "recipient_email",
          partyIndex: missIdx,
        });
      }
    }
    return g;
  }, [draft]);

  const scrollToSimpleFlowDraftDetails = useCallback(() => {
    const el =
      document.getElementById("simple-flow-draft-details") ||
      document.getElementById("simple-flow-revise");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const revealRecipientsAndScrollToSend = useCallback(() => {
    setSimpleSendRecipientEditorOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("simple-flow-send-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const gapFixActionClassName =
    "shrink-0 self-start text-left text-xs font-semibold text-emerald-300/95 underline decoration-emerald-500/45 underline-offset-2 hover:text-emerald-200";

  const renderSimpleHomeGapRow = useCallback(
    (item: SimpleReviewGap) => {
      let action: React.ReactNode = null;
      if (item.gapKey === "jurisdiction") {
        action = (
          <button
            type="button"
            className={gapFixActionClassName}
            onClick={() => {
              const cur = (draft?.jurisdiction || "").trim();
              setGoverningLawSelect(cur || LEGAL_GOVERNING_LAW_STATE);
              setGoverningLawModalOpen(true);
            }}
          >
            Set governing law
          </button>
        );
      } else if (item.gapKey === "wording") {
        action = (
          <button type="button" className={gapFixActionClassName} onClick={scrollToSimpleFlowDraftDetails}>
            Edit wording
          </button>
        );
      } else if (item.gapKey === "effective_date") {
        action = (
          <button type="button" className={gapFixActionClassName} onClick={scrollToSimpleFlowDraftDetails}>
            Set effective date
          </button>
        );
      } else if (item.gapKey === "parties") {
        action = (
          <button type="button" className={gapFixActionClassName} onClick={scrollToSimpleFlowDraftDetails}>
            Add recipient
          </button>
        );
      } else if (item.gapKey === "recipient_email") {
        action = (
          <button type="button" className={gapFixActionClassName} onClick={revealRecipientsAndScrollToSend}>
            Add recipient
          </button>
        );
      }
      return (
        <li
          key={`${item.label}_${item.gapKey ?? "x"}_${item.partyIndex ?? ""}`}
          className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 gap-2.5">
            <span className="text-slate-500" aria-hidden>
              ·
            </span>
            <span>{item.label}</span>
          </div>
          {action}
        </li>
      );
    },
    [draft?.jurisdiction, revealRecipientsAndScrollToSend, scrollToSimpleFlowDraftDetails],
  );

  const sortedUsJurisdictionNames = useMemo(
    () => [...US_STATE_NAMES_ENGLISH].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const streamlinedPartiesHeadline = useMemo(() => {
    if (!draft) return "—";
    const parties = draft.parties || [];
    const a = parties[0] ? participantDisplayName(parties[0], 0).trim() : "Party A";
    const b = parties[1] ? participantDisplayName(parties[1], 1).trim() : "Party B";
    return `${a} ↔ ${b}`;
  }, [draft]);

  const agreementReadiness = useMemo(() => {
    if (!draft || section !== "simpleHomeReview") return null;
    return computeAgreementDraftReadiness(draft);
  }, [draft, section]);

  const readinessShownAgreementIdRef = useRef<string | null>(null);
  const readinessPrevLevelRef = useRef<AgreementReadinessLevel | null>(null);
  const readinessSoftWarnLoggedRef = useRef(false);

  useEffect(() => {
    if (!agreementReadiness || section !== "simpleHomeReview" || !draft) return;
    if (readinessShownAgreementIdRef.current === agreementId) return;
    readinessShownAgreementIdRef.current = agreementId;
    logProductEvent("readiness_shown", {
      level: agreementReadiness.level,
      missingSignalsCount: agreementReadiness.missingSignals.length,
      surface: "simple_home_review",
      route: simpleFlowPhase,
    });
  }, [agreementReadiness, agreementId, draft, section, simpleFlowPhase]);

  useEffect(() => {
    if (!agreementReadiness || section !== "simpleHomeReview") return;
    const prev = readinessPrevLevelRef.current;
    if (prev !== null && prev !== agreementReadiness.level) {
      logProductEvent("readiness_level_changed", {
        from: prev,
        to: agreementReadiness.level,
        missingSignalsCount: agreementReadiness.missingSignals.length,
        surface: "simple_home_review",
        route: simpleFlowPhase,
      });
    }
    readinessPrevLevelRef.current = agreementReadiness.level;
  }, [agreementReadiness?.level, section, simpleFlowPhase]);

  useEffect(() => {
    if (!agreementReadiness || section !== "simpleHomeReview" || simpleFlowPhase !== "send") return;
    if (agreementReadiness.level === "ready") return;
    if (readinessSoftWarnLoggedRef.current) return;
    readinessSoftWarnLoggedRef.current = true;
    logProductEvent("readiness_soft_warning_seen", {
      level: agreementReadiness.level,
      missingSignalsCount: agreementReadiness.missingSignals.length,
      surface: "simple_home_review",
      route: "send",
    });
  }, [agreementReadiness?.level, section, simpleFlowPhase]);

  useEffect(() => {
    readinessShownAgreementIdRef.current = null;
    readinessPrevLevelRef.current = null;
    readinessSoftWarnLoggedRef.current = false;
  }, [agreementId]);

  useEffect(() => {
    if (section !== "simpleHomeReview") return;
    let cancelled = false;
    void fetchWorkspaceProEntitlement().then((ok) => {
      if (!cancelled) setWorkspaceProEntitled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [section, agreementId]);

  useEffect(() => {
    if (!revisionPreviewFlash) return;
    const t = window.setTimeout(() => setRevisionPreviewFlash(false), 4500);
    return () => window.clearTimeout(t);
  }, [revisionPreviewFlash]);

  /** Premium simple-home review: compare panel mounts below preview — scroll so users see the result. */
  useEffect(() => {
    if (!pendingRevision || section !== "simpleHomeReview") return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(SIMPLE_HOME_REVISION_COMPARE_ANCHOR_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [pendingRevision, section]);

  const vb = useMemo(() => {
    if (!isWorkspace) return null;
    return versionBundle ?? loadBundle(agreementId);
  }, [isWorkspace, versionBundle, agreementId]);

  const headVersionTail = useMemo(() => {
    if (!vb || vb.versions.length === 0) return null;
    return vb.versions[vb.versions.length - 1]!;
  }, [vb]);

  const revisionCompare = useMemo(() => {
    if (!pendingRevision) return null;
    return compareAgreementSnapshots(
      draftToSnapshot(pendingRevision.baselineDraft),
      draftToSnapshot(pendingRevision.proposedDraft)
    );
  }, [pendingRevision]);

  const redlinePreview = useMemo(() => {
    if (!pendingRevision) return null;
    return buildAgreementRedline(
      htmlToPlainText(pendingRevision.baselineRenderedHtml),
      htmlToPlainText(pendingRevision.proposedHtml)
    );
  }, [pendingRevision]);

  const openRecipientProposals = useMemo(
    () => (draft ? findOpenRecipientProposals(draft.audit_log) : []),
    [draft]
  );

  useEffect(() => {
    if (openRecipientProposals.length === 0) {
      setRecipientProposalFocusId(null);
      setOwnerMakeMoreChangesHint(false);
      return;
    }
    setRecipientProposalFocusId((cur) => {
      if (cur && openRecipientProposals.some((p) => p.proposal_id === cur)) return cur;
      return openRecipientProposals[0]!.proposal_id;
    });
  }, [openRecipientProposals]);

  const openRecipientProposal = useMemo(
    () =>
      openRecipientProposals.find((p) => p.proposal_id === recipientProposalFocusId) ??
      openRecipientProposals[0] ??
      null,
    [openRecipientProposals, recipientProposalFocusId]
  );

  const recipientProposalNormalized = useMemo(() => {
    if (!openRecipientProposal || !draft) return null;
    const proposed = normalizeAgreementDraftFromApi(openRecipientProposal.draft, {
      fallbackAgreementId: agreementId,
    });
    if (!proposed) return null;
    return { proposed, baseline: draft };
  }, [openRecipientProposal, draft, agreementId]);

  const rpRevisionCompare = useMemo(() => {
    if (!recipientProposalNormalized) return null;
    return compareAgreementSnapshots(
      draftToSnapshot(recipientProposalNormalized.baseline),
      draftToSnapshot(recipientProposalNormalized.proposed)
    );
  }, [recipientProposalNormalized]);

  const rpRedlinePreview = useMemo(() => {
    if (!recipientProposalNormalized || !openRecipientProposal) return null;
    const propHtml = String(openRecipientProposal.rendered_html || "");
    return buildAgreementRedline(
      htmlToPlainText(renderedHtml),
      htmlToPlainText(propHtml || "<p></p>")
    );
  }, [recipientProposalNormalized, openRecipientProposal, renderedHtml]);

  const rpRedlineCharCount =
    rpRedlinePreview?.segments.reduce((n, s) => n + s.text.length, 0) ?? 0;
  const rpRedlineLarge =
    Boolean(rpRedlinePreview) &&
    (rpRedlinePreview!.segments.length > 120 || rpRedlineCharCount > 24_000);
  const rpRedlineHasDiff = Boolean(rpRedlinePreview?.hasChanges);

  useEffect(() => {
    if (rpCompareMode === "redline" && !rpRedlineHasDiff) {
      setRpCompareMode("structured");
    }
  }, [rpCompareMode, rpRedlineHasDiff]);

  const negotiationTimelineSignals = useMemo(() => {
    if (!vb || vb.versions.length === 0) return null;
    return buildNegotiationTimelineSignals(vb.versions);
  }, [vb]);

  const recipientTimelineName = useMemo(() => {
    if (!vb) return undefined;
    for (let i = vb.versions.length - 1; i >= 0; i--) {
      const r = vb.versions[i]!;
      if (r.created_by === "recipient" && r.label?.trim()) return r.label.trim();
    }
    return undefined;
  }, [vb]);

  const negotiationTimelineEvents = useMemo(() => {
    if (!vb || !showWorkspaceRichHistory) return [];
    return buildNegotiationTimelineEvents(vb.versions, {
      perspective: "owner",
      recipientDisplayName: recipientTimelineName,
      simplified: false,
      signingLock: vb.signingLock ?? null,
      signingLockAudit: vb.signingLockAudit,
    });
  }, [vb, showWorkspaceRichHistory, recipientTimelineName]);

  const negotiationTimelineStatus = useMemo(() => {
    if (!vb || !showWorkspaceRichHistory || !negotiationTimelineSignals) return null;
    return buildNegotiationTimelineCurrentStatus({
      versions: vb.versions,
      perspective: "owner",
      signingLock: vb.signingLock ?? null,
      convergence: negotiationTimelineSignals.convergence,
      closeRecommendation: negotiationTimelineSignals.closeRecommendation,
      patternEventCount: negotiationTimelineSignals.patternEventCount,
    });
  }, [vb, showWorkspaceRichHistory, negotiationTimelineSignals]);

  const negotiationPatternStats = useMemo(() => {
    if (!vb || !showWorkspaceRichHistory) return null;
    return negotiationTimelineSignals?.patterns ?? computeNegotiationPatterns(vb.versions);
  }, [vb, showWorkspaceRichHistory, negotiationTimelineSignals]);

  const executionPacketData = useMemo(() => {
    if (!isWorkspace || !vb || !draft) return null;
    const lockedActive = isSigningLockActive(vb);
    const useFallback =
      !lockedActive &&
      (workspaceEntryMode === "read_only_completed" || workspaceEntryMode === "read_only_archived") &&
      vb.versions.length > 0;
    if (!lockedActive && !useFallback) return null;
    return buildExecutionPacket({
      agreementId,
      draft,
      bundle: vb,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      signingAccessToken: signingAccessToken ?? undefined,
      useFinalVersionFallback: useFallback,
    });
  }, [isWorkspace, vb, draft, agreementId, signingAccessToken, workspaceEntryMode]);

  const signingLockedEarly = Boolean(isWorkspace && vb && isSigningLockActive(vb));
  const shouldPollAgreementProof = Boolean(
    isWorkspace &&
      agreementId &&
      (signingLockedEarly ||
        workspaceEntryMode === "read_only_completed" ||
        workspaceEntryMode === "read_only_archived")
  );

  const executionPacketForView = useMemo(() => {
    if (!executionPacketData) return null;
    if (!proofOverlay) return executionPacketData;
    return { ...executionPacketData, proof: proofOverlay };
  }, [executionPacketData, proofOverlay]);

  const onVerifiedPacketDownload = useCallback(
    (kind: "json" | "txt") => {
      const g = access.check("verification_packet");
      if (!g.allowed) {
        setError(g.message || "Download limit reached for your plan.");
        return;
      }
      const pkt = executionPacketForView;
      if (!pkt) return;
      access.recordUsage("verification_packets");
      if (kind === "json") downloadExecutionPacketJson(pkt);
      else downloadExecutionPacketSummaryTxt(pkt);
    },
    [access, executionPacketForView]
  );

  const agreementFullySigned = useMemo(() => isAgreementMarkedSignedInAudit(draft), [draft]);

  const signingUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!vb || !isSigningLockActive(vb) || !vb.signingLock?.lockedVersionId) return "";
    return `${window.location.origin}${agreementSigningPath(agreementId, vb.signingLock.lockedVersionId, signingAccessToken)}`;
  }, [vb, agreementId, signingAccessToken]);

  const verificationUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const id = String(agreementId || "").trim();
    if (!id) return "";
    return `${window.location.origin}${agreementPublicVerifyPath(id)}`;
  }, [agreementId]);

  const pendingSignerModel = useMemo(
    () =>
      draft
        ? buildPendingSignerRows({
            draft,
            linkReady: Boolean(signingUrl),
            agreementFullySigned,
          })
        : { rows: [], completedCount: 0, total: 0, summary: "Add at least one signer on the Recipients step." },
    [draft, signingUrl, agreementFullySigned]
  );

  const workspaceStatusPillText = useMemo(() => {
    if (
      postVs01SignatureFirstLanding &&
      status === "Complete Draft" &&
      (!vb || !vb.reviewSentAt)
    ) {
      const pend = pendingSignerModel.rows.filter((r) => r.status !== "signed");
      if (pend.length === 1) {
        const nm = pend[0]!.name.trim();
        if (nm) return `Awaiting ${nm}`;
        return "Awaiting signature";
      }
      if (pend.length > 1) return "Awaiting signatures";
      return "Awaiting signature";
    }
    return workspaceStatusPillLabel(status);
  }, [postVs01SignatureFirstLanding, status, vb, pendingSignerModel]);

  const workspaceStateBannerContent = useMemo(() => {
    if (section === "simpleHomeReview") return null;
    if (!isWorkspace || !draft) return null;
    const signed = Boolean((draft.audit_log || []).find((e) => e.event_type === "signed"));
    const lockActive = Boolean(vb && isSigningLockActive(vb));
    const reviewSent = Boolean(vb?.reviewSentAt);
    const lastIsRecipient = Boolean(headVersionTail?.created_by === "recipient");
    if (signed) {
      return {
        title: JOY_COPY.workspaceSealedTitle,
        detail: JOY_COPY.workspaceSealedDetail,
      };
    }
    if (lockActive) {
      if (postVs01SignatureFirstLanding && !reviewSent) {
        const pend = pendingSignerModel.rows.filter((r) => r.status !== "signed");
        const named = pend.map((r) => r.name.trim()).filter(Boolean);
        if (named.length === 1) {
          return {
            title: `Awaiting signature from ${named[0]}`,
            detail: pendingSignerModel.summary,
          };
        }
        if (named.length > 1) {
          return { title: "Awaiting signatures", detail: pendingSignerModel.summary };
        }
        return { title: "Awaiting signature", detail: pendingSignerModel.summary };
      }
      return {
        title: "Pending signature",
        detail:
          "Signers are completing this agreement on the final signing version. To change terms, reopen review first.",
      };
    }
    if (lastIsRecipient) {
      return {
        title: "Waiting on your response",
        detail:
          "The latest version is from a recipient. Preview changes, then apply updates or send your own revised draft — you control what merges into your master draft.",
      };
    }
    if (reviewSent) {
      return {
        title: "Waiting on recipient review",
        detail:
          "A review link is active. Recipients can suggest edits; each update is tracked in version history.",
      };
    }
    if (requiredComplete) {
      if (postVs01SignatureFirstLanding && !reviewSent) {
        const pend = pendingSignerModel.rows.filter((r) => r.status !== "signed");
        const named = pend.map((r) => r.name.trim()).filter(Boolean);
        if (named.length === 1) {
          return {
            title: `Awaiting signature from ${named[0]}`,
            detail: pendingSignerModel.summary,
          };
        }
        if (named.length > 1) {
          return { title: "Awaiting signatures", detail: pendingSignerModel.summary };
        }
        return { title: "Awaiting signature", detail: pendingSignerModel.summary };
      }
      return {
        title: "Ready for review",
        detail:
          "Details are complete. Share a review link from Recipients when you want counterparty input — nothing is final until signatures.",
      };
    }
    return {
      title: "Draft only",
      detail:
        "Finish agreement details first. Then you can request changes and share revised drafts with recipients in one shared workflow.",
    };
  }, [
    section,
    isWorkspace,
    draft,
    vb,
    headVersionTail,
    requiredComplete,
    postVs01SignatureFirstLanding,
    pendingSignerModel,
  ]);

  useEffect(() => {
    if (!shouldPollAgreementProof) {
      setProofOverlay(null);
      setSigningAccessToken(null);
      return;
    }
    let cancel = false;
    void (async () => {
      const p = await fetchAgreementProofStatus(API_BASE, agreementId);
      if (!cancel && p) setProofOverlay(p);
    })();
    return () => {
      cancel = true;
    };
  }, [shouldPollAgreementProof, agreementId]);

  useEffect(() => {
    if (!isWorkspace || finalizeReadOnly || !signingLockedEarly || signingAccessToken) return;
    let cancel = false;
    const mintKey =
      (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env
        ?.VITE_RECIPIENT_LINK_MINT_KEY || "";
    void (async () => {
      const minted = await mintRecipientAccessToken(agreementId, { mode: "sign" }, mintKey);
      if (!cancel && minted?.token) setSigningAccessToken(minted.token);
    })();
    return () => {
      cancel = true;
    };
  }, [isWorkspace, finalizeReadOnly, signingLockedEarly, signingAccessToken, agreementId]);

  useEffect(() => {
    simpleHomeEditLoggedRef.current = false;
  }, [agreementId]);

  useEffect(() => {
    const signed = Boolean((draft?.audit_log || []).find((e) => e.event_type === "signed"));
    if (signed) setStatus("Signed");
    else if (requiredComplete) setStatus("Complete Draft");
    else setStatus("Draft");
  }, [draft, requiredComplete]);

  useEffect(() => {
    if (!executionPacketData) setExecutionPacketOpen(false);
  }, [executionPacketData]);

  async function loadRendered() {
    const id = agreementId?.trim();
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(id)}/render`, {
        method: "POST",
        headers: clawAgreementHeaders(),
      });
      if (!res.ok) throw new Error("render_failed");
      const payload = await res.json();
      setRenderedHtml(String(payload?.rendered_html || ""));
    } catch {
      setRenderedHtml("");
    }
  }

  /** Refresh draft from server (e.g. after export). Avoids flashing the full-page loading gate when `silent`. */
  async function loadDraft(opts?: { silent?: boolean }) {
    const id = agreementId?.trim();
    if (!id) return;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(id)}`, {
        headers: clawAgreementHeaders(),
      });
      if (!res.ok) {
        const buf = await res.text();
        const msg = await errorMessageFromResponse(
          new Response(buf, { status: res.status }),
          "We couldn't load this agreement. Please try again.",
        );
        throw new Error(msg);
      }
      const payload = await res.json();
      setEconomicsOverlay(parseEconomicsPayload(payload?.economics));
      const normalized = normalizeAgreementDraftFromApi(payload?.draft ?? null, { fallbackAgreementId: id });
      if (!normalized) {
        throw new Error(
          "The server returned an agreement we could not display. Refresh the page or try again.",
        );
      }
      setDraft(normalized);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load agreement.");
    } finally {
      if (!opts?.silent) setLoading(false);
      if (section === "simpleHomeReview") setSimpleHomeEconomicsHydrated(true);
    }
  }

  async function applyOpenRecipientProposal() {
    if (!openRecipientProposal) return;
    setRecipientProposalBusy("apply");
    setError(null);
    try {
      const r = await applyRecipientProposalApi(agreementId, openRecipientProposal.proposal_id);
      if (!r.ok) {
        const fe = (r.error || "").trim();
        throw new Error(
          fe && !/^(apply_failed|reject_failed|network)$/i.test(fe) && fe.length < 240
            ? fe
            : "Could not merge that suggestion into your draft. Please try again.",
        );
      }
      trackAgreementFunnelEvent("owner_applied_edits", { surface: "agreement_review" }, { planTier: String(access.tier), agreementId });
      await loadDraft({ silent: true });
      await loadRendered();
      setOwnerMakeMoreChangesHint(false);
      setOwnerPostAcceptSigningGuide(true);
      window.requestAnimationFrame(() => {
        const el = document.getElementById("owner-finalize-signing");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.requestAnimationFrame(() => {
          el?.focus({ preventScroll: true });
        });
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not apply suggestion.");
    } finally {
      setRecipientProposalBusy(null);
    }
  }

  async function rejectOpenRecipientProposal() {
    if (!openRecipientProposal) return;
    setRecipientProposalBusy("reject");
    setError(null);
    try {
      const r = await rejectRecipientProposalApi(agreementId, openRecipientProposal.proposal_id);
      if (!r.ok) {
        const fe = (r.error || "").trim();
        throw new Error(
          fe && !/^(apply_failed|reject_failed|network)$/i.test(fe) && fe.length < 240
            ? fe
            : "Could not dismiss that suggestion. Please try again.",
        );
      }
      await loadDraft({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not record a decline for this suggestion.");
    } finally {
      setRecipientProposalBusy(null);
    }
  }

  useEffect(() => {
    const id = agreementId?.trim();
    if (!id) {
      if (import.meta.env.DEV) {
        console.warn("[AgreementReview] missing or empty agreement_id — cannot load");
      }
      setLoading(false);
      setDraft(null);
      setRenderedHtml("");
      setError(null);
      setServerSigningLockHydrate(null);
      return;
    }

    if (import.meta.env.DEV) {
      console.log("[AgreementReview] navigating / loading agreement", id);
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setServerSigningLockHydrate(null);

    const snap = initialDraftSnapshotRef.current;
    const simpleHome = section === "simpleHomeReview";
    if (simpleHome) setSimpleHomeEconomicsHydrated(false);
    if (snap && String(snap.id || "").trim() === id) {
      const primed = normalizeAgreementDraftFromApi(snap, { fallbackAgreementId: id });
      const primedReady = Boolean(primed && isAgreementDetailsStepReady(primed, id));
      if (primed && (primedReady || simpleHome)) {
        if (import.meta.env.DEV) {
          console.log("[AgreementReview] primed draft from create/hydrate path", id, { primedReady, simpleHome });
        }
        setDraft(primed);
      } else {
        if (import.meta.env.DEV) {
          console.warn("[AgreementReview] initialDraftSnapshot rejected by normalize / guard", id, {
            primedReady,
            simpleHome,
          });
        }
      }
    }

    void (async () => {
      try {
        try {
          const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(id)}`, {
            headers: clawAgreementHeaders(),
          });
          if (!res.ok) {
            const buf = await res.text();
            const msg = await errorMessageFromResponse(
              new Response(buf, { status: res.status }),
              "We couldn't load this agreement. Please try again.",
            );
            throw new Error(msg);
          }
          const payload = await res.json();
          if (cancelled) return;
          const pl = payload as Record<string, unknown>;
          setServerSigningLockHydrate({
            keyPresent: Object.prototype.hasOwnProperty.call(pl, "signing_lock"),
            value: Object.prototype.hasOwnProperty.call(pl, "signing_lock") ? pl.signing_lock : undefined,
          });
          setEconomicsOverlay(parseEconomicsPayload(payload?.economics));
          if (simpleHome && !cancelled) setSimpleHomeEconomicsHydrated(true);
          const normalized = normalizeAgreementDraftFromApi(payload?.draft ?? null, { fallbackAgreementId: id });
          const ready = Boolean(normalized && isAgreementDetailsStepReady(normalized, id));
          if (import.meta.env.DEV) {
            console.log("[AgreementReview] fetch agreement received", id, {
              normalized: Boolean(normalized),
              detailsStepReady: ready,
              simpleHome,
            });
          }
          if (!normalized) {
            if (import.meta.env.DEV) {
              console.warn("[AgreementReview] normalize returned null after GET", id);
            }
            const snapRecover =
              simpleHome &&
              initialDraftSnapshotRef.current &&
              String(initialDraftSnapshotRef.current.id || "").trim() === id
                ? normalizeAgreementDraftFromApi(initialDraftSnapshotRef.current, { fallbackAgreementId: id })
                : null;
            if (snapRecover) {
              setDraft(snapRecover);
              setError(null);
            } else {
              setDraft(null);
              setError("We couldn't load agreement details. Go back or refresh and try again.");
              if (embeddedInCard && section === "details" && onWorkspaceDetailsNotReadyRef.current) {
                onWorkspaceDetailsNotReadyRef.current();
              }
            }
            return;
          }
          if (!ready && !simpleHome) {
            if (import.meta.env.DEV) {
              console.warn("[AgreementReview] Step 2 guard: invalid draft shape after GET", id);
            }
            setDraft(null);
            setError("We couldn't load agreement details. Go back or refresh and try again.");
            if (embeddedInCard && section === "details" && onWorkspaceDetailsNotReadyRef.current) {
              onWorkspaceDetailsNotReadyRef.current();
            }
            return;
          }
          if (!ready && simpleHome) {
            if (import.meta.env.DEV) {
              console.warn("[AgreementReview] simpleHomeReview: using draft despite workspace shape guard", id);
            }
          }
          const primedCurrent =
            simpleHome && initialDraftSnapshotRef.current && String(initialDraftSnapshotRef.current.id || "").trim() === id
              ? normalizeAgreementDraftFromApi(initialDraftSnapshotRef.current, { fallbackAgreementId: id })
              : null;
          const mergedForSimple = simpleHome ? mergeSimpleHomeHydrationDraft(id, primedCurrent, normalized) : normalized;
          setDraft(mergedForSimple);
          if (simpleHome && mergedForSimple) {
            logReviewLinkRecipientEmailPreflight(mergedForSimple);
          }
          if (import.meta.env.DEV && simpleHome && mergedForSimple) {
            const hp = pickAuthoritativePlainForSendHandoff(mergedForSimple);
            // eslint-disable-next-line no-console
            console.info("[send-hydrate-corpus]", {
              agreementId: id,
              fieldUsed: hp?.field ?? null,
              bodyLen: hp?.text.length ?? 0,
            });
          }
          onCanonicalDraftLoadedRef.current?.();
          if (import.meta.env.DEV) {
            console.log("[AgreementReview] fetch agreement success", id);
          }
        } catch (e: unknown) {
          if (!cancelled) {
            const snap = initialDraftSnapshotRef.current;
            const primedRecover =
              simpleHome && snap && String(snap.id || "").trim() === id
                ? normalizeAgreementDraftFromApi(snap, { fallbackAgreementId: id })
                : null;
            if (primedRecover) {
              setDraft(primedRecover);
              setError(null);
            } else {
              setDraft(null);
              const msg = e instanceof Error ? e.message : "Could not load agreement.";
              setError(msg);
            }
            setServerSigningLockHydrate(null);
            if (import.meta.env.DEV) {
              console.error("[AgreementReview] fetch agreement failed", id, e);
            }
          }
        }

        try {
          const rrender = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(id)}/render`, {
            method: "POST",
            headers: clawAgreementHeaders(),
          });
          if (!rrender.ok) throw new Error("render_failed");
          const rp = await rrender.json();
          if (!cancelled) setRenderedHtml(String(rp?.rendered_html || ""));
        } catch {
          if (!cancelled) setRenderedHtml("");
        }
      } finally {
        if (!cancelled && simpleHome) setSimpleHomeEconomicsHydrated(true);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit initialDraftSnapshot: primed payload is read once per agreementId via ref so clearing
    // the snapshot in the parent does not re-trigger a full reload.
  }, [agreementId, embeddedInCard, section]);

  useEffect(() => {
    if (!pendingRevision) setCompareViewMode("structured");
  }, [pendingRevision]);

  useEffect(() => {
    if (!openRecipientProposal) setRpCompareMode("structured");
  }, [openRecipientProposal]);

  useEffect(() => {
    if (!draft || !agreementId || !renderedHtml) return;
    let b = loadBundle(agreementId);
    if (!b || b.versions.length === 0) {
      b = ensureInitialVersion(agreementId, draft, renderedHtml);
    } else {
      b = syncOwnerFromServerDraft({ agreementId, draft, renderedHtml });
    }
    if (serverSigningLockHydrate?.keyPresent) {
      const raw = serverSigningLockHydrate.value;
      mergeServerSigningLockIntoBundle(
        agreementId,
        raw === null || raw === undefined
          ? null
          : typeof raw === "object"
            ? (raw as Record<string, unknown>)
            : null,
      );
      b = loadBundle(agreementId) ?? b;
    }
    setVersionBundle(b);
  }, [agreementId, draft, renderedHtml, serverSigningLockHydrate]);

  /** Preview selection + copy helpers — must run before any early return (Rules of Hooks). */
  const selectedVid = useMemo(() => {
    if (!isWorkspace || !vb) return "";
    return previewVersionId ?? vb.currentVersionId;
  }, [isWorkspace, vb, previewVersionId]);

  const selectedVer = useMemo(() => {
    if (!vb) return undefined;
    return vb.versions.find((v) => v.id === selectedVid);
  }, [vb, selectedVid]);

  const authoritativeCorpusPick = useMemo(
    () => (draft ? pickAuthoritativePlainForSendHandoff(draft) : null),
    [draft],
  );

  const simpleSendAuthoritativeMinimalChrome = useMemo(
    () =>
      Boolean(
        isSimpleHomeReview &&
          simpleFlowPhase === "send" &&
          shouldMinimalProSendRecipientChrome({
            premiumRenderSourceResolved: draft?.premium_render_source ?? null,
            authoritativePick: authoritativeCorpusPick,
            readonlyPlainText: authoritativeCorpusPick?.text ?? "",
            draft,
          }),
      ),
    [isSimpleHomeReview, simpleFlowPhase, authoritativeCorpusPick, draft],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !isSimpleHomeReview || simpleFlowPhase !== "send" || !draft) return;
    const pick = authoritativeCorpusPick;
    const purposeLen = (draft.purpose ?? "").trim().length;
    const hasAuthoritativeCorpus = Boolean(
      pick &&
        pick.text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN &&
        pick.field !== "purpose",
    );
    const authLen = pick?.text.length ?? 0;
    // eslint-disable-next-line no-console
    console.info("[send-stage-ui-source]", {
      minimalProSendRecipientChrome: simpleSendAuthoritativeMinimalChrome,
      hasAuthoritativeCorpus,
      authoritativeLen: authLen,
      renderSource: pick?.field ?? "",
      reviewCardHidden: simpleSendAuthoritativeMinimalChrome,
      advancedOptionsHidden: simpleSendAuthoritativeMinimalChrome,
      purposeLen,
    });
    if (
      simpleSendAuthoritativeMinimalChrome &&
      purposeLen < 1000 &&
      authLen >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN
    ) {
      // eslint-disable-next-line no-console
      console.warn("[send-purpose-short-but-authoritative-ok]", {
        purposeLen,
        authoritativeLen: authLen,
        renderSource: pick?.field ?? "",
      });
    }
  }, [
    isSimpleHomeReview,
    simpleFlowPhase,
    draft,
    draft?.purpose,
    authoritativeCorpusPick,
    simpleSendAuthoritativeMinimalChrome,
  ]);

  const renderedHtmlResolved = useMemo(() => {
    const rh = renderedHtml || "";
    const plainFromRender = htmlToPlainText(rh).trim();
    if (!isSimpleHomeReview || !authoritativeCorpusPick) return rh;
    if (authoritativeCorpusPick.text.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return rh;
    if (plainFromRender.length >= authoritativeCorpusPick.text.length - 200) return rh;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[send-render-corpus]", {
        agreementId,
        fieldUsed: authoritativeCorpusPick.field,
        bodyLen: authoritativeCorpusPick.text.length,
        renderPlainLen: plainFromRender.length,
      });
    }
    const paidAuthoritative = Boolean(
      draft && isPaidProAgreementAuthoritative({ draft, agreementId, includeLocalCompletionMarker: false }),
    );
    return buildSendRouteReadonlyHtmlFromPlain(authoritativeCorpusPick.text, {
      documentLabel: paidAuthoritative ? "Agreement preview" : undefined,
    });
  }, [agreementId, draft, isSimpleHomeReview, authoritativeCorpusPick, renderedHtml]);

  const previewHtml = useMemo(() => {
    if (isWorkspace && selectedVer) return selectedVer.rendered_html;
    return renderedHtmlResolved;
  }, [isWorkspace, selectedVer, renderedHtmlResolved]);

  const draftSanitizeContext = useMemo(() => {
    if (!draft) return "";
    return [draft.title, draft.purpose, draft.payment_terms, ...(draft.parties ?? []).map((p) => p.name)].join("\n");
  }, [draft]);

  /** Ordered structured party names — authoritative for [ORG_n] / signature-block hydration. */
  const authoritativePartyNames = useMemo(
    () => (draft?.parties ?? []).map((p) => p.name),
    [draft?.parties],
  );

  const previewHtmlDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        previewHtml || "",
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [previewHtml, draftSanitizeContext, authoritativePartyNames],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || section !== "simpleHomeReview" || !draft) return;
    const pick = pickAuthoritativePlainForSendHandoff(draft);
    const previewPlainLen = htmlToPlainText(previewHtmlDisplay || "").trim().length;
    if (
      pick &&
      pick.text.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN &&
      previewPlainLen < 400 &&
      pick.text.length > previewPlainLen + 200
    ) {
      // eslint-disable-next-line no-console
      console.warn("[send-handoff-invariant]", {
        agreementId,
        issue: "authoritative_corpus_present_but_preview_short",
        corpusField: pick.field,
        corpusLen: pick.text.length,
        previewPlainLen,
      });
    }
  }, [section, draft, agreementId, previewHtmlDisplay]);

  const renderedHtmlDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        renderedHtml || "",
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [renderedHtml, draftSanitizeContext, authoritativePartyNames],
  );

  const plainForDirectCompare = useMemo(
    () => htmlToPlainText(previewHtmlDisplay || renderedHtmlDisplay || ""),
    [previewHtmlDisplay, renderedHtmlDisplay],
  );

  const recipientProposalHtmlDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        String(openRecipientProposal?.rendered_html || ""),
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [openRecipientProposal?.rendered_html, draftSanitizeContext, authoritativePartyNames],
  );

  const pendingRevBaselineDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        pendingRevision?.baselineRenderedHtml || "",
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [pendingRevision?.baselineRenderedHtml, draftSanitizeContext, authoritativePartyNames],
  );

  const pendingRevProposedDisplay = useMemo(
    () =>
      substitutePartyPlaceholdersInUserFacingText(
        pendingRevision?.proposedHtml || "",
        draftSanitizeContext,
        authoritativePartyNames,
      ),
    [pendingRevision?.proposedHtml, draftSanitizeContext, authoritativePartyNames],
  );

  const previewMetaWhen = useMemo(() => {
    if (isWorkspace && selectedVer) return selectedVer.created_at;
    return draft?.updated_at ?? "";
  }, [isWorkspace, selectedVer, draft?.updated_at]);

  const topFrictionClauseId = useMemo(
    (): ClauseFrictionId | undefined => negotiationPatternStats?.topFrictionClauses?.[0]?.clause,
    [negotiationPatternStats]
  );

  const copyFullDraftPlain = useCallback(async () => {
    const text = htmlToPlainText(previewHtmlDisplay || renderedHtmlDisplay || "");
    try {
      await navigator.clipboard.writeText(text);
      setCopyDraftFlash(true);
      window.setTimeout(() => setCopyDraftFlash(false), 1800);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [previewHtmlDisplay, renderedHtmlDisplay]);

  const copyClausePlain = useCallback(async () => {
    if (!draft || !topFrictionClauseId) return;
    const text = draftExcerptForClause(draft, topFrictionClauseId);
    try {
      await navigator.clipboard.writeText(text);
      setCopyClauseFlash(true);
      window.setTimeout(() => setCopyClauseFlash(false), 1800);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [draft, topFrictionClauseId]);

  useEffect(() => {
    if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
    const id = agreementId?.trim();
    const mode = !id ? "no_agreement_id" : loading && !draft ? "loading" : !draft ? "fallback_no_draft" : "ready";
    console.debug("[AgreementReview] progression", {
      agreementId: id ? `${id.slice(0, 8)}…` : null,
      mode,
      hasDraft: Boolean(draft),
    });
  }, [agreementId, loading, draft]);

  /** Declared before any early returns — must match hooks used when `draft` is still loading (Rules of Hooks). */
  const show = (s: AgreementReviewSection) => section === "all" || section === s;
  const isStreamlinedSimple = Boolean(streamlinedSimpleFlow && isSimpleHomeReview);
  /**
   * Paid LawDog tier — only after economics overlay hydrates from GET /api/agreements/:id
   * (`simpleHomeEconomicsHydrated`). Prevents treating unknown tier as free before economics resolves.
   */
  const tierIsPaidLawdog = Boolean(
    isSimpleHomeReview && economicsOverlay !== null && economicsOverlay.tier === "paid",
  );
  const simpleFlowUpsellSuppressed = Boolean(
    tierIsPaidLawdog ||
      workspaceProEntitled ||
      hasSessionAgreementSendUnlock(agreementId),
  );
  const simpleHomeProEntitlementBypass = Boolean(simpleFlowUpsellSuppressed && isSimpleHomeReview);
  /** Premium post-upgrade: same surfaces as streamlined simple-home (LawDog copy + fork), even without router priming. */
  const premiumLawdogSimpleHome = Boolean(isStreamlinedSimple || simpleFlowUpsellSuppressed);
  const streamlinedPremiumIntentForCopy = premiumLawdogSimpleHome ? simpleFlowPremiumHandoffIntent ?? null : null;
  const simpleSendReviewIntent =
    (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review";
  /** Paid Pro review-link handoff: hide upsell strips, redline/export chrome, keep a tight confirmation surface. */
  const simpleHomePaidReviewLinkHandoff = Boolean(
    isSimpleHomeReview && simpleFlowUpsellSuppressed && simpleSendReviewIntent,
  );
  /** Premium review intent on `/app/send` send step — final review-link prep (not the signature workspace). */
  const simpleHomeReviewLinkSendStep = Boolean(
    isSimpleHomeReview && premiumLawdogSimpleHome && simpleFlowPhase === "send" && simpleSendReviewIntent,
  );
  /** Premium on `/app/send`: fork choice lives in parent until intent is non-null. */
  const premiumAwaitingStreamlinedFork = Boolean(
    premiumLawdogSimpleHome && simpleSendActionsUnlocked && simpleFlowPhase === "review" && simpleFlowPremiumHandoffIntent === null,
  );
  /**
   * simpleHomeReview + send: brief neutral surface until agreement economics resolves — avoids unpaid canonical
   * chrome for paid users (see `canonicalUnpaidSendShell`).
   */
  const sendShellTierGatePending = Boolean(
    isSimpleHomeReview &&
      simpleFlowPhase === "send" &&
      !simpleHomeEconomicsHydrated &&
      !hasSessionAgreementSendUnlock(agreementId) &&
      !workspaceProEntitled,
  );
  /**
   * Canonical GTM v1 unpaid simple-home send — after economics fetch completes (`simpleHomeEconomicsHydrated`);
   * paid tier is gated on `tierIsPaidLawdog` (non-null overlay + `tier === "paid"`).
   */
  const canonicalUnpaidSendShell = Boolean(
    isSimpleHomeReview &&
      simpleFlowPhase === "send" &&
      simpleHomeEconomicsHydrated &&
      !simpleFlowUpsellSuppressed,
  );
  const simplePreviewHtmlForFreeSend = useMemo(() => {
    const base = previewHtmlDisplay || "<p>No rendered document yet.</p>";
    if (!canonicalUnpaidSendShell) return base;
    return base.replace(/\bding\b/gi, "To be agreed between the parties");
  }, [previewHtmlDisplay, canonicalUnpaidSendShell]);
  useEffect(() => {
    if (simpleFlowPhase !== "send" || !isSimpleHomeReview) {
      setSimpleSendValidateAttempted(false);
      setSimpleSendFieldErrors({});
    }
  }, [simpleFlowPhase, isSimpleHomeReview, agreementId]);
  const fv = isWorkspace ? "workspace" : "default";
  const viewingHead = Boolean(vb && selectedVid === vb.currentVersionId);
  const signingLocked = Boolean(isWorkspace && isSigningLockActive(vb));
  const workspaceDraftStatusLine = useMemo(() => {
    if (!isWorkspace || !vb) return null;
    if (signingLocked) return "Final: Final version ready for signature";
    if (showWorkspaceRichHistory && openRecipientProposal && !signingLocked) {
      return "Received: They suggested edits — review now";
    }
    const reviewSent = Boolean(vb.reviewSentAt);
    const lastIsRecipient = headVersionTail?.created_by === "recipient";
    if (reviewSent && !lastIsRecipient) return "Waiting: Waiting for their review";
    return "Editable: Draft in progress — you can still make edits";
  }, [
    isWorkspace,
    vb,
    signingLocked,
    showWorkspaceRichHistory,
    openRecipientProposal,
    headVersionTail?.created_by,
  ]);
  const proofBadgeState: ProofBadgeState = useMemo(() => {
    if (agreementFullySigned) return "signed";
    if (signingLocked) return "pending";
    if (status === "Complete Draft") return "pending";
    return "draft";
  }, [agreementFullySigned, signingLocked, status]);

  useEffect(() => {
    expiryWarnLoggedRef.current = false;
    watermarkShownLoggedRef.current = false;
    setOwnerPostAcceptSigningGuide(false);
  }, [agreementId]);

  useEffect(() => {
    if (signingLocked) setOwnerPostAcceptSigningGuide(false);
  }, [signingLocked]);

  useEffect(() => {
    if (!economicsOverlay || economicsOverlay.tier !== "free") return;
    if (economicsOverlay.free_draft_expired || !economicsOverlay.free_draft_expires_at) return;
    if (expiryWarnLoggedRef.current) return;
    expiryWarnLoggedRef.current = true;
    logProductEvent("draft_expiry_warning_shown", { agreementId });
  }, [economicsOverlay, agreementId]);

  useEffect(() => {
    if (!economicsOverlay?.watermark_required || !renderedHtml) return;
    if (watermarkShownLoggedRef.current) return;
    watermarkShownLoggedRef.current = true;
    logProductEvent("watermark_shown", { agreementId, surface: "agreement_review" });
  }, [economicsOverlay?.watermark_required, renderedHtml, agreementId]);

  const copyPublicVerifyLinkOnly = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setShareFlash("Public verify link copied");
      window.setTimeout(() => setShareFlash(null), 2200);
    } catch {
      setError("Could not copy link.");
    }
  }, [verificationUrl]);

  const copySocialSummaryFn = useCallback(async () => {
    if (!draft) return;
    try {
      const text = buildAgreementSocialSummary({ draft });
      await navigator.clipboard.writeText(text);
      setShareFlash("Copied for email or social");
      window.setTimeout(() => setShareFlash(null), 2200);
    } catch {
      setError("Could not copy summary.");
    }
  }, [draft]);

  const stubAgreementPdf = useCallback(() => {
    setShareFlash("PDF export is coming soon — use Export for Word in the meantime.");
    window.setTimeout(() => setShareFlash(null), 2800);
  }, []);

  const copyKeyTermsPlain = useCallback(async () => {
    if (!draft) return;
    const p = (draft.purpose || "").trim();
    const pay = (draft.payment_terms || "").trim();
    if (!p && !pay) {
      setError("Add purpose or payment terms to copy key terms.");
      return;
    }
    const text = [p && `Purpose: ${p}`, pay && `Payment: ${pay}`].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyClauseFlash(true);
      window.setTimeout(() => setCopyClauseFlash(false), 1800);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [draft]);

  const signingApproverMissingList = useMemo(() => missingSignerApprovals(draft), [draft]);
  const participantRows = useMemo(() => deriveParticipantRows(draft), [draft]);
  const sendInviteReadyCount = useMemo(() => {
    const parties = draft?.parties;
    const reviewIntent =
      isSimpleHomeReview && (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review";
    if (reviewIntent) {
      return countReadyReviewLinkInviteParties(parties);
    }
    return countReadyInviteParties(parties);
  }, [draft?.parties, isSimpleHomeReview, streamlinedPremiumIntentForCopy, simpleFlowPremiumHandoffIntent]);
  const sendInviteTotalSlots = useMemo(() => countContactRequiredParties(draft?.parties), [draft?.parties]);
  /** Paid authoritative `/app/send` v1: flat recipient editor, no accordion / delivery matrix chrome. */
  const simplePaidProAuthoritativeSendSurface = useMemo(
    () =>
      Boolean(
        isSimpleHomeReview &&
          simpleFlowPhase === "send" &&
          (simpleSendAuthoritativeMinimalChrome || simpleHomePaidAuthoritativeAgreementPreview),
      ),
    [
      isSimpleHomeReview,
      simpleFlowPhase,
      simpleSendAuthoritativeMinimalChrome,
      simpleHomePaidAuthoritativeAgreementPreview,
    ],
  );
  const recipientGateBlocksSend = useMemo(() => sendInviteReadyCount < 1, [sendInviteReadyCount]);

  /** Skip the intermediate “Create review links” card when paid Pro is authoritative and parties already satisfy send. */
  const paidProAuthoritativeSendHappyPath = useMemo(
    () =>
      Boolean(
        isSimpleHomeReview &&
          simpleFlowPhase === "send" &&
          draft &&
          simpleSendActionsUnlocked &&
          !recipientGateBlocksSend &&
          isPaidProAgreementAuthoritative({ draft, agreementId }),
      ),
    [agreementId, draft, isSimpleHomeReview, recipientGateBlocksSend, simpleFlowPhase, simpleSendActionsUnlocked],
  );

  useEffect(() => {
    if (simpleFlowPhase !== "send") autoPaidAuthoritativeSendConfirmPrimedKeyRef.current = null;
  }, [simpleFlowPhase]);

  useEffect(() => {
    if (!paidProAuthoritativeSendHappyPath || !draft) return;
    if (!bypassSimpleHomeWatermarkSendGate(draft, economicsOverlay)) return;
    if (autoPaidAuthoritativeSendConfirmPrimedKeyRef.current === agreementId) return;
    autoPaidAuthoritativeSendConfirmPrimedKeyRef.current = agreementId;
    setWatermarkSendModalOpen(true);
  }, [agreementId, draft, economicsOverlay, paidProAuthoritativeSendHappyPath]);

  useEffect(() => {
    if (!watermarkSendModalOpen) return;
    setWatermarkModalSignFirst(false);
  }, [watermarkSendModalOpen]);

  useEffect(() => {
    if (simpleFlowPhase === "send") return;
    setSimpleReviewLinkConfirmModalOpen(false);
  }, [simpleFlowPhase]);

  useEffect(() => {
    if (!watermarkSendModalOpen) return;
    setSimpleReviewLinkConfirmModalOpen(false);
  }, [watermarkSendModalOpen]);

  const logCreateReviewLinksClick = useCallback(
    (actionTaken: string, extra?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      if (postVs01SignatureFirstLanding) return;
      // eslint-disable-next-line no-console
      console.info("[create-review-links-click]", {
        agreementId,
        createUiStage: section,
        createFlowPhase: simpleFlowPhase,
        sendAuthoritative: Boolean(draft && isPaidProAgreementAuthoritative({ draft, agreementId })),
        hasRecipientEmails: sendInviteReadyCount >= 1,
        actionTaken,
        ...extra,
      });
    },
    [agreementId, section, simpleFlowPhase, draft, sendInviteReadyCount, postVs01SignatureFirstLanding],
  );

  const paymentRequestSnap = useMemo(() => {
    if (!draft) return "";
    return JSON.stringify(draft.payment_request ?? null);
  }, [draft?.id, draft?.payment_request]);

  const paySnapRef = useRef<string>("");
  const [simplePayForm, setSimplePayForm] = useState<PaymentRequestPayload>(() => emptyPaymentRequest());
  const simplePayFormRef = useRef<PaymentRequestPayload>(simplePayForm);
  simplePayFormRef.current = simplePayForm;
  const [simplePaymentRequired, setSimplePaymentRequired] = useState(false);
  const simplePaymentRequiredRef = useRef(false);
  simplePaymentRequiredRef.current = simplePaymentRequired;

  useEffect(() => {
    if (section !== "simpleHomeReview" || !draft) return;
    setSimplePaymentRequired(Boolean(draft.payment_required));
  }, [section, draft?.payment_required, draft?.id]);

  useEffect(() => {
    if (section !== "simpleHomeReview" || !draft) return;
    if (paySnapRef.current === paymentRequestSnap) return;
    paySnapRef.current = paymentRequestSnap;
    setSimplePayForm(hydratePaymentFormFromApi(draft.payment_request));
  }, [section, draft, paymentRequestSnap]);

  async function saveField(field: string, value: unknown) {
    if (economicsOverlay?.free_draft_expired) {
      setError("Don't lose this agreement — save and finalize it.");
      logProductEvent("upgrade_prompt_from_expiry", { agreementId, surface: "edit_blocked" });
      triggerPaywall({ agreementId, reason: "draft_expired" });
      return;
    }
    setSavingField(field);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/update-field`,
        {
          method: "POST",
          headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ field, value }),
        }
      );
      if (!res.ok) {
        const buf = await res.text();
        let detail: Record<string, unknown> | null = null;
        try {
          const raw = buf ? (JSON.parse(buf) as { detail?: unknown }) : null;
          detail =
            raw?.detail && typeof raw.detail === "object" && raw.detail !== null
              ? (raw.detail as Record<string, unknown>)
              : null;
        } catch {
          /* ignore */
        }
        if (res.status === 403 && detail?.code === "draft_expired" && detail?.paywall) {
          logProductEvent("draft_expired", { agreementId, surface: "update_field" });
          logProductEvent("upgrade_prompt_from_expiry", { agreementId, surface: "api" });
          setEconomicsOverlay((prev) =>
            prev
              ? { ...prev, free_draft_expired: true }
              : {
                  watermark_required: true,
                  free_draft_expires_at: null,
                  free_draft_expired: true,
                  tier: "free",
                }
          );
          triggerPaywall({ agreementId, reason: "draft_expired" });
          return;
        }
        const msg = await errorMessageFromResponse(
          new Response(buf, { status: res.status }),
          "Couldn't save your draft. Please try again.",
        );
        throw new Error(msg);
      }
      const payload = await res.json();
      setEconomicsOverlay(parseEconomicsPayload(payload?.economics) ?? economicsOverlay);
      const savedNorm = normalizeAgreementDraftFromApi(payload?.draft ?? null, {
        fallbackAgreementId: agreementId,
      });
      if (!savedNorm) {
        throw new Error(
          "Your changes may have saved, but we could not read the agreement the server returned. Refresh the page or try again.",
        );
      }
      setDraft(savedNorm);
      await loadRendered();
      if (section === "simpleHomeReview" && !simpleHomeEditLoggedRef.current) {
        simpleHomeEditLoggedRef.current = true;
        logProductEvent("agreement_edited", { agreementId });
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't save your draft. Please try again.");
    } finally {
      setSavingField(null);
    }
  }

  async function persistSimplePayment() {
    const f = simplePayFormRef.current;
    const pr = f.amount.trim() ? f : null;
    await saveField("payment_request", pr);
    await saveField("payment_required", simplePaymentRequiredRef.current);
  }

  async function persistSimplePaymentRequired(nextRequired: boolean) {
    setSimplePaymentRequired(nextRequired);
    const f = simplePayFormRef.current;
    const pr = f.amount.trim() ? f : null;
    await saveField("payment_required", nextRequired);
    await saveField("payment_request", pr);
  }

  async function handleSimpleSendWithPayment() {
    if (!onSimpleFlowContinue || !draft || !simpleSendActionsUnlocked) return;
    if (simpleFlowAdvanceBusy) return;
    if (isWorkspace && isSimpleHomeReview && simpleFlowPhase === "send") {
      setSimpleSendValidateAttempted(true);
      const contactErrs = validateRecipientContactForFlexibleSend(draft.parties, {
        reviewLinkEmailOnly: (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review",
      });
      setSimpleSendFieldErrors(contactErrs);
      if (Object.keys(contactErrs).length > 0) {
        setSimpleSendRecipientEditorOpen(true);
        setContactValidationSeq((n) => n + 1);
        const firstKey = scrollToFirstContactError(contactErrs);
        if (firstKey) {
          setShakeContactFieldKey(firstKey);
          window.setTimeout(() => setShakeContactFieldKey(null), 220);
        }
        return;
      }
    }
    if (!simplePaymentRequired && !simplePayForm.amount.trim()) {
      setError("Enter an amount to request payment, or use “Send without payment.”");
      return;
    }
    if (simplePaymentRequired && !simplePayForm.amount.trim()) {
      setError("Payment is required before signing — add an amount.");
      return;
    }
    setError(null);
    setSimpleFlowAdvanceBusy(true);
    try {
      await saveField("payment_request", simplePayForm);
      await saveField("payment_required", simplePaymentRequired);
      await Promise.resolve(onSimpleFlowContinue?.());
    } catch {
      /* saveField sets error */
    } finally {
      setSimpleFlowAdvanceBusy(false);
    }
  }

  async function handleSimpleSendWithoutPayment() {
    const logReviewLinkAction = (actionTaken: string, extra?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      if (postVs01SignatureFirstLanding) return;
      // eslint-disable-next-line no-console
      console.info("[review-link-action]", {
        agreementId,
        createFlowPhase: simpleFlowPhase,
        createUiStage: section,
        hasRecipients: sendInviteReadyCount >= 1,
        actionTaken,
        ...extra,
      });
    };
    if (!onSimpleFlowContinue || !draft || !simpleSendActionsUnlocked) {
      logReviewLinkAction("aborted_missing_prereq", {
        hasOnContinue: Boolean(onSimpleFlowContinue),
        hasDraft: Boolean(draft),
        unlocked: simpleSendActionsUnlocked,
      });
      return;
    }
    if (simpleFlowAdvanceBusy) return;
    if (isWorkspace && isSimpleHomeReview && simpleFlowPhase === "send") {
      setSimpleSendValidateAttempted(true);
      const contactErrs = validateRecipientContactForFlexibleSend(draft.parties, {
        reviewLinkEmailOnly: (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review",
      });
      setSimpleSendFieldErrors(contactErrs);
      if (Object.keys(contactErrs).length > 0) {
        logReviewLinkAction("blocked_recipient_validation");
        setError(
          draft && isPaidProAgreementAuthoritative({ draft, agreementId })
            ? streamlinedPremiumIntentForCopy === "signature"
              ? "Add at least one signer email to continue."
              : "Add at least one recipient email to create a review link."
            : streamlinedPremiumIntentForCopy === "review"
              ? "Add at least one recipient email below, then try Create review link again."
              : "Add at least one recipient email below, then try again.",
        );
        setSimpleSendRecipientEditorOpen(true);
        setContactValidationSeq((n) => n + 1);
        const firstKey = scrollToFirstContactError(contactErrs);
        if (firstKey) {
          setShakeContactFieldKey(firstKey);
          window.setTimeout(() => setShakeContactFieldKey(null), 220);
        }
        window.requestAnimationFrame(() => {
          document.getElementById("simple-send-recipients-v1-anchor")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
        return;
      }
    }
    setError(null);
    setSimplePaymentRequired(false);
    setSimpleFlowAdvanceBusy(true);
    try {
      await saveField("payment_required", false);
      await saveField("payment_request", null);
      await Promise.resolve(onSimpleFlowContinue?.());
      logReviewLinkAction("advance_confirm_flow");
    } catch {
      /* saveField sets error */
    } finally {
      setSimpleFlowAdvanceBusy(false);
    }
  }

  function requestReviewLinkCreateConfirmation() {
    const logReviewLinkAction = (actionTaken: string, extra?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      if (postVs01SignatureFirstLanding) return;
      // eslint-disable-next-line no-console
      console.info("[review-link-action]", {
        agreementId,
        createFlowPhase: simpleFlowPhase,
        createUiStage: section,
        hasRecipients: sendInviteReadyCount >= 1,
        actionTaken,
        ...extra,
      });
    };
    if (!onSimpleFlowContinue || !draft || !simpleSendActionsUnlocked) {
      logReviewLinkAction("aborted_missing_prereq", {
        hasOnContinue: Boolean(onSimpleFlowContinue),
        hasDraft: Boolean(draft),
        unlocked: simpleSendActionsUnlocked,
      });
      return;
    }
    if (simpleFlowAdvanceBusy) return;
    if (isWorkspace && isSimpleHomeReview && simpleFlowPhase === "send") {
      setSimpleSendValidateAttempted(true);
      const contactErrs = validateRecipientContactForFlexibleSend(draft.parties, {
        reviewLinkEmailOnly: (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review",
      });
      setSimpleSendFieldErrors(contactErrs);
      if (Object.keys(contactErrs).length > 0) {
        logReviewLinkAction("blocked_recipient_validation");
        setError(
          draft && isPaidProAgreementAuthoritative({ draft, agreementId })
            ? streamlinedPremiumIntentForCopy === "signature"
              ? "Add at least one signer email to continue."
              : "Add at least one recipient email to create a review link."
            : streamlinedPremiumIntentForCopy === "review"
              ? "Add at least one recipient email below, then try Create review link again."
              : "Add at least one recipient email below, then try again.",
        );
        setSimpleSendRecipientEditorOpen(true);
        setContactValidationSeq((n) => n + 1);
        const firstKey = scrollToFirstContactError(contactErrs);
        if (firstKey) {
          setShakeContactFieldKey(firstKey);
          window.setTimeout(() => setShakeContactFieldKey(null), 220);
        }
        window.requestAnimationFrame(() => {
          document.getElementById("simple-send-recipients-v1-anchor")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
        return;
      }
    }
    setError(null);
    setSimpleReviewLinkConfirmModalOpen(true);
  }

  function EditableField(props: {
    label: string;
    field: string;
    value: string | null | undefined;
    placeholder?: string;
    variant?: "default" | "workspace";
  }) {
    const v = props.variant ?? "default";
    const [editing, setEditing] = useState(false);
    const safeVal = String(props.value ?? "");
    const [localValue, setLocalValue] = useState(safeVal);
    const [normFlash, setNormFlash] = useState(false);
    const isJurisdictionCard = props.field === "jurisdiction" && isSimpleHomeReview;

    useEffect(() => {
      setLocalValue(String(props.value ?? ""));
    }, [props.value]);

    useEffect(() => {
      if (!normFlash) return;
      const t = window.setTimeout(() => setNormFlash(false), 900);
      return () => window.clearTimeout(t);
    }, [normFlash]);

    const labelCls =
      v === "workspace" && isSimpleHomeReview
        ? "text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300"
        : "text-[11px] font-medium uppercase tracking-wide text-slate-500";

    const shell =
      v === "workspace"
        ? isSimpleHomeReview
          ? `flex min-h-[7.25rem] flex-col rounded-lg border border-slate-800/90 bg-slate-900/35 p-5 ${normFlash ? "claw-jurisdiction-normalized-flash" : ""}`
          : "rounded-lg border border-slate-800/90 bg-slate-900/35 p-4"
        : "rounded border border-slate-800 bg-slate-900/40 p-3";
    const shellEdit =
      v === "workspace"
        ? isSimpleHomeReview
          ? "flex min-h-[7.25rem] flex-col rounded-lg border border-slate-700 bg-slate-900/55 p-5"
          : "rounded-lg border border-slate-700 bg-slate-900/55 p-4"
        : "rounded border border-slate-700 bg-slate-900/60 p-3";

    const readDisplay = (() => {
      if (isJurisdictionCard) {
        const t = safeVal.trim();
        if (!t) return v === "workspace" ? "—" : "TBD";
        return normalizeJurisdictionDisplay(safeVal);
      }
      return safeVal.trim() || (v === "workspace" ? "—" : "TBD");
    })();

    if (!editing) {
      return (
        <div className={shell}>
          <div className={labelCls}>{props.label}</div>
          <div
            className={
              v === "workspace" && isSimpleHomeReview
                ? "mt-3 flex-1 text-[1.0625rem] font-medium leading-snug text-slate-50"
                : "mt-2 text-sm leading-snug text-slate-100"
            }
          >
            {readDisplay}
          </div>
          <button
            type="button"
            className={
              v === "workspace"
                ? isSimpleHomeReview
                  ? "mt-3 self-start text-xs font-medium text-emerald-400/95 underline decoration-emerald-500/25 underline-offset-2 hover:text-emerald-300"
                  : "mt-3 text-xs font-semibold text-emerald-500 hover:text-emerald-400"
                : "btn mt-2 text-xs"
            }
            onClick={() => setEditing(true)}
          >
            {v === "workspace" ? "Edit field" : "Edit"}
          </button>
        </div>
      );
    }
    return (
      <div className={shellEdit}>
        <div className={labelCls}>{props.label}</div>
        <input
          className={
            v === "workspace" && isSimpleHomeReview
              ? "mt-3 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2.5 text-[1.0625rem] text-slate-100"
              : "mt-2 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
          }
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          placeholder={props.placeholder || props.label}
          onBlur={() => {
            if (!isJurisdictionCard) return;
            void (async () => {
              const norm = normalizeJurisdictionDisplay(localValue);
              const prior = String(props.value ?? "").trim();
              if ((norm || "") === prior && localValue.trim() === prior) {
                setEditing(false);
                return;
              }
              if (norm !== localValue.trim()) setNormFlash(true);
              await saveField(props.field, norm || null);
              setEditing(false);
            })();
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={
              v === "workspace"
                ? "btn rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                : "btn text-xs"
            }
            disabled={savingField === props.field}
            onClick={async () => {
              let out: string | null = localValue.trim() || null;
              if (isJurisdictionCard && out) {
                const norm = normalizeJurisdictionDisplay(out);
                if (norm !== out) setNormFlash(true);
                out = norm || null;
              }
              await saveField(props.field, out);
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="btn text-xs"
            onClick={() => {
              setLocalValue(String(props.value ?? ""));
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  async function onExportDocx() {
    setError(null);
    if (
      isSimpleHomeReview &&
      isSimpleSendPaywallActive() &&
      !canAccessSimpleSendActions(agreementId)
    ) {
      logProductEvent("paywall_triggered", { surface: "export_docx", agreementId });
      onRequestSendUnlock?.();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/export-docx`, {
        method: "POST",
        headers: clawAgreementHeaders(),
      });
      if (!res.ok) throw new Error("export_failed");
      await loadDraft({ silent: true });
    } catch (e: any) {
      setError(e?.message || "Could not export.");
    }
  }

  async function saveParties(nextParties: Party[]) {
    await saveField("parties", nextParties);
  }

  async function copyMagicInviteEmail(row: { partyId: string; name: string; roleRaw: string }) {
    const id = String(agreementId || "").trim();
    if (!id || !draft) return;
    setError(null);
    const wf = normalizeWorkflowRole(row.roleRaw);
    if (wf === "owner") return;
    const invGate = access.check("recipient_invitation");
    if (!invGate.allowed) {
      setError(invGate.message || "Recipient invitation limit reached.");
      return;
    }
    const mintKey =
      (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env
        ?.VITE_RECIPIENT_LINK_MINT_KEY || "";
    const ownerParty = (draft.parties || []).find((p) => normalizeWorkflowRole(p.role) === "owner");
    const inviter = (ownerParty?.name || "").trim();
    const role =
      wf === "signer"
        ? ("signer" as const)
        : wf === "reviewer"
          ? ("reviewer" as const)
          : ("recipient" as const);
    const partyIdForMint =
      row.partyId && !row.partyId.startsWith("legacy_") ? row.partyId : undefined;
    const minted = await mintRecipientAccessToken(
      id,
      {
        mode: "review",
        role,
        recipient_party_id: partyIdForMint,
        inviter_display_name: inviter || undefined,
      },
      mintKey
    );
    if (!minted?.token) {
      setError(
        "We couldn't create the invitation link. Try again in a moment. If this keeps happening, contact support."
      );
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${agreementMagicLinkPath(id, minted.token)}`;
    const lines = [
      "Subject: You've been invited to review an agreement",
      "",
      `${row.name},`,
      "",
      "You've been invited to review an agreement.",
      "",
      `Open agreement: ${url}`,
      "",
      inviter ? `— ${inviter}` : "",
    ];
    await navigator.clipboard.writeText(lines.filter(Boolean).join("\n")).catch(() => {});
    access.recordUsage("recipient_invitations");
  }

  /**
   * Preview only: POST /revise with persist=false (server draft unchanged until commit-revision).
   */
  async function requestOwnerRevisePreview(
    instruction: string,
    source: PendingRevisionSource,
    versionMeta?: VersionMeta,
    negotiationMemory?: {
      posture: NegotiationPosture;
      riskAssessment: NegotiationRiskAssessment | null;
      priorSnapshot: AgreementSnapshot | null;
    },
    suggestionContext?: SuggestionContextMeta
  ): Promise<boolean> {
    const ins = instruction.trim();
    if (!ins || !draft) return false;
    const lockBundle = loadBundle(agreementId);
    if (lockBundle && isSigningLockActive(lockBundle)) {
      setError("This version is set for signature. Reopen review to make changes.");
      return false;
    }
    if (pendingRevision || previewInFlightRef.current) {
      setError("Discard the open comparison or apply it to the draft first.");
      return false;
    }
    const revGate = access.check("revision_preview");
    if (!revGate.allowed) {
      setError(revGate.message || "Revision preview limit reached.");
      return false;
    }
    previewInFlightRef.current = true;
    setSavingField("conversation");
    setError(null);
    setRevisionPreviewFlash(false);
    setAppliedRevisionBanner(null);
    setAppliedRevisionHeuristicBullets([]);
    setRevisionValidation(null);
    try {
      const baselineDraft = JSON.parse(JSON.stringify(draft)) as AgreementDraft;
      const baselineRenderedHtml = renderedHtml;
      if (typeof console !== "undefined" && console.info) {
        console.info("[review-revision-request-start]", {
          instructionLen: ins.length,
          revisionSource: source,
          hasAgreementId: Boolean(agreementId?.trim()),
          baselinePartiesWithEmailCount: agreementPartiesWithEmailCount(draft.parties),
        });
      }
      const res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/revise`, {
        method: "POST",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          instruction: ins,
          session_type: "owner",
          persist: false,
          ai_model_class: access.effectiveAiModelClass,
        }),
      });
      if (!res.ok) {
        const buf = await res.text();
        let msg = await errorMessageFromResponse(
          new Response(buf, { status: res.status }),
          "Couldn't preview that revision. Please try again.",
        );
        msg = mapDraftAssistBlockedMessage(msg);
        setError(msg);
        return false;
      }
      const payload = await res.json();
      const nextDraft = payload?.draft as AgreementDraft | null;
      const html = String(payload?.rendered_html || "");
      if (!nextDraft) throw new Error("We couldn't load the proposed revision. Please try again.");
      if (typeof console !== "undefined" && console.info) {
        console.info("[review-revision-success]", {
          instructionLen: ins.length,
          revisionSource: source,
          proposedPurposeLen: String(nextDraft.purpose ?? "").length,
          proposedPaymentTermsLen: String(nextDraft.payment_terms ?? "").length,
          proposedPartiesWithEmailCount: agreementPartiesWithEmailCount(nextDraft.parties),
          hasRenderedHtml: html.length > 0,
        });
      }
      const rvRaw = payload?.revision_validation as { ok?: unknown; issues?: unknown } | undefined;
      if (rvRaw && rvRaw.ok === false) {
        const issues = Array.isArray(rvRaw.issues)
          ? rvRaw.issues.filter((x): x is string => typeof x === "string")
          : [];
        if (typeof console !== "undefined" && console.info) {
          console.info("[review-revision-warning]", { issues, count: issues.length });
        }
        setRevisionValidation({ ok: false, issues });
      } else {
        setRevisionValidation(null);
      }
      setPendingRevision({
        instruction: ins,
        baselineDraft,
        baselineRenderedHtml,
        proposedDraft: nextDraft,
        proposedHtml: html,
        source,
        versionMeta,
        negotiationMemory,
        suggestionContext,
      });
      access.recordUsage("revision_previews");
      if (section === "simpleHomeReview") {
        setRevisionPreviewFlash(true);
      }
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't revise preview. Please try again.");
      return false;
    } finally {
      previewInFlightRef.current = false;
      setSavingField(null);
    }
  }

  /** Persist previewed draft and append workspace version (same metadata path as before). */
  async function commitPendingRevision(): Promise<boolean> {
    const p = pendingRevision;
    if (!p) return false;
    if (revisionCommitInFlightRef.current) return false;
    const lockBundle = loadBundle(agreementId);
    if (lockBundle && isSigningLockActive(lockBundle)) {
      setError("This version is set for signature. Reopen review to apply changes.");
      return false;
    }
    revisionCommitInFlightRef.current = true;
    setSavingField("conversation");
    setError(null);
    try {
      const d = p.proposedDraft;
      const res = await fetch(
        `${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/commit-revision`,
        {
          method: "POST",
          headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            instruction: p.instruction,
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
          }),
        }
      );
      if (!res.ok) {
        const buf = await res.text();
        const msg = await errorMessageFromResponse(
          new Response(buf, { status: res.status }),
          "Couldn't apply that revision to your draft. Please try again.",
        );
        throw new Error(msg);
      }
      const payload = await res.json();
      const nextDraft = normalizeAgreementDraftFromApi(payload?.draft ?? null, {
        fallbackAgreementId: agreementId,
      });
      const html = String(payload?.rendered_html || "");
      if (!nextDraft) throw new Error("We couldn't load the updated draft. Please try again.");
      const ins = p.instruction;
      const appliedCmp = compareAgreementSnapshots(
        draftToSnapshot(p.baselineDraft),
        draftToSnapshot(nextDraft)
      );
      if (typeof console !== "undefined" && console.info) {
        console.info("[review-revision-applied-to-send]", {
          instructionLen: ins.length,
          revisionSource: p.source,
          changedFieldCount: appliedCmp.changedFieldKeys.length,
          changedFieldKeys: appliedCmp.changedFieldKeys,
          baselinePartiesWithEmailCount: agreementPartiesWithEmailCount(p.baselineDraft.parties),
          nextPartiesWithEmailCount: agreementPartiesWithEmailCount(nextDraft.parties),
        });
      }
      const labels = appliedCmp.changedFieldKeys.map((k) => agreementFieldLabel(k));
      setAppliedRevisionBanner(
        labels.length > 0
          ? `Changes applied: ${labels.join(", ")}.`
          : "Revision applied to your draft."
      );
      setAppliedRevisionHeuristicBullets(heuristicRevisionSummaryBullets(ins));
      const rvCommit = payload?.revision_validation as { ok?: unknown; issues?: unknown } | undefined;
      if (rvCommit && rvCommit.ok === false) {
        const issues = Array.isArray(rvCommit.issues)
          ? rvCommit.issues.filter((x): x is string => typeof x === "string")
          : [];
        if (typeof console !== "undefined" && console.info) {
          console.info("[review-revision-warning]", { issues, count: issues.length });
        }
        setRevisionValidation({ ok: false, issues });
      } else {
        setRevisionValidation(null);
      }
      setDraft(nextDraft);
      setRenderedHtml(html);
      setEditInstruction("");
      setExternalAiPaste("");
      setPendingRevision(null);
      if (isWorkspace) {
        let meta = p.versionMeta ? { ...p.versionMeta } : undefined;
        if (p.negotiationMemory && meta && meta.source !== "external_ai_import") {
          const decision = decisionFromResponseType(meta.response_type);
          meta = {
            ...meta,
            negotiation_memory: buildNegotiationMemory({
              intent: ins,
              posture: p.negotiationMemory.posture,
              riskTier: p.negotiationMemory.riskAssessment?.tier,
              decision,
              priorSnapshot: p.negotiationMemory.priorSnapshot,
              nextSnapshot: draftToSnapshot(nextDraft),
            }),
          };
        }
        if (p.suggestionContext && meta) {
          meta = { ...meta, suggestion_context: p.suggestionContext };
        }
        const next = appendVersion({
          agreementId,
          draft: nextDraft,
          renderedHtml: html,
          instruction: ins,
          createdBy: "owner",
          label: "You",
          meta,
        });
        setVersionBundle(next);
        setPreviewVersionId(null);
      }
      if (p.source === "negotiation_response") {
        setNegotiationCommitSeq((s) => s + 1);
      }
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not apply revision.");
      return false;
    } finally {
      revisionCommitInFlightRef.current = false;
      setSavingField(null);
    }
  }

  function discardPendingRevision() {
    setPendingRevision(null);
    setRevisionPreviewFlash(false);
    setRevisionValidation(null);
  }

  async function reviseAgreement() {
    const ins = editInstruction.trim();
    const hb = versionBundle ?? loadBundle(agreementId);
    if (hb && isSigningLockActive(hb)) {
      setError("This version is set for signature. Reopen review to make changes.");
      return;
    }
    const last = hb && hb.versions.length > 0 ? hb.versions[hb.versions.length - 1] : null;
    const attachMemory = Boolean(isWorkspace && last?.created_by === "recipient");
    const mem = attachMemory
      ? {
          posture: negotiationPanelCtxRef.current.posture,
          riskAssessment: negotiationPanelCtxRef.current.riskAssessment,
          priorSnapshot: last?.snapshot ?? null,
        }
      : undefined;
    await requestOwnerRevisePreview(
      ins,
      "owner_manual",
      {
        source: "owner_edit",
        action_badge: "Owner edit",
      },
      mem,
      undefined
    );
  }

  const outerClass =
    embeddedInCard || section === "simpleHomeReview"
      ? `vs01-agreement-review-inner ${isWorkspace ? "space-y-6" : "space-y-4"}`
      : "space-y-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4";

  const loadingWrap = embeddedInCard ? "vs01-agreement-review-inner p-4 text-sm text-slate-300" : outerClass;
  const backBtnClass = embeddedInCard
    ? "vs01-btn vs01-btn--secondary mt-5"
    : "btn mt-5 border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700";

  useEffect(() => {
    if (!(isWorkspace && isSimpleHomeReview && simpleFlowPhase === "send") || !draft?.parties?.length) return;
    const err = validateRecipientContactForFlexibleSend(draft.parties, {
      reviewLinkEmailOnly: (streamlinedPremiumIntentForCopy ?? simpleFlowPremiumHandoffIntent) === "review",
    });
    if (Object.keys(err).length > 0) setSimpleSendRecipientEditorOpen(true);
  }, [
    isWorkspace,
    isSimpleHomeReview,
    simpleFlowPhase,
    draft?.parties,
    streamlinedPremiumIntentForCopy,
    simpleFlowPremiumHandoffIntent,
  ]);

  if (!agreementId?.trim()) {
    if (import.meta.env.DEV) {
      console.warn("[AgreementReview] render blocked: invalid agreement_id");
    }
    return (
      <section className={`${loadingWrap} flex min-h-[12rem] flex-col items-center justify-center text-center`}>
        <p className="text-sm text-slate-300">No agreement is selected.</p>
        {onBackToNew ? (
          <button type="button" className={backBtnClass} onClick={onBackToNew}>
            Back to edit draft
          </button>
        ) : null}
      </section>
    );
  }

  if (loading && !draft) {
    return (
      <section className={`${loadingWrap} min-h-[16rem] space-y-4 px-2 py-8`} aria-busy="true">
        <div className="mx-auto max-w-md space-y-3 text-center">
          <p className="text-sm font-medium text-slate-200">Preparing your agreement…</p>
          <p className="text-xs leading-relaxed text-slate-500">Loading your draft and preview.</p>
        </div>
        <div className="mx-auto max-w-lg space-y-3" aria-hidden>
          <div className="h-4 animate-pulse rounded-md bg-slate-800/80" />
          <div className="h-4 w-[83%] max-w-xl animate-pulse rounded-md bg-slate-800/70" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-800/60" />
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-slate-800/70" />
        </div>
      </section>
    );
  }

  if (!draft) {
    return (
      <section
        className={`${loadingWrap} flex min-h-[14rem] flex-col items-center justify-center gap-4 px-4 text-center`}
      >
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium text-slate-100">We couldn&apos;t load your draft.</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Check your connection and try again, or go back to edit your description.
          </p>
          {error ? <p className="pt-2 text-[11px] text-rose-300/95">{error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary"
            onClick={() => void loadDraft()}
          >
            Retry
          </button>
          {onBackToNew ? (
            <button type="button" className="vs01-btn vs01-btn--secondary" onClick={onBackToNew}>
              Back to edit draft
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const showPendingSignatureDashboard = Boolean(
    isWorkspace && section === "finalize" && signingLocked && !finalizeReadOnly
  );
  const showCompletedAgreementDashboard = Boolean(
    isWorkspace && section === "finalize" && workspaceEntryMode === "read_only_completed"
  );
  const headVer = headVersionTail;
  const showNegotiationAssistant = Boolean(
    showWorkspaceRichHistory &&
      vb &&
      !signingLocked &&
      !collaborationReadOnly &&
      viewingHead &&
      headVer &&
      headVer.created_by === "recipient"
  );
  const priorVer =
    showNegotiationAssistant && vb && vb.versions.length >= 2
      ? vb.versions[vb.versions.length - 2]
      : null;
  const revisionPreviewBlocked = Boolean(pendingRevision || openRecipientProposal);

  const pendingBanner =
    showWorkspaceRichHistory && vb?.pendingRecipientNotice ? (
      <div
        className="rounded-lg border border-amber-600/35 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
        role="status"
      >
        <strong className="font-semibold">Updated since your last review</strong>{" "}
        <span className="text-amber-100/90">
          The master agreement changed (often from recipient activity or another session). Check the latest row in
          version history, then dismiss when you are caught up.
        </span>
        <button
          type="button"
          className="btn ml-3 text-xs font-medium text-amber-200 underline"
          onClick={() => {
            clearPendingRecipientNotice(agreementId);
            setVersionBundle(loadBundle(agreementId));
          }}
        >
          Dismiss
        </button>
      </div>
    ) : null;

  const versionTimeline =
    showWorkspaceRichHistory && vb && vb.versions.length > 0 ? (
      <div className="rounded-lg border border-slate-800/90 bg-slate-900/45 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Version history</div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          Each row is a saved version — who changed it, what happened, and when. Open a row to preview that revision.
        </p>
        <ol className="mt-3 list-none space-y-2 p-0">
          {vb.versions.map((v, idx) => {
            const active = v.id === selectedVid;
            const who = v.label || (v.created_by === "owner" ? "You" : "Recipient");
            const badge = versionActionBadge(v);
            const mem = v.meta?.negotiation_memory;
            const postureBit = v.meta?.negotiation_posture
              ? ` · ${postureLabelForHistory(v.meta.negotiation_posture)}`
              : "";
            const riskBit = v.meta?.risk_tier ? ` · ${riskLabelForHistory(v.meta.risk_tier)}` : "";
            const showLegacyExtras = !mem && (v.meta?.negotiation_posture || v.meta?.risk_tier);
            const summary = safeVersionInstructionSummary(v.instruction);
            const trendSuffix = negotiationPatternStats
              ? negotiationRowTrendSuffix(v, negotiationPatternStats)
              : "";
            const posturePill = mem
              ? postureLabelForHistory(mem.posture)
              : "";
            const riskPill = mem?.risk_level ? memoryRiskLabel(mem.risk_level) : "";
            const dec = mem?.decision;
            const decPill =
              dec === "accepted"
                ? "✔ Accepted"
                : dec === "rejected"
                  ? "Declined"
                  : dec === "modified"
                    ? "✏ Modified"
                    : "";
            const expandWhy = Boolean(mem?.summary);
            return (
              <li
                key={v.id}
                className={`rounded-md border text-xs transition-colors ${
                  active
                    ? "border-emerald-600/50 bg-emerald-950/25 text-slate-100"
                    : "border-slate-700 bg-slate-950/30 text-slate-300"
                }`}
              >
                <div className="flex items-stretch gap-0">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-slate-900/25"
                    onClick={() => setPreviewVersionId(v.id === vb.currentVersionId ? null : v.id)}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                      <span className="font-semibold text-slate-200">
                        {formatRevisionIdentityLabel(idx, v.id, vb.signingLock ?? null)}
                      </span>
                      <span className="text-slate-500">· {who}</span>
                      <span className="text-[10px] font-medium text-slate-500">
                        · {badge}
                        {showLegacyExtras ? `${postureBit}${riskBit}` : ""}
                      </span>
                    </div>
                    {posturePill || riskPill || decPill ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {posturePill ? (
                          <span className="rounded border border-slate-700/80 bg-slate-900/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                            {posturePill}
                          </span>
                        ) : null}
                        {riskPill ? (
                          <span className="rounded border border-slate-700/80 bg-slate-900/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                            {riskPill}
                          </span>
                        ) : null}
                        {decPill ? (
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                              dec === "accepted"
                                ? "border-emerald-800/50 text-emerald-200/90"
                                : dec === "rejected"
                                  ? "border-rose-800/45 text-rose-200/90"
                                  : "border-sky-800/40 text-sky-200/90"
                            }`}
                          >
                            {decPill}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {summary}
                      {trendSuffix ? (
                        <span className="text-slate-500">{trendSuffix}</span>
                      ) : null}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </button>
                  {expandWhy ? (
                    <button
                      type="button"
                      className="shrink-0 border-l border-slate-800/80 px-2 text-[11px] text-slate-500 hover:bg-slate-900/40 hover:text-slate-300"
                      aria-expanded={memoryDetailOpenId === v.id}
                      title="Why this change?"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMemoryDetailOpenId((cur) => (cur === v.id ? null : v.id));
                      }}
                    >
                      {memoryDetailOpenId === v.id ? "▴" : "▾"}
                    </button>
                  ) : null}
                </div>
                {memoryDetailOpenId === v.id && mem?.summary ? (
                  <div className="border-t border-slate-800/80 px-3 py-2 text-[11px]">
                    <div className="font-medium text-slate-500">Why this change?</div>
                    <p className="mt-1 leading-snug text-slate-300">{mem.summary}</p>
                    {Array.isArray(mem.changed_fields) && mem.changed_fields.length ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Sections:{" "}
                        {mem.changed_fields.map((f) => agreementFieldLabel(String(f))).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800/60 px-3 py-2 text-[10px]">
                  <a
                    href={verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400/90 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View public verify page
                  </a>
                  <button
                    type="button"
                    className="text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void (async () => {
                        const text = buildVersionShareText({
                          agreementId,
                          versionOrdinal: idx + 1,
                          instruction: v.instruction,
                          createdAt: v.created_at,
                        });
                        try {
                          await navigator.clipboard.writeText(text);
                          setShareFlash("Version summary copied");
                          window.setTimeout(() => setShareFlash(null), 2000);
                        } catch {
                          setError("Could not copy.");
                        }
                      })();
                    }}
                  >
                    Share this version
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    ) : null;

  const lastChangeCallout =
    isWorkspace && selectedVer && selectedVer.instruction ? (
      <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 px-4 py-3 text-xs text-slate-300">
        <span className="font-semibold text-slate-400">Last change: </span>
        <q className="text-slate-200">{selectedVer.instruction}</q>
      </div>
    ) : null;

  async function reviewExternalAiPaste() {
    const paste = externalAiPaste.trim();
    if (!paste || !isWorkspace || !viewingHead) return;
    const scope: "clause" | "instruction" = topFrictionClauseId ? "clause" : "instruction";
    const instruction =
      "Apply the following review notes and suggested edits (pasted; not generated by LawDog in this step). " +
      "Integrate them into the agreement fields where it fits the draft structure:\n\n" +
      paste;
    await requestOwnerRevisePreview(
      instruction,
      "external_ai_import",
      {
        source: "external_ai_import",
        action_badge: "Pasted import",
        negotiation_summary: "applied text pasted from external review",
        external_assist: {
          source: "user_pasted_external_ai",
          applied: true,
          imported_at: new Date().toISOString(),
          scope,
        },
        import_scope: scope,
      },
      undefined,
      undefined
    );
  }

  const redlineCharCount =
    redlinePreview?.segments.reduce((n, s) => n + s.text.length, 0) ?? 0;
  const redlineLarge =
    Boolean(redlinePreview) &&
    (redlinePreview!.segments.length > 120 || redlineCharCount > 24_000);

  const compareChangesPanel =
    pendingRevision && revisionCompare && redlinePreview ? (
      <div className="rounded-lg border border-sky-900/35 bg-slate-900/50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            {MATERIAL_CHANGE_SUMMARY_LABEL}
          </div>
          <span className="rounded-md border border-slate-600/80 bg-slate-950/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            Source: {pendingRevisionSourceBadge(pendingRevision.source)}
          </span>
        </div>
        <p className="mt-1 text-[10px] font-medium text-slate-200/95">
            {signingLocked
            ? "Final: Final version ready for signature"
            : "Editable: Draft in progress — you can still make edits"}
        </p>
        <p className="mt-1 text-[10px] font-medium text-amber-100/90">
          Previewing suggested edits — nothing is saved to your draft yet.
        </p>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          The draft saved in LawDog is unchanged while you preview. Nothing changes in your record until you accept. Compare
          current vs. proposed, then apply or dismiss — this never overwrites your draft silently.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-slate-700/90 bg-slate-950/40 p-0.5">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
              compareViewMode === "structured"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => setCompareViewMode("structured")}
          >
            Compare drafts
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
              compareViewMode === "redline"
                ? "bg-slate-800 text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => setCompareViewMode("redline")}
          >
            View changes
          </button>
        </div>

        {compareViewMode === "structured" ? (
          <>
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Changed sections
              </div>
              {revisionCompare.hasChanges ? (
                <ul className="mt-1.5 mb-0 list-disc space-y-0.5 pl-4 text-[11px] text-slate-200">
                  {revisionCompare.changedFieldKeys.map((key) => (
                    <li key={key}>{agreementFieldLabel(key)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-[11px] text-amber-200/90">
                  No section-by-section changes detected in the form fields.
                </p>
              )}
            </div>
            {revisionCompare.changedFields.filter((r) => r.changed).length > 0 ? (
              <div className="mt-3 space-y-2">
                {revisionCompare.changedFields
                  .filter((r) => r.changed)
                  .map((row) => (
                    <div
                      key={row.field}
                      className="rounded-md border border-amber-800/35 bg-amber-950/15 px-3 py-2 text-[11px] leading-snug text-slate-200"
                    >
                      <div className="font-semibold text-amber-100/95">{agreementFieldLabel(row.field)}</div>
                      <div className="mt-1 text-slate-400">
                        <span className="text-slate-500">Before: </span>
                        {row.before?.trim() ? row.before : "—"}
                      </div>
                      <div className="mt-0.5 text-slate-200">
                        <span className="text-slate-500">After: </span>
                        {row.after?.trim() ? row.after : "—"}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-800/90 bg-white p-4 text-slate-900">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Current draft</div>
                <div
                  className="prose prose-sm mt-2 max-h-[min(48vh,26rem)] max-w-none overflow-y-auto overscroll-y-contain touch-pan-y text-slate-900"
                  dangerouslySetInnerHTML={{
                    __html: pendingRevBaselineDisplay || "<p>No preview.</p>",
                  }}
                />
              </div>
              <div className="rounded-md border border-emerald-900/30 bg-white p-4 text-slate-900">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Proposed changes</div>
                <div
                  className="prose prose-sm mt-2 max-h-[min(48vh,26rem)] max-w-none overflow-y-auto overscroll-y-contain touch-pan-y text-slate-900"
                  dangerouslySetInnerHTML={{
                    __html: pendingRevProposedDisplay || "<p>No preview.</p>",
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            {redlineLarge ? (
              <p className="mb-2 text-[10px] leading-snug text-slate-500">
                Large change — side-by-side drafts may be easier to scan.
              </p>
            ) : null}
            <div className="max-h-[28rem] overflow-y-auto overscroll-y-contain touch-pan-y rounded-md border border-slate-700/80 bg-white p-4 text-[0.8125rem] leading-relaxed text-slate-900">
              {redlinePreview.segments.map((seg, idx) => {
                if (seg.type === "same") {
                  return <span key={`rl_${idx}`}>{seg.text}</span>;
                }
                if (seg.type === "insert") {
                  return (
                    <span
                      key={`rl_${idx}`}
                      className="bg-emerald-100/95 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2"
                    >
                      {seg.text}
                    </span>
                  );
                }
                return (
                  <span
                    key={`rl_${idx}`}
                    className="bg-rose-100/90 text-rose-950 line-through decoration-rose-700/40 decoration-1"
                  >
                    {seg.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
            disabled={savingField === "conversation" || !revisionCompare.hasChanges}
            title={!revisionCompare.hasChanges ? "No section-by-section field changes to apply." : undefined}
            onClick={() => void commitPendingRevision()}
          >
            {savingField === "conversation" ? "Applying…" : "Apply changes"}
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
            disabled={savingField === "conversation"}
            onClick={() => discardPendingRevision()}
          >
            Discard preview
          </button>
        </div>
      </div>
    ) : null;

  /**
   * Owner-facing: incoming `recipient_proposal_pending` — suggested edits, compare, accept / revise / reject.
   * Master draft is unchanged until the owner accepts; audit records proposal events.
   */
  const recipientProposalPanel =
    showWorkspaceRichHistory &&
    openRecipientProposal &&
    recipientProposalNormalized &&
    rpRevisionCompare &&
    !signingLocked &&
    !collaborationReadOnly ? (
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
              {OWNER_REVIEW_BEFORE_SIGNING}
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-amber-50">
              {OWNER_SUGGESTED_CHANGES_RECEIVED_TITLE}
            </h2>
            <p className="mt-1 text-sm leading-snug text-amber-100/90">{OWNER_SUGGESTED_CHANGES_REVIEW_SUBTEXT}</p>
            <p className="mt-2 text-xs leading-snug text-amber-200/90">{OWNER_SUGGESTED_CHANGES_NOT_SIGNED_LINE}</p>
            {openRecipientProposal.proposer_display_name || openRecipientProposal.proposer_id ? (
              <p className="mt-2 text-[11px] font-medium text-amber-50/95">
                Proposed by{" "}
                {openRecipientProposal.proposer_display_name?.trim() ||
                  openRecipientProposal.proposer_id ||
                  "Participant"}
              </p>
            ) : null}
            {openRecipientProposals.length > 1 ? (
              <div className="mt-3">
                <label className="text-[10px] text-slate-400" htmlFor="owner-suggested-changes-select">
                  {OWNER_MULTIPLE_SUGGESTIONS_LABEL}
                </label>
                <select
                  id="owner-suggested-changes-select"
                  className="mt-0.5 block w-full max-w-md rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
                  value={recipientProposalFocusId || openRecipientProposal.proposal_id}
                  onChange={(e) => setRecipientProposalFocusId(e.target.value || null)}
                >
                  {openRecipientProposals.map((p) => (
                    <option key={p.proposal_id} value={p.proposal_id}>
                      {(p.proposer_display_name || p.proposer_id || "Participant").slice(0, 48)} ·{" "}
                      {p.submitted_at
                        ? new Date(String(p.submitted_at)).toLocaleString()
                        : p.proposal_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-950/70"
              onClick={() => {
                recipientProposalDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                window.requestAnimationFrame(() => {
                  recipientProposalDetailRef.current?.focus({ preventScroll: true });
                });
              }}
            >
              {OWNER_CTA_REVIEW_SUGGESTED_CHANGES}
            </button>
            <button
              type="button"
              className="btn rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
              disabled={recipientProposalBusy !== null}
              onClick={() => void applyOpenRecipientProposal()}
            >
              {recipientProposalBusy === "apply" ? "Applying…" : OWNER_CTA_ACCEPT_AND_CONTINUE}
            </button>
            <button
              type="button"
              className="btn rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-900/60 disabled:opacity-45"
              disabled={recipientProposalBusy !== null}
              onClick={() => {
                setOwnerMakeMoreChangesHint(true);
                window.requestAnimationFrame(() => {
                  document.getElementById("owner-revise-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  document.getElementById("agreement-review-revision-instruction")?.focus();
                });
              }}
            >
              {OWNER_CTA_MAKE_MORE_CHANGES}
            </button>
            <button
              type="button"
              className="btn rounded-lg border border-rose-900/50 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950/40 disabled:opacity-45"
              disabled={recipientProposalBusy !== null}
              onClick={() => void rejectOpenRecipientProposal()}
            >
              {recipientProposalBusy === "reject" ? "Rejecting…" : OWNER_CTA_REJECT_SUGGESTIONS}
            </button>
          </div>
        </div>

        <div
          id="owner-suggested-changes-detail"
          ref={recipientProposalDetailRef}
          tabIndex={-1}
          className="mt-5 rounded-md border border-amber-800/30 bg-slate-950/25 p-3 outline-none ring-amber-700/30 focus-visible:ring-2"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{MATERIAL_CHANGE_SUMMARY_LABEL}</div>
          <p className="mt-1 text-[11px] text-slate-300">
            Your current draft is unchanged until you accept. Side by side: original (left) and their suggested version
            (right).
          </p>
          {openRecipientProposal.instruction ? (
            <p className="mt-2 text-[11px] text-slate-200">
              <span className="font-semibold text-slate-400">Requested changes: </span>
              {openRecipientProposal.instruction.length > 400
                ? `${openRecipientProposal.instruction.slice(0, 397)}…`
                : openRecipientProposal.instruction}
            </p>
          ) : null}

          <div className="mt-3 inline-flex rounded-lg border border-slate-700/90 bg-slate-950/40 p-0.5">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                rpCompareMode === "structured"
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setRpCompareMode("structured")}
            >
              Compare drafts
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
                rpCompareMode === "redline"
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              } ${!rpRedlineHasDiff ? "cursor-not-allowed opacity-45" : ""}`}
              disabled={!rpRedlineHasDiff}
              onClick={() => {
                if (rpRedlineHasDiff) setRpCompareMode("redline");
              }}
            >
              View changes
            </button>
          </div>

          {rpCompareMode === "structured" ? (
            <>
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Changed sections</div>
                {rpRevisionCompare.hasChanges ? (
                  <ul className="mt-1.5 mb-0 list-disc space-y-0.5 pl-4 text-[11px] text-slate-200">
                    {rpRevisionCompare.changedFieldKeys.map((key) => (
                      <li key={key}>{agreementFieldLabel(key)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[11px] text-amber-200/90">
                    No section-by-section changes detected in the form fields.
                  </p>
                )}
              </div>
              {rpRevisionCompare.changedFields.filter((r) => r.changed).length > 0 ? (
                <div className="mt-3 space-y-2">
                  {rpRevisionCompare.changedFields
                    .filter((r) => r.changed)
                    .map((row) => (
                      <div
                        key={row.field}
                        className="rounded-md border border-amber-800/35 bg-amber-950/15 px-3 py-2 text-[11px] leading-snug text-slate-200"
                      >
                        <div className="font-semibold text-amber-100/95">{agreementFieldLabel(row.field)}</div>
                        <div className="mt-1 text-slate-400">
                          <span className="text-slate-500">Before: </span>
                          {row.before?.trim() ? row.before : "—"}
                        </div>
                        <div className="mt-0.5 text-slate-200">
                          <span className="text-slate-500">After: </span>
                          {row.after?.trim() ? row.after : "—"}
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-800/90 bg-white p-4 text-slate-900">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Current draft</div>
                  <div
                    className="prose prose-sm mt-2 max-h-[min(48vh,26rem)] max-w-none overflow-y-auto overscroll-y-contain touch-pan-y text-slate-900"
                    dangerouslySetInnerHTML={{
                      __html: renderedHtmlDisplay || "<p>No preview.</p>",
                    }}
                  />
                </div>
                <div className="rounded-md border border-emerald-900/30 bg-white p-4 text-slate-900">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Their suggested edits
                  </div>
                  <div
                    className="prose prose-sm mt-2 max-h-[min(48vh,26rem)] max-w-none overflow-y-auto overscroll-y-contain touch-pan-y text-slate-900"
                    dangerouslySetInnerHTML={{
                      __html: recipientProposalHtmlDisplay || "<p>No preview.</p>",
                    }}
                  />
                </div>
              </div>
            </>
          ) : rpRedlinePreview ? (
            <div className="mt-4">
              {rpRedlineLarge ? (
                <p className="mb-2 text-[10px] leading-snug text-slate-500">
                  Large change — comparing versions side by side may be easier.
                </p>
              ) : null}
              {rpRedlineHasDiff ? (
                <div className="max-h-[28rem] overflow-y-auto overscroll-y-contain touch-pan-y rounded-md border border-slate-700/80 bg-white p-4 text-[0.8125rem] leading-relaxed text-slate-900">
                  {rpRedlinePreview.segments.map((seg, idx) => {
                    if (seg.type === "same") {
                      return <span key={`rprl_${idx}`}>{seg.text}</span>;
                    }
                    if (seg.type === "insert") {
                      return (
                        <span
                          key={`rprl_${idx}`}
                          className="bg-emerald-100/95 text-emerald-950 underline decoration-emerald-700/35 decoration-1 underline-offset-2"
                        >
                          {seg.text}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`rprl_${idx}`}
                        className="bg-rose-100/90 text-rose-950 line-through decoration-rose-700/40 decoration-1"
                      >
                        {seg.text}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-amber-200/90">
                  No inline text highlights for this suggestion — use Compare drafts to review the full documents.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[11px] text-amber-200/90">Preview unavailable for this suggestion.</p>
          )}
        </div>
      </div>
    ) : null;

  const workWithAnotherAiSection =
    isWorkspace && viewingHead ? (
      <div className="rounded-lg border border-dashed border-slate-600/70 bg-slate-950/35 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {PORTABLE_REVIEW_HEADER}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          {AI_ASSISTIVE_SHORT} {OWNER_PORTABLE_REVIEW_SUB} Use{" "}
          <span className="text-slate-400">Assisted → Preview changes</span> or{" "}
          <span className="text-slate-400">Direct compare</span> below. LawDog-native suggestions stay above.
        </p>
        <p className="mt-1.5 text-[9px] leading-snug text-slate-600">{PORTABLE_REVIEW_OCR_FOOTNOTE}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`btn rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
              portableTextMode === "assisted"
                ? "border-slate-500 bg-slate-800 text-slate-100"
                : "border border-transparent text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setPortableTextMode("assisted")}
          >
            Assisted preview
          </button>
          <button
            type="button"
            className={`btn rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
              portableTextMode === "direct"
                ? "border-slate-500 bg-slate-800 text-slate-100"
                : "border border-transparent text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setPortableTextMode("direct")}
          >
            Direct compare
          </button>
        </div>
        {portableTextMode === "direct" ? (
          <div className="mt-4">
            <DirectComparePanel defaultBefore={plainForDirectCompare} />
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn rounded-md border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-slate-800"
                onClick={() => void copyFullDraftPlain()}
              >
                Copy full draft
              </button>
              {copyDraftFlash ? <span className="text-[10px] text-emerald-400">Draft copied</span> : null}
              <button
                type="button"
                className="btn rounded-md border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-slate-800 disabled:opacity-40"
                disabled={!topFrictionClauseId}
                onClick={() => void copyClausePlain()}
              >
                Copy clause (tracked)
              </button>
              <button
                type="button"
                className="btn rounded-md border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-100 hover:bg-slate-800"
                onClick={() => void copyKeyTermsPlain()}
              >
                Copy key terms
              </button>
              {copyClauseFlash ? <span className="text-[10px] text-emerald-400">Copied</span> : null}
            </div>
            {!topFrictionClauseId ? (
              <p className="mt-1 text-[10px] text-slate-600">
                Clause-level copy follows where you are in the document; key terms for purpose and payment are always
                available.
              </p>
            ) : null}
            <label className="mt-3 block text-[10px] font-medium text-slate-500" htmlFor="external-ai-paste-ar">
              {PORTABLE_REVIEW_PASTE_LABEL}
            </label>
            <textarea
              id="external-ai-paste-ar"
              className="mt-1 w-full min-h-[4.25rem] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
              placeholder={PORTABLE_REVIEW_PASTE_PLACEHOLDER}
              value={externalAiPaste}
              disabled={savingField === "conversation" || revisionPreviewBlocked}
              onChange={(e) => setExternalAiPaste(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn rounded-lg bg-emerald-700/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                disabled={
                  savingField === "conversation" || !externalAiPaste.trim() || revisionPreviewBlocked
                }
                onClick={() => void reviewExternalAiPaste()}
              >
                Preview changes
              </button>
            </div>
          </>
        )}
      </div>
    ) : null;

  const headerBlock = isWorkspace ? (
    <div className="border-b border-slate-800/80 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProofBadge state={proofBadgeState} />
          <span className="inline-flex rounded-full border border-slate-600 bg-slate-900/50 px-2.5 py-1 text-[11px] font-medium text-slate-200">
            {workspaceStatusPillText}
          </span>
          <span className="text-xs text-slate-500">Updated {new Date(draft.updated_at).toLocaleString()}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="group relative">
            <summary className="vs01-btn vs01-btn--secondary vs01-btn--compact cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
              Share
            </summary>
            <div className="absolute right-0 z-30 mt-1 min-w-[13.5rem] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-slate-800/90"
                onClick={() => void copyPublicVerifyLinkOnly()}
              >
                Copy public verify link
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-slate-800/90"
                onClick={() => void copySocialSummaryFn()}
              >
                Copy summary (email / social)
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[11px] text-slate-400 hover:bg-slate-800/90"
                onClick={() => stubAgreementPdf()}
              >
                Download PDF (soon)
              </button>
            </div>
          </details>
          {onBackToNew && !postVs01SignatureFirstLanding ? (
            <button type="button" className="btn text-xs font-medium text-slate-200" onClick={onBackToNew}>
              Reset draft
            </button>
          ) : null}
        </div>
      </div>
      {shareFlash ? <p className="mt-2 text-[10px] text-emerald-400/95">{shareFlash}</p> : null}
      {postVs01SignatureFirstLanding ? (
        <details className="mt-2 rounded-md border border-slate-800/60 bg-slate-950/30 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] font-medium text-slate-500">
            Workspace and version history (optional)
          </summary>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Owners merge revisions into the draft; recipients review or propose changes; signatures happen after the
            agreement is stable and locked.
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Changes are versioned and auditable in LawDog.</p>
        </details>
      ) : (
        <>
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Owners merge revisions into the draft; recipients review or propose changes; signatures happen after the
            agreement is stable and locked.
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">Changes are versioned and auditable in LawDog.</p>
        </>
      )}
      <p className="mt-2 text-[10px] text-slate-600">
        Agreement ID (for support):{" "}
        <span className="font-mono text-slate-500">{draft.id}</span>
      </p>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-xs text-slate-500">Agreement ID: {draft.id}</div>
        <div className="mt-1 inline-flex rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
          {workspaceStatusPillLabel(status)}
        </div>
      </div>
      <div className="flex gap-2">
        {onBackToNew && (
          <button type="button" className="btn text-xs" onClick={onBackToNew}>
            New Intake
          </button>
        )}
        {onGoLegacy && (
          <button type="button" className="btn text-xs" onClick={onGoLegacy}>
            Open Legacy Builder
          </button>
        )}
      </div>
    </div>
  );

  const coreMetaGrid = (
    <div className={`grid md:grid-cols-3 ${isSimpleHomeReview ? "gap-5" : "gap-3"}`}>
      <EditableField label="Title" field="title" value={draft.title} variant={fv} />
      <EditableField
        label={isWorkspace ? "Governing law" : "Jurisdiction"}
        field="jurisdiction"
        value={draft.jurisdiction}
        variant={fv}
      />
      <EditableField
        label={isWorkspace ? "Effective date" : "Effective Date"}
        field="effective_date"
        value={draft.effective_date || "TBD"}
        placeholder="YYYY-MM-DD"
        variant={fv}
      />
    </div>
  );

  const extendedDetailsGrid = (
    <div className={`grid md:grid-cols-2 ${isSimpleHomeReview ? "gap-5" : "gap-3"}`}>
      <EditableField label="Purpose" field="purpose" value={draft.purpose} variant={fv} />
      <EditableField
        label="Payment terms"
        field="payment_terms"
        value={
          isSimpleHomeReview
            ? premiumLawdogSimpleHome
              ? draft.payment_terms
              : normalizeStarterPaymentTermsForDisplay(draft.payment_terms)
            : draft.payment_terms
        }
        variant={fv}
      />
      <EditableField label="Duration" field="duration" value={draft.duration} variant={fv} />
    </div>
  );

  const partiesSection = (
    <div
      className={
        isWorkspace
          ? isSimpleHomeReview
            ? "rounded-xl border border-slate-800/70 bg-slate-950/[0.35] p-5"
            : "rounded-lg border border-slate-800 bg-slate-900/35 p-4"
          : "rounded border border-slate-800 bg-slate-900/40 p-3"
      }
    >
      <div
        className={
          isWorkspace && isSimpleHomeReview
            ? "mb-4 text-sm font-semibold tracking-tight text-slate-100"
            : "mb-3 text-sm font-semibold text-slate-200"
        }
      >
        {isWorkspace ? "Who’s in this agreement?" : "Parties"}
      </div>
      <div className={isWorkspace ? (isSimpleHomeReview ? "space-y-0" : "space-y-3") : "space-y-2"}>
        {(draft.parties || []).map((party, idx) => (
          <div
            key={`party_row_${idx}`}
            className={
              isWorkspace && isSimpleHomeReview
                ? "border-b border-slate-800/50 py-5 first:pt-0 last:border-b-0 last:pb-0"
                : undefined
            }
          >
            <PartyRow
              index={idx}
              party={party}
              disabled={savingField === "parties"}
              workspace={isWorkspace}
              emphasizeHierarchy={Boolean(isSimpleHomeReview && isWorkspace)}
              inlineAutosave={Boolean(isSimpleHomeReview && isWorkspace)}
              onSave={(nextParty) => {
                const nextParties = [...(draft.parties || [])];
                nextParties[idx] = nextParty;
                void saveParties(nextParties);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className={
            isWorkspace
              ? isSimpleHomeReview
                ? "btn mt-1 w-full rounded-lg border border-dashed border-slate-600/90 bg-slate-950/20 py-3 text-sm font-medium text-slate-300 hover:border-emerald-500/45 hover:bg-slate-900/50"
                : "btn mt-1 w-full rounded-lg border border-dashed border-slate-600 bg-transparent py-2.5 text-sm font-medium text-slate-200 hover:border-emerald-500/40 hover:bg-slate-900/40 sm:w-auto sm:px-4"
              : "btn text-xs"
          }
          disabled={savingField === "parties"}
          onClick={() => {
            const nextParties = [...(draft.parties || []), { name: "", role: "party" }];
            void saveParties(nextParties);
          }}
        >
          {isWorkspace ? "+ Add another person" : "Add party"}
        </button>
      </div>
    </div>
  );

  const revisionPlanGate = access.check("revision_preview");
  const revisionPlanAllowed = revisionPlanGate.allowed || simpleHomeProEntitlementBypass;

  const revisionInstructionPlaceholder =
    "Example: remove equity, keep consulting only, and set payment to $5,000/month after launch";

  const reviseBlock = isWorkspace ? (
    <div id="owner-revise-workspace" className="rounded-lg border border-slate-800/90 bg-slate-900/40 p-4">
      {ownerMakeMoreChangesHint ? (
        <p className="mb-3 rounded-md border border-sky-800/40 bg-sky-950/30 px-3 py-2 text-sm leading-snug text-sky-100">
          {OWNER_MAKE_MORE_CHANGES_LINE}
        </p>
      ) : null}
      {!isSimpleHomeReview ? (
        <div className="mb-3 text-sm font-semibold tracking-tight text-slate-100">Type or speak a change</div>
      ) : null}
      {appliedRevisionBanner ? (
        <p className="mb-3 text-xs font-medium text-emerald-400/95" role="status">
          {appliedRevisionBanner}
        </p>
      ) : null}
      {appliedRevisionHeuristicBullets.length > 0 ? (
        <div className="mb-3 text-xs text-slate-300" role="status">
          <div className="font-semibold text-slate-200">Changes applied</div>
          <ul className="mt-1 list-disc pl-5">
            {appliedRevisionHeuristicBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {revisionValidation && revisionValidation.ok === false ? (
        <div className="mb-3 text-xs text-amber-300/95" role="alert">
          <p className="font-medium">
            Some requested changes may not have been fully applied. Please review before sending.
          </p>
          {revisionValidation.issues.length > 0 ? (
            <ul className="mt-1.5 list-disc pl-5 text-amber-200/90">
              {humanizeRevisionValidationIssues(revisionValidation.issues).map((label, idx) => (
                <li key={revisionValidation.issues[idx] ?? idx}>{label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {workspaceDraftStatusLine ? (
        <p className="mb-3 text-[10px] font-medium leading-snug text-slate-400">{workspaceDraftStatusLine}</p>
      ) : null}
      {!simpleHomeProEntitlementBypass ? <UpgradeLimitNotice gate={revisionPlanGate} className="mb-3" /> : null}
      <p className="mb-3 text-[12px] leading-relaxed text-slate-400">
        Describe the change you want. We&apos;ll preview it before anything is applied.
      </p>
      <div className="flex flex-col gap-3">
        <VoiceAugmentedTextArea
          value={editInstruction}
          onValueChange={setEditInstruction}
          surface="dark"
          voiceSubtleIdle={false}
          disabled={savingField === "conversation" || revisionPreviewBlocked}
          rows={4}
          id="agreement-review-revision-instruction"
          aria-label="Describe the change you want in plain language"
          placeholder={revisionInstructionPlaceholder}
          className="min-h-[6.5rem] w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 pb-12 pr-14 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500"
        />
        <p className="text-[10px] leading-snug text-slate-500">
          Nothing changes in your draft until you preview and choose to apply. Safe to experiment.
        </p>
        <button
          type="button"
          className="btn w-full shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 sm:w-auto sm:self-start"
          disabled={
            savingField === "conversation" ||
            !editInstruction.trim() ||
            revisionPreviewBlocked ||
            !revisionPlanAllowed
          }
          onClick={() => void reviseAgreement()}
        >
          {savingField === "conversation"
            ? isSimpleHomeReview
              ? "Revising agreement preview…"
              : "Generating preview…"
            : "Review"}
        </button>
        {isSimpleHomeReview && revisionPreviewFlash && pendingRevision ? (
          <p className="mt-2 text-xs font-medium text-emerald-400/95" role="status">
            Preview updated
          </p>
        ) : null}
        {isSimpleHomeReview && error && savingField !== "conversation" ? (
          <p className="mt-2 text-xs leading-snug text-rose-300">{error}</p>
        ) : null}
      </div>
    </div>
  ) : (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-sm font-semibold tracking-tight text-slate-200">Type or speak a change</div>
      {appliedRevisionBanner ? (
        <p className="mt-2 text-xs font-medium text-emerald-400/95" role="status">
          {appliedRevisionBanner}
        </p>
      ) : null}
      {appliedRevisionHeuristicBullets.length > 0 ? (
        <div className="mt-2 text-xs text-slate-300" role="status">
          <div className="font-semibold text-slate-200">Changes applied</div>
          <ul className="mt-1 list-disc pl-5">
            {appliedRevisionHeuristicBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {revisionValidation && revisionValidation.ok === false ? (
        <div className="mt-2 text-xs text-amber-300/95" role="alert">
          <p className="font-medium">
            Some requested changes may not have been fully applied. Please review before sending.
          </p>
          {revisionValidation.issues.length > 0 ? (
            <ul className="mt-1.5 list-disc pl-5 text-amber-200/90">
              {humanizeRevisionValidationIssues(revisionValidation.issues).map((label, idx) => (
                <li key={revisionValidation.issues[idx] ?? idx}>{label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!simpleHomeProEntitlementBypass ? <UpgradeLimitNotice gate={revisionPlanGate} className="mt-2" /> : null}
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Describe the change you want. We&apos;ll preview it before anything is applied.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {workspaceDraftStatusLine ? (
          <p className="text-[10px] font-medium leading-snug text-slate-500">{workspaceDraftStatusLine}</p>
        ) : null}
        <VoiceAugmentedTextArea
          value={editInstruction}
          onValueChange={setEditInstruction}
          surface="dark"
          voiceSubtleIdle={false}
          disabled={savingField === "conversation" || revisionPreviewBlocked}
          rows={3}
          id="agreement-review-revision-instruction-legacy"
          aria-label="Describe the change you want in plain language"
          placeholder={revisionInstructionPlaceholder}
          className="min-h-[5rem] w-full resize-y rounded border border-slate-700 bg-slate-950 px-2 py-2 pb-11 pr-12 text-sm text-slate-100 placeholder:text-slate-500"
        />
        <p className="text-[10px] text-slate-500">Preview first — nothing saves until you apply.</p>
        <button
          type="button"
          className="btn self-start bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
          disabled={
            savingField === "conversation" ||
            !editInstruction.trim() ||
            revisionPreviewBlocked ||
            !revisionPlanAllowed
          }
          onClick={() => void reviseAgreement()}
        >
          {savingField === "conversation" ? "Preview…" : "Review"}
        </button>
      </div>
    </div>
  );

  const previewBlock = (
    <div
      className={
        isWorkspace
          ? "rounded-lg border border-slate-700 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
          : "rounded border border-slate-800 bg-white p-4 text-slate-900"
      }
    >
      <div className={`uppercase tracking-wide text-slate-600 ${isWorkspace ? "text-xs font-semibold" : "text-xs"}`}>
        {isWorkspace ? "Working draft" : "Agreement Preview"}
      </div>
      {isWorkspace && workspaceDraftStatusLine ? (
        <p className="mt-1 text-[10px] font-medium leading-snug text-slate-500">{workspaceDraftStatusLine}</p>
      ) : null}
      <div className="mt-1 text-[11px] text-slate-500">
        {isWorkspace && selectedVer && !viewingHead ? (
          <span className="text-amber-700">Viewing earlier version · </span>
        ) : null}
        Last updated: {new Date(previewMetaWhen).toLocaleString()}
      </div>
      <div
        className={`prose max-w-none text-slate-900 ${
          isWorkspace
            ? "mt-4 max-h-[min(72vh,40rem)] overflow-y-auto overscroll-y-contain touch-pan-y text-[0.9375rem] leading-relaxed"
            : "mt-2 max-h-[min(68vh,34rem)] overflow-y-auto overscroll-y-contain touch-pan-y text-sm"
        }`}
        dangerouslySetInnerHTML={{ __html: previewHtmlDisplay || "<p>No rendered document yet.</p>" }}
      />
    </div>
  );

  const simplePreviewBlock = (
    <div className="rounded-xl border border-slate-700/90 bg-white p-6 text-slate-900 shadow-md shadow-black/15 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Full agreement</div>
        <div className="text-[11px] text-slate-600">
          Updated {previewMetaWhen ? new Date(previewMetaWhen).toLocaleString() : "—"}
        </div>
      </div>
      <div
        className="prose prose-slate mt-4 max-h-[min(70vh,36rem)] max-w-none overflow-y-auto overscroll-y-contain touch-pan-y rounded-lg border border-slate-200/90 bg-white px-2 py-3 text-[1.125rem] leading-[1.78] text-slate-950 sm:px-3 sm:text-[1.15625rem] sm:leading-[1.75] [&_li]:my-1.5 [&_p]:mb-3.5 [&_ul]:my-3.5 [&_strong]:text-slate-950"
        dangerouslySetInnerHTML={{ __html: simplePreviewHtmlForFreeSend || "<p>No rendered document yet.</p>" }}
      />
      {!canonicalUnpaidSendShell && !sendShellTierGatePending ? (
        <p className="mt-2 text-center text-[11px] text-slate-500">Scroll inside the box to read the full agreement.</p>
      ) : null}
    </div>
  );

  const negotiationTimelineSection =
    featureFlags.negotiationTimelineUi && showWorkspaceRichHistory && vb && vb.versions.length > 0 ? (
      fullTimelineUnlocked ? (
        <NegotiationTimelineView
          versions={vb.versions}
          events={negotiationTimelineEvents}
          currentStatus={negotiationTimelineStatus}
          onSelectVersion={(vid) => {
            if (!vb) return;
            setPreviewVersionId(vid === vb.currentVersionId ? null : vid);
          }}
        />
      ) : (
        <NegotiationTimelinePowerTeaser
          onUnlock={() => openPowerPaywall("agreement_review_draft", "full_timeline")}
        />
      )
    ) : null;

  const readOnlyCompletedHistorySlot = showCompletedAgreementDashboard
    ? vb && vb.versions.length > 0
      ? featureFlags.negotiationTimelineUi ? (
          fullTimelineUnlocked ? (
            <NegotiationTimelineView
              versions={vb.versions}
              events={negotiationTimelineEvents}
              currentStatus={negotiationTimelineStatus}
              showIntro={false}
            />
          ) : (
            <NegotiationTimelinePowerTeaser
              onUnlock={() => openPowerPaywall("agreement_review_completed", "full_timeline")}
            />
          )
        ) : (
          <p className="rounded-lg border border-slate-800/90 bg-slate-900/35 p-4 text-xs text-slate-400">
            {vb.versions.length} version(s) on record. (Version timeline is off for this build.)
          </p>
        )
      : executionPacketForView?.versionHistory && executionPacketForView.versionHistory.length > 0
        ? fullTimelineUnlocked ? (
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/35 p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Version history
              </p>
              <ul className="mt-3 space-y-2 text-xs text-slate-300">
                {executionPacketForView.versionHistory.map((r, i) => (
                  <li key={`${r.versionId}_${i}`}>
                    <span className="text-slate-500">{r.timestamp}</span> — {r.actor}: {r.event}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <NegotiationTimelinePowerTeaser
              onUnlock={() => openPowerPaywall("agreement_review_packet_history", "full_timeline")}
            />
          )
        : (
            <p className="rounded-lg border border-slate-800/80 bg-slate-950/30 px-4 py-3 text-xs text-slate-500">
              No version history on this device.
            </p>
          )
    : null;

  const draftBlock = (
    <>
      {showWorkspaceRichHistory ? pendingBanner : null}
      {showWorkspaceRichHistory ? recipientProposalPanel : null}
      {showWorkspaceRichHistory ? versionTimeline : null}
      {showWorkspaceRichHistory ? negotiationTimelineSection : null}
      {showNegotiationAssistant && headVer ? (
        <NegotiationAssistantPanel
          agreementId={agreementId}
          headVersion={headVer}
          priorVersion={priorVer}
          versionHistory={vb?.versions ?? []}
          disabled={!viewingHead || revisionPreviewBlocked || !revisionPlanAllowed}
          busy={savingField === "conversation"}
          negotiationCommitSeq={negotiationCommitSeq}
          aiModelClass={access.effectiveAiModelClass}
          onMemoryContextChange={onNegotiationMemoryContext}
          onRespond={({
            instruction,
            responseType,
            negotiationSummary,
            negotiationPosture,
            riskAssessment,
            suggestionContext,
          }) =>
            requestOwnerRevisePreview(
              instruction,
              "negotiation_response",
              {
                source: "negotiation_response",
                responds_to_version_id: headVer.id,
                response_type: responseType,
                negotiation_summary: negotiationSummary,
                ...(negotiationPosture ? { negotiation_posture: negotiationPosture } : {}),
                ...(riskAssessment ? riskToVersionMeta(riskAssessment) : {}),
              },
              {
                posture: negotiationPosture ?? DEFAULT_NEGOTIATION_POSTURE,
                riskAssessment: riskAssessment ?? null,
                priorSnapshot: headVer.snapshot,
              },
              suggestionContext
            )
          }
        />
      ) : null}
      {isWorkspace ? lastChangeCallout : null}
      {compareChangesPanel}
      {isWorkspace ? previewBlock : null}
      {isWorkspace ? (
        signingLocked ? (
          <p className="rounded-lg border border-slate-800/80 bg-slate-950/30 px-4 py-3 text-xs text-slate-400">
            {collaborationReadOnly
              ? "Review is closed on the final version. Version history above is read-only."
              : "Review is closed on the final signing version. Reopen review below if terms need to change again."}
          </p>
        ) : collaborationReadOnly ? (
          <p className="rounded-lg border border-slate-800/80 bg-slate-950/30 px-4 py-3 text-xs text-slate-400">
            Read-only history for this completed agreement.
          </p>
        ) : viewingHead ? (
          <>
            {reviseBlock}
            {workWithAnotherAiSection}
          </>
        ) : (
          <p className="rounded-lg border border-slate-800/80 bg-slate-950/30 px-4 py-3 text-xs text-slate-400">
            You’re viewing an earlier version. Select the latest row in version history to suggest a new change.
          </p>
        )
      ) : null}
      {!isWorkspace ? reviseBlock : null}
      {!isWorkspace ? compareChangesPanel : null}
      {!isWorkspace ? previewBlock : null}
    </>
  );

  const reviewers = (draft.parties || []).filter((p) => normalizeWorkflowRole(p.role) === "reviewer");
  const signers = (draft.parties || []).filter((p) => normalizeWorkflowRole(p.role) === "signer");

  const signerCount = signers.length;
  const recipientsSummaryLine =
    signerCount === 0
      ? "Add signers so you know who will execute this agreement."
      : signerCount === 1
        ? "1 person will sign this agreement."
        : `${signerCount} people will sign this agreement.`;

  const reviewUrl =
    typeof window !== "undefined" ? `${window.location.origin}${agreementReviewPath(agreementId)}` : "";
  const recipientInviteGate = access.check("recipient_invitation");
  const signatureRequestGate = access.check("signature_request");
  const recipientInviteAllowed = recipientInviteGate.allowed || simpleHomeProEntitlementBypass;
  const signatureRequestAllowed = signatureRequestGate.allowed || simpleHomeProEntitlementBypass;
  const simpleSendHeroPrimary =
    isWorkspace && isSimpleHomeReview && simpleFlowPhase === "send"
      ? (() => {
          const parties = draft.parties || [];
          const signerIdx = parties.findIndex((p) => normalizeWorkflowRole(p.role) === "signer");
          const p = signerIdx >= 0 ? parties[signerIdx] : parties[0];
          if (!p) return { name: "—", email: "" };
          return { name: (p.name || "").trim() || "—", email: (p.email || "").trim() };
        })()
      : null;

  const recipientsBlock = isWorkspace ? (canonicalUnpaidSendShell || sendShellTierGatePending ? null : (
    <div id="owner-signing-recipients-setup" className={isSimpleHomeReview ? "space-y-5" : "space-y-5"}>
      {isSimpleHomeReview ? null : (
        <p className="text-sm leading-relaxed text-slate-400">
          Add signers and reviewers below. Use the button at the bottom to send signature requests.
        </p>
      )}
      {!simpleHomeProEntitlementBypass ? <UpgradeLimitNotice gate={recipientInviteGate} /> : null}
      {isSimpleHomeReview &&
      simpleFlowPhase === "send" &&
      simpleSendHeroPrimary &&
      !(premiumLawdogSimpleHome && simpleSendActionsUnlocked) ? (
        <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-b from-slate-950 via-slate-950/98 to-[#0a101f]/95 p-5 shadow-xl shadow-black/25 ring-1 ring-emerald-500/[0.06] sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">Send this agreement</h2>
          <div className="mt-5 rounded-xl border border-slate-700/45 bg-slate-900/35 px-4 py-4 sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Primary recipient</p>
            <p className="mt-2 text-lg font-medium tracking-tight text-slate-100">{simpleSendHeroPrimary.name}</p>
            <p
              className={`mt-1 text-sm ${simpleSendHeroPrimary.email ? "text-slate-300" : "text-amber-200/90"}`}
            >
              {simpleSendHeroPrimary.email || "Add an email in Edit recipients to send"}
            </p>
          </div>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3.5 text-center text-base font-semibold text-slate-950 shadow-[0_8px_28px_rgba(16,185,129,0.22)] transition hover:from-emerald-300 hover:to-emerald-500"
            onClick={() =>
              document.getElementById("simple-flow-send-anchor")?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            Send Agreement
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 sm:text-sm">
            Nothing is sent until you confirm.
          </p>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-medium text-emerald-300/95 underline decoration-emerald-500/40 underline-offset-4 hover:text-emerald-200"
            onClick={() => setSimpleSendRecipientEditorOpen((o) => !o)}
          >
            {simpleSendRecipientEditorOpen ? "Hide recipient fields" : "Edit recipients"}
          </button>
        </div>
      ) : null}
      {isSimpleHomeReview &&
      simpleFlowPhase === "send" &&
      simpleSendValidateAttempted &&
      Object.keys(simpleSendFieldErrors).length > 0 ? (
        <div
          className="rounded-lg border border-slate-600/50 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-300"
          role="status"
          aria-live="polite"
        >
          Complete the highlighted fields to continue
        </div>
      ) : null}
      {isSimpleHomeReview &&
      !(simpleFlowPhase === "send" && simplePaidProAuthoritativeSendSurface) &&
      !simpleHomeReviewLinkSendStep ? (
        <details className="rounded-lg border border-slate-800/60 bg-slate-950/25 px-3 py-2 text-slate-400 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-300">
            Understand roles
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1.5 pb-2 text-[11px] leading-snug text-slate-400">
            <li>
              <strong className="text-slate-200">Signer</strong> — receives a signing link and can execute the
              agreement.
            </li>
            <li>
              <strong className="text-slate-200">Reviewer</strong> — can review the agreement before signing is
              requested.
            </li>
            <li>
              <strong className="text-slate-200">Copy only</strong> — receives an informational copy only.
            </li>
          </ul>
        </details>
      ) : !isSimpleHomeReview ? (
        <div className="rounded-lg border border-slate-800/70 bg-slate-950/30 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What each role means</div>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] leading-snug text-slate-400">
            <li>
              <strong className="text-slate-200">Signer</strong> — receives a signing link and can execute the
              agreement.
            </li>
            <li>
              <strong className="text-slate-200">Reviewer</strong> — can review the agreement before signing is
              requested.
            </li>
            <li>
              <strong className="text-slate-200">Copy only</strong> — receives an informational copy only.
            </li>
          </ul>
        </div>
      ) : null}
      <div
        id="simple-send-recipients-v1-anchor"
        className={
          isSimpleHomeReview
            ? "rounded-lg border border-slate-800/55 bg-slate-900/25 p-4 sm:p-5"
            : "rounded-lg border border-slate-800/90 bg-slate-900/35 p-4"
        }
      >
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {isSimpleHomeReview
              ? simplePaidProAuthoritativeSendSurface && simpleFlowPhase === "send"
                ? simpleHomeReviewLinkSendStep
                  ? "Recipient setup"
                  : "Recipients"
                : "Signature delivery"
              : "People on this agreement"}
          </div>
          {isSimpleHomeReview && simpleFlowPhase === "send" ? (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
              {simpleHomeReviewLinkSendStep
                ? "Names and emails label each private review link. Nothing is sent automatically."
                : simplePaidProAuthoritativeSendSurface
                  ? "LawDog creates a secure review link — it does not email recipients automatically. Add names and emails below so signers are labeled correctly."
                  : "Parties are listed in the agreement. Only people with emails entered below will receive signature requests."}
            </p>
          ) : null}
        </div>
        {participantRows.length > 0 &&
        !(isSimpleHomeReview && simpleFlowPhase === "send" && simplePaidProAuthoritativeSendSurface) ? (
          <details
            className={`mb-4 overflow-hidden rounded-lg border border-slate-800/90 bg-slate-950/30 [&_summary::-webkit-details-marker]:hidden ${
              isSimpleHomeReview && simpleFlowPhase === "send" ? "" : "open"
            }`}
            {...(isSimpleHomeReview && simpleFlowPhase === "send" ? {} : { open: true })}
          >
            <summary
              className={`cursor-pointer list-none px-3 py-2.5 text-left text-xs font-medium text-slate-300 marker:hidden hover:bg-slate-900/50 sm:text-sm ${
                isSimpleHomeReview && simpleFlowPhase === "send" ? "" : "hidden"
              }`}
            >
              Delivery status matrix (advanced)
            </summary>
            <div className="overflow-x-auto">
            <table
              className={
                isSimpleHomeReview
                  ? "w-full table-fixed border-collapse text-left text-xs text-slate-300"
                  : "w-full min-w-[20rem] border-collapse text-left text-[11px] text-slate-300"
              }
            >
              <colgroup>
                {isSimpleHomeReview && simpleFlowPhase === "send" ? (
                  <>
                    <col className="w-[22%]" />
                    <col className="w-[18%]" />
                    <col className="w-[28%]" />
                    <col className="w-[22%]" />
                    <col className="min-w-[7rem]" />
                  </>
                ) : isSimpleHomeReview ? (
                  <>
                    <col className="w-[28%]" />
                    <col className="w-[22%]" />
                    <col className="w-[20%]" />
                    <col className="w-[30%]" />
                  </>
                ) : null}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 align-bottom">Name</th>
                  <th className="px-3 py-2.5 align-bottom">Role</th>
                  {isSimpleHomeReview && simpleFlowPhase === "send" ? (
                    <>
                      <th className="px-3 py-2.5 align-bottom">Email status</th>
                      <th className="px-3 py-2.5 align-bottom">Delivery status</th>
                    </>
                  ) : (
                    <th className="px-3 py-2.5 align-bottom">Status</th>
                  )}
                  <th className="px-3 py-2.5 align-bottom">{isSimpleHomeReview ? "Action" : "Magic link"}</th>
                  {isSimpleHomeReview ? null : <th className="px-3 py-2.5 align-bottom">Personal review link</th>}
                </tr>
              </thead>
              <tbody>
                {isSimpleHomeReview && simpleFlowPhase === "send"
                  ? (draft.parties || []).map((party, idx) => {
                      const row = participantRows[idx];
                      if (!row) return null;
                      const wf = normalizeWorkflowRole(row.roleRaw);
                      const linkRole =
                        wf === "signer" ? "signer" : wf === "reviewer" ? "reviewer" : ("counterparty" as const);
                      const rowLinkLabels = recipientRowLinkActionLabels(wf);
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      const canLink = wf !== "owner" && row.partyId && !row.partyId.startsWith("legacy_");
                      const personal = canLink
                        ? `${origin}${agreementReviewPathWithParticipant(draft.id, row.partyId, linkRole)}`
                        : "";
                      const emailLine = sendStageEmailStatusLine(party);
                      const deliveryLine = sendStageDeliveryLine(draft, party, idx, row);
                      return (
                        <tr key={`send_delivery_${row.partyId}_${idx}`} className="border-b border-slate-800/80 align-top">
                          <td className="max-w-0 px-3 py-3 font-semibold text-slate-50">
                            <span className="block truncate" title={row.name}>
                              {row.name}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-400">{humanizePartyRoleForTable(party.role)}</td>
                          <td className="px-3 py-3 text-[11px] leading-snug text-slate-300">
                            <span className={emailLine === "—" ? "text-slate-600" : "break-all text-slate-200"}>
                              {emailLine}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[11px] leading-snug text-slate-300">{deliveryLine}</td>
                          <td className="px-3 py-3">
                            {wf === "owner" ? (
                              <span className="text-slate-600">—</span>
                            ) : (
                              <div className="relative z-0 flex flex-col gap-1.5">
                                {personal ? (
                                  <button
                                    type="button"
                                    className="text-left text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400"
                                    onClick={() => void navigator.clipboard.writeText(personal).catch(() => {})}
                                  >
                                    {rowLinkLabels.copyPersonal}
                                  </button>
                                ) : (
                                  <span className="text-[11px] leading-snug text-slate-600">Save row for link</span>
                                )}
                                <button
                                  type="button"
                                  className="text-left text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={!recipientInviteAllowed}
                                  onClick={() => void copyMagicInviteEmail(row)}
                                >
                                  {rowLinkLabels.emailDraft}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  : participantRows.map((row) => {
                      const wf = normalizeWorkflowRole(row.roleRaw);
                      const linkRole =
                        wf === "signer" ? "signer" : wf === "reviewer" ? "reviewer" : ("counterparty" as const);
                      const rowLinkLabels = recipientRowLinkActionLabels(wf);
                      const origin = typeof window !== "undefined" ? window.location.origin : "";
                      const canLink = wf !== "owner" && row.partyId && !row.partyId.startsWith("legacy_");
                      const personal = canLink
                        ? `${origin}${agreementReviewPathWithParticipant(draft.id, row.partyId, linkRole)}`
                        : "";
                      return (
                        <tr key={row.partyId} className="border-b border-slate-800/80 align-top">
                          <td
                            className={`max-w-0 px-3 py-3 ${isSimpleHomeReview ? "whitespace-nowrap font-semibold text-slate-50" : "text-slate-100"}`}
                          >
                            <span className="block truncate" title={row.name}>
                              {row.name}
                            </span>
                          </td>
                          <td className={`px-3 py-3 ${isSimpleHomeReview ? "whitespace-nowrap text-slate-400" : ""}`}>
                            {row.roleLabel}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-200">{row.status}</td>
                          <td className="px-3 py-3">
                            {isSimpleHomeReview ? (
                              wf === "owner" ? (
                                <span className="text-slate-600">—</span>
                              ) : (
                                <div className="relative z-0 flex flex-col gap-1.5">
                                  {personal ? (
                                    <button
                                      type="button"
                                      className="text-left text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400"
                                      onClick={() => void navigator.clipboard.writeText(personal).catch(() => {})}
                                    >
                                      {rowLinkLabels.copyPersonal}
                                    </button>
                                  ) : (
                                    <span className="text-[11px] leading-snug text-slate-600">Save row for link</span>
                                  )}
                                  <button
                                    type="button"
                                    className="text-left text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
                                    disabled={!recipientInviteAllowed}
                                    onClick={() => void copyMagicInviteEmail(row)}
                                  >
                                    {rowLinkLabels.emailDraft}
                                  </button>
                                </div>
                              )
                            ) : wf === "owner" ? (
                              <span className="text-slate-600">—</span>
                            ) : (
                              <button
                                type="button"
                                className="text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
                                disabled={!recipientInviteAllowed}
                                onClick={() => void copyMagicInviteEmail(row)}
                              >
                                {rowLinkLabels.emailDraft}
                              </button>
                            )}
                          </td>
                          {isSimpleHomeReview ? null : (
                            <td className="px-3 py-2">
                              {personal ? (
                                <button
                                  type="button"
                                  className="text-[11px] font-normal text-slate-500 underline decoration-slate-600/45 underline-offset-2 hover:text-slate-400"
                                  onClick={() => void navigator.clipboard.writeText(personal).catch(() => {})}
                                >
                                  {rowLinkLabels.copyPersonal}
                                </button>
                              ) : wf === "owner" ? (
                                <span className="text-slate-600">—</span>
                              ) : (
                                <span className="text-slate-600">Save row to get id</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            </div>
          </details>
        ) : null}
        {simplePaidProAuthoritativeSendSurface && isSimpleHomeReview && simpleFlowPhase === "send" ? (
          <div className="rounded-lg border border-slate-800/55 bg-slate-950/20 px-1 pb-3 pt-1">
            <p className="mb-3 px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Recipient details
            </p>
            <div className={`${isSimpleHomeReview ? "space-y-4" : "space-y-3"} px-1 pb-1 pt-1`}>
              {(draft.parties || []).map((party, idx) => (
                <RecipientWorkflowRow
                  key={`recipient_row_${idx}`}
                  index={idx}
                  party={party}
                  variant="workspace"
                  accentName={isSimpleHomeReview}
                  disabled={savingField === "parties"}
                  collectContact={Boolean(
                    isSimpleHomeReview && simpleFlowPhase === "send" && simpleSendActionsUnlocked
                  )}
                  contactValidateAttempted={simpleSendValidateAttempted}
                  contactFieldErrors={simpleSendFieldErrors}
                  contactValidationSeq={contactValidationSeq}
                  shakeContactFieldKey={shakeContactFieldKey}
                  contactWayfindLabel={contactWayfindLabel(
                    idx,
                    party,
                    contactPartyOrdinal(draft.parties, idx),
                    simpleSendFieldErrors,
                    simpleSendValidateAttempted
                  )}
                  onRelieveContactFieldError={relieveContactFieldError}
                  onSave={(nextParty) => {
                    const nextParties = [...(draft.parties || [])];
                    nextParties[idx] = nextParty;
                    void saveParties(nextParties);
                    if (simpleSendValidateAttempted) {
                      setSimpleSendFieldErrors((prev) => {
                        const next = { ...prev };
                        if (!recipientRoleNeedsContactInfo(nextParty.role)) {
                          (["name", "email", "phone"] as const).forEach((f) => delete next[`${idx}-${f}`]);
                          return next;
                        }
                        if ((nextParty.name || "").trim()) delete next[`${idx}-name`];
                        const em = (nextParty.email || "").trim();
                        if (em && SIMPLE_SEND_EMAIL_RE.test(em)) delete next[`${idx}-email`];
                        const digits = (nextParty.phone || "").replace(/\D/g, "");
                        if (digits.length >= 10) delete next[`${idx}-phone`];
                        return next;
                      });
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <details
            className={`rounded-lg border border-slate-800/55 bg-slate-950/20 [&_summary::-webkit-details-marker]:hidden ${
              isSimpleHomeReview && simpleFlowPhase === "send" ? "" : "open"
            }`}
            {...(isSimpleHomeReview && simpleFlowPhase === "send"
              ? { open: simpleSendRecipientEditorOpen }
              : { open: true })}
            onToggle={
              isSimpleHomeReview && simpleFlowPhase === "send"
                ? (e) => setSimpleSendRecipientEditorOpen((e.target as HTMLDetailsElement).open)
                : undefined
            }
          >
            <summary
              className={`cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-slate-200 marker:hidden hover:bg-slate-900/40 ${
                isSimpleHomeReview && simpleFlowPhase === "send" ? "" : "hidden"
              }`}
            >
              Edit recipients &amp; routing
            </summary>
            <div className={`${isSimpleHomeReview ? "space-y-4" : "space-y-3"} px-1 pb-1 pt-1`}>
              {(draft.parties || []).map((party, idx) => (
                <RecipientWorkflowRow
                  key={`recipient_row_${idx}`}
                  index={idx}
                  party={party}
                  variant="workspace"
                  accentName={isSimpleHomeReview}
                  disabled={savingField === "parties"}
                  collectContact={Boolean(
                    isSimpleHomeReview && simpleFlowPhase === "send" && simpleSendActionsUnlocked
                  )}
                  contactValidateAttempted={simpleSendValidateAttempted}
                  contactFieldErrors={simpleSendFieldErrors}
                  contactValidationSeq={contactValidationSeq}
                  shakeContactFieldKey={shakeContactFieldKey}
                  contactWayfindLabel={contactWayfindLabel(
                    idx,
                    party,
                    contactPartyOrdinal(draft.parties, idx),
                    simpleSendFieldErrors,
                    simpleSendValidateAttempted
                  )}
                  onRelieveContactFieldError={relieveContactFieldError}
                  onSave={(nextParty) => {
                    const nextParties = [...(draft.parties || [])];
                    nextParties[idx] = nextParty;
                    void saveParties(nextParties);
                    if (simpleSendValidateAttempted) {
                      setSimpleSendFieldErrors((prev) => {
                        const next = { ...prev };
                        if (!recipientRoleNeedsContactInfo(nextParty.role)) {
                          (["name", "email", "phone"] as const).forEach((f) => delete next[`${idx}-${f}`]);
                          return next;
                        }
                        if ((nextParty.name || "").trim()) delete next[`${idx}-name`];
                        const em = (nextParty.email || "").trim();
                        if (em && SIMPLE_SEND_EMAIL_RE.test(em)) delete next[`${idx}-email`];
                        const digits = (nextParty.phone || "").replace(/\D/g, "");
                        if (digits.length >= 10) delete next[`${idx}-phone`];
                        return next;
                      });
                    }
                  }}
                />
              ))}
            </div>
          </details>
        )}
      <p className="text-xs text-slate-500">{recipientsSummaryLine}</p>
      {!simplePaidProAuthoritativeSendSurface ? (
      <details className="rounded-lg border border-slate-800/55 bg-slate-950/30 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-200 marker:hidden hover:bg-slate-900/40">
          Advanced options — links &amp; FYI copy
        </summary>
        <div className="space-y-4 border-t border-slate-800/50 px-3 pb-4 pt-3">
      <div
        className={
          isSimpleHomeReview
            ? "rounded-lg border border-slate-800/55 bg-slate-950/30 p-4 sm:p-5"
            : "rounded-lg border border-slate-700 bg-slate-950/35 p-4"
        }
      >
        <p className="text-sm font-medium text-slate-300">
          {isSimpleHomeReview ? "Optional shared draft link" : "Send"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {isSigningLockActive(vb)
            ? "Review is closed. This link shows only the final signing version — recipients can’t send new suggested edits here."
            : isSimpleHomeReview
              ? "Use this only if you want to share a draft before sending formal signature requests."
              : "Workspace link to the current draft below. Row actions above are helpers for individual links. Use the button at the bottom to send signature requests."}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
          {isSimpleHomeReview ? (
            <div className="flex min-h-[2.75rem] min-w-0 flex-1 items-stretch overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 focus-within:border-emerald-500/40">
              <input
                readOnly
                value={reviewUrl}
                className="max-w-none min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono text-[11px] text-slate-200 outline-none whitespace-nowrap"
                aria-label="Review link URL"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center border-l border-slate-700 bg-slate-800/60 px-3 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Copy review link"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(reviewUrl);
                      trackAgreementFunnelEvent("review_link_created", { surface: "owner_copy" }, { planTier: String(access.tier), agreementId });
                    } catch {
                      /* ignore */
                    }
                  })();
                }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <code className="min-w-0 flex-1 break-all rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] leading-snug text-slate-300 sm:break-words">
              {reviewUrl}
            </code>
          )}
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className={
                isSimpleHomeReview
                  ? "btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  : "btn shrink-0 rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              }
              onClick={() => {
                const nb = setReviewSent(agreementId);
                if (nb) setVersionBundle(nb);
                void postReviewSentServer(agreementId);
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(reviewUrl);
                    trackAgreementFunnelEvent("review_link_created", { surface: isSimpleHomeReview ? "log_copy_simple" : "log_copy" }, { planTier: String(access.tier), agreementId });
                  } catch {
                    /* ignore */
                  }
                })();
              }}
            >
              {isSimpleHomeReview ? "Log & copy draft link" : "Send"}
            </button>
            {!isSimpleHomeReview ? (
              <button
                type="button"
                className="btn rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(reviewUrl);
                      trackAgreementFunnelEvent("review_link_created", { surface: "owner_copy_draft" }, { planTier: String(access.tier), agreementId });
                    } catch {
                      /* ignore */
                    }
                  })();
                }}
              >
                Copy draft link
              </button>
            ) : null}
          </div>
        </div>
        {vb?.reviewSentAt ? (
          <p className="mt-2 text-[11px] text-slate-500">
            Review link active · {new Date(vb.reviewSentAt).toLocaleString()}
          </p>
        ) : null}
      </div>
      {signingUrl ? (
        <div className="rounded-lg border border-emerald-800/45 bg-emerald-950/25 p-4">
          <p className="text-sm font-semibold text-emerald-100">Signing link</p>
          <p className="mt-1 text-xs text-emerald-100/85">
            Signers should use this link. It only opens the version you locked—not the latest draft if it changes later.
          </p>
          <code className="mt-3 block min-w-0 truncate rounded border border-emerald-900/40 bg-slate-950/40 px-2 py-1.5 text-[11px] text-emerald-50/95">
            {signingUrl}
          </code>
            <button
            type="button"
            className="btn mt-3 rounded-lg border border-emerald-700/50 bg-emerald-900/30 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/45"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(signingUrl);
                  trackAgreementFunnelEvent("signing_link_created", { surface: "owner_copy" }, { planTier: String(access.tier), agreementId });
                } catch {
                  /* ignore */
                }
              })();
            }}
          >
            Copy signing link
          </button>
        </div>
      ) : null}
        </div>
      </details>
      ) : null}
      </div>
    </div>
  )) : (
    <>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recipients summary</div>
        <p className="mt-2 text-xs text-slate-400">
          Tag each party as a reviewer, signer, or counterparty. This mirrors the agreement&apos;s{" "}
          <code className="text-slate-300">parties</code> field — no separate backend yet.
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-300">
          <li>
            <strong className="text-slate-200">Reviewers ({reviewers.length}):</strong>{" "}
            {reviewers.length ? reviewers.map((p) => p.name || "(unnamed)").join(", ") : "—"}
          </li>
          <li>
            <strong className="text-slate-200">Signers ({signers.length}):</strong>{" "}
            {signers.length ? signers.map((p) => p.name || "(unnamed)").join(", ") : "—"}
          </li>
        </ul>
        <div className="mt-3 rounded border border-slate-800/80 bg-slate-950/30 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Who reviews next?</div>
          <p className="mt-1 text-xs text-slate-400">
            Assign at least one reviewer to drive order-of-review. Sending notifications is not wired yet.
          </p>
          <button type="button" className="btn mt-2 text-xs opacity-60" disabled>
            Send for review (coming soon)
          </button>
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Roles &amp; names
        </div>
        <div className="space-y-2">
          {(draft.parties || []).map((party, idx) => (
            <RecipientWorkflowRow
              key={`recipient_row_${idx}`}
              index={idx}
              party={party}
              disabled={savingField === "parties"}
              onSave={(nextParty) => {
                const nextParties = [...(draft.parties || [])];
                nextParties[idx] = nextParty;
                void saveParties(nextParties);
              }}
            />
          ))}
        </div>
      </div>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Version history</div>
        <p className="mt-1 text-xs text-slate-500">
          Stored on the draft when the backend records revisions (same <code>versions</code> array as before).
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-300">
          {(Array.isArray(draft.versions) ? draft.versions : []).length === 0 && <li>No version rows yet.</li>}
          {(Array.isArray(draft.versions) ? draft.versions : []).map((v) => (
            <li key={`v_${Number(v?.version ?? 0)}_${String(v?.created_at ?? "")}`}>
              v{Number(v?.version ?? 0)} —{" "}
              {String(v?.created_at ?? "").trim()
                ? new Date(String(v.created_at)).toLocaleString()
                : "unknown time"}
              {typeof v?.note === "string" && v.note.trim() ? ` — ${v.note}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  const freePlanPlusUpsellCard = canonicalUnpaidSendShell ? (
    <div className="rounded-xl border border-slate-800/55 bg-slate-950/30 px-4 py-4 sm:px-5">
      <p className="text-sm font-medium text-slate-200">When you upgrade</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
        {FUNNEL_PRO_VALUE_BULLETS.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-emerald-400/90" aria-hidden>
              ·
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-4 w-full rounded-lg border border-emerald-500/50 bg-emerald-950/25 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/65 hover:bg-emerald-950/40"
        onClick={() => triggerPaywall({ agreementId, reason: "free_send_plus_upsell" })}
      >
        {FUNNEL_CTA_SEND_WITH_PRO}
      </button>
    </div>
  ) : null;

  const freePlanSendRecipientsPanel =
    canonicalUnpaidSendShell && isWorkspace ? (
      <div className="space-y-5">
        {!simpleHomeProEntitlementBypass ? <UpgradeLimitNotice gate={recipientInviteGate} /> : null}
        {isSimpleHomeReview &&
        simpleFlowPhase === "send" &&
        simpleSendValidateAttempted &&
        Object.keys(simpleSendFieldErrors).length > 0 ? (
          <div
            className="rounded-lg border border-slate-600/50 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-300"
            role="status"
            aria-live="polite"
          >
            Complete the highlighted fields to continue
          </div>
        ) : null}
        {simpleSendHeroPrimary ? (
          <div className="rounded-xl border border-slate-800/65 bg-slate-950/[0.42] px-5 py-5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">Send this agreement</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Review the recipient and send your agreement link.
            </p>
            <div className="mt-5 rounded-lg border border-slate-700/50 bg-slate-900/40 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recipient</p>
              <p className="mt-2 text-base font-medium tracking-tight text-slate-100">{simpleSendHeroPrimary.name}</p>
              <p
                className={`mt-1 text-sm ${simpleSendHeroPrimary.email ? "text-slate-300" : "text-amber-200/90"}`}
              >
                {simpleSendHeroPrimary.email || "Add an email to send"}
              </p>
            </div>
            <button
              type="button"
              className="mt-5 text-sm font-medium text-emerald-300/95 underline decoration-emerald-500/45 underline-offset-4 hover:text-emerald-200"
              onClick={() => setSimpleSendRecipientEditorOpen((o) => !o)}
            >
              {simpleSendRecipientEditorOpen ? "Hide recipient fields" : "Edit recipients"}
            </button>
            {simpleSendRecipientEditorOpen ? (
              <div className="mt-4 space-y-4 rounded-lg border border-slate-800/55 bg-slate-950/30 px-3 py-4 sm:px-4">
                {(draft.parties || []).map((party, idx) => (
                  <RecipientWorkflowRow
                    key={`free_min_recipient_${idx}`}
                    index={idx}
                    party={party}
                    variant="workspace"
                    accentName={isSimpleHomeReview}
                    disabled={savingField === "parties"}
                    collectContact={Boolean(
                      isSimpleHomeReview && simpleFlowPhase === "send" && simpleSendActionsUnlocked
                    )}
                    contactValidateAttempted={simpleSendValidateAttempted}
                    contactFieldErrors={simpleSendFieldErrors}
                    contactValidationSeq={contactValidationSeq}
                    shakeContactFieldKey={shakeContactFieldKey}
                    contactWayfindLabel={contactWayfindLabel(
                      idx,
                      party,
                      contactPartyOrdinal(draft.parties, idx),
                      simpleSendFieldErrors,
                      simpleSendValidateAttempted
                    )}
                    onRelieveContactFieldError={relieveContactFieldError}
                    onSave={(nextParty) => {
                      const nextParties = [...(draft.parties || [])];
                      nextParties[idx] = nextParty;
                      void saveParties(nextParties);
                      if (simpleSendValidateAttempted) {
                        setSimpleSendFieldErrors((prev) => {
                          const next = { ...prev };
                          if (!recipientRoleNeedsContactInfo(nextParty.role)) {
                            (["name", "email", "phone"] as const).forEach((f) => delete next[`${idx}-${f}`]);
                            return next;
                          }
                          if ((nextParty.name || "").trim()) delete next[`${idx}-name`];
                          const em = (nextParty.email || "").trim();
                          if (em && SIMPLE_SEND_EMAIL_RE.test(em)) delete next[`${idx}-email`];
                          const digits = (nextParty.phone || "").replace(/\D/g, "");
                          if (digits.length >= 10) delete next[`${idx}-phone`];
                          return next;
                        });
                      }
                    }}
                  />
                ))}
              </div>
            ) : null}
            <p className="mt-5 text-center text-xs leading-relaxed text-slate-500 sm:text-left">
              Nothing is sent until you confirm.
            </p>
            {!requiredComplete ? (
              <p className="mt-3 text-xs leading-relaxed text-amber-200/85">
                Complete the key terms &amp; parties section above before you can send.
              </p>
            ) : null}
            {simpleSendActionsUnlocked ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--primary mt-6 w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={
                  Boolean(savingField) ||
                  simpleFlowAdvanceBusy ||
                  recipientGateBlocksSend ||
                  !requiredComplete
                }
                onClick={() => void handleSimpleSendWithoutPayment()}
              >
                Send
              </button>
            ) : onRequestSendUnlock ? (
              <button
                type="button"
                className="vs01-btn vs01-btn--primary mt-6 w-full min-h-[2.75rem] px-6"
                onClick={() => onRequestSendUnlock()}
              >
                {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const freePlanSendChecklist = canonicalUnpaidSendShell ? (
    <div className="rounded-xl border border-slate-800/50 bg-slate-950/20 px-4 py-4 sm:px-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Quick check</h3>
      <ul className="mt-3 space-y-2 text-sm leading-snug text-slate-300">
        <li className="flex gap-2">
          <span className="shrink-0 text-emerald-400" aria-hidden>
            ✓
          </span>
          Names look correct
        </li>
        <li className="flex gap-2">
          <span className="shrink-0 text-emerald-400" aria-hidden>
            ✓
          </span>
          Terms look correct
        </li>
        <li className="flex gap-2">
          <span className="shrink-0 text-emerald-400" aria-hidden>
            ✓
          </span>
          Nothing sent yet
        </li>
      </ul>
    </div>
  ) : null;

  const canonicalUnpaidSendDraftCompletionPanel =
    canonicalUnpaidSendShell && !requiredComplete ? (
      <details open className="rounded-xl border border-amber-900/35 bg-amber-950/15 [&_summary::-webkit-details-marker]:hidden">
        <summary className="list-none cursor-pointer px-4 py-3 text-left text-sm font-semibold text-amber-100">
          Complete key terms &amp; parties
        </summary>
        <div className="space-y-2 border-t border-amber-900/25 px-4 pb-4 pt-3">
          <p className="text-xs leading-relaxed text-slate-400">
            Fix these fields to finish your draft. Free send stays on this simple surface.
          </p>
          <div className="mt-4 space-y-6 rounded-lg border border-slate-800/60 bg-slate-950/30 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Title, dates &amp; jurisdiction</p>
              <div className="mt-3 space-y-3 border-b border-slate-800/55 pb-6">{coreMetaGrid}</div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Scope, payment &amp; duration</p>
              <div className="mt-3 space-y-3">{extendedDetailsGrid}</div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/[0.35]">
              {partiesSection}
            </div>
          </div>
        </div>
      </details>
    ) : null;

  const revisionCount = vb?.versions.length ?? 0;
  const versionIdToLock =
    isWorkspace && vb ? (previewVersionId ?? vb.currentVersionId) : "";
  const versionOrdinalToLock =
    isWorkspace && vb && versionIdToLock
      ? vb.versions.findIndex((v) => v.id === versionIdToLock) + 1
      : 0;
  const signingHandoffReady =
    Boolean(isSigningLockActive(vb)) && signerCount >= 1 && requiredComplete;
  const ownerSigningNeedsRecipientSetup = signerCount < 1 || signingApproverMissingList.length > 0;
  const ownerPostAcceptNextStepCopy = ownerSigningNeedsRecipientSetup
    ? OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND
    : signingHandoffReady
      ? OWNER_NEXT_SEND_FOR_SIGNATURE
      : OWNER_NEXT_LOCK_THEN_SEND;

  const lockVidPanel = vb?.signingLock?.lockedVersionId ?? "";
  const lockedVerForPanel =
    vb && lockVidPanel ? vb.versions.find((v) => v.id === lockVidPanel) : undefined;
  const lockedVersionMissing = Boolean(signingLocked && lockVidPanel && !lockedVerForPanel);
  const lockedVersionOrdinal =
    vb && lockVidPanel ? vb.versions.findIndex((v) => v.id === lockVidPanel) + 1 : 0;
  const lockedVersionLabel =
    vb && lockVidPanel && lockedVersionOrdinal > 0
      ? formatRevisionIdentityLabel(lockedVersionOrdinal - 1, lockVidPanel, vb.signingLock ?? null)
      : lockVidPanel
        ? `${lockVidPanel.slice(0, 8)}…`
        : "—";
  const versionHumanLabelForLock =
    vb && versionIdToLock && versionOrdinalToLock > 0
      ? formatRevisionIdentityLabel(versionOrdinalToLock - 1, versionIdToLock, vb.signingLock ?? null)
      : null;
  const finalizedAtLabelPanel = vb?.signingLock?.lockedAt
    ? new Date(vb.signingLock.lockedAt).toLocaleString()
    : lockedVerForPanel?.created_at
      ? new Date(lockedVerForPanel.created_at).toLocaleString()
      : null;

  const proofForDisplay = executionPacketForView?.proof ?? proofOverlay;

  const completedAgreementDerived = showCompletedAgreementDashboard
    ? (() => {
        const meta = deriveFinalVersionDisplay({ vb, packet: executionPacketForView });
        let html = "";
        if (executionPacketForView?.agreement.content?.trim()) {
          html = executionPacketForView.agreement.content;
        } else if (vb && meta.finalVersionId !== "—") {
          const vrec = vb.versions.find((x) => x.id === meta.finalVersionId);
          if (vrec?.rendered_html?.trim()) html = vrec.rendered_html;
        }
        if (!html.trim() && vb?.versions.length) {
          const last = vb.versions[vb.versions.length - 1]!;
          html = last.rendered_html || "";
        }
        const signedAt = findSignedAuditTimestamp(draft);
        const completedAtLabel = signedAt
          ? Number.isNaN(new Date(signedAt).getTime())
            ? signedAt
            : new Date(signedAt).toLocaleString()
          : null;
        const signerModel = buildPendingSignerRows({
          draft,
          linkReady: false,
          agreementFullySigned: true,
        });
        const hint = html.trim()
          ? null
          : "Final text is not available on this device. Use the signing record below, or open this agreement where you completed signing.";
        const signersCompleteSummary =
          signerModel.total === 0
            ? "Signers: none listed with the signer role."
            : `${signerModel.total} of ${signerModel.total} signers complete`;
        return {
          meta,
          html,
          completedAtLabel,
          signerModel,
          hint,
          signersCompleteSummary,
        };
      })()
    : null;

  const ownerReopenSlot =
    !finalizeReadOnly && signingLocked ? (
      <>
        {!reopenNegotiationConfirm ? (
          <button
            type="button"
            className="btn rounded-lg border border-amber-600/60 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-slate-900/60"
            onClick={() => setReopenNegotiationConfirm(true)}
          >
            Reopen review
          </button>
        ) : (
          <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
            <p>Reopening review pauses signing on the current final version.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn rounded-md bg-rose-700/90 px-3 py-1.5 text-xs text-white hover:bg-rose-600"
                onClick={() => {
                  clearSigningLock(agreementId);
                  setVersionBundle(loadBundle(agreementId));
                  setReopenNegotiationConfirm(false);
                }}
              >
                Reopen review
              </button>
              <button
                type="button"
                className="btn rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
                onClick={() => setReopenNegotiationConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </>
    ) : null;

  const executionAndProofSlot = (
    <div className="mt-4 rounded-lg border border-slate-700/90 bg-slate-900/35 px-4 py-4">
      <h3 className="text-sm font-semibold text-slate-100">Signing record</h3>
      {executionPacketForView ? (
        <p className="mt-1 text-xs text-slate-400">
          Everything needed to review, sign, and verify this agreement.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          The signing record will appear once this browser has your active signing session. If you finalized on another
          device, open the agreement there or finalize again here.
        </p>
      )}
      <div className="mt-2 rounded-md border border-slate-800/90 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-500">Proof &amp; anchor status</div>
        {proofForDisplay ? (
          <>
            <p className="mt-1 text-slate-400">
              Receipt: {proofForDisplay.receipt_id ? "created" : "—"} · Anchor:{" "}
              <span className="text-slate-200">
                {proofForDisplay.anchor_status === "anchored"
                  ? "on-chain"
                  : proofForDisplay.anchor_status === "anchoring"
                    ? "anchoring"
                    : proofForDisplay.anchor_status === "batched"
                      ? "batched"
                      : proofForDisplay.anchor_status === "failed"
                        ? "failed"
                        : "queued"}
              </span>
              {proofForDisplay.anchor_network ? ` · ${proofForDisplay.anchor_network}` : ""}
              {proofForDisplay.anchor_txid ? ` · tx ${proofForDisplay.anchor_txid}` : ""}
            </p>
            {proofForDisplay.anchor_canonical_explorer_url ? (
              <p className="mt-1">
                <a
                  href={proofForDisplay.anchor_canonical_explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline"
                >
                  View Bitcoin anchor
                </a>
              </p>
            ) : null}
            {proofForDisplay.anchor_mirror_explorer_url ? (
              <p className="mt-1">
                <a
                  href={proofForDisplay.anchor_mirror_explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-300 underline"
                >
                  View Dogecoin mirror
                </a>
              </p>
            ) : null}
            {proofForDisplay.anchor_explorer_url &&
            !proofForDisplay.anchor_canonical_explorer_url &&
            !proofForDisplay.anchor_mirror_explorer_url ? (
              <p className="mt-1">
                <a
                  href={proofForDisplay.anchor_explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline"
                >
                  View on-chain anchor
                </a>
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-slate-400">Proof pending</p>
        )}
      </div>
      {executionPacketForView ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
            onClick={() => setExecutionPacketOpen(true)}
          >
            View signing record
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
            onClick={() => onVerifiedPacketDownload("json")}
          >
            Download signing record (JSON)
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
            onClick={() => onVerifiedPacketDownload("txt")}
          >
            Download summary (text)
          </button>
        </div>
      ) : null}
    </div>
  );

  const activityLogDetails = (
    <details className="mt-5 rounded-lg border border-slate-800/80 bg-slate-900/25">
      <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-slate-400">
        Activity log
      </summary>
      <div className="border-t border-slate-800/60 px-4 py-3 text-xs text-slate-400">
        {(draft.audit_log || []).length === 0 ? (
          <p>No activity recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {(draft.audit_log || []).map((evt, idx) => (
              <li key={`${evt.at}_${evt.event_type}_${idx}`}>
                {evt.at} — {auditEventLabel(evt.event_type)}
                {evt.field ? ` (${evt.field})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );

  const downloadSendGrid = (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-100">Download</h3>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">
          Export a Word document to share, print, or edit outside LawDog.
        </p>
        <button
          type="button"
          className="btn mt-4 w-full rounded-lg border border-slate-600 bg-slate-800/60 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
          onClick={() => void onExportDocx()}
        >
          Export as Word
        </button>
      </div>
      <div className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-slate-100">Send to signing</h3>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">
          When you’re ready to collect signatures on a PDF, go to the LawDog home screen and choose{" "}
          <strong className="font-medium text-slate-200">Sign a document</strong>. Complete your agreement details
          there so signers get the right file.
        </p>
        <button
          type="button"
          className="btn mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={!signingHandoffReady || finalizeReadOnly}
          title={
            finalizeReadOnly
              ? "Not available in read-only view."
              : !requiredComplete
                ? "Complete title, parties, dates, and payment details first."
                : !isSigningLockActive(vb)
                  ? "Finalize a version before sending to signing."
                  : signerCount < 1
                    ? "Add at least one signer on the Recipients step first."
                    : "Return to the home screen to open Sign a document."
          }
          onClick={() => {
            if (!signingHandoffReady) return;
            window.location.assign("/");
          }}
        >
          {signingHandoffReady ? OWNER_SEND_FOR_SIGNATURE : "Send to signing"}
        </button>
      </div>
    </div>
  );

  const finalizeReadOnlyBanner =
    workspaceEntryMode === "read_only_archived" ? (
      <div className="mb-3 rounded-lg border border-slate-600/55 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
        <p className="font-semibold text-slate-100">Archived agreement</p>
        <p className="mt-1 text-xs text-slate-400">Read-only summary. Unarchive from My agreements to work on it again.</p>
      </div>
    ) : workspaceEntryMode === "read_only_completed" ? (
      <div className="mb-3 rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
        <p className="font-semibold text-emerald-50">{JOY_COPY.readOnlySealedHeadline}</p>
        <p className="mt-1 text-xs text-emerald-100/90">Read-only. Packet and proof status are below.</p>
      </div>
    ) : null;

  const finalizeBlock = isWorkspace ? (
    <>
      {showCompletedAgreementDashboard && completedAgreementDerived ? (
        <>
          <CompletedAgreementPanel
            agreementTitle={(draft.title || "").trim() || "Untitled agreement"}
            signersCompleteSummary={completedAgreementDerived.signersCompleteSummary}
            finalVersionLabel={completedAgreementDerived.meta.versionLabel}
            proofSummaryShort={proofSummaryLine(proofForDisplay)}
            finalVersionId={completedAgreementDerived.meta.finalVersionId}
            finalizedAtLabel={completedAgreementDerived.meta.finalizedAtLabel}
            completedAtLabel={completedAgreementDerived.completedAtLabel}
            signerRows={completedAgreementDerived.signerModel.rows}
            signerRosterSummary={completedAgreementDerived.signerModel.summary}
            finalAgreementHtml={completedAgreementDerived.html}
            finalContentUnavailableHint={completedAgreementDerived.hint}
            executionAndProofSlot={executionAndProofSlot}
            readOnlyHistorySlot={readOnlyCompletedHistorySlot}
            claimRecordSlot={
              <ClaimRecordCard flow="agreement_complete" recordId={agreementId} visible variant="default" />
            }
          />
          {activityLogDetails}
        </>
      ) : null}
      {!showCompletedAgreementDashboard ? finalizeReadOnlyBanner : null}
      {showPendingSignatureDashboard ? (
        <>
          <PendingSignaturePanel
            agreementTitle={(draft.title || "").trim() || "Untitled agreement"}
            lockedVersionId={lockVidPanel || "—"}
            versionLabel={lockedVersionLabel}
            finalizedAtLabel={finalizedAtLabelPanel}
            signerModel={pendingSignerModel}
            signingUrl={signingUrl || null}
            verificationUrl={verificationUrl || null}
            agreementFullySigned={agreementFullySigned}
            lockedVersionMissing={lockedVersionMissing}
            ownerActions={ownerReopenSlot}
            executionAndProofSlot={executionAndProofSlot}
          />
          {downloadSendGrid}
          {activityLogDetails}
        </>
      ) : null}
      {!showPendingSignatureDashboard && !showCompletedAgreementDashboard ? (
        <>
          {signingLocked ? (
        <div className="rounded-lg border border-emerald-700/45 bg-emerald-950/25 px-4 py-4 text-sm text-emerald-100">
          <p className="font-semibold text-emerald-50">Final version ready for signature</p>
          <p className="mt-1 text-xs text-emerald-100/85">Recipients will sign this final version only.</p>
          {signingHandoffReady ? (
            <p className="mt-2 text-xs font-medium text-sky-100/95">{OWNER_NEXT_SEND_FOR_SIGNATURE}</p>
          ) : ownerSigningNeedsRecipientSetup ? (
            <p className="mt-2 text-xs font-medium text-amber-100/95">{OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND}</p>
          ) : null}
          {ownerReopenSlot ? <div className="mt-3">{ownerReopenSlot}</div> : null}
        </div>
          ) : finalizeReadOnly ? (
        <div className="rounded-lg border border-slate-700/70 bg-slate-900/30 px-4 py-3 text-xs text-slate-400">
          <p>
            {workspaceEntryMode === "read_only_archived"
              ? "Signing controls are hidden for archived agreements."
              : "Final terms are summarized in the signing record below when available."}
          </p>
        </div>
      ) : (
        <div
          id="owner-finalize-signing"
          tabIndex={-1}
          className="rounded-lg border border-slate-700/90 bg-slate-900/35 px-4 py-4 text-sm text-slate-200 outline-none ring-sky-500/30 focus-visible:ring-2"
        >
          {ownerPostAcceptSigningGuide ? (
            <div
              className="mb-4 rounded-lg border border-emerald-700/45 bg-emerald-950/30 px-3 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-semibold text-emerald-50">{OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE}</p>
              <p className="mt-1 text-xs leading-snug text-emerald-100/90">
                {OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL}
              </p>
              <p className="mt-2 text-xs leading-snug text-slate-300/95">{OWNER_POST_ACCEPT_LOCK_EXPLAINER}</p>
              <p className="mt-2 text-xs font-medium text-sky-100/95">{ownerPostAcceptNextStepCopy}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ownerSigningNeedsRecipientSetup ? (
                  <button
                    type="button"
                    className="btn rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-950/70"
                    onClick={() => {
                      if (section === "finalize" && onOwnerJumpToRecipientsStep) {
                        onOwnerJumpToRecipientsStep();
                        window.setTimeout(() => {
                          document
                            .getElementById("owner-signing-recipients-setup")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 120);
                        return;
                      }
                      document
                        .getElementById("owner-signing-recipients-setup")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {OWNER_CTA_GO_TO_SIGNERS}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                  onClick={() => setOwnerPostAcceptSigningGuide(false)}
                >
                  {OWNER_CTA_DISMISS_SUCCESS}
                </button>
              </div>
            </div>
          ) : null}
          <p className="font-semibold text-slate-100">Lock this version for signing</p>
          {!ownerPostAcceptSigningGuide ? (
            <p className="mt-1 text-xs font-medium text-sky-200/95">{OWNER_FINALIZE_LOCK_HINT}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-400">
            The revision highlighted in history (
            {versionHumanLabelForLock || `row ${versionOrdinalToLock || "—"}`}) becomes the stable signing copy. Pick
            another row in version history first if you need a different version.
          </p>
          {revisionCount > 1 ? (
            <p className="mt-2 text-xs text-amber-200/90">
              You have {revisionCount} saved versions—confirm the correct one before locking.
            </p>
          ) : null}
          {signingApproverMissingList.length > 0 ? (
            <p className="mt-2 text-xs text-amber-200/90">
              Each signer must approve the current draft (personal review link on the Recipients step) before you can
              lock for signing. Still pending: {signingApproverMissingList.join(", ")}.
            </p>
          ) : null}
          {!simpleHomeProEntitlementBypass ? (
            <UpgradeLimitNotice gate={signatureRequestGate} className="mt-3" />
          ) : null}
          <button
            type="button"
            className="btn mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={
              signingLockBusy ||
              !versionIdToLock ||
              signingApproverMissingList.length > 0 ||
              !signatureRequestAllowed
            }
            onClick={() => {
              if (!versionIdToLock || !draft || signingLockBusy) return;
              const sigGate = access.check("signature_request");
              if (!sigGate.allowed && !simpleHomeProEntitlementBypass) {
                setError(sigGate.message || "Signing request limit reached for your plan.");
                return;
              }
              const next = applySigningLock(agreementId, versionIdToLock);
              if (!next) return;
              setSigningLockBusy(true);
              setVersionBundle(next);
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const sl = next.signingLock!;
              const revertLocalSigningLock = () => {
                clearSigningLock(agreementId);
                const reverted = loadBundle(agreementId);
                if (reverted) setVersionBundle(reverted);
              };
              void (async () => {
                try {
                  const lockRes = await putSigningLock(agreementId, {
                    locked_version_id: sl.lockedVersionId!,
                    locked_at: sl.lockedAt || new Date().toISOString(),
                    locked_by: sl.lockedBy || "owner",
                  });
                  if (!lockRes.ok) {
                    revertLocalSigningLock();
                    setError(humanizeOwnerSigningLockError(lockRes.error));
                    return;
                  }
                  if (import.meta.env.MODE !== "test") {
                    const ownerFinalizeDiag =
                      import.meta.env.DEV ||
                      (typeof window !== "undefined" &&
                        window.localStorage?.getItem("lawdogOwnerFinalizeDiag") === "1");
                    if (ownerFinalizeDiag) {
                      // eslint-disable-next-line no-console
                      console.info("[owner-finalize-signing-lock-create]", {
                        agreementId,
                        locked_version_id: sl.lockedVersionId,
                      });
                    }
                  }
                  access.recordUsage("signature_requests");
                  try {
                    const mintKey =
                      (import.meta as unknown as { env?: { VITE_RECIPIENT_LINK_MINT_KEY?: string } }).env
                        ?.VITE_RECIPIENT_LINK_MINT_KEY || "";
                    const minted = await mintRecipientAccessToken(agreementId, { mode: "sign" }, mintKey);
                    const tok = minted?.token ?? null;
                    if (tok) {
                      setSigningAccessToken(tok);
                    }
                    const lockedBundle = loadBundle(agreementId) ?? next;
                    const pkt = buildExecutionPacket({
                      agreementId,
                      draft,
                      bundle: lockedBundle,
                      origin,
                      signingAccessToken: tok ?? undefined,
                    });
                    if (pkt) {
                      const reg = await registerFinalizedAgreementReceipt(API_BASE, agreementId, pkt);
                      if (reg.ok && reg.proof) setProofOverlay(reg.proof);
                    }
                  } catch {
                    setError(
                      "This version is set for signature on the server, but a follow-up step failed. Reload this page before sharing signing links.",
                    );
                  }
                } catch {
                  revertLocalSigningLock();
                  setError("We could not reach the server to lock this version. Check your connection and try again.");
                } finally {
                  setSigningLockBusy(false);
                }
              })();
            }}
          >
            {signingLockBusy
              ? "Locking…"
              : ownerPostAcceptSigningGuide
                ? OWNER_LOCK_AND_CONTINUE_TO_SIGNING
                : "Finalize this version for signing"}
          </button>
        </div>
          )}
          {downloadSendGrid}
          {executionPacketForView && (signingLocked || finalizeReadOnly) ? (
        <div className="mt-4 rounded-lg border border-slate-700/90 bg-slate-900/35 px-4 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Signing record</h3>
          <p className="mt-1 text-xs text-slate-400">
            Everything needed to review, sign, and verify this agreement.
          </p>
          {executionPacketForView.proof ? (
            <div className="mt-2 rounded-md border border-slate-800/90 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
              <div className="font-semibold text-slate-500">Proof &amp; anchor status</div>
              <p className="mt-1 text-slate-400">
                Receipt: {executionPacketForView.proof.receipt_id ? "created" : "—"} · Anchor:{" "}
                <span className="text-slate-200">
                  {executionPacketForView.proof.anchor_status === "anchored"
                    ? "on-chain"
                    : executionPacketForView.proof.anchor_status === "anchoring"
                      ? "anchoring"
                      : executionPacketForView.proof.anchor_status === "batched"
                        ? "batched"
                        : executionPacketForView.proof.anchor_status === "failed"
                          ? "failed"
                          : "queued"}
                </span>
                {executionPacketForView.proof.anchor_network
                  ? ` · ${executionPacketForView.proof.anchor_network}`
                  : ""}
              </p>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              onClick={() => setExecutionPacketOpen(true)}
            >
              View signing record
            </button>
            <button
              type="button"
              className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              onClick={() => onVerifiedPacketDownload("json")}
            >
              Download signing record (JSON)
            </button>
            <button
              type="button"
              className="btn rounded-lg border border-slate-600 bg-slate-800/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
              onClick={() => onVerifiedPacketDownload("txt")}
            >
              Download summary (text)
            </button>
          </div>
        </div>
      ) : null}
          {activityLogDetails}
        </>
      ) : null}
    </>
  ) : (
    <>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Export &amp; handoff</div>
        <p className="mt-2 text-xs text-slate-400">
          Export uses the existing <code className="text-slate-300">/export-docx</code> route. For PDF signing and
          receipts, use <strong className="text-slate-200">Sign a document</strong> from the home screen (VS01).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn text-xs" onClick={() => void onExportDocx()}>
            Export (.docx)
          </button>
          <button
            type="button"
            className="btn bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={!requiredComplete}
            title={requiredComplete ? "Ready when core fields are complete" : "Complete core fields first"}
          >
            Proceed to Sign
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
        <button type="button" className="btn text-xs opacity-70" disabled>
          Redlines (stub)
        </button>
        <button type="button" className="btn text-xs opacity-70" disabled>
          Comments (stub)
        </button>
        <button type="button" className="btn text-xs" onClick={() => setAuditOpen((v) => !v)}>
          {auditOpen ? "Hide Audit" : "Audit"}
        </button>
      </div>
      {auditOpen && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit</div>
          <div className="mt-2 space-y-1 text-xs text-slate-300">
            {(draft.audit_log || []).map((evt, idx) => (
              <div key={`${evt.at}_${evt.event_type}_${idx}`}>
                {evt.at} - {auditEventLabel(evt.event_type)}
                {evt.field ? ` (${evt.field})` : ""}
              </div>
            ))}
            {(draft.audit_log || []).length === 0 && <div>No audit events yet.</div>}
          </div>
        </div>
      )}
    </>
  );

  const legacyToolbar = (
    <div className="flex flex-wrap gap-2 rounded border border-slate-800 bg-slate-900/40 p-3">
      <button type="button" className="btn text-xs opacity-70" disabled>
        Versions (stub)
      </button>
      <button type="button" className="btn text-xs opacity-70" disabled>
        Redlines (stub)
      </button>
      <button type="button" className="btn text-xs opacity-70" disabled>
        Comments (stub)
      </button>
      <button type="button" className="btn text-xs" onClick={() => setAuditOpen((v) => !v)}>
        {auditOpen ? "Hide Audit" : "Audit"}
      </button>
      <button type="button" className="btn text-xs" onClick={() => void onExportDocx()}>
        Export (.docx)
      </button>
      <button
        type="button"
        className="btn bg-emerald-600 text-xs text-white hover:bg-emerald-500 disabled:opacity-60"
        disabled={!requiredComplete}
        title={requiredComplete ? "Proceed to sign" : "Complete core fields first"}
      >
        Sign
      </button>
    </div>
  );

  const auditPanelAll = auditOpen ? (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Audit</div>
      <div className="mt-2 space-y-1 text-xs text-slate-300">
        {(draft.audit_log || []).map((evt, idx) => (
          <div key={`${evt.at}_${evt.event_type}_${idx}`}>
            {evt.at} - {auditEventLabel(evt.event_type)}
            {evt.field ? ` (${evt.field})` : ""}
          </div>
        ))}
        {(draft.audit_log || []).length === 0 && <div>No audit events yet.</div>}
      </div>
    </div>
  ) : null;

  const detailsStepBlock = (
    <>
      {coreMetaGrid}
      {extendedDetailsGrid}
      {partiesSection}
    </>
  );

  const economicsBannerEl =
    section === "simpleHomeReview" &&
    economicsOverlay?.tier === "free" &&
    !simpleFlowUpsellSuppressed &&
    !(isStreamlinedSimple && !economicsOverlay.free_draft_expired) ? (
      <div
        className={`mb-4 rounded-lg border px-4 py-3 ${
          economicsOverlay.free_draft_expired
            ? "border-amber-800/50 bg-amber-950/20"
            : "border-slate-700/80 bg-slate-900/40"
        }`}
        role="status"
      >
        <p className="text-sm font-medium text-slate-100">
          {economicsOverlay.free_draft_expired
            ? "Don't lose this agreement — save and finalize it."
            : FUNNEL_FREE_STARTER_HEADLINE}
        </p>
        {!economicsOverlay.free_draft_expired ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{FUNNEL_FREE_STARTER_BODY}</p>
        ) : (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
            onClick={() => {
              logProductEvent("upgrade_prompt_from_expiry", { agreementId });
              triggerPaywall({ agreementId, reason: "draft_expired" });
            }}
          >
            Upgrade to send
          </button>
        )}
      </div>
    ) : null;

  if (section === "all") {
    return (
      <section className={outerClass}>
        {headerBlock}
        {coreMetaGrid}
        {reviseBlock}
        {partiesSection}
        {legacyToolbar}
        {auditPanelAll}
        {previewBlock}
        {error && <div className="text-xs text-rose-300">{error}</div>}
        <ClawTrustFooter agreementId={draft.id} />
      </section>
    );
  }

  const workspaceStateBannerEl = workspaceStateBannerContent ? (
      <div
        className="mb-4 rounded-lg border border-slate-700/85 bg-slate-900/45 px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <div className="text-xs font-semibold text-slate-100">{workspaceStateBannerContent.title}</div>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">{workspaceStateBannerContent.detail}</p>
      </div>
    ) : null;

  if (section === "simpleHomeReview") {
    return (
      <>
        <section className={`${outerClass} mx-auto w-full max-w-none`}>
          {!premiumLawdogSimpleHome && !canonicalUnpaidSendShell && !sendShellTierGatePending ? (
            <div className="mb-8 rounded-lg border border-emerald-900/25 bg-emerald-950/[0.07] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-400"
                  aria-hidden
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold tracking-tight text-slate-100">{FUNNEL_FREE_STARTER_HEADLINE}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{FUNNEL_FREE_STARTER_BODY}</p>
                  <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
                    {FUNNEL_PRO_VALUE_BULLETS.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                    {REVIEW_STRUCTURED_WIN_LINE} You can edit anything below — no upgrade required to review.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {economicsBannerEl}

          {simpleFlowUpsellSuppressed && !simpleHomePaidReviewLinkHandoff ? (
            <div
              className="mb-4 rounded-lg border border-emerald-800/40 bg-emerald-950/[0.12] px-4 py-3"
              role="status"
            >
              <p className="text-sm font-semibold tracking-tight text-emerald-100">{FUNNEL_PRO_ACTIVE_TITLE}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{FUNNEL_PRO_ACTIVE_BODY}</p>
              {peekPostProUnlockCelebrate(agreementId) ? (
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary mt-3 w-full min-h-[2.5rem] px-4 text-sm sm:w-auto"
                  onClick={() => {
                    clearPostProUnlockCelebrate(agreementId);
                    onContinueToReviewerSetup?.();
                  }}
                >
                  {FUNNEL_PRO_PHASE_REVIEWER_SETUP}
                </button>
              ) : (
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {simpleFlowPhase === "send"
                    ? FUNNEL_PRO_PHASE_READY_SIGNATURES
                    : FUNNEL_PRO_PHASE_REVIEWER_SETUP}
                </p>
              )}
            </div>
          ) : null}

          {agreementReadiness &&
          !isStreamlinedSimple &&
          !canonicalUnpaidSendShell &&
          !sendShellTierGatePending &&
          !(premiumLawdogSimpleHome && simpleHomePaidAuthoritativeAgreementPreview) ? (
            <div className="mb-6">
              <AgreementReadinessCard
                result={agreementReadiness}
                surface="simple_home_review"
                flowPhase={simpleFlowPhase}
                showSendPrepNote={simpleFlowPhase === "send"}
              />
            </div>
          ) : null}

          {sendShellTierGatePending ? (
            <div
              className="mb-10 flex min-h-[10rem] flex-col items-center justify-center rounded-xl border border-slate-800/55 bg-slate-950/25 px-6 py-8 text-center"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <p className="text-sm font-medium text-slate-200">Preparing send…</p>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">Loading plan for this agreement.</p>
            </div>
          ) : null}

          {canonicalUnpaidSendShell ? (
            <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,40%)_minmax(0,60%)] lg:items-start lg:gap-12">
              <div className="order-1 flex min-w-0 flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
                {!requiredComplete ? (
                  <div
                    className="rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-4"
                    role="status"
                  >
                    <p className="text-sm font-semibold text-slate-100">A few details needed to continue</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Answer below to complete your draft — nothing is sent until you confirm.
                    </p>
                    <ul className="mt-3 space-y-2.5 text-sm text-slate-200/95">
                      {simpleReviewGaps.map(renderSimpleHomeGapRow)}
                    </ul>
                  </div>
                ) : null}
                {canonicalUnpaidSendDraftCompletionPanel}
                {freePlanSendRecipientsPanel}
                {freePlanPlusUpsellCard}
              </div>
              <div className="order-2 flex min-h-0 min-w-0 flex-col gap-5">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-100">Agreement preview</h2>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">
                    Read-only preview. Nothing is sent until you confirm.
                  </p>
                </div>
                {isSimpleHomeReview && draft && simpleFlowPhase === "review" ? (
                  <div className="mb-3 rounded-lg border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5 text-[11px] leading-relaxed sm:text-xs">
                    {SIMPLE_HOME_AGREEMENT_READY_LINES.map((line, i) => (
                      <p key={line} className={`${i > 0 ? "mt-1 " : ""}text-slate-300 last:text-slate-400`}>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {simplePreviewBlock}
                {isSimpleHomeReview && savingField === "conversation" && !pendingRevision ? (
                  <div
                    className="mt-4 flex items-center gap-2.5 rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-emerald-400"
                      aria-hidden
                    />
                    <span>Revising agreement preview…</span>
                  </div>
                ) : null}
                {freePlanSendChecklist}
              </div>
            </div>
          ) : null}

          {!canonicalUnpaidSendShell && !sendShellTierGatePending ? (
          <div
            className={`flex flex-col lg:grid lg:grid-cols-[minmax(0,68%)_minmax(0,32%)] lg:items-start ${
              premiumLawdogSimpleHome ? "gap-12 lg:gap-10" : "gap-10 lg:gap-5"
            }`}
          >
            <div className="order-1 flex min-h-0 min-w-0 flex-col gap-8">
              {premiumLawdogSimpleHome && simpleFlowPhase === "review" ? (
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.625rem]">
                    {streamlinedPremiumIntentForCopy === "review"
                      ? "Prepare review link"
                      : streamlinedPremiumIntentForCopy === "signature"
                        ? "Review before sending for signature"
                        : "Review before sending"}
                  </h1>
                  <p className="max-w-none text-sm leading-relaxed text-slate-400 lg:max-w-[44rem]">
                    {streamlinedPremiumIntentForCopy === "review"
                      ? "Choose who can review this agreement. Nothing is signed."
                      : streamlinedPremiumIntentForCopy === "signature"
                        ? "Finalize terms here, then send for tracked e‑signature — professional delivery, signer progress, and proof when the deal closes."
                        : "Check the agreement below. Nothing is sent until you confirm."}
                  </p>
                </div>
              ) : premiumLawdogSimpleHome && simpleFlowPhase === "send" && streamlinedPremiumIntentForCopy === "review" ? (
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.625rem]">
                    Prepare review link
                  </h1>
                  <p className="max-w-none text-sm leading-relaxed text-slate-400 lg:max-w-[44rem]">
                    Choose who can review this agreement. Nothing is signed.
                  </p>
                </div>
              ) : premiumLawdogSimpleHome && simpleFlowPhase === "send" && streamlinedPremiumIntentForCopy === "signature" ? (
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.625rem]">
                    Owner workspace
                  </h1>
                  <p className="max-w-none text-sm leading-relaxed text-slate-400 lg:max-w-[44rem]">
                    Confirm signers on the right, then create and share signing links when you are ready.
                  </p>
                </div>
              ) : (
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-100">Agreement preview</h2>
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">
                    {premiumLawdogSimpleHome
                      ? "Read-only preview. Editable until sent."
                      : "Read-only rendered draft. Quick field edits live in the summary column. Broader edits — type or speak in the panel below (mic on the field)."}
                  </p>
                </div>
              )}
              {isSimpleHomeReview && draft && simpleFlowPhase === "review" ? (
                <div className="mb-3 rounded-lg border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5 text-[11px] leading-relaxed sm:text-xs">
                  {SIMPLE_HOME_AGREEMENT_READY_LINES.map((line, i) => (
                    <p key={line} className={`${i > 0 ? "mt-1 " : ""}text-slate-300 last:text-slate-400`}>
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              {simpleHomeReviewLinkSendStep && draft ? (
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-4 py-4 sm:px-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Agreement summary</p>
                  <p className="mt-2 text-base font-semibold tracking-tight text-slate-100">
                    {(draft.title || "").trim() || "Agreement"}
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    <span className="font-medium text-slate-500">Parties: </span>
                    {streamlinedPartiesHeadline}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Review link only · Nothing is signed</p>
                </div>
              ) : null}
              {simpleHomeReviewLinkSendStep ? (
                <details className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/[0.35] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="cursor-pointer list-none px-4 py-3 text-left marker:hidden hover:bg-slate-900/35">
                    <span className="text-sm font-semibold text-slate-100">Agreement preview</span>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">Collapsed — expand for a read-only view.</span>
                  </summary>
                  <div className="border-t border-slate-800/50 px-1 pb-3 pt-2">{simplePreviewBlock}</div>
                </details>
              ) : (
                simplePreviewBlock
              )}
              {draft && isPaidProAgreementAuthoritative({ draft, agreementId }) && !simpleSendReviewIntent ? (
                <div className="mt-6">
                  <ProRedlineOwnerPanel
                    agreementId={agreementId}
                    draft={draft}
                    intakeTextFallback={[draft.title, draft.jurisdiction, draft.purpose, draft.payment_terms]
                      .map((x) => String(x || "").trim())
                      .filter(Boolean)
                      .join("\n\n")}
                    onDraftReplaced={(next) => {
                      const norm = normalizeAgreementDraftFromApi(next, { fallbackAgreementId: agreementId });
                      if (norm) setDraft(norm);
                    }}
                  />
                </div>
              ) : null}
              {isSimpleHomeReview && savingField === "conversation" && !pendingRevision ? (
                <div
                  className="mt-4 flex items-center gap-2.5 rounded-lg border border-slate-700/70 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-emerald-400"
                    aria-hidden
                  />
                  <span>Revising agreement preview…</span>
                </div>
              ) : null}
              {compareChangesPanel && !simpleHomeReviewLinkSendStep ? (
                <div id={SIMPLE_HOME_REVISION_COMPARE_ANCHOR_ID} className="scroll-mt-24">
                  {compareChangesPanel}
                </div>
              ) : null}
              {!isStreamlinedSimple ? (
                <details id="simple-flow-revise" open className="rounded-xl">
                  <summary className="list-none cursor-pointer rounded-xl border border-slate-800/55 bg-slate-950/20 px-4 py-3 text-left text-slate-300 hover:border-slate-700/70 hover:bg-slate-950/30 [&::-webkit-details-marker]:hidden">
                    <span className="block text-sm font-semibold text-slate-100">Type or speak a change</span>
                    <span className="mt-1 block text-xs font-normal leading-snug text-slate-500">
                      Bigger change? Use the field below — same preview-first flow as create.
                    </span>
                  </summary>
                  <div className="mt-3 rounded-xl border border-slate-800/50 bg-slate-950/20 px-4 py-4">{reviseBlock}</div>
                </details>
              ) : null}
            </div>

            <aside className="order-2 flex min-w-0 flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
              {!requiredComplete ? (
                <div
                  className="rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-4"
                  role="status"
                >
                  <p className="text-sm font-semibold text-slate-100">A few details needed to continue</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {premiumLawdogSimpleHome
                      ? "Complete the missing pieces in your draft, then continue."
                      : "Answer below to complete your draft — nothing is sent until you confirm."}
                  </p>
                  <ul className="mt-3 space-y-2.5 text-sm text-slate-200/95">
                    {simpleReviewGaps.map(renderSimpleHomeGapRow)}
                  </ul>
                </div>
              ) : null}

              {premiumLawdogSimpleHome ? (
                <>
                  {reviewLinkMintFailureMessage && isSimpleHomeReview && simpleFlowPhase === "send" ? (
                    <div
                      className="rounded-lg border border-rose-800/45 bg-rose-950/25 px-4 py-3 text-sm leading-snug text-rose-50/95"
                      role="alert"
                    >
                      {reviewLinkMintFailureMessage}
                    </div>
                  ) : null}
                  {!simpleHomeReviewLinkSendStep ? (
                    <p className="text-sm leading-snug text-slate-300">
                      <span className="font-medium text-slate-500">Parties: </span>
                      {streamlinedPartiesHeadline}
                    </p>
                  ) : null}
                  {simpleFlowPhase === "send" ? (
                    simpleSendActionsUnlocked ? (
                      <>
                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                          {simpleSendAuthoritativeMinimalChrome ? (
                            paidProAuthoritativeSendHappyPath ? (
                              <div className="space-y-4">
                                {!watermarkSendModalOpen ? (
                                  <p className="text-sm leading-relaxed text-slate-400">
                                    Final confirmation opens automatically for paid Pro agreements when recipients are
                                    ready. Use{" "}
                                    <span className="font-medium text-slate-200">
                                      {simpleFlowPremiumHandoffIntent === "review"
                                        ? "Continue to confirmation"
                                        : "Review and send"}
                                    </span>{" "}
                                    below if you closed the dialog — nothing is sent until you confirm.
                                  </p>
                                ) : null}
                                <div className="flex flex-col gap-3">
                                  <button
                                    type="button"
                                    className={`vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 ${
                                      watermarkSendModalOpen ? "hidden" : ""
                                    }`}
                                    disabled={
                                      Boolean(savingField) ||
                                      simpleFlowAdvanceBusy ||
                                      (recipientGateBlocksSend &&
                                        !(simpleHomeReviewLinkSendStep && simpleFlowPremiumHandoffIntent === "review"))
                                    }
                                    onClick={() => {
                                      if (
                                        simpleHomeReviewLinkSendStep &&
                                        recipientGateBlocksSend &&
                                        simpleFlowPremiumHandoffIntent === "review"
                                      ) {
                                        setSimpleSendRecipientEditorOpen(true);
                                        window.requestAnimationFrame(() => {
                                          document
                                            .getElementById("simple-send-recipients-v1-anchor")
                                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        });
                                        return;
                                      }
                                      setWatermarkSendModalOpen(true);
                                    }}
                                  >
                                    {simpleFlowPremiumHandoffIntent === "review"
                                      ? simpleHomeReviewLinkSendStep && recipientGateBlocksSend
                                        ? "Add recipient emails"
                                        : "Continue to confirmation"
                                      : "Review and send"}
                                  </button>
                                  {simpleHomeReviewLinkSendStep && onBackToNew ? (
                                    <button
                                      type="button"
                                      className={`vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 ${
                                        watermarkSendModalOpen ? "hidden" : ""
                                      }`}
                                      onClick={() => onBackToNew()}
                                    >
                                      Back to draft
                                    </button>
                                  ) : onSimpleFlowBack ? (
                                    <button
                                      type="button"
                                      className={`vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 ${
                                        watermarkSendModalOpen ? "hidden" : ""
                                      }`}
                                      onClick={() => onSimpleFlowBack()}
                                    >
                                      Back
                                    </button>
                                  ) : null}
                                </div>
                                <p className="text-xs leading-relaxed text-slate-500">
                                  Nothing is sent until you confirm in the dialog.
                                </p>
                                <div className="border-t border-slate-800/50 pt-4">{recipientsBlock}</div>
                              </div>
                            ) : (
                            <>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/95">
                                {simpleHomeReviewLinkSendStep ? "Recipient setup" : "Agreement ready"}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                {simpleHomeReviewLinkSendStep
                                  ? "Confirm who can open a private review link. You copy and share it — nothing is signed."
                                  : streamlinedPremiumIntentForCopy === "review"
                                    ? "LawDog creates secure review links — it does not email recipients automatically. Use the button below to generate links you copy and share."
                                    : "LawDog creates secure signing links — it does not email recipients automatically. Use the button below to generate links you copy and share."}
                              </p>
                              {recipientGateBlocksSend ? (
                                <p
                                  className="mt-3 rounded-lg border border-amber-800/45 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95"
                                  role="status"
                                >
                                  {draft && isPaidProAgreementAuthoritative({ draft, agreementId })
                                    ? streamlinedPremiumIntentForCopy === "signature"
                                      ? "Add at least one signer email to continue."
                                      : "Add at least one recipient email to create a review link."
                                    : streamlinedPremiumIntentForCopy === "review"
                                      ? "Add at least one recipient email in Recipients below — we need it to label review links and continue."
                                      : "Add at least one recipient email in Recipients below before continuing."}
                                </p>
                              ) : null}
                              <div className="mt-4 flex flex-col gap-3">
                                <button
                                  type="button"
                                  className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={
                                    Boolean(savingField) ||
                                    simpleFlowAdvanceBusy ||
                                    (recipientGateBlocksSend &&
                                      !(simpleHomeReviewLinkSendStep && streamlinedPremiumIntentForCopy === "review"))
                                  }
                                  onClick={() => {
                                    if (
                                      simpleHomeReviewLinkSendStep &&
                                      recipientGateBlocksSend &&
                                      streamlinedPremiumIntentForCopy === "review"
                                    ) {
                                      setSimpleSendRecipientEditorOpen(true);
                                      window.requestAnimationFrame(() => {
                                        document
                                          .getElementById("simple-send-recipients-v1-anchor")
                                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                      });
                                      return;
                                    }
                                    logCreateReviewLinksClick("primary_cta_click", {
                                      intent: streamlinedPremiumIntentForCopy ?? null,
                                    });
                                    if (streamlinedPremiumIntentForCopy === "review") {
                                      requestReviewLinkCreateConfirmation();
                                    } else {
                                      void handleSimpleSendWithoutPayment();
                                    }
                                  }}
                                >
                                  {streamlinedPremiumIntentForCopy === "review"
                                    ? simpleHomeReviewLinkSendStep && recipientGateBlocksSend
                                      ? "Add recipient emails"
                                      : "Continue to confirmation"
                                    : "Review and send"}
                                </button>
                                {simpleHomeReviewLinkSendStep && onBackToNew ? (
                                  <button
                                    type="button"
                                    className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
                                    onClick={() => onBackToNew()}
                                  >
                                    Back to draft
                                  </button>
                                ) : onSimpleFlowBack ? (
                                  <button
                                    type="button"
                                    className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
                                    onClick={() => onSimpleFlowBack()}
                                  >
                                    Back
                                  </button>
                                ) : null}
                              </div>
                              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                                Nothing reaches anyone until you confirm and share a link yourself.
                              </p>
                              <div className="mt-5 border-t border-slate-800/50 pt-4">{recipientsBlock}</div>
                            </>
                            )
                          ) : premiumAwaitingStreamlinedFork ? (
                            <>
                              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                                Premium path
                              </h3>
                              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                Choose <span className="font-medium text-slate-200">Review link path</span> or{" "}
                                <span className="font-medium text-slate-200">Signing link path</span> at the top of this
                                page — then return here to finish recipients and confirm.
                              </p>
                            </>
                          ) : streamlinedPremiumIntentForCopy === "review" ? (
                            <>
                              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                                {simpleHomeReviewLinkSendStep ? "Recipient setup" : "Review link"}
                              </h3>
                              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                {simpleHomeReviewLinkSendStep
                                  ? "Add who can open the private review link. LawDog does not email them for you."
                                  : "Create a private review link — you copy and share it. Nothing reaches anyone until you do."}
                              </p>
                              {recipientGateBlocksSend ? (
                                <p
                                  className="mt-3 rounded-lg border border-amber-800/45 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95"
                                  role="status"
                                >
                                  Add at least one recipient email in Recipients below — we need it to label review
                                  links and continue.
                                </p>
                              ) : null}
                              <div className="mt-4 flex flex-col gap-3">
                                <button
                                  type="button"
                                  className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={
                                    Boolean(savingField) ||
                                    simpleFlowAdvanceBusy ||
                                    (recipientGateBlocksSend && !simpleHomeReviewLinkSendStep)
                                  }
                                  onClick={() => {
                                    if (simpleHomeReviewLinkSendStep && recipientGateBlocksSend) {
                                      setSimpleSendRecipientEditorOpen(true);
                                      window.requestAnimationFrame(() => {
                                        document
                                          .getElementById("simple-send-recipients-v1-anchor")
                                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                      });
                                      return;
                                    }
                                    logCreateReviewLinksClick("primary_cta_click", {
                                      intent: streamlinedPremiumIntentForCopy ?? null,
                                    });
                                    requestReviewLinkCreateConfirmation();
                                  }}
                                >
                                  {simpleHomeReviewLinkSendStep && recipientGateBlocksSend
                                    ? "Add recipient emails"
                                    : "Continue to confirmation"}
                                </button>
                                {simpleHomeReviewLinkSendStep && onBackToNew ? (
                                  <button
                                    type="button"
                                    className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
                                    onClick={() => onBackToNew()}
                                  >
                                    Back to draft
                                  </button>
                                ) : onSimpleFlowBack ? (
                                  <button
                                    type="button"
                                    className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
                                    onClick={() => onSimpleFlowBack()}
                                  >
                                    Back
                                  </button>
                                ) : null}
                              </div>
                              {!simpleHomeReviewLinkSendStep ? (
                                <ul className="mt-4 space-y-2 text-xs leading-relaxed text-slate-400">
                                  <li className="flex gap-2">
                                    <span className="text-emerald-400" aria-hidden>
                                      ✓
                                    </span>
                                    <span>Request changes, compare versions, and send revised drafts in one workspace</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="text-emerald-400" aria-hidden>
                                      ✓
                                    </span>
                                    <span>Suggested edits and approvals from your reviewers</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="text-emerald-400" aria-hidden>
                                      ✓
                                    </span>
                                    <span>Finalize signatures when terms are ready</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="text-emerald-400" aria-hidden>
                                      ✓
                                    </span>
                                    <span>Nothing reaches reviewers until you share a link</span>
                                  </li>
                                </ul>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                                Create signature links
                              </h3>
                              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                Generate secure signature links for each signer — you copy and share them. Tracked
                                completion and proof stay on record in LawDog.
                              </p>
                              <div className="mt-4 flex flex-col gap-3">
                                <button
                                  type="button"
                                  className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45"
                                  disabled={Boolean(savingField) || simpleFlowAdvanceBusy || recipientGateBlocksSend}
                                  onClick={() => {
                                    logCreateReviewLinksClick("primary_cta_click", {
                                      intent: streamlinedPremiumIntentForCopy ?? null,
                                    });
                                    void handleSimpleSendWithoutPayment();
                                  }}
                                >
                                  Create signature links
                                </button>
                                {onSimpleFlowBack ? (
                                  <button
                                    type="button"
                                    className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
                                    onClick={() => onSimpleFlowBack()}
                                  >
                                    Back
                                  </button>
                                ) : null}
                              </div>
                              <ul className="mt-4 space-y-2 text-xs leading-relaxed text-slate-400">
                                <li className="flex gap-2">
                                  <span className="text-emerald-400" aria-hidden>
                                    ✓
                                  </span>
                                  <span>Track signer completion</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="text-emerald-400" aria-hidden>
                                    ✓
                                  </span>
                                  <span>Timestamped proof</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="text-emerald-400" aria-hidden>
                                    ✓
                                  </span>
                                  <span>Professional delivery</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="text-emerald-400" aria-hidden>
                                    ✓
                                  </span>
                                  <span>Nothing reaches signers until you share a link</span>
                                </li>
                              </ul>
                            </>
                          )}
                          {!simplePaidProAuthoritativeSendSurface ? (
                            <>
                              <details
                                className="mt-5 rounded-lg border border-slate-800/55 bg-slate-950/30 px-2 py-1.5 [&_summary::-webkit-details-marker]:hidden"
                                {...(simpleHomeReviewLinkSendStep ? { open: true } : {})}
                              >
                                <summary
                                  className={`cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:hidden hover:text-slate-400 ${
                                    simpleHomeReviewLinkSendStep ? "hidden" : ""
                                  }`}
                                >
                                  Recipients and delivery setup
                                </summary>
                                <div className={`border-slate-800/50 pt-3 ${simpleHomeReviewLinkSendStep ? "" : "mt-3 border-t"}`}>
                                  {recipientsBlock}
                                </div>
                              </details>
                              {featureFlags.sendPaymentRequestsUi ? (
                                <details className="mt-2 rounded-lg border border-slate-800/55 bg-slate-950/30 px-2 py-1.5 [&_summary::-webkit-details-marker]:hidden">
                                  <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 marker:hidden hover:text-slate-400">
                                    Optional payments
                                  </summary>
                                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    Optional payment only if you expand it below — it never sends on its own.
                                  </p>
                                </details>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {featureFlags.sendPaymentRequestsUi && !simplePaidProAuthoritativeSendSurface ? (
                          <SimplePaymentAttachCard
                            partyALabel={
                              (draft.parties || [])[0]
                                ? participantDisplayName((draft.parties || [])[0], 0)
                                : "Party A"
                            }
                            partyBLabel={
                              (draft.parties || [])[1]
                                ? participantDisplayName((draft.parties || [])[1], 1)
                                : "Party B"
                            }
                            paymentTerms={draft.payment_terms}
                            purpose={draft.purpose}
                            paymentRequired={simplePaymentRequired}
                            onPaymentRequiredChange={(v) => void persistSimplePaymentRequired(v)}
                            value={simplePayForm}
                            onChange={setSimplePayForm}
                            onPersist={() => void persistSimplePayment()}
                          />
                        ) : null}
                      </>
                    ) : simpleFlowUpsellSuppressed && !simpleHomePaidReviewLinkHandoff ? (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <p className="text-sm font-semibold text-emerald-100">{FUNNEL_PRO_ACTIVE_TITLE}</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                          {FUNNEL_PRO_ACTIVE_BODY} Add recipients above, then confirm send.
                        </p>
                      </div>
                    ) : simpleFlowUpsellSuppressed && simpleHomePaidReviewLinkHandoff ? (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                          Unlock send to add recipient emails and finish your review link.
                        </p>
                        {onRequestSendUnlock ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--primary mt-5 w-full min-h-[2.75rem] px-6"
                            onClick={() => onRequestSendUnlock()}
                          >
                            {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                          Sending is locked
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                          Upgrade to close this agreement faster with a guided send flow, clear signer visibility, and
                          professional delivery.
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">
                          Your draft and edits stay saved. Nothing goes out until you confirm after unlocking.
                        </p>
                        {onRequestSendUnlock ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--primary mt-5 w-full min-h-[2.75rem] px-6"
                            onClick={() => onRequestSendUnlock()}
                          >
                            {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
                          </button>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </>
              ) : (
                <>
                  <div
                    id="simple-flow-draft-details"
                    className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5"
                  >
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">Key terms</h3>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      Quick field edits — tap <span className="text-slate-400">Edit field</span> on each row.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      Confirm or edit — each field saves to your draft.
                    </p>
                    <div className="mt-6 space-y-3 border-b border-slate-800/55 pb-7">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Title, dates &amp; jurisdiction
                      </p>
                      {coreMetaGrid}
                    </div>
                    <div className="mt-7 space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Scope, payment &amp; duration
                      </p>
                      {extendedDetailsGrid}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950/[0.35]">
                    {partiesSection}
                  </div>

                  {simpleFlowPhase === "send" ? (
                    simpleSendActionsUnlocked ? (
                      <>
                        <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">Sign</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-300">
                            Add signers and reviewers below. Use the button at the bottom to send signature requests.
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            Nothing is sent until you press Sign. Optional payment stays off unless you expand it.
                            Collaborate first, send professionally, and keep proof on record.
                          </p>
                          <div className="mt-6">{recipientsBlock}</div>
                        </div>
                        {featureFlags.sendPaymentRequestsUi ? (
                          <SimplePaymentAttachCard
                            partyALabel={
                              (draft.parties || [])[0]
                                ? participantDisplayName((draft.parties || [])[0], 0)
                                : "Party A"
                            }
                            partyBLabel={
                              (draft.parties || [])[1]
                                ? participantDisplayName((draft.parties || [])[1], 1)
                                : "Party B"
                            }
                            paymentTerms={draft.payment_terms}
                            purpose={draft.purpose}
                            paymentRequired={simplePaymentRequired}
                            onPaymentRequiredChange={(v) => void persistSimplePaymentRequired(v)}
                            value={simplePayForm}
                            onChange={setSimplePayForm}
                            onPersist={() => void persistSimplePayment()}
                          />
                        ) : null}
                      </>
                    ) : simpleFlowUpsellSuppressed && !simpleHomePaidReviewLinkHandoff ? (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <p className="text-sm font-semibold text-emerald-100">{FUNNEL_PRO_ACTIVE_TITLE}</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                          {FUNNEL_PRO_ACTIVE_BODY} Add signers below, then confirm send.
                        </p>
                      </div>
                    ) : simpleFlowUpsellSuppressed && simpleHomePaidReviewLinkHandoff ? (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                          Unlock send to add recipient emails and finish your review link.
                        </p>
                        {onRequestSendUnlock ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--primary mt-5 w-full min-h-[2.75rem] px-6"
                            onClick={() => onRequestSendUnlock()}
                          >
                            {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-5 py-5">
                        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                          Sending is locked
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                          Upgrade to generate live signing links, attach payment requests, and track delivery for this
                          agreement.
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">
                          Your draft and edits stay saved. Nothing goes out until you confirm after unlocking.
                        </p>
                        {onRequestSendUnlock ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--primary mt-5 w-full min-h-[2.75rem] px-6"
                            onClick={() => onRequestSendUnlock()}
                          >
                            {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
                          </button>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </>
              )}
            </aside>
          </div>
          ) : null}

          {error ? (
            <div className="mt-8 rounded-lg border border-rose-900/35 bg-rose-950/15 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {onSimpleFlowContinue ? (
            <div
              id={isSimpleHomeReview && simpleFlowPhase === "send" ? "simple-flow-send-anchor" : undefined}
              className={`mt-12 rounded-xl border border-slate-800/60 bg-slate-950/25 px-4 py-6 sm:px-6 ${
                isSimpleHomeReview && simpleFlowPhase === "review"
                  ? "sticky bottom-0 z-20 border-t border-slate-800/80 bg-slate-950/[0.97] shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:border-slate-800/60 sm:bg-slate-950/25 sm:shadow-none sm:backdrop-blur-none"
                  : (canonicalUnpaidSendShell || sendShellTierGatePending) && simpleFlowPhase === "send"
                    ? "sticky bottom-0 z-20 border-t border-slate-800/80 bg-slate-950/[0.97] shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:border-slate-800/60 sm:bg-slate-950/25 sm:shadow-none sm:backdrop-blur-none"
                    : ""
              }`}
            >
              {sendShellTierGatePending ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-400" role="status">
                    Preparing send…
                  </p>
                  {onSimpleFlowBack ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 sm:w-auto"
                      onClick={() => onSimpleFlowBack()}
                    >
                      Back
                    </button>
                  ) : null}
                </div>
              ) : (
              <>
              <div
                className={`flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8 ${
                  premiumLawdogSimpleHome && simpleFlowPhase === "review" && requiredComplete
                    ? "sm:justify-end"
                    : "sm:justify-between"
                }`}
              >
                <div className="order-2 max-w-xl space-y-1.5 sm:order-1 lg:max-w-none">
                  {premiumLawdogSimpleHome && simpleFlowPhase === "review" && requiredComplete ? null : canonicalUnpaidSendShell &&
                    simpleFlowPhase === "send" ? (
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Nothing is sent until you confirm.
                    </p>
                  ) : (
                    <>
                      {requiredComplete &&
                      (simpleFlowPhase === "review" || simpleFlowPhase === "send") &&
                      !premiumLawdogSimpleHome ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300/90">
                          Make this official
                        </p>
                      ) : null}
                      {requiredComplete && !premiumLawdogSimpleHome ? (
                        <div className="flex flex-wrap gap-2 pb-1">
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95">
                            <span aria-hidden>✓</span> Structured
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/95">
                            <span aria-hidden>✓</span> Ready for signature
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                            <span aria-hidden>✓</span> Delivery receipt included
                          </span>
                        </div>
                      ) : null}
                      <p className="text-sm font-medium text-slate-200">
                        {simpleHomeReviewLinkSendStep
                          ? "Add recipients above, then confirm to create your private review link."
                          : agreementReadiness && isSimpleHomeReview && !premiumLawdogSimpleHome
                            ? readinessCtaHelper(agreementReadiness.level)
                            : premiumLawdogSimpleHome
                              ? simpleFlowPhase === "review"
                                ? premiumAwaitingStreamlinedFork
                                  ? "Choose Review link or Signing link at the top before you continue."
                                  : streamlinedPremiumIntentForCopy === "review"
                                    ? "Continue when you are ready to set up recipients and your review link."
                                    : streamlinedPremiumIntentForCopy === "signature"
                                      ? "Close this agreement faster with tracked e-signature and clear proof."
                                      : "Create → Review → Send."
                                : simpleSendActionsUnlocked
                                  ? premiumAwaitingStreamlinedFork
                                    ? "Choose your path at the top first, then add recipients and confirm in the send panel."
                                    : streamlinedPremiumIntentForCopy === "review"
                                      ? "Add recipients, then share your review draft link."
                                      : "Add recipients, then send your signature request."
                                  : "Upgrade to send to close faster, see signer progress, and send professionally."
                              : simpleFlowPhase === "review"
                                ? REVIEW_STRUCTURED_WIN_LINE
                                : simpleSendActionsUnlocked
                                  ? "Recipients are set below — send when you are ready."
                                  : "Unlock signing to close faster, monitor delivery, and keep proof."}
                      </p>
                      {!premiumLawdogSimpleHome ? (
                        <p className="text-xs leading-relaxed text-slate-500">
                          {simpleFlowPhase === "review"
                            ? "Editable until you confirm send. You control when this goes out."
                            : "Nothing has been sent yet. You’re in control — optional payment attaches only if you choose."}
                        </p>
                      ) : null}
                      {simpleFlowPhase === "send" && requiredComplete && simpleSendActionsUnlocked && !premiumLawdogSimpleHome ? (
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          Takes about 10 seconds to send. No commitment until signed.
                        </p>
                      ) : null}
                      {!premiumLawdogSimpleHome ? (
                        <p className="text-[10px] leading-relaxed text-slate-600">{NOT_LEGAL_ADVICE}</p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="order-1 flex min-w-0 flex-1 flex-col gap-3 sm:order-2 sm:max-w-xl sm:items-end lg:max-w-none">
                  {!requiredComplete ? (
                    <p className="text-xs leading-snug text-slate-400 sm:text-right" role="status">
                      {premiumLawdogSimpleHome ? (
                        <>Complete required fields, then continue.</>
                      ) : (
                        <>
                          Complete the items in <span className="font-medium text-slate-200">Key terms</span> and{" "}
                          <span className="font-medium text-slate-200">Who&apos;s in this agreement</span> first.
                        </>
                      )}
                    </p>
                  ) : null}
                  <div className="flex w-full flex-col items-stretch gap-3 sm:items-end">
                    {simpleFlowPhase === "review" || !requiredComplete ? (
                      <>
                        {isSimpleHomeReview && simpleFlowPhase === "review" && requiredComplete && !premiumLawdogSimpleHome ? (
                          <p
                            className="w-full text-center text-xs font-medium leading-snug text-slate-300 sm:text-right"
                            role="status"
                          >
                            You&apos;re about to send this for signature — nothing goes out without confirmation.
                          </p>
                        ) : null}
                        {isSimpleHomeReview &&
                        simpleFlowPhase === "review" &&
                        requiredComplete &&
                        premiumLawdogSimpleHome &&
                        streamlinedPremiumIntentForCopy === "signature" ? (
                          <p
                            className="w-full text-center text-xs font-medium leading-snug text-slate-300 sm:text-right"
                            role="status"
                          >
                            You&apos;re moving toward tracked e-sign — nothing sends without your confirmation.
                          </p>
                        ) : null}
                        {premiumLawdogSimpleHome && simpleFlowPhase === "review" && requiredComplete ? (
                          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                              type="button"
                              className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 sm:w-auto"
                              disabled={!onBackToNew}
                              onClick={() => onBackToNew?.()}
                            >
                              Edit Draft
                            </button>
                            <button
                              type="button"
                              className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 py-3 shadow-md shadow-emerald-950/35 ring-1 ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                              disabled={!requiredComplete || premiumAwaitingStreamlinedFork}
                              onClick={() => {
                                if (economicsOverlay?.free_draft_expired) {
                                  logProductEvent("draft_expired", { agreementId, surface: "simple_flow" });
                                  triggerPaywall({ agreementId, reason: "draft_expired" });
                                  return;
                                }
                                if (
                                  simpleFlowPhase === "review" &&
                                  requiredComplete &&
                                  economicsOverlay?.watermark_required &&
                                  !simpleFlowUpsellSuppressed &&
                                  draft &&
                                  !bypassSimpleHomeWatermarkSendGate(draft, economicsOverlay)
                                ) {
                                  setWatermarkSendModalOpen(true);
                                  return;
                                }
                                if (agreementReadiness) {
                                  logProductEvent("readiness_continue_clicked", {
                                    level: agreementReadiness.level,
                                    missingSignalsCount: agreementReadiness.missingSignals.length,
                                    surface: "simple_home_review",
                                    route: simpleFlowPhase,
                                  });
                                }
                                void Promise.resolve(onSimpleFlowContinue?.());
                              }}
                            >
                              {simpleFlowReviewPrimaryCtaLabel ?? "Send"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="vs01-btn vs01-btn--primary order-1 w-full min-h-[2.75rem] px-6 py-3 shadow-md shadow-emerald-950/35 ring-1 ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                              disabled={!requiredComplete}
                              onClick={() => {
                                if (economicsOverlay?.free_draft_expired) {
                                  logProductEvent("draft_expired", { agreementId, surface: "simple_flow" });
                                  triggerPaywall({ agreementId, reason: "draft_expired" });
                                  return;
                                }
                                if (
                                  simpleFlowPhase === "review" &&
                                  requiredComplete &&
                                  economicsOverlay?.watermark_required &&
                                  !simpleFlowUpsellSuppressed &&
                                  draft &&
                                  !bypassSimpleHomeWatermarkSendGate(draft, economicsOverlay)
                                ) {
                                  setWatermarkSendModalOpen(true);
                                  return;
                                }
                                if (agreementReadiness) {
                                  logProductEvent("readiness_continue_clicked", {
                                    level: agreementReadiness.level,
                                    missingSignalsCount: agreementReadiness.missingSignals.length,
                                    surface: "simple_home_review",
                                    route: simpleFlowPhase,
                                  });
                                }
                                void Promise.resolve(onSimpleFlowContinue?.());
                              }}
                            >
                              {!requiredComplete
                                ? "Next"
                                : simpleFlowReviewPrimaryCtaLabel ?? "Send"}
                            </button>
                            {isSimpleHomeReview && simpleFlowPhase === "review" && requiredComplete ? (
                              <button
                                type="button"
                                className="vs01-btn vs01-btn--secondary order-2 w-full min-h-[2.75rem] px-6 sm:w-auto"
                                onClick={() =>
                                  document
                                    .getElementById("simple-flow-draft-details")
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                                }
                              >
                                Edit details
                              </button>
                            ) : null}
                          </>
                        )}
                      </>
                    ) : canonicalUnpaidSendShell && simpleFlowPhase === "send" ? (
                      <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                        {onSimpleFlowBack ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6 sm:w-auto"
                            onClick={() => onSimpleFlowBack()}
                          >
                            Back
                          </button>
                        ) : null}
                      </div>
                    ) : simpleFlowPhase === "send" && !simpleSendActionsUnlocked && !simpleFlowUpsellSuppressed ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 sm:w-auto"
                        disabled={!onRequestSendUnlock}
                        onClick={() => onRequestSendUnlock?.()}
                      >
                        {simpleFlowUnlockCtaLabel ?? "Unlock signing"}
                      </button>
                    ) : simplePaymentRequired ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                        disabled={
                          simpleFlowAdvanceBusy ||
                          !simplePayForm.amount.trim() ||
                          savingField === "payment_request" ||
                          savingField === "payment_required"
                        }
                        onClick={() => void handleSimpleSendWithPayment()}
                      >
                        Send &amp; Request Payment
                      </button>
                    ) : premiumLawdogSimpleHome && simpleFlowPhase === "send" && simpleSendActionsUnlocked ? (
                      simpleHomeReviewLinkSendStep ? null : (
                        <p className="w-full text-center text-xs leading-relaxed text-slate-500 sm:text-right sm:max-w-md">
                          {premiumAwaitingStreamlinedFork
                            ? "Choose your premium path at the top of the page, then confirm send in the panel above."
                            : streamlinedPremiumIntentForCopy === "review"
                              ? "Confirm send in the panel above — collaboration stays first on this path."
                              : "Confirm send in the panel above — signature delivery stays first on this path."}
                        </p>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                          disabled={
                            simpleFlowAdvanceBusy ||
                            !simplePayForm.amount.trim() ||
                            savingField === "payment_request" ||
                            savingField === "payment_required"
                          }
                          onClick={() => void handleSimpleSendWithPayment()}
                        >
                          Send &amp; Request Payment
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
                          disabled={
                            Boolean(savingField) ||
                            simpleFlowAdvanceBusy ||
                            (isSimpleHomeReview && simpleFlowPhase === "send" && recipientGateBlocksSend)
                          }
                          onClick={() => void handleSimpleSendWithoutPayment()}
                        >
                          {isSimpleHomeReview && simpleFlowPhase === "send"
                            ? sendInviteReadyCount === 1
                              ? "Send 1 invite now"
                              : sendInviteReadyCount > 1
                                ? `Send ${sendInviteReadyCount} invites now`
                                : "Send without payment"
                            : "Send without payment"}
                        </button>
                        {isSimpleHomeReview &&
                        simpleFlowPhase === "send" &&
                        sendInviteTotalSlots > 1 &&
                        sendInviteReadyCount < sendInviteTotalSlots ? (
                          <button
                            type="button"
                            className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
                            onClick={() => scrollToFirstIncompleteSignerEmail(draft?.parties)}
                          >
                            {sendInviteTotalSlots === 2
                              ? "Add second signer email"
                              : "Add another signer email"}
                          </button>
                        ) : null}
                      </>
                    )}
                    {simpleFlowPhase === "send" &&
                    requiredComplete &&
                    simpleSendActionsUnlocked &&
                    !premiumLawdogSimpleHome &&
                    !canonicalUnpaidSendShell &&
                    !sendShellTierGatePending ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
                        onClick={() => {
                          void (async () => {
                            try {
                              await navigator.clipboard.writeText(reviewUrl);
                              trackAgreementFunnelEvent("review_link_created", { surface: "simple_send_strip" }, { planTier: String(access.tier), agreementId });
                            } catch {
                              /* ignore */
                            }
                          })();
                        }}
                      >
                        Copy review link
                      </button>
                    ) : null}
                    {simpleFlowPhase === "send" && requiredComplete ? (
                      simpleHomeReviewLinkSendStep ? null : (
                        <p className="w-full text-center text-[11px] leading-relaxed text-slate-500 sm:text-right">
                          {canonicalUnpaidSendShell
                            ? "Nothing is sent until you confirm."
                            : isSimpleHomeReview
                              ? sendInviteReadyCount >= 1
                                ? premiumAwaitingStreamlinedFork
                                  ? "Choose your path at the top first, then confirm in the send panel above."
                                  : premiumLawdogSimpleHome && streamlinedPremiumIntentForCopy === "review"
                                    ? "Nothing is delivered until you tap send — review drafts stay on your LawDog path."
                                    : premiumLawdogSimpleHome && streamlinedPremiumIntentForCopy === "signature"
                                      ? "Nothing is sent until you confirm tracked signature in the panel above."
                                      : "Nothing is sent until you tap the send button above."
                                : "Add at least one signer email and mobile number to send."
                              : premiumLawdogSimpleHome && streamlinedPremiumIntentForCopy === "review"
                                ? "Nothing is delivered until you confirm — collaboration stays first on this path."
                                : premiumLawdogSimpleHome && streamlinedPremiumIntentForCopy === "signature"
                                  ? "Nothing is sent until you confirm tracked signature in the panel above."
                                  : "Nothing is sent until you press Send."}
                        </p>
                      )
                    ) : null}
                    <div
                      className={`flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs font-medium ${
                        isSimpleHomeReview && simpleFlowPhase === "review" && requiredComplete
                          ? "mt-1 w-full border-t border-slate-800/50 pt-3 text-[11px] text-slate-600"
                          : ""
                      }`}
                    >
                      {onBackToNew ? (
                        <button
                          type="button"
                          className={`underline-offset-4 hover:underline ${
                            isSimpleHomeReview && simpleFlowPhase === "review" && requiredComplete
                              ? "font-normal text-slate-600 hover:text-slate-400"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                          onClick={onBackToNew}
                        >
                          Edit description
                        </button>
                      ) : null}
                      {onSimpleFlowBack ? (
                        <button
                          type="button"
                          className={
                            isSimpleHomeReview && simpleFlowPhase === "review" && requiredComplete
                              ? "rounded-md border border-slate-800/80 bg-transparent px-2.5 py-1 text-[11px] font-normal text-slate-500 hover:border-slate-700 hover:text-slate-400"
                              : "vs01-btn vs01-btn--secondary vs01-btn--compact"
                          }
                          onClick={() => onSimpleFlowBack()}
                        >
                          Back
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          ) : null}

          <div className="mt-10">
            <ClawTrustFooter agreementId={draft.id} className="opacity-75" />
          </div>
        </section>
        {watermarkSendModalOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wm-send-title"
          >
            <div className="max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
              {draft && bypassSimpleHomeWatermarkSendGate(draft, economicsOverlay) ? (
                <>
                  <h2 id="wm-send-title" className="text-lg font-semibold leading-snug text-slate-100">
                    {simpleFlowPremiumHandoffIntent === "review" ? "Create review link?" : PAYWALL_PAID_READY_HEADLINE}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {simpleFlowPremiumHandoffIntent === "review"
                      ? "This creates a private link for the reviewer to suggest changes. Nothing is signed."
                      : PAYWALL_PAID_READY_SUB_SIGNATURE}
                  </p>
                  {simpleFlowPremiumHandoffIntent === "signature" ? (
                    <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-left text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500/40"
                        checked={watermarkModalSignFirst}
                        onChange={(e) => setWatermarkModalSignFirst(e.target.checked)}
                      />
                      <span>
                        <span className="font-medium text-slate-100">I&apos;ll sign first</span>
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          Sign your copy before the other party receives their signing link.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      className="w-full min-h-[2.65rem] rounded-xl border-2 border-emerald-500/55 bg-gradient-to-b from-emerald-950/40 to-slate-950/70 px-6 text-sm font-semibold text-emerald-100 shadow-[0_4px_18px_rgba(16,185,129,0.12)] transition hover:border-emerald-400/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                      onClick={() => {
                        void (async () => {
                          writePremiumSenderSignFirst(
                            simpleFlowPremiumHandoffIntent === "signature" && watermarkModalSignFirst,
                          );
                          setWatermarkSendModalOpen(false);
                          await Promise.resolve(onSimpleFlowContinue?.());
                        })();
                      }}
                    >
                      {simpleFlowPremiumHandoffIntent === "review" ? "Create review link" : PAYWALL_PAID_READY_CTA}
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary w-full"
                      onClick={() => setWatermarkSendModalOpen(false)}
                    >
                      Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 id="wm-send-title" className="text-lg font-semibold leading-snug text-slate-100">
                    {PAYWALL_DEFAULT_HEADLINE}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{PAYWALL_DEFAULT_SUB}</p>
                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      className="w-full min-h-[2.65rem] rounded-xl border-2 border-emerald-500/55 bg-gradient-to-b from-emerald-950/40 to-slate-950/70 px-6 text-sm font-semibold text-emerald-100 shadow-[0_4px_18px_rgba(16,185,129,0.12)] transition hover:border-emerald-400/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                      onClick={() => {
                        setWatermarkSendModalOpen(false);
                        triggerPaywall({ agreementId, reason: "watermark_upgrade" });
                      }}
                    >
                      {FUNNEL_CTA_SEND_WITH_PRO}
                    </button>
                    <button
                      type="button"
                      className="w-full min-h-[2.75rem] rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-6 text-sm font-semibold text-slate-950 shadow-[0_4px_22px_rgba(245,158,11,0.3)] transition hover:from-amber-300 hover:to-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/90 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                      onClick={() => {
                        void (async () => {
                          setWatermarkSendModalOpen(false);
                          await Promise.resolve(onSimpleFlowContinue?.());
                        })();
                      }}
                    >
                      Continue with draft version
                    </button>
                    <p className="text-center text-[11px] leading-relaxed text-slate-500">{CONVERSION_GUARANTEE_INLINE}</p>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary w-full"
                      onClick={() => setWatermarkSendModalOpen(false)}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
        {simpleReviewLinkConfirmModalOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="simple-review-link-confirm-title"
          >
            <div className="max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
              <h2 id="simple-review-link-confirm-title" className="text-lg font-semibold leading-snug text-slate-100">
                Create review link?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                This creates a private link for the reviewer to suggest changes. Nothing is signed.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  className="w-full min-h-[2.65rem] rounded-xl border-2 border-emerald-500/55 bg-gradient-to-b from-emerald-950/40 to-slate-950/70 px-6 text-sm font-semibold text-emerald-100 shadow-[0_4px_18px_rgba(16,185,129,0.12)] transition hover:border-emerald-400/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  onClick={() => {
                    setSimpleReviewLinkConfirmModalOpen(false);
                    void handleSimpleSendWithoutPayment();
                  }}
                >
                  Create review link
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary w-full"
                  onClick={() => setSimpleReviewLinkConfirmModalOpen(false)}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {governingLawModalOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gov-law-title"
          >
            <div className="max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
              <h2 id="gov-law-title" className="text-lg font-semibold leading-snug text-slate-100">
                Governing law
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Pick the state whose laws govern this agreement. We&apos;ll save it and refresh your preview.
              </p>
              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="gov-law-select">
                Jurisdiction
              </label>
              <select
                id="gov-law-select"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100"
                value={governingLawSelect}
                onChange={(e) => setGoverningLawSelect(e.target.value)}
              >
                {sortedUsJurisdictionNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mt-2 text-left text-xs font-semibold text-emerald-300/95 underline decoration-emerald-500/45 underline-offset-2 hover:text-emerald-200"
                onClick={() => setGoverningLawSelect(LEGAL_GOVERNING_LAW_STATE)}
              >
                Use suggested: {LEGAL_GOVERNING_LAW_STATE}
              </button>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
                  disabled={governingLawSaveBusy}
                  onClick={() => setGoverningLawModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="vs01-btn vs01-btn--primary w-full sm:w-auto"
                  disabled={governingLawSaveBusy || !governingLawSelect.trim()}
                  onClick={() => {
                    void (async () => {
                      setGoverningLawSaveBusy(true);
                      try {
                        await saveField("jurisdiction", governingLawSelect.trim());
                        setGoverningLawModalOpen(false);
                      } finally {
                        setGoverningLawSaveBusy(false);
                      }
                    })();
                  }}
                >
                  {governingLawSaveBusy ? "Saving…" : "Save and regenerate clause"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {executionPacketOpen && executionPacketForView ? (
          <ExecutionPacketView packet={executionPacketForView} onClose={() => setExecutionPacketOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <section className={outerClass}>
        {headerBlock}
        {workspaceStateBannerEl}
        {show("details") ? detailsStepBlock : null}
        {show("draft") ? draftBlock : null}
        {show("recipients") ? recipientsBlock : null}
        {show("finalize") ? finalizeBlock : null}
        {error && <div className="text-xs text-rose-300">{error}</div>}
        <ClawTrustFooter agreementId={draft.id} />
      </section>
      {executionPacketOpen && executionPacketForView ? (
        <ExecutionPacketView packet={executionPacketForView} onClose={() => setExecutionPacketOpen(false)} />
      ) : null}
    </>
  );
};

const PartyRow: React.FC<{
  index: number;
  party: Party;
  disabled?: boolean;
  workspace?: boolean;
  /** Stronger name vs role hierarchy (simple home review). */
  emphasizeHierarchy?: boolean;
  /** Simple home: save on blur, no Update button. */
  inlineAutosave?: boolean;
  onSave: (party: Party) => void;
}> = ({
  index,
  party,
  onSave,
  disabled,
  workspace = false,
  emphasizeHierarchy = false,
  inlineAutosave = false,
}) => {
  const [name, setName] = useState(party.name || "");
  const [role, setRole] = useState(party.role || "party");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(party.name || "");
    setRole(party.role || "party");
  }, [party.name, party.role]);

  const flushIfChanged = () => {
    if (disabled) return;
    const nn = name.trim();
    const rr = role.trim() || "party";
    const pn = (party.name || "").trim();
    const pr = (party.role || "party").trim();
    if (nn === pn && rr === pr) return;
    onSave({ ...party, name: nn, role: rr });
  };

  const shell =
    workspace && emphasizeHierarchy
      ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
      : workspace
        ? "grid gap-3 rounded-lg border border-slate-800/90 bg-slate-950/20 p-3 md:grid-cols-[1fr_1fr_auto]"
        : "grid gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 md:grid-cols-[1fr_1fr_auto]";
  const nameCls = workspace
    ? emphasizeHierarchy
      ? "min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-50 placeholder:text-slate-600"
      : "rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
    : "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs";
  const roleCls = workspace
    ? emphasizeHierarchy
      ? "w-full shrink-0 rounded-full border border-slate-600 bg-slate-900/90 px-4 py-2 text-sm font-medium text-slate-200 placeholder:text-slate-600 sm:w-[12rem]"
      : "rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
    : "rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs";

  const showUpdateBtn = workspace && !inlineAutosave;

  return (
    <div className={shell}>
      <input
        ref={nameInputRef}
        className={nameCls}
        value={name}
        placeholder={workspace ? `Name ${index + 1}` : `Party ${index + 1} name`}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (inlineAutosave) flushIfChanged();
        }}
      />
      <input
        className={roleCls}
        value={role}
        placeholder={workspace ? "Role (e.g. Client)" : "Role"}
        disabled={disabled}
        onChange={(e) => setRole(e.target.value)}
        onBlur={() => {
          if (inlineAutosave) flushIfChanged();
        }}
      />
      {emphasizeHierarchy && inlineAutosave ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-600/80 bg-slate-900/40 p-2.5 text-slate-400 hover:border-slate-500 hover:text-slate-200 sm:self-center"
          disabled={disabled}
          aria-label="Edit name"
          onClick={() => nameInputRef.current?.focus()}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
      ) : null}
      {showUpdateBtn ? (
        <button
          type="button"
          className={
            emphasizeHierarchy
              ? "btn shrink-0 rounded-md border border-slate-600 bg-transparent px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/60 sm:self-center"
              : "btn self-end rounded-md border border-slate-600 bg-transparent px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/60"
          }
          disabled={disabled}
          onClick={() => onSave({ ...party, name: name.trim(), role: role.trim() || "party" })}
        >
          Update
        </button>
      ) : !workspace ? (
        <button
          type="button"
          className="btn text-xs"
          disabled={disabled}
          onClick={() => onSave({ ...party, name: name.trim(), role: role.trim() || "party" })}
        >
          Save
        </button>
      ) : null}
    </div>
  );
};

const CONTACT_INPUT_ERR =
  "border-red-500 bg-rose-950/40 ring-2 ring-red-500/85 ring-offset-0 ring-offset-transparent";
const CONTACT_INPUT_OK = "border-slate-600 bg-slate-900";

const RecipientWorkflowRow: React.FC<{
  index: number;
  party: Party;
  disabled?: boolean;
  variant?: "default" | "workspace";
  accentName?: boolean;
  collectContact?: boolean;
  contactValidateAttempted?: boolean;
  contactFieldErrors?: Record<string, string>;
  contactValidationSeq?: number;
  shakeContactFieldKey?: string | null;
  contactWayfindLabel?: string | null;
  onRelieveContactFieldError?: (index: number, field: "name" | "email" | "phone") => void;
  onSave: (party: Party) => void;
}> = ({
  index,
  party,
  disabled,
  variant = "default",
  accentName = false,
  collectContact = false,
  contactValidateAttempted = false,
  contactFieldErrors = {},
  contactValidationSeq = 0,
  shakeContactFieldKey = null,
  contactWayfindLabel = null,
  onRelieveContactFieldError,
  onSave: onSaveParty,
}) => {
  const [name, setName] = useState(party.name || "");
  const [role, setRole] = useState(normalizeWorkflowRole(party.role));
  const [email, setEmail] = useState((party.email || "").trim());
  const [phone, setPhone] = useState((party.phone || "").trim());
  const [typingBorderClear, setTypingBorderClear] = useState({
    name: false,
    email: false,
    phone: false,
  });

  useEffect(() => {
    setName(party.name || "");
    setRole(normalizeWorkflowRole(party.role));
    setEmail((party.email || "").trim());
    setPhone((party.phone || "").trim());
  }, [party.name, party.role, party.email, party.phone]);

  useEffect(() => {
    setTypingBorderClear({ name: false, email: false, phone: false });
  }, [contactValidationSeq]);

  const pushParty = (n: string, r: string, em: string, ph: string) => {
    if (disabled) return;
    const id = party.id?.trim();
    const next: Party = {
      name: n.trim(),
      role: r.trim() || "counterparty",
      ...(id ? { id } : {}),
    };
    if (collectContact) {
      next.email = em.trim();
      next.phone = ph.trim();
    }
    onSaveParty(next);
  };

  const persistCore = (n: string, r: string) => {
    if (disabled) return;
    if (collectContact) pushParty(n, r, email, phone);
    else {
      const id = party.id?.trim();
      onSaveParty({
        name: n.trim(),
        role: r.trim() || "counterparty",
        ...(id ? { id } : {}),
      });
    }
  };

  const nameKey = `${index}-name`;
  const emailKey = `${index}-email`;
  const phoneKey = `${index}-phone`;
  const nameErr = contactValidateAttempted ? contactFieldErrors[nameKey] : "";
  const emailErr = contactValidateAttempted ? contactFieldErrors[emailKey] : "";
  const phoneErr = contactValidateAttempted ? contactFieldErrors[phoneKey] : "";
  const showContact = collectContact && recipientRoleNeedsContactInfo(role);
  const rowHasErr = Boolean(nameErr || emailErr || phoneErr);
  const nameErrId = `party-err-${nameKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const emailErrId = `party-err-${emailKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const phoneErrId = `party-err-${phoneKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const showNameBorder = Boolean(nameErr) && !typingBorderClear.name;
  const showEmailBorder = Boolean(emailErr) && !typingBorderClear.email;
  const showPhoneBorder = Boolean(phoneErr) && !typingBorderClear.phone;

  const relieve = (field: "name" | "email" | "phone") => {
    if (contactValidateAttempted) onRelieveContactFieldError?.(index, field);
  };

  if (variant === "workspace") {
    const shellBorder =
      contactValidateAttempted && rowHasErr
        ? "border-red-500/55 bg-rose-950/25"
        : "border-slate-800/80 bg-slate-950/25";

    return (
      <div
        data-signer-contact-row={String(index)}
        className={
          accentName
            ? `relative z-0 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4 ${shellBorder}`
            : `grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_min(12rem,100%)] ${shellBorder}`
        }
      >
        {contactWayfindLabel ? (
          <div
            className={
              accentName
                ? "w-full basis-full text-[12px] font-medium leading-snug text-rose-100/95"
                : "col-span-full text-[12px] font-medium leading-snug text-rose-100/95"
            }
            role="status"
          >
            {contactWayfindLabel}
          </div>
        ) : null}
        <div className={accentName ? "min-w-0 flex-1 space-y-1 sm:min-w-[10rem]" : "min-w-0 space-y-1"}>
          <input
            data-party-contact={nameKey}
            id={`party-inp-${nameKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            aria-label={`Name for person ${index + 1}`}
            aria-invalid={Boolean(nameErr)}
            aria-describedby={nameErr ? nameErrId : undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm text-slate-100 outline-none transition-[box-shadow,background-color,border-color] duration-150 ${
              showNameBorder ? CONTACT_INPUT_ERR : CONTACT_INPUT_OK
            } ${shakeContactFieldKey === nameKey ? "claw-field-error-shake" : ""} ${
              accentName ? "font-semibold text-slate-50" : ""
            }`}
            value={name}
            placeholder={`Person ${index + 1}`}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              if (nameErr) setTypingBorderClear((m) => ({ ...m, name: true }));
              if (contactValidateAttempted && v.trim()) relieve("name");
            }}
            onBlur={() => {
              const nn = name.trim();
              const pr = party.name || "";
              if (nn !== pr.trim() || role !== normalizeWorkflowRole(party.role)) {
                persistCore(name, role);
              } else if (collectContact && showContact) {
                pushParty(name, role, email, phone);
              }
            }}
          />
          {nameErr ? (
            <p id={nameErrId} className="text-[11px] leading-snug text-rose-200">
              {nameErr}
            </p>
          ) : null}
        </div>
        <select
          className={`relative z-20 w-full shrink-0 rounded-full border border-slate-600 bg-slate-900/95 px-4 py-2 text-sm shadow-sm shadow-black/20 sm:mt-0 sm:w-[12rem] sm:self-center ${
            accentName ? "font-medium text-slate-200" : "text-slate-100"
          }`}
          value={role}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setRole(v);
            persistCore(name, v);
          }}
        >
          {WORKFLOW_ROLE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        {showContact ? (
          <div
            className={
              accentName
                ? "grid w-full basis-full grid-cols-1 gap-3 sm:grid-cols-2"
                : "col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2"
            }
          >
            <div className="space-y-1">
              <label
                className="text-[10px] font-medium uppercase tracking-wide text-slate-500"
                htmlFor={`party-inp-${emailKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
              >
                Email
              </label>
              <input
                type="email"
                data-party-contact={emailKey}
                id={`party-inp-${emailKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                autoComplete="email"
                aria-invalid={Boolean(emailErr)}
                aria-describedby={emailErr ? emailErrId : undefined}
                className={`w-full rounded-md border px-3 py-2 text-sm text-slate-100 outline-none transition-[box-shadow,background-color,border-color] duration-150 ${
                  showEmailBorder ? CONTACT_INPUT_ERR : CONTACT_INPUT_OK
                } ${shakeContactFieldKey === emailKey ? "claw-field-error-shake" : ""}`}
                value={email}
                placeholder="name@example.com"
                disabled={disabled}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmail(v);
                  if (emailErr) setTypingBorderClear((m) => ({ ...m, email: true }));
                  const t = v.trim();
                  if (contactValidateAttempted && t && SIMPLE_SEND_EMAIL_RE.test(t)) relieve("email");
                }}
                onBlur={() => pushParty(name, role, email, phone)}
              />
              {emailErr ? (
                <p id={emailErrId} className="text-[11px] leading-snug text-rose-200">
                  {emailErr}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <label
                className="text-[10px] font-medium uppercase tracking-wide text-slate-500"
                htmlFor={`party-inp-${phoneKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
              >
                Phone
              </label>
              <input
                type="tel"
                data-party-contact={phoneKey}
                id={`party-inp-${phoneKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                autoComplete="tel"
                aria-invalid={Boolean(phoneErr)}
                aria-describedby={phoneErr ? phoneErrId : undefined}
                className={`w-full rounded-md border px-3 py-2 text-sm text-slate-100 outline-none transition-[box-shadow,background-color,border-color] duration-150 ${
                  showPhoneBorder ? CONTACT_INPUT_ERR : CONTACT_INPUT_OK
                } ${shakeContactFieldKey === phoneKey ? "claw-field-error-shake" : ""}`}
                value={phone}
                placeholder="Mobile or best number"
                disabled={disabled}
                onChange={(e) => {
                  const v = e.target.value;
                  setPhone(v);
                  if (phoneErr) setTypingBorderClear((m) => ({ ...m, phone: true }));
                  const digits = v.replace(/\D/g, "");
                  if (contactValidateAttempted && digits.length >= 10) relieve("phone");
                }}
                onBlur={() => pushParty(name, role, email, phone)}
              />
              {phoneErr ? (
                <p id={phoneErrId} className="text-[11px] leading-snug text-rose-200">
                  {phoneErr}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 md:grid-cols-[1fr_1fr_auto]">
      <input
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
        value={name}
        placeholder={`Recipient ${index + 1} name`}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      >
        {WORKFLOW_ROLE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn text-xs"
        disabled={disabled}
        onClick={() => persistCore(name, role)}
      >
        Save
      </button>
    </div>
  );
};

export default AgreementReview;
