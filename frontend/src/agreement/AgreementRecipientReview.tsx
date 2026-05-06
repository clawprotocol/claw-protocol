import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { draftExcerptForClause, htmlToPlainText, htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import {
  agreementFieldLabel,
  compareAgreementSnapshots,
} from "../vs01/agreementCompare";
import {
  assessRecipientPreviewDiff,
  buildRecipientClauseCards,
  extractPauseRequestPhrase,
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
  snippetAroundPaymentTerms,
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
  postSigningCeremonyComplete,
  postSigningCeremonyStart,
  recipientApproveCurrentApi,
  submitRecipientProposalApi,
} from "./agreementWorkspaceApi";
import {
  isAgreementMarkedSignedInAudit,
  isParticipantSignatureComplete,
  pendingSignatureCount,
} from "./pendingSignatureDerive";
import { normalizeAgreementDraftFromApi } from "./agreementDraftNormalize";
import { substitutePartyPlaceholdersInUserFacingText } from "./partyPlaceholderDisplay";
import { findOpenRecipientProposals } from "./recipientProposal";
import {
  DEFAULT_NEGOTIATION_POSTURE,
  NEGOTIATION_POSTURE_OPTIONS,
  recipientPostureInstructionPreamble,
  type NegotiationPosture,
} from "./negotiationPostures";
import type { NegotiationRiskTier } from "./negotiationRisk";
import { useAccess } from "../access/AccessContext";
import { buildAgreementSocialSummary } from "./agreementSharing";
import { ClawTrustFooter } from "../components/claw/ClawTrustFooter";
import { type ProofBadgeState, ProofBadge } from "../components/claw/ProofBadge";
import { LawdogOnRecordStamp } from "../components/ui/LawdogOnRecordStamp";
import { CANONICAL_PROOF_SENTENCE, JOY_COPY } from "../joy/clawJoyCopy";
import { JoyMilestoneMark } from "../joy/JoyMilestone";
import { emitActionCompleted } from "../joy/joyTelemetry";
import { errorMessageFromResponse, resolveApiBase } from "../lib/clawApi";
import { trackAgreementFunnelEvent } from "../tracking/agreementFunnelAnalytics";
import { recipientAgreementReadHeaders } from "./recipientAccessApi";
import { postProRedlineReviewerSuggestion } from "./proRedlineReviewApi";
import { isPaidProAgreementAuthoritative } from "../components/agreements/paidProAgreementAuthority";
import { DirectComparePanel } from "./DirectComparePanel";
import { cloneDraftForRecipientPreview } from "./recipientPreviewBaseline";
import {
  PORTABLE_REVIEW_OCR_FOOTNOTE,
  PORTABLE_REVIEW_PASTE_LABEL,
  PORTABLE_REVIEW_PASTE_PLACEHOLDER,
  PORTABLE_REVIEW_SUB,
  buildRecipientRevisionText,
} from "./portableReviewCopy";
import {
  MODE_PASTE_REVISED_DRAFT,
  MODE_SUGGEST_PLAIN_ENGLISH,
  MODE_UPLOAD_FILE,
  PASTE_OPTIONAL_NOTE_LABEL,
  PLAIN_ENGLISH_FIELD_LABEL,
  UPLOAD_FILE_COMPARISON_COMING_SOON,
} from "./universalReviewIntakeCopy";

const API_BASE = resolveApiBase();

function recipientIntentAppliedExplanation(category: RecipientInstructionIntentCategory): string {
  switch (category) {
    case "payment_timing":
      return "Updates when payment is due.";
    case "suspend_pause_work":
      return "Adds a pause if payment is over 15 days late.";
    default:
      return "Shown in the preview below.";
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

function recipientTrustCueStrip() {
  const cues = [
    "Mobile-friendly",
    "Secure e-signing",
    "Nothing changes until both sides confirm",
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Trust cues">
      {cues.map((t) => (
        <li
          key={t}
          className="rounded-full border border-slate-700/80 bg-slate-950/35 px-2.5 py-1 text-[10px] font-medium text-slate-300"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

function recipientAgreementSummaryCard(props: {
  agreementType: string;
  sender: string;
  partiesLine: string;
  nextStep: string;
}) {
  const row = (label: string, value: string) => (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="mt-4 rounded-lg border border-slate-700/70 bg-slate-950/35 px-3 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {row("Agreement type", props.agreementType)}
        {row("Sender", props.sender)}
        {row("Parties", props.partiesLine)}
        {row("Next step", props.nextStep)}
      </div>
    </div>
  );
}

function formatPartiesLine(parties: AgreementDraft["parties"], maxNames = 4): string {
  const names = (parties || [])
    .map((p) => (p.name || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "—";
  const shown = names.slice(0, maxNames);
  const extra = names.length > maxNames ? ` +${names.length - maxNames}` : "";
  return `${shown.join(", ")}${extra}`;
}

export type AgreementRecipientEntry =
  | { kind: "review"; accessGate?: { lockedVersionId: string } }
  | { kind: "sign"; lockedVersionId: string; accessGate?: { lockedVersionId: string } };

export type RecipientLinkRole = "signer" | "reviewer" | "counterparty";

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
  /** Minted link token for scoped draft GET/render (session also checked). */
  recipientAccessToken?: string;
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
};

/** Stable copy for tests and recipient Pro redline submit success. */
export const PRO_REDLINE_REVIEWER_SUGGEST_SUCCESS_COPY =
  "Suggestion sent. The agreement owner chooses what to accept.";

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
}: Props) {
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [renderedHtml, setRenderedHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [flowPhase, setFlowPhase] = useState<"landing" | "active" | "declined">("landing");
  const [workspaceTab, setWorkspaceTab] = useState<"read" | "revise">("read");
  const [approving, setApproving] = useState(false);
  const [approvedAck, setApprovedAck] = useState(false);
  const [bundle, setBundle] = useState<AgreementVersionBundle | null>(null);
  const [externalAiPaste, setExternalAiPaste] = useState("");
  const [copyDraftFlash, setCopyDraftFlash] = useState(false);
  const [copyClauseFlash, setCopyClauseFlash] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreview | null>(null);
  const [sendSuggestedEditsModalOpen, setSendSuggestedEditsModalOpen] = useState(false);
  const [recipientSuggestedEditsSentAck, setRecipientSuggestedEditsSentAck] = useState(false);
  const recipientRedlineViewModelLogKeyRef = useRef<string>("");
  const recipientRedlineSourceLogKeyRef = useRef<string>("");
  const [recipientPosture, setRecipientPosture] =
    useState<NegotiationPosture>(DEFAULT_NEGOTIATION_POSTURE);
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const [reviseTextMode, setReviseTextMode] = useState<"assisted" | "direct">("assisted");
  const [universalIntakeMode, setUniversalIntakeMode] = useState<"plain" | "paste">("plain");
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
  /** Scroll target when reviewer opens “Suggest changes”. */
  const recipientSuggestPanelRef = useRef<HTMLDivElement>(null);
  const access = useAccess();

  const scrollAndFocusSuggestPanel = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const root = recipientSuggestPanelRef.current;
        root?.scrollIntoView({ behavior: "smooth", block: "start" });
        const first =
          root?.querySelector<HTMLElement>(
            "#recipient-revision-input, #recipient-external-ai-paste, #pro-redline-recipient-suggest",
          ) ?? null;
        first?.focus({ preventScroll: true });
      }, 16);
    });
  }, []);

  useEffect(() => {
    reviewerViewLoggedRef.current = false;
  }, [agreementId]);

  useEffect(() => {
    if (entry.kind !== "review" || recipientLinkRole !== "reviewer") return;
    if (!recipientAccessToken.trim()) return;
    if (reviewerViewLoggedRef.current) return;
    reviewerViewLoggedRef.current = true;
    // eslint-disable-next-line no-console
    console.info("[reviewer-view-visible]", { agreementId, mode: "reviewer" as const });
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
  const participantPid = (participantPartyId || "").trim();
  const needsPersonalizedLink = Boolean(partiesHaveIds && entry.kind === "review" && !participantPid);
  const myPendingProposals = useMemo(() => {
    if (!partiesHaveIds) return allOpenProposals;
    if (!participantPid) return [];
    return allOpenProposals.filter((p) => String(p.proposer_id || "").trim() === participantPid);
  }, [allOpenProposals, partiesHaveIds, participantPid]);
  const hasPendingSuggestion = myPendingProposals.length > 0;
  const signingBlockedByProposalQueue = allOpenProposals.length > 0;
  const proposerDisplayNameForApi = useMemo(() => {
    if (!draft?.parties?.length) return recipientLabel;
    const m = draft.parties.find((p) => (p.id || "").trim() === participantPid);
    return m?.name?.trim() || recipientLabel;
  }, [draft?.parties, participantPid, recipientLabel]);
  const agreementFullyExecuted = useMemo(() => isAgreementMarkedSignedInAudit(draft), [draft]);
  const mySignatureDone = useMemo(
    () => isParticipantSignatureComplete(draft, participantPid),
    [draft, participantPid]
  );
  const recipientApprovedInAudit = useMemo(
    () => (draft?.audit_log || []).some((e) => e.event_type === "recipient_approved"),
    [draft?.audit_log]
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
  }, [agreementId]);

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

  const recipientRedlinePlainTexts = useMemo(() => {
    if (!recipientPreview || !previewDiff) return null;
    return buildRecipientLegalRedlinePlainTexts(
      recipientPreview.baselineDraft,
      recipientPreview.proposedDraft,
      recipientPreview.baselineHtml,
      recipientPreview.proposedHtml,
      previewDiff.hasSnapshotDiff,
      recipientPreview.revisionText ?? "",
      previewDiff.snapshotCompare.changedFields,
    );
  }, [recipientPreview, previewDiff]);

  const recipientIntentGapCount = useMemo(() => {
    const o = recipientRedlinePlainTexts?.instructionIntentOutcomes;
    if (o && o.length > 0) return countRecipientIntentGaps(o);
    return previewDiff?.instructionCaptureWarning ? 1 : 0;
  }, [recipientRedlinePlainTexts?.instructionIntentOutcomes, previewDiff?.instructionCaptureWarning]);

  const [narrowRedlineHighlightAnchor, setNarrowRedlineHighlightAnchor] = useState<string | null>(null);
  const suggestedChangesDocScrollRef = useRef<HTMLDivElement>(null);

  const legalRedlineDocumentBaseVm = useMemo(() => {
    if (!recipientRedlinePlainTexts) return null;
    let vm = buildLegalRedlineDocumentViewModel(
      recipientRedlinePlainTexts.currentPlain,
      recipientRedlinePlainTexts.proposedPlain,
    );
    if (recipientRedlinePlainTexts.narrowRecipientTargetedRedline) {
      vm = filterNarrowRecipientPaymentRedlineNoise(vm, { narrowPaymentInstruction: true });
    }
    return vm;
  }, [recipientRedlinePlainTexts]);

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
      instruction: recipientPreview.revisionText ?? "",
      changedClauseCount: cards.length,
      clauseIds: cards.map((c) => c.id),
      clauses: cards.map((c) => ({
        id: c.id,
        beforeLen: c.currentText.length,
        afterLen: c.proposedText.length,
        hasAdds: c.redlineView.hasAdds,
        hasDeletes: c.redlineView.hasDeletes,
        addedLines: c.redlineView.addedLines,
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
      baselineSnippet: snippetAroundPaymentTerms(paired.currentPlain),
      proposedSnippet: snippetAroundPaymentTerms(paired.proposedPlain),
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
      setRenderedHtml(html);
      let b = loadBundle(agreementId);
      if (!b || b.versions.length === 0) {
        b = ensureInitialVersion(agreementId, d, html);
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
        saveBundle(b);
      } else if (signingLockPresentInPayload && b.signingLock?.locked) {
        b = {
          ...b,
          finalizedForSigning: false,
          signingLock: { locked: false },
        };
        saveBundle(b);
      }
      setBundle(b);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load agreement.");
    } finally {
      setLoading(false);
    }
  }, [agreementId, recipientAccessToken]);

  const draftSanitizeContext = useMemo(() => {
    if (!draft) return "";
    return [draft.title, draft.purpose, draft.payment_terms, ...draft.parties.map((p) => p.name)].join("\n");
  }, [draft]);

  const renderedHtmlDisplay = useMemo(
    () => substitutePartyPlaceholdersInUserFacingText(renderedHtml, draftSanitizeContext),
    [renderedHtml, draftSanitizeContext],
  );

  const directCompareDefault = useMemo(
    () => htmlToPlainText(renderedHtmlDisplay || ""),
    [renderedHtmlDisplay],
  );

  const scrubAgreementHtml = useCallback(
    (html: string) => substitutePartyPlaceholdersInUserFacingText(html || "", draftSanitizeContext),
    [draftSanitizeContext],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revisionPayload = useMemo(() => {
    if (universalIntakeMode === "plain") {
      return buildRecipientRevisionText(instruction.trim(), "");
    }
    return buildRecipientRevisionText(instruction.trim(), externalAiPaste.trim());
  }, [universalIntakeMode, instruction, externalAiPaste]);

  const canPreview = Boolean(revisionPayload.text) && !previewing && !saving;

  async function previewChanges() {
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return;
    }
    const { text, hasExternal } = revisionPayload;
    if (!text || !draft || previewing) return;
    const revGate = access.check("revision_preview");
    if (!revGate.allowed) {
      setError(revGate.message || "Revision preview limit reached.");
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const baselineDraft = cloneDraftForRecipientPreview(draft);
      const readHeaders = recipientAgreementReadHeaders(agreementId, recipientAccessToken);
      /** Immutable owner-current HTML: re-fetch from /render immediately before revise (not React state alone). */
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
            "AI assist limit reached for this draft. Keep editing without smart suggestions, or try again shortly."
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
        setError(recipientPreviewNoOpMessage());
        setRecipientPreview(null);
        return;
      }
      setRecipientPreview({
        baselineDraft,
        baselineHtml,
        proposedDraft: nextDraft,
        proposedHtml: html,
        revisionText: text,
        hasExternal,
        postureAtPreview: recipientPosture,
        suggestionUsedAtPreview: suggestionUsed,
      });
      access.recordUsage("revision_previews");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not generate preview.");
      setRecipientPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  function openSendSuggestedEditsModal() {
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return;
    }
    const p = recipientPreview;
    if (!p || saving) return;
    if (!previewDiff?.canSubmit) {
      setError(recipientPreviewNoOpMessage());
      return;
    }
    setSendSuggestedEditsModalOpen(true);
  }

  async function performRecipientSuggestedEditsSubmit() {
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    const p = recipientPreview;
    if (!p || saving) return;
    if (!previewDiff?.canSubmit) {
      setError(recipientPreviewNoOpMessage());
      setSendSuggestedEditsModalOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const d = p.proposedDraft;
      const submitted = await submitRecipientProposalApi(
        agreementId,
        {
          instruction: p.revisionText,
          proposer_id: participantPid,
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
          rendered_html: p.proposedHtml,
        },
        recipientAccessToken,
      );
      if (!submitted.ok) {
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
        throw new Error(
          humanizeRecipientActionError(
            submitted.error,
            "Couldn't send your suggestion. Please try again.",
          ),
        );
      }
      trackAgreementFunnelEvent("recipient_submitted_edits", { entry_kind: entry.kind }, { planTier: String(access.tier), agreementId });
      setSendSuggestedEditsModalOpen(false);
      setRecipientSuggestedEditsSentAck(true);
      setInstruction("");
      setExternalAiPaste("");
      setRecipientPreview(null);
      setSuggestionUsed(false);
      setWorkspaceTab("read");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send suggestion.");
    } finally {
      setSaving(false);
    }
  }

  function discardPreview() {
    setRecipientPreview(null);
  }

  async function acceptCurrentDraft() {
    if (viewerLike) return;
    if (needsPersonalizedLink) {
      setError("Use the personal review link from the sender (it includes your participant id).");
      return;
    }
    if (
      !window.confirm(
        "You are confirming this version is acceptable and ready for signing."
      )
    ) {
      return;
    }
    if (bundle && isSigningLockActive(bundle)) {
      setError("Review is closed on this agreement — you can still read the document.");
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const r = await recipientApproveCurrentApi(agreementId, {
        participant_id: partiesHaveIds ? participantPid : undefined,
        participant_display_name: partiesHaveIds ? proposerDisplayNameForApi : undefined,
        recipientAccessToken,
      });
      if (!r.ok) {
        throw new Error(
          humanizeRecipientActionError(r.error, "Couldn't record approval. Please try again."),
        );
      }
      setApprovedAck(true);
      await refresh();
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

  const comparePanel =
    recipientPreview && previewDiff && !previewDiff.isCompleteNoOp && !recipientSuggestedEditsSentAck ? (
      <div
        className="rounded-lg border border-sky-900/35 bg-slate-900/50 p-4 shadow-sm"
        data-testid="recipient-suggested-changes-panel"
      >
        <h3
          className="text-base font-semibold tracking-tight text-slate-100"
          data-testid="recipient-preview-summary-heading"
        >
          Suggested changes
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          Review the proposed edits before sending. Nothing changes unless the owner accepts.
        </p>
        {participantPid ? (
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Proposed by <span className="text-slate-300">{proposerDisplayNameForApi}</span>
          </p>
        ) : null}

        {legalRedlineDocumentVm ? (
          <>
            {legalRedlineDocumentVm.fallbackReason ? (
              <p className="mb-2 mt-3 text-sm leading-snug text-amber-100/95">{legalRedlineDocumentVm.fallbackReason}</p>
            ) : null}

            <div
              className="mt-3 flex flex-wrap gap-2"
              data-testid="recipient-suggested-changes-summary-chips"
              aria-label="Summary of suggested edits"
            >
              <span
                data-testid="recipient-redline-chip-insertions"
                className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
              >
                {legalRedlineDocumentVm.stats.insertCount} insertion
                {legalRedlineDocumentVm.stats.insertCount === 1 ? "" : "s"}
              </span>
              <span
                data-testid="recipient-redline-chip-deletions"
                className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
              >
                {legalRedlineDocumentVm.stats.deleteCount} deletion
                {legalRedlineDocumentVm.stats.deleteCount === 1 ? "" : "s"}
              </span>
              <span
                data-testid="recipient-redline-chip-sections"
                className="inline-flex items-center rounded-full border border-slate-600/80 bg-slate-950/50 px-2.5 py-0.5 text-[11px] font-medium text-slate-200"
              >
                {legalRedlineDocumentVm.stats.changedBlockCount} changed section
                {legalRedlineDocumentVm.stats.changedBlockCount === 1 ? "" : "s"}
              </span>
              {recipientIntentGapCount > 0 ? (
                <span
                  data-testid="recipient-redline-chip-not-reflected"
                  className="inline-flex items-center rounded-full border border-amber-600/60 bg-amber-950/40 px-2.5 py-0.5 text-[11px] font-medium text-amber-100"
                >
                  {recipientIntentGapCount} request{recipientIntentGapCount === 1 ? "" : "s"} to review
                </span>
              ) : null}
            </div>

            {recipientRedlinePlainTexts?.instructionIntentOutcomes &&
            recipientRedlinePlainTexts.instructionIntentOutcomes.length > 0 ? (
              <div
                className="mt-3 rounded-md border border-amber-600/55 bg-amber-950/35 px-3 py-2.5 text-sm leading-snug text-amber-50"
                data-testid="recipient-redline-not-reflected-callout"
                role="status"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-100/90">
                  Your requested changes
                </p>
                <ul className="space-y-2.5" data-testid="recipient-intent-coverage-list">
                  {recipientRedlinePlainTexts.instructionIntentOutcomes.map((it) => {
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
                      className="rounded-md border border-amber-700/35 bg-amber-950/25 px-2.5 py-2"
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
                                View in document
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
                      ) : it.status === "unclear" ? (
                        <>
                          <p className="text-[13px] leading-snug text-amber-50">
                            ? Clarification needed: &quot;{it.normalizedIntent}&quot;
                          </p>
                          {it.reason ? (
                            <p className="mt-1 text-[11px] leading-snug text-amber-100/85">{it.reason}</p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] leading-snug text-amber-50">
                            ⚠ Could not add: {it.normalizedIntent}
                          </p>
                          {it.reason ? (
                            <p className="mt-1 text-[11px] leading-snug text-amber-100/85">Reason: {it.reason}</p>
                          ) : null}
                        </>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : previewDiff.instructionCaptureWarning ? (
              <p
                className="mt-3 rounded-md border border-amber-600/55 bg-amber-950/35 px-3 py-2.5 text-sm leading-snug text-amber-50"
                data-testid="recipient-redline-not-reflected-callout"
                role="status"
              >
                Not reflected:{" "}
                {extractPauseRequestPhrase(recipientPreview.revisionText ?? "") ?? "pause work for late payment"}.
              </p>
            ) : null}

            {recipientRedlinePlainTexts?.paymentTermsInlinePlacementFailed &&
            recipientRedlinePlainTexts.narrowRecipientTargetedRedline ? (
              <p
                className="mt-3 rounded-md border border-amber-700/45 bg-amber-950/30 px-3 py-2 text-sm leading-snug text-amber-50"
                data-testid="recipient-redline-narrow-unsafe-payment-callout"
                role="status"
              >
                Could not safely place these payment edits in the matched payment section of the document shown
                below. Your note still goes to the owner. Requested timing:{" "}
                {extractPaymentPlacementCalloutSnippet(String(recipientPreview.proposedDraft.payment_terms ?? ""))}.
              </p>
            ) : recipientRedlinePlainTexts?.paymentTermsInlinePlacementFailed ? (
              <p
                className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-100/95"
                data-testid="recipient-redline-placement-callout"
                role="status"
              >
                Requested edit not placed inline — we could not match a payment section in the shown document text.
                Your note still goes to the owner.
              </p>
            ) : null}

            <p
              className="mt-3 text-[11px] leading-snug text-slate-400"
              data-testid="recipient-suggested-changes-what-this-means"
            >
              <span className="font-medium text-emerald-200/90">Green</span> = added.{" "}
              <span className="font-medium text-rose-200/90">Red</span> = removed. These are suggestions only — nothing
              changes unless the owner accepts. Use{" "}
              <span className="font-medium text-slate-200">Send suggestions for review</span> to send them to the owner
              for review (not a signed agreement).
            </p>

            <div className="mt-4 rounded-lg border border-slate-600/50 bg-slate-200/20 p-2 sm:p-3">
              <div
                ref={suggestedChangesDocScrollRef}
                className="max-h-[min(72vh,880px)] min-h-[40vh] overflow-y-auto rounded-md bg-slate-100/40"
                data-testid="recipient-suggested-changes-document"
              >
                <RecipientLegalRedlineDocument
                  document={legalRedlineDocumentVm}
                  variant="suggested"
                  recipientNarrowIntentAnchors={Boolean(recipientRedlinePlainTexts?.narrowRecipientTargetedRedline)}
                  highlightedRecipientAnchor={narrowRedlineHighlightAnchor}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-amber-100/90">Preview comparison is unavailable. You can still dismiss or edit your note.</p>
        )}

        <p
          className="mt-4 text-[11px] leading-relaxed text-slate-400"
          data-testid="recipient-suggested-changes-send-reassurance"
        >
          Nothing is signed. Sending shares suggestions for the owner to review first — not a signed agreement.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="recipient-open-send-suggested-edits-modal"
            className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={saving || !previewDiff.canSubmit}
            onClick={() => openSendSuggestedEditsModal()}
          >
            Send suggestions for review
          </button>
          <button
            type="button"
            className="btn rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
            disabled={saving || previewing}
            onClick={() => discardPreview()}
          >
            Dismiss preview
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
    const agreementTypeSign = (draft.purpose || "").trim() || (draft.title || "").trim() || "Agreement";
    const partiesLineSign = formatPartiesLine(draft.parties);
    const nextStepSign = signDone
      ? "Your signature is recorded."
      : ceremonyPhase === "signing"
        ? "Recording your signature…"
        : ceremonyPhase !== "ready"
          ? "Finishing setup…"
          : "Read the agreement, then sign when you’re ready.";

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
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Agreement review</p>
                <h1 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
                  You&apos;ve been invited to review and sign an agreement
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                  Please review the final terms below. When ready, sign securely on your phone. Nothing is final until
                  you confirm.
                </p>
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
              sender: inviterLineSign,
              partiesLine: partiesLineSign,
              nextStep: nextStepSign,
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
                    {showCelebrate ? JOY_COPY.signSealedProof : JOY_COPY.signLockedIn}
                  </p>
                  {showCelebrate ? (
                    <>
                      <p className="mt-2 text-sm opacity-95">
                        All required signers have completed this agreement.
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-emerald-100/90">{CANONICAL_PROOF_SENTENCE}</p>
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
    const agreementTypeLocked = (draft.purpose || "").trim() || (draft.title || "").trim() || "Agreement";
    const partiesLineLocked = formatPartiesLine(draft.parties);
    const nextStepLocked =
      recipientLinkRole === "signer"
        ? canSignerProceed
          ? "Open signing when you’ve read the final version."
          : "Resolve any open change requests with the sender before signing."
        : "No signature needed from you on this link — read the final version for your records.";
    const signingHref = agreementSigningPath(agreementId, lockVid, undefined, participantPid || undefined);

    return (
      <div
        className={`vs01-agreement-review-inner space-y-6 ${canSignerProceed ? "pb-28 sm:pb-6" : ""}`}
      >
        <div
          className="rounded-lg border border-sky-800/40 bg-sky-950/30 px-4 py-3 text-sm text-sky-50"
          role="status"
        >
          <div className="font-semibold">Final version ready for signature</div>
          <p className="mt-1 text-xs text-sky-100/90">
            The sender set this text as the final signing version. Suggested edits are closed on this link — open
            signing when you’re ready.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement review</p>
            <p className="text-sm text-slate-300">Final version ready for signature (read-only)</p>
            {recipientTrustCueStrip()}
            {recipientAgreementSummaryCard({
              agreementType: agreementTypeLocked,
              sender: inviterLineLocked,
              partiesLine: partiesLineLocked,
              nextStep: nextStepLocked,
            })}
          </div>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-700 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
          <div
            className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
                dangerouslySetInnerHTML={{
                  __html: scrubAgreementHtml(lockedReviewBodyHtml) || "<p>No preview yet.</p>",
                }}
          />
        </div>
        {recipientLinkRole === "signer" ? (
          canSignerProceed ? (
            <>
              <a
                className="hidden w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500 sm:inline-flex sm:w-auto"
                href={signingHref}
              >
                Review and sign
              </a>
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/90 bg-slate-950/95 p-4 backdrop-blur sm:hidden">
                <a
                  className="vs01-btn inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                  href={signingHref}
                >
                  Review and sign
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

  if (entry.kind === "review" && flowPhase === "landing") {
    const senderName = (draft.parties?.[0]?.name || "").trim() || "the sender";
    const inviterLine = (inviterDisplayNameOverride || "").trim() || senderName;
    const title = (draft.title || "").trim() || "Agreement";
    const signingReadyHub = Boolean(bundle && isSigningLockActive(bundle));
    const lockedVid = bundle?.signingLock?.lockedVersionId || "";
    const canSignFromHub =
      recipientLinkRole === "signer" &&
      signingReadyHub &&
      Boolean(lockedVid) &&
      !signingBlockedByProposalQueue;
    const agreementType = (draft.purpose || "").trim() || title;
    const partiesLine = formatPartiesLine(draft.parties);
    const nextStepLanding = canSignFromHub
      ? "Review the terms, then open signing when you’re ready."
      : viewerLike
        ? "Read the agreement — this link is view-only."
        : signingReadyHub && recipientLinkRole === "signer" && signingBlockedByProposalQueue
          ? "Resolve open change requests with the sender before signing."
          : signingReadyHub
            ? "Review the terms — signing opens when the sender finishes setup."
            : "Review the terms — you can request changes before anything is finalized.";
    const primaryCtaLabel = canSignFromHub ? "Review and sign" : "Review agreement";
    const isPaidReviewerSurface =
      entry.kind === "review" && recipientLinkRole === "reviewer" && !viewerLike;
    return (
      <div className="vs01-agreement-review-inner space-y-5 p-6 pb-28 sm:pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement review</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
              {isPaidReviewerSurface
                ? "Review this agreement"
                : "You've been invited to review an agreement"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              {isPaidReviewerSurface
                ? "Suggest changes before anyone signs."
                : "Read the terms, request changes, or sign securely on your phone. Nothing is final until you confirm."}
            </p>
            {isPaidReviewerSurface ? (
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
                Your suggestions do not change the original until the owner accepts them.
              </p>
            ) : null}
            {recipientTrustCueStrip()}
            {recipientAgreementSummaryCard({
              agreementType,
              sender: inviterLine,
              partiesLine,
              nextStep: nextStepLanding,
            })}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              You&apos;re on the recipient link for this agreement — not the sender&apos;s private editing view.
            </p>
            {viewerLike ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                View-only access — you can read the agreement but can&apos;t suggest changes.
              </p>
            ) : null}
          </div>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canSignFromHub ? (
              <a
                className="vs01-btn inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                href={agreementSigningPath(agreementId, lockedVid, undefined, participantPid || undefined)}
              >
                {primaryCtaLabel}
              </a>
            ) : (
              <button
                type="button"
                className="vs01-btn rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                onClick={() => setFlowPhase("active")}
              >
                {primaryCtaLabel}
              </button>
            )}
            {!viewerLike ? (
              <div className="flex w-full min-w-[12rem] flex-col gap-1 sm:w-auto">
                <button
                  type="button"
                  className="vs01-btn vs01-btn--secondary rounded-lg px-4 py-2.5 text-sm"
                  onClick={() => {
                    setFlowPhase("active");
                    setWorkspaceTab("revise");
                    scrollAndFocusSuggestPanel();
                  }}
                >
                  Suggest changes
                </button>
                <p className="text-[10px] leading-snug text-slate-500 sm:max-w-[14rem]">
                  Ask for edits before anything is signed.
                </p>
              </div>
            ) : null}
          </div>

          <div className="text-[11px] text-slate-500">
            <button
              type="button"
              className="text-slate-400 underline decoration-slate-700 underline-offset-2 hover:text-slate-200"
              onClick={() => setFlowPhase("declined")}
            >
              I&apos;m not participating
            </button>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-slate-800/90 bg-slate-950/95 p-4 backdrop-blur sm:hidden">
          {canSignFromHub ? (
            <a
              className="vs01-btn inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
              href={agreementSigningPath(agreementId, lockedVid, undefined, participantPid || undefined)}
            >
              {primaryCtaLabel}
            </a>
          ) : (
            <button
              type="button"
              className="vs01-btn w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
              onClick={() => setFlowPhase("active")}
            >
              {primaryCtaLabel}
            </button>
          )}
          {!viewerLike ? (
            <>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary w-full rounded-lg px-4 py-2.5 text-sm"
                onClick={() => {
                  setFlowPhase("active");
                  setWorkspaceTab("revise");
                  scrollAndFocusSuggestPanel();
                }}
              >
                Suggest changes
              </button>
              <p className="text-center text-[10px] leading-snug text-slate-500">
                Ask for edits before anything is signed.
              </p>
            </>
          ) : null}
        </div>
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
  const lockedSignVid = bundle?.signingLock?.lockedVersionId || "";
  const canRecipientSign =
    recipientLinkRole === "signer" &&
    signingReadyActive &&
    Boolean(lockedSignVid) &&
    !signingBlockedByProposalQueue;

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
    return {
      wrap: "border-slate-700 bg-slate-900/50 text-slate-200",
      title: "Draft under review",
      detail: "Changes can still be requested before signing.",
    };
  })();

  const suggestControlsDisabled =
    saving || previewing || hasPendingSuggestion || recipientSuggestedEditsSentAck;

  return (
    <div
      className={`vs01-agreement-review-inner space-y-6 sm:pb-8 ${
        recipientPreview && !recipientSuggestedEditsSentAck ? "pb-32" : "pb-24"
      }`}
    >
      <div
        className={`rounded-lg border px-4 py-3 text-sm leading-snug ${statusBanner.wrap}`}
        role="status"
      >
        <div className="font-semibold">{statusBanner.title}</div>
        <p className="mt-1 text-xs opacity-95">{statusBanner.detail}</p>
      </div>

      {entry.kind === "review" && recipientSuggestedEditsSentAck ? (
        <div
          className="rounded-lg border border-emerald-700/45 bg-emerald-950/30 px-4 py-4 text-slate-50 shadow-sm"
          data-testid="recipient-suggested-edits-sent-ack"
          role="status"
        >
          <h2 className="text-base font-semibold text-emerald-100">Suggestions sent</h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-50/95">
            The owner can review your suggested changes. Nothing has been signed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              data-testid="recipient-suggested-edits-back-to-agreement"
              onClick={() => {
                setWorkspaceTab("read");
                window.requestAnimationFrame(() => {
                  document.querySelector(".prose")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                setWorkspaceTab("revise");
                setError(null);
                scrollAndFocusSuggestPanel();
              }}
            >
              Suggest another change
            </button>
          </div>
        </div>
      ) : null}

      {entry.kind === "review" ? (
        <p className="rounded-md border border-slate-800/70 bg-slate-950/35 px-3 py-2 text-[11px] leading-snug text-slate-500">
          You&apos;re reviewing an agreement shared through LawDog.
          <a
            href="/"
            className="ml-1 font-medium text-sky-500/90 underline-offset-2 hover:text-sky-400 hover:underline"
          >
            Create your own agreements
          </a>
          <span className="text-slate-600"> — only when it helps you.</span>
        </p>
      ) : null}

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
              clearPendingRecipientNotice(agreementId);
              setBundle(loadBundle(agreementId));
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
        <div>
          {entry.kind === "review" && recipientLinkRole === "reviewer" && !viewerLike ? (
            <>
              <h1 className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
                Review this agreement
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Suggest changes before signing. Nothing changes unless the owner accepts.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Review Agreement</p>
              <p className="text-sm text-slate-300">
                {workspaceTab === "read"
                  ? "Read the agreement first — editing tools are under Suggest changes."
                  : "Describe what you’d like different, preview, then send your revised draft to the owner."}
              </p>
            </>
          )}
          <p className="mt-1.5 text-[10px] text-slate-600">
            Support — ID <span className="font-mono text-slate-500 break-all">{agreementId}</span>
          </p>
        </div>
        {onClose ? (
          <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <ProofBadge state={recipientProofBadge} />
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-0.5 font-medium text-slate-300">
          {versionLabelHub}
        </span>
        <span className="text-slate-500">·</span>
        <span>{(draft.title || "").trim() || "Agreement"}</span>
      </div>

      {workspaceTab === "read" ? (
        <p className="text-xs leading-relaxed text-slate-400">
          Read the document, then use Suggest changes when you are ready.
        </p>
      ) : null}

      <div className="rounded-lg border border-slate-700 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
        <div
          className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
          dangerouslySetInnerHTML={{ __html: renderedHtmlDisplay || "<p>No preview yet.</p>" }}
        />
      </div>

      {entry.kind === "review" &&
      draft &&
      isPaidProAgreementAuthoritative({ draft, agreementId, includeLocalCompletionMarker: false }) &&
      !viewerLike ? (
        <div className="rounded-lg border border-violet-800/45 bg-slate-950/50 px-4 py-4 text-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-200/90">Note for the owner</div>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Plain-language notes for the owner. Nothing is signed on this screen.
          </p>
          <label className="mt-3 block text-[11px] font-medium text-slate-500" htmlFor="pro-redline-recipient-suggest">
            Your suggestions
          </label>
          <textarea
            id="pro-redline-recipient-suggest"
            className="mt-1 w-full min-h-[7rem] rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            value={proRedlineSuggestText}
            onChange={(e) => {
              setProRedlineSuggestText(e.target.value);
              setProRedlineSuggestErr(null);
              setProRedlineSuggestSuccess(false);
            }}
            disabled={proRedlineSuggestBusy || needsPersonalizedLink}
            placeholder="Describe what you’d like different…"
          />
          {needsPersonalizedLink ? (
            <p className="mt-2 text-[11px] text-amber-200/90">
              Open the personal link the owner sent you (it includes <code className="text-amber-100/90">?p=…</code>) so
              your suggestion is attributed correctly.
            </p>
          ) : null}
          <button
            type="button"
            className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
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

      {workspaceTab === "read" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            onClick={() => {
              window.requestAnimationFrame(() => {
                document.querySelector(".prose")?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
          >
            Review agreement
          </button>
          {!viewerLike ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-45"
                disabled={hasPendingSuggestion || recipientSuggestedEditsSentAck}
                onClick={() => {
                  setWorkspaceTab("revise");
                  setError(null);
                  scrollAndFocusSuggestPanel();
                }}
              >
                Suggest changes
              </button>
              <p className="text-[10px] leading-snug text-slate-500 sm:max-w-[16rem]">
                Ask for edits before anything is signed.
              </p>
            </div>
          ) : null}
          {!viewerLike ? (
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-900/60 disabled:opacity-45"
              disabled={approving || Boolean(bundle && isSigningLockActive(bundle))}
              onClick={() => void acceptCurrentDraft()}
            >
              {approving ? "Saving…" : "Looks good"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-900/60"
            onClick={() => setFlowPhase("declined")}
          >
            I&apos;m not participating
          </button>
          {recipientLinkRole === "signer" && canRecipientSign ? (
            <a
              className="inline-flex items-center justify-center rounded-lg border border-sky-700 bg-sky-950/40 px-4 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-900/50"
              href={agreementSigningPath(agreementId, lockedSignVid, undefined, participantPid || undefined)}
            >
              Ready to sign
            </a>
          ) : recipientLinkRole === "signer" ? (
            <span className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-500">
              {signingBlockedByProposalQueue
                ? "Resolve open change requests before signing"
                : "Waiting for final version before signing"}
            </span>
          ) : null}
        </div>
      ) : viewerLike ? (
        <p className="text-xs text-slate-500">You have view-only access to this agreement.</p>
      ) : (
        <div ref={recipientSuggestPanelRef} className="space-y-3">
          <button
            type="button"
            className="text-xs font-medium text-sky-300 underline decoration-sky-800/50 hover:text-sky-200"
            onClick={() => {
              setWorkspaceTab("read");
              setRecipientPreview(null);
              setError(null);
            }}
          >
            ← Back to agreement
          </button>

          {hasPendingSuggestion ? (
            <div className="rounded-lg border border-amber-800/45 bg-amber-950/25 p-4 text-sm text-amber-100">
              <p className="font-semibold">Suggested edits pending</p>
              <p className="mt-2 text-xs text-amber-200/90">
                The owner must review your revised draft before you can send another one.
              </p>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                    reviseTextMode === "assisted"
                      ? "border border-slate-500 bg-slate-800/90 text-slate-100"
                      : "text-slate-500 hover:text-slate-200"
                  }`}
                  onClick={() => {
                    setReviseTextMode("assisted");
                    setRecipientPreview(null);
                    setError(null);
                  }}
                >
                  Preview suggestions
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                    reviseTextMode === "direct"
                      ? "border border-slate-500 bg-slate-800/90 text-slate-100"
                      : "text-slate-500 hover:text-slate-200"
                  }`}
                  onClick={() => {
                    setReviseTextMode("direct");
                    setRecipientPreview(null);
                    setError(null);
                  }}
                >
                  Compare text
                </button>
              </div>
              {reviseTextMode === "direct" ? (
                <DirectComparePanel defaultBefore={directCompareDefault} />
              ) : (
                <>
              <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-950/35 p-3">
                <h3 className="text-sm font-semibold text-slate-100">Suggest changes</h3>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Write what you want changed. LawDog will show a preview before anything is sent.
                </p>
                <p className="text-[0.65rem] font-medium text-amber-100/80">Nothing changes unless the owner accepts.</p>
              </div>

              <details className="group rounded-md border border-slate-800/80 bg-slate-950/25 p-2">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-sky-300/95 marker:content-none [&::-webkit-details-marker]:hidden">
                  Advanced copy tools
                </summary>
                <div className="mt-2 space-y-2 border-t border-slate-800/60 pt-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How to suggest changes">
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                    universalIntakeMode === "plain"
                      ? "border border-slate-500 bg-slate-800/90 text-slate-100"
                      : "text-slate-500 hover:text-slate-200"
                  }`}
                  onClick={() => {
                    setUniversalIntakeMode("plain");
                    setExternalAiPaste("");
                    setRecipientPreview(null);
                    setError(null);
                  }}
                >
                  {MODE_SUGGEST_PLAIN_ENGLISH}
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${
                    universalIntakeMode === "paste"
                      ? "border border-slate-500 bg-slate-800/90 text-slate-100"
                      : "text-slate-500 hover:text-slate-200"
                  }`}
                  onClick={() => {
                    setUniversalIntakeMode("paste");
                    setRecipientPreview(null);
                    setError(null);
                  }}
                >
                  {MODE_PASTE_REVISED_DRAFT}
                </button>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-dashed border-slate-600/60 px-2.5 py-1.5 text-[10px] font-medium text-slate-500"
                  title={UPLOAD_FILE_COMPARISON_COMING_SOON}
                >
                  {MODE_UPLOAD_FILE}
                </button>
              </div>
              <p className="text-[0.6rem] text-slate-600">{UPLOAD_FILE_COMPARISON_COMING_SOON}</p>

              <div className="rounded-md border border-dashed border-slate-600/70 bg-slate-950/30 p-3">
                <p className="text-[10px] leading-snug text-slate-500">
                  {universalIntakeMode === "plain" ? (
                    <>
                      {PORTABLE_REVIEW_SUB} Start with <span className="text-slate-400">Preview changes</span> to line up
                      your notes, or add detail below.
                    </>
                  ) : (
                    <>Paste a full or partial revised draft, then <span className="text-slate-400">Preview changes</span> to see how it lines up. {PORTABLE_REVIEW_OCR_FOOTNOTE}</>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-100 hover:bg-slate-800"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(htmlToPlainText(renderedHtml));
                  setCopyDraftFlash(true);
                  window.setTimeout(() => setCopyDraftFlash(false), 1800);
                } catch {
                  setError("Could not copy to clipboard.");
                }
              })();
            }}
                  >
                    Copy full draft
                  </button>
                  {copyDraftFlash ? <span className="text-[10px] text-emerald-400">Draft copied</span> : null}
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-100 hover:bg-slate-800 disabled:opacity-40"
                    disabled={!draft || !topFrictionClauseId}
                    onClick={() => {
                      if (!draft || !topFrictionClauseId) return;
                      void (async () => {
                        try {
                          await navigator.clipboard.writeText(draftExcerptForClause(draft, topFrictionClauseId));
                          setCopyClauseFlash(true);
                          window.setTimeout(() => setCopyClauseFlash(false), 1800);
                        } catch {
                          setError("Could not copy to clipboard.");
                        }
                      })();
                    }}
                  >
                    Copy clause
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-100 hover:bg-slate-800"
                    onClick={() => {
                      if (!draft) return;
                      void (async () => {
                        try {
                          await navigator.clipboard.writeText(buildAgreementSocialSummary({ draft }));
                          setCopyClauseFlash(true);
                          window.setTimeout(() => setCopyClauseFlash(false), 1800);
                        } catch {
                          setError("Could not copy to clipboard.");
                        }
                      })();
                    }}
                  >
                    Copy for X / social
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-100 hover:bg-slate-800"
                    onClick={() => {
                      if (!draft) return;
                      const p = (draft.purpose || "").trim();
                      const pay = (draft.payment_terms || "").trim();
                      if (!p && !pay) {
                        setError("No key terms to copy yet.");
                        return;
                      }
                      void (async () => {
                        try {
                          await navigator.clipboard.writeText(
                            [p && `Purpose: ${p}`, pay && `Payment: ${pay}`].filter(Boolean).join("\n\n")
                          );
                          setCopyClauseFlash(true);
                          window.setTimeout(() => setCopyClauseFlash(false), 1800);
                        } catch {
                          setError("Could not copy to clipboard.");
                        }
                      })();
                    }}
                  >
                    Copy key terms
                  </button>
                  {copyClauseFlash ? <span className="text-[10px] text-emerald-400">Copied</span> : null}
                </div>
                {!topFrictionClauseId ? (
                  <p className="mt-1 text-[10px] text-slate-600">
                    Clause-level copy follows where you are in the document; key terms stay available below.
                  </p>
                ) : null}
                {universalIntakeMode === "paste" ? (
                  <div>
                    <label
                      className="mt-2 block text-[10px] font-medium text-slate-500"
                      htmlFor="recipient-external-ai-paste"
                    >
                      {PORTABLE_REVIEW_PASTE_LABEL}
                    </label>
                    <textarea
                      id="recipient-external-ai-paste"
                      className="mt-1 w-full min-h-[8.5rem] rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                      placeholder={PORTABLE_REVIEW_PASTE_PLACEHOLDER}
                      value={externalAiPaste}
                      disabled={suggestControlsDisabled}
                      onChange={(e) => {
                        setExternalAiPaste(e.target.value);
                        setRecipientPreview(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
                </div>
              </details>

              <details className="rounded-md border border-slate-800/70 bg-slate-950/20 px-2 py-1.5">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-400 marker:content-none hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                  Negotiation tone (optional)
                </summary>
                <div className="mt-2 space-y-2 border-t border-slate-800/50 pt-2">
                  <label className="text-[11px] font-medium text-slate-400" htmlFor="recipient-posture">
                    Tone for your suggestions
                  </label>
                  <select
                    id="recipient-posture"
                    className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={recipientPosture}
                    disabled={suggestControlsDisabled}
                    onChange={(e) => setRecipientPosture(e.target.value as NegotiationPosture)}
                  >
                    {NEGOTIATION_POSTURE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] leading-snug text-slate-500">
                    Optional framing for your note — default is cooperative.
                  </p>
                </div>
              </details>

              {showSuggestionBlock ? (
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

              {universalIntakeMode === "plain" ? (
                <label className="text-sm font-semibold text-slate-200" htmlFor="recipient-revision-input">
                  {PLAIN_ENGLISH_FIELD_LABEL}
                </label>
              ) : (
                <label className="text-sm font-semibold text-slate-200" htmlFor="recipient-revision-input">
                  {PASTE_OPTIONAL_NOTE_LABEL}
                </label>
              )}
              <VoiceAugmentedTextArea
                id="recipient-revision-input"
                data-testid="recipient-revision-voice-field"
                className="min-h-[5.5rem] w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 pb-11 pr-12 text-sm text-slate-100"
                placeholder={
                  universalIntakeMode === "plain"
                    ? "Be specific about what should change…"
                    : "E.g. “Focus the fee clause first.” (optional)"
                }
                value={instruction}
                onValueChange={(v) => {
                  setInstruction(v);
                  setRecipientPreview(null);
                }}
                disabled={suggestControlsDisabled}
                surface="dark"
                voiceSubtleIdle={false}
                onVoiceError={(m) => setError(recipientVoiceErrorMessage(m))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                  disabled={!canPreview || hasPendingSuggestion || recipientSuggestedEditsSentAck}
                  onClick={() => void previewChanges()}
                >
                  {previewing ? "Working…" : "Preview changes"}
                </button>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                Use <span className="text-slate-400">Preview changes</span>, review <span className="text-slate-400">Suggested changes</span>, then{" "}
                <span className="text-slate-400">Send suggestions for review</span>.
              </p>

              {comparePanel}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {bundle && bundle.reviewSentAt ? (
        <p className="text-center text-[0.6875rem] text-slate-500">
          Review session active · {new Date(bundle.reviewSentAt).toLocaleString()}
        </p>
      ) : null}

      <ClawTrustFooter agreementId={agreementId} />

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {recipientPreview && !recipientSuggestedEditsSentAck ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-slate-800/90 bg-slate-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur sm:hidden"
          role="toolbar"
          aria-label="Send or discard suggested edits"
        >
          <p className="text-center text-[10px] leading-snug text-slate-400">
            Nothing is signed. Sending shares suggestions for the owner to review first — not a signed agreement.
          </p>
          <button
            type="button"
            data-testid="recipient-open-send-suggested-edits-modal-mobile"
            className="btn w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={saving || !previewDiff?.canSubmit}
            onClick={() => openSendSuggestedEditsModal()}
          >
            Send suggestions for review
          </button>
          <button
            type="button"
            className="btn w-full rounded-lg border border-slate-600 px-4 py-3 text-sm text-slate-200 hover:bg-slate-900/60 disabled:opacity-50"
            disabled={saving || previewing}
            onClick={() => discardPreview()}
          >
            Dismiss preview
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
              Send suggestions for review?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              These changes will be sent to the agreement owner. Nothing is signed, and the agreement will not change
              unless the owner accepts.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-testid="recipient-send-suggested-edits-modal-dismiss"
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                disabled={saving}
                onClick={() => setSendSuggestedEditsModalOpen(false)}
              >
                Keep reviewing
              </button>
              <button
                type="button"
                data-testid="recipient-send-suggested-edits-confirm"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                disabled={saving}
                onClick={() => void performRecipientSuggestedEditsSubmit()}
              >
                {saving ? "Sending…" : "Send suggestions"}
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
