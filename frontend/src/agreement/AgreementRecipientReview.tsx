import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { draftExcerptForClause, htmlToPlainText } from "./externalAiHandoff";
import {
  agreementFieldLabel,
  compareAgreementSnapshots,
} from "../vs01/agreementCompare";
import { buildAgreementRedline } from "../vs01/agreementRedline";
import { buildRecipientNegotiationHints } from "../vs01/recipientNegotiationHints";
import { featureFlags } from "../config/featureFlags";
import {
  AI_ASSISTIVE_SHORT,
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
  BRING_BACK_SUGGESTED_EDITS_TITLE,
  MATERIAL_CHANGE_SUMMARY_LABEL,
  MODE_PASTE_REVISED_DRAFT,
  MODE_SUGGEST_PLAIN_ENGLISH,
  MODE_UPLOAD_FILE,
  NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE,
  PASTE_OPTIONAL_NOTE_LABEL,
  PLAIN_ENGLISH_FIELD_LABEL,
  UNIVERSAL_REVIEW_INTRO,
  UPLOAD_FILE_COMPARISON_COMING_SOON,
} from "./universalReviewIntakeCopy";

const API_BASE = resolveApiBase();

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
  const [compareViewMode, setCompareViewMode] = useState<"structured" | "redline">("structured");
  const [recipientPosture, setRecipientPosture] =
    useState<NegotiationPosture>(DEFAULT_NEGOTIATION_POSTURE);
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const [reviseTextMode, setReviseTextMode] = useState<"assisted" | "direct">("assisted");
  const [universalIntakeMode, setUniversalIntakeMode] = useState<"plain" | "paste">("plain");
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
  const access = useAccess();

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
  }, [agreementId]);

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

  useEffect(() => {
    if (!recipientPreview) setCompareViewMode("structured");
  }, [recipientPreview]);

  const revisionCompare = useMemo(() => {
    if (!recipientPreview) return null;
    return compareAgreementSnapshots(
      draftToSnapshot(recipientPreview.baselineDraft),
      draftToSnapshot(recipientPreview.proposedDraft)
    );
  }, [recipientPreview]);

  const redlinePreview = useMemo(() => {
    if (!recipientPreview) return null;
    return buildAgreementRedline(
      htmlToPlainText(recipientPreview.baselineHtml),
      htmlToPlainText(recipientPreview.proposedHtml)
    );
  }, [recipientPreview]);

  const redlineCharCount =
    redlinePreview?.segments.reduce((n, s) => n + s.text.length, 0) ?? 0;
  const redlineLarge =
    Boolean(redlinePreview) &&
    (redlinePreview!.segments.length > 120 || redlineCharCount > 24_000);

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
      const baselineHtml = renderedHtml;
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

  async function commitSubmit() {
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
        recipientAccessToken
      );
      if (!submitted.ok) {
        if (
          submitted.error === "recipient_proposal_already_pending" ||
          submitted.error === "recipient_proposal_already_pending_from_participant"
        ) {
          setError(
            submitted.error === "recipient_proposal_already_pending_from_participant"
              ? "You already have a suggestion in the queue for this agreement."
              : "You already have a suggestion waiting for the owner. Wait for them to review it."
          );
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
    recipientPreview && revisionCompare && redlinePreview ? (
      <div className="rounded-lg border border-sky-900/35 bg-slate-900/50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {MATERIAL_CHANGE_SUMMARY_LABEL}
            </div>
            <p className="mt-1 text-[10px] font-medium text-slate-200/95">
              {bundle && isSigningLockActive(bundle)
                ? "Final: Final version ready for signature"
                : "Editable: Draft in progress — you can still make edits"}
            </p>
            {participantPid ? (
              <span className="mt-1 block text-[10px] font-normal normal-case text-slate-400">
                Proposed by{" "}
                <span className="text-slate-200">{proposerDisplayNameForApi}</span>
              </span>
            ) : null}
          </div>
          <span className="rounded-md border border-slate-600/80 bg-slate-950/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            Suggested edits
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          LawDog organizes the differences; your current draft in LawDog is preserved until the owner reviews and
          applies. Send only when this preview is the agreement path you want them to see.
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
              {!revisionCompare.hasChanges ? (
                <p className="mt-1.5 text-[10px] text-slate-500">
                  You can still submit if this matches what you intended.
                </p>
              ) : null}
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
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Current</div>
                <div
                  className="prose prose-sm mt-2 max-w-none text-slate-900"
                  dangerouslySetInnerHTML={{
                    __html: scrubAgreementHtml(recipientPreview.baselineHtml || "") || "<p>No preview.</p>",
                  }}
                />
              </div>
              <div className="rounded-md border border-emerald-900/30 bg-white p-4 text-slate-900">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Proposed</div>
                <div
                  className="prose prose-sm mt-2 max-w-none text-slate-900"
                  dangerouslySetInnerHTML={{
                    __html: scrubAgreementHtml(recipientPreview.proposedHtml || "") || "<p>No preview.</p>",
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
            <div className="max-h-[28rem] overflow-y-auto rounded-md border border-slate-700/80 bg-white p-4 text-[0.8125rem] leading-relaxed text-slate-900">
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
            className="btn rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={saving}
            onClick={() => void commitSubmit()}
          >
            {saving ? "Sending…" : "Send suggested edits"}
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
    return (
      <div className="vs01-agreement-review-inner space-y-5 p-6 pb-28 sm:pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement review</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
              You&apos;ve been invited to review an agreement
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              Read the terms, request changes, or sign securely on your phone. Nothing is final until you confirm.
            </p>
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
                View-only access — you can read the agreement but can&apos;t suggest edits.
              </p>
            ) : null}
          </div>
          {onClose ? (
            <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        {!viewerLike ? (
          <div className="sm:hidden">
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary w-full rounded-lg px-4 py-2.5 text-sm"
              onClick={() => {
                setFlowPhase("active");
                setWorkspaceTab("revise");
              }}
            >
              Request changes
            </button>
          </div>
        ) : null}

        <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap">
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
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary rounded-lg px-4 py-2.5 text-sm"
              onClick={() => {
                setFlowPhase("active");
                setWorkspaceTab("revise");
              }}
            >
              Request changes
            </button>
          ) : null}
        </div>

        <div className="text-[11px] text-slate-500 sm:pl-0">
          <button
            type="button"
            className="text-slate-400 underline decoration-slate-700 underline-offset-2 hover:text-slate-200"
            onClick={() => setFlowPhase("declined")}
          >
            I&apos;m not participating
          </button>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800/90 bg-slate-950/95 p-4 backdrop-blur sm:hidden">
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
      title: "Draft — changes may still occur",
      detail: "You can suggest changes or accept this agreement.",
    };
  })();

  const suggestControlsDisabled = saving || previewing || hasPendingSuggestion;

  return (
    <div
      className={`vs01-agreement-review-inner space-y-6 sm:pb-8 ${recipientPreview ? "pb-32" : "pb-24"}`}
    >
      <div
        className={`rounded-lg border px-4 py-3 text-sm leading-snug ${statusBanner.wrap}`}
        role="status"
      >
        <div className="font-semibold">{statusBanner.title}</div>
        <p className="mt-1 text-xs opacity-95">{statusBanner.detail}</p>
      </div>

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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Review Agreement</p>
          <p className="text-sm text-slate-300">
            {workspaceTab === "read"
              ? "Read the agreement first — editing tools are under Suggest edits."
              : "Describe what you’d like different, preview, then send your revised draft to the owner."}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">You are a recipient (not the owner).</p>
          <p className="mt-1.5 text-[10px] text-slate-600">
            Support reference — agreement ID:{" "}
            <span className="font-mono text-slate-500 break-all">{agreementId}</span>
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
          You can suggest changes or accept this agreement. The owner applies edits — nothing here overwrites their draft
          directly.
        </p>
      ) : null}

      <div className="rounded-lg border border-slate-700 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Document</div>
        <div
          className="prose mt-4 max-w-none text-[0.9375rem] leading-relaxed text-slate-900"
          dangerouslySetInnerHTML={{ __html: renderedHtmlDisplay || "<p>No preview yet.</p>" }}
        />
      </div>

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
          {!viewerLike ? (
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
              disabled={hasPendingSuggestion}
              onClick={() => {
                setWorkspaceTab("revise");
                setError(null);
              }}
            >
              Suggest edits
            </button>
          ) : null}
          {!viewerLike ? (
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-45"
              disabled={approving || Boolean(bundle && isSigningLockActive(bundle))}
              onClick={() => void acceptCurrentDraft()}
            >
              {approving ? "Saving…" : "Accept current draft"}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-900/60"
            onClick={() => setFlowPhase("declined")}
          >
            Decline
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
        <div className="space-y-3">
          <button
            type="button"
            className="text-xs font-medium text-sky-300 underline decoration-sky-800/50 hover:text-sky-200"
            onClick={() => {
              setWorkspaceTab("read");
              setRecipientPreview(null);
              setError(null);
            }}
          >
            ← Back to read-only view
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
                  Assisted preview
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
                  Direct compare
                </button>
              </div>
              {reviseTextMode === "direct" ? (
                <DirectComparePanel defaultBefore={directCompareDefault} />
              ) : (
                <>
              <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-950/35 p-3">
                <h3 className="text-sm font-semibold text-slate-100">{BRING_BACK_SUGGESTED_EDITS_TITLE}</h3>
                <p className="text-[10px] leading-relaxed text-slate-400">{UNIVERSAL_REVIEW_INTRO}</p>
                <p className="text-[0.65rem] leading-snug text-slate-500">
                  {AI_ASSISTIVE_SHORT} The agreement owner still decides what to accept. Nothing in their master draft
                  changes until they confirm a proposal.
                </p>
                <p className="text-[0.65rem] font-medium text-amber-100/80">{NOTHING_CHANGES_UNTIL_OWNER_ACCEPTS_LINE}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How to suggest edits">
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

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200" htmlFor="recipient-posture">
                  Your approach
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
                  This shapes how your suggested changes are framed.
                </p>
              </div>

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
                <>
                  <label className="text-sm font-semibold text-slate-200" htmlFor="recipient-revision-input">
                    {PLAIN_ENGLISH_FIELD_LABEL}
                  </label>
                  <p className="text-[10px] leading-snug text-slate-500">
                    Describe the change in your own words. The owner can review and accept in their workspace.
                  </p>
                </>
              ) : (
                <>
                  <label className="text-sm font-semibold text-slate-200" htmlFor="recipient-revision-input">
                    {PASTE_OPTIONAL_NOTE_LABEL}
                  </label>
                  <p className="text-[10px] leading-snug text-slate-500">
                    Add a short cover note; your pasted text above is what LawDog will compare in preview.
                  </p>
                </>
              )}
              <textarea
                id="recipient-revision-input"
                className="min-h-[5.5rem] w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder={
                  universalIntakeMode === "plain" ? "Be specific about what should change…" : "E.g. “Focus the fee clause first.” (optional)"
                }
                value={instruction}
                disabled={suggestControlsDisabled}
                onChange={(e) => {
                  setInstruction(e.target.value);
                  setRecipientPreview(null);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn rounded-lg border border-slate-600 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                  disabled={!canPreview || hasPendingSuggestion}
                  onClick={() => void previewChanges()}
                >
                  {previewing ? "Working…" : "Preview changes"}
                </button>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                After <span className="text-slate-400">Preview changes</span>, review the{" "}
                <span className="text-slate-400">summary of material changes</span>, then{" "}
                <span className="text-slate-400">Send suggested edits</span> for the owner — the saved draft in LawDog stays
                as-is until they apply.
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

      {recipientPreview ? (
        <div
          className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-slate-800/90 bg-slate-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur sm:hidden"
          role="toolbar"
          aria-label="Send or discard suggested edits"
        >
          <button
            type="button"
            className="btn w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            disabled={saving}
            onClick={() => void commitSubmit()}
          >
            {saving ? "Sending…" : "Send suggested edits"}
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
