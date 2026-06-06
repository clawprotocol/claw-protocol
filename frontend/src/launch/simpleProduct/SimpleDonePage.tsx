import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { agreementPublicVerifyPath, fetchPublicAgreementVerify } from "../../agreement/agreementPublicVerify";
import { fetchAgreementDraft, fetchAgreementDraftWithSigningLock } from "../../agreement/agreementWorkspaceApi";
import { writeCreateReviewAgreementResumeId } from "../../components/agreements/agreementIntakeStorage";
import {
  AGREEMENT_LIFECYCLE_PROGRESS_LABELS,
  lifecycleStepForStage,
} from "../../agreement/agreementLifecycleRail";
import { CANONICAL_PROOF_SENTENCE, JOY_COPY } from "../../joy/clawJoyCopy";
import { JoyMilestoneMark } from "../../joy/JoyMilestone";
import { JoyShareMilestone } from "../../joy/JoyShareMilestone";
import { consumeJoyFlash, emitActionCompleted } from "../../joy/joyTelemetry";
import { hasMarkedSimpleFlowSent } from "../simpleFlowSent";
import { canAccessSimpleSendActions, isSimpleSendPaywallActive } from "../simpleFlowSendUnlock";
import { isLawdogCsnTraffic, markLawdogFunnelStep } from "../../tracking/lawdogSession";
import { trackAgreementFunnelEvent } from "../../tracking/agreementFunnelAnalytics";
import { prepareFreshMarketingEntry } from "../marketingSession";
import { markFirstWorkflowReinforcementDone, shouldShowFirstWorkflowReinforcement } from "../reEngagementStore";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { useLaunchNav } from "../LaunchNavContext";
import { usePowerGatedNavigation } from "../../monetization/usePowerGatedNavigation";
import { ClaimRecordCard } from "../../conversion/ClaimRecordCard";
import { JoinLeaderboardOptInCard } from "../../leaderboard/JoinLeaderboardOptInCard";
import { trackProofFinalizeMilestone, trackProofSendMilestone } from "../../leaderboard/trackProofLifecycle";
import { PROOF_LADDER_SUBTITLE } from "../../components/proof/proofTrustLadder";
import { LawdogOnRecordStamp } from "../../components/ui/LawdogOnRecordStamp";
import { LawdogRecordedMark } from "../../components/ui/LawdogRecordedMark";
import { PRODUCT_NOT_LAW_FIRM, RECORDS_DOWNLOAD_KEEP_COPY_SHORT } from "../../compliance/disclosureCopy";
import type { SimpleDoneReviewRecipientLinkRow } from "./simpleDoneReviewRecipientLinks";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  readSimpleDoneReviewRecipientLinks,
  writeSimpleDoneReviewRecipientLinks,
} from "./simpleDoneReviewRecipientLinks";
import { extractReviewLinkTokenFromHref, normalizeHandoffToReviewerLinkRows } from "./reviewerLinkRowModel";
import { PaidProReviewReviewerLinksTable } from "./PaidProReviewReviewerLinksTable";
import { SimpleDoneReviewFlowDiagPanel } from "./SimpleDoneReviewFlowDiagPanel";
import {
  OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY,
  canContinueLockedSigningFromDonePage,
  canFinalizeReviewForSigning,
  computeOwnerDoneReviewApprovalPresentation,
  draftAuditHasRecipientRecordedApproval,
  logOwnerFinalizeRouteDecision,
  logOwnerReviewLinkStatus,
  shouldWritePaidProEditReturnHandoffAfterReview,
} from "../../components/agreements/draftRecipientReviewSignals";
import { logReviewApprovalStatus, logReviewLinkRowOpen } from "../../components/agreements/reviewFlowDebugLog";
import {
  logPaidProReviewTrackLifecycle,
  logReviewLinkOpen,
} from "../../components/agreements/paidProReviewTrackLifecycle";
import { recipientLinkTokenFingerprint } from "../../agreement/recipientLinkTokenFingerprint";
import {
  clearPaidProEditReturnHandoff,
  paidProEditReturnHasRecoverableBody,
  writePaidProEditReturnHandoff,
} from "./paidProEditReturnHandoff";
import { findOpenRecipientProposals } from "../../agreement/recipientProposal";
import {
  linearPremiumRecipientSlots,
  MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS,
  readPremiumRecipientHandoff,
} from "../../components/agreements/premiumPartyNamesHandoff";
import { mergeReviewLinkRecipientEmailsOntoHydratedDraft } from "./reviewLinkRecipientEmailMerge";
import { tryNavigatePaidProAgreementSenderFirstVs01Esign } from "./agreementToVs01SigningBridge";
import {
  orderedAuthoritativePartyDisplayNames,
} from "../../agreement/handoffPartyDisplay";
import { normalizeAgreementDisplayTitle } from "../../components/agreements/canonicalAgreementTitle";
import {
  logReviewFirstDisplayCorpusSelected,
  resolveReviewFirstDisplayCorpus,
} from "./reviewFirstDisplayCorpus";
import {
  ReviewActions,
  ReviewDocumentFrame,
  ReviewHeader,
  ReviewMetaGrid,
  ReviewNotice,
  ReviewShell,
  reviewActionButtonClass,
} from "../../agreement/reviewFirstLayout";
import { OwnerProposalReviewQaPanel } from "../../components/agreements/OwnerProposalReviewQaPanel";
import { OWNER_CTA_REVIEW_SUGGESTED_CHANGES } from "../../agreement/ownerRecipientSuggestedEditsCopy";
import {
  buildOwnerQaReviewAbsoluteLink,
  buildOwnerQaReviewDonePath,
  enableOwnerProposalReviewQaLocal,
  isOwnerProposalReviewQaEnabled,
  logOwnerReviewLinkBuilt,
} from "../../agreement/ownerProposalReviewQa";

const EMPTY_REVIEW_HANDOFF_RECIPIENTS: SimpleDoneReviewRecipientLinkRow[] = [];

export function SimpleDonePage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const { navigateToReuse, navigateToWorkProduct } = usePowerGatedNavigation();
  const [signed, setSigned] = useState<boolean | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [confirmedSend, setConfirmedSend] = useState(() => hasMarkedSimpleFlowSent(agreementId));
  const [copyFlash, setCopyFlash] = useState(false);
  const [publicVerifyCopyFlash, setPublicVerifyCopyFlash] = useState(false);
  const [showFirstWorkflowReinforcement, setShowFirstWorkflowReinforcement] = useState(false);
  const finalizeLoggedRef = useRef(false);

  const verifyPath = agreementPublicVerifyPath(agreementId);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${verifyPath}` : verifyPath;
  const [reviewLinksTick, setReviewLinksTick] = useState(0);
  const [remintBusy, setRemintBusy] = useState(false);
  const reviewRecipientHandoff = useMemo(
    () => readSimpleDoneReviewRecipientLinks(agreementId),
    [agreementId, reviewLinksTick],
  );
  const [reviewBundleCopyFlash, setReviewBundleCopyFlash] = useState(false);
  const [ownerHandoffDraft, setOwnerHandoffDraft] = useState<AgreementDraft | null>(null);
  const [ownerSigningLockVid, setOwnerSigningLockVid] = useState<string | null>(null);
  const [finalizeNavigating, setFinalizeNavigating] = useState(false);
  const [rowCopyFlashByKey, setRowCopyFlashByKey] = useState<Record<string, boolean>>({});
  const [reviewFlowDiagLocal, setReviewFlowDiagLocal] = useState(false);
  const [ownerQaLinkCopyFlash, setOwnerQaLinkCopyFlash] = useState(false);
  const ownerSuccessLoggedRef = useRef<string | null>(null);
  const ownerReviewLinkStatusDiagKeyRef = useRef("");
  const canDownload = !isSimpleSendPaywallActive() || canAccessSimpleSendActions(agreementId);
  const csn = isLawdogCsnTraffic();
  const showClaimBlock = Boolean(confirmedSend || signed);

  useEffect(() => {
    if (confirmedSend) trackProofSendMilestone(agreementId);
  }, [agreementId, confirmedSend]);

  useEffect(() => {
    if (signed) trackProofFinalizeMilestone(agreementId);
  }, [agreementId, signed]);

  useEffect(() => {
    consumeJoyFlash();
  }, []);

  useEffect(() => {
    markLawdogFunnelStep("done");
  }, []);

  useEffect(() => {
    setConfirmedSend(hasMarkedSimpleFlowSent(agreementId));
  }, [agreementId]);

  useEffect(() => {
    try {
      setReviewFlowDiagLocal(typeof window !== "undefined" && window.localStorage?.getItem("lawdogReviewFlowDiag") === "1");
    } catch {
      setReviewFlowDiagLocal(false);
    }
  }, [agreementId]);

  useEffect(() => {
    if (confirmedSend && shouldShowFirstWorkflowReinforcement()) {
      setShowFirstWorkflowReinforcement(true);
    }
  }, [confirmedSend]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const v = await fetchPublicAgreementVerify(agreementId);
      if (cancel) return;
      const isSigned = Boolean(v?.signature_status?.fully_executed);
      setSigned(isSigned);
      setTitle((() => {
        const raw = (v?.summary?.title || "").trim();
        return raw ? normalizeAgreementDisplayTitle(raw) : null;
      })());
      if (isSigned && !finalizeLoggedRef.current) {
        finalizeLoggedRef.current = true;
        trackAgreementFunnelEvent("agreement_completed", { surface: "simple_done" }, { agreementId });
        emitActionCompleted("finalize", { agreementId });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId]);

  const headline = signed
    ? JOY_COPY.signSealedProof
    : confirmedSend
      ? "Agreement ready"
      : JOY_COPY.readyToSendHeadline;
  const subline = signed
    ? "Everyone who needed to sign has signed."
    : confirmedSend
      ? "Share your review link so others can suggest edits. Use the public verify link only for status checks."
      : JOY_COPY.readyToSendSubline;

  const ownerReviewPresentationMismatchKeyRef = useRef("");

  const reviewHandoffRows = useMemo(
    () => reviewRecipientHandoff?.recipients ?? EMPTY_REVIEW_HANDOFF_RECIPIENTS,
    [reviewRecipientHandoff],
  );

  const ownerReviewPresentation = useMemo(
    () =>
      computeOwnerDoneReviewApprovalPresentation(
        ownerHandoffDraft,
        normalizeHandoffToReviewerLinkRows(reviewHandoffRows),
      ),
    [ownerHandoffDraft, reviewHandoffRows],
  );
  const reviewApprovalAgg = ownerReviewPresentation.aggregate;

  const reviewLinksReady = confirmedSend && reviewHandoffRows.length > 0;
  const reviewLinksPending =
    confirmedSend &&
    reviewRecipientHandoff?.intent === "review" &&
    (reviewRecipientHandoff.reviewLinksPending === true || reviewHandoffRows.length === 0);
  const isPaidProReviewDonePath =
    Boolean(confirmedSend && !signed && reviewRecipientHandoff?.intent === "review");
  const ownerReviewFirstDisplayCorpus = useMemo(
    () => resolveReviewFirstDisplayCorpus(ownerHandoffDraft),
    [ownerHandoffDraft],
  );

  useEffect(() => {
    if (!isPaidProReviewDonePath || !ownerHandoffDraft) return;
    logReviewFirstDisplayCorpusSelected({
      agreementId,
      corpus: ownerReviewFirstDisplayCorpus,
      surface: "owner_done",
    });
  }, [agreementId, isPaidProReviewDonePath, ownerHandoffDraft, ownerReviewFirstDisplayCorpus]);

  useEffect(() => {
    if (!isPaidProReviewDonePath) return;
    let cancel = false;
    const run = async () => {
      const { ok, draft, lockedVersionId } = await fetchAgreementDraftWithSigningLock(agreementId);
      if (cancel) return;
      if (ok && draft) setOwnerHandoffDraft(draft);
      else setOwnerHandoffDraft(null);
      setOwnerSigningLockVid(lockedVersionId && lockedVersionId.trim() ? lockedVersionId.trim() : null);
    };
    void run();
    const id = window.setInterval(() => void run(), 12_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancel = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [agreementId, isPaidProReviewDonePath]);

  useEffect(() => {
    ownerSuccessLoggedRef.current = null;
    ownerReviewLinkStatusDiagKeyRef.current = "";
    ownerReviewPresentationMismatchKeyRef.current = "";
  }, [agreementId]);

  useEffect(() => {
    if (!isPaidProReviewDonePath || !reviewLinksReady) return;
    if (ownerSuccessLoggedRef.current === agreementId) return;
    ownerSuccessLoggedRef.current = agreementId;
    // eslint-disable-next-line no-console
    console.info("[review-link-owner-success-visible]", { agreementId });
  }, [agreementId, isPaidProReviewDonePath, reviewLinksReady]);

  useEffect(() => {
    if (!isPaidProReviewDonePath || !reviewLinksReady) return;
    const signingLockActive = Boolean((ownerSigningLockVid || "").trim());
    const multiMint = reviewHandoffRows.length > 1;
    const primaryCtaLabel = signingLockActive
      ? "Continue to signing"
      : reviewApprovalAgg.finalizeForSigningEnabled
        ? "Prepare signing packet"
        : reviewApprovalAgg.hasOpenChangeRequests
          ? OWNER_CTA_REVIEW_SUGGESTED_CHANGES
          : multiMint
            ? "Per-reviewer copy (table)"
            : "Copy review link";
    const payload = {
      agreementId,
      recipientApprovalDetected: reviewApprovalAgg.anyReviewerApproval,
      finalizeForSigningEnabled: reviewApprovalAgg.finalizeForSigningEnabled,
      approvedReviewerCount: reviewApprovalAgg.approvedReviewerCount,
      requiredReviewerCount: reviewApprovalAgg.requiredReviewerCount,
      signingLockActive,
      lockedVersionId: ownerSigningLockVid,
      finalizedVersionId: ownerSigningLockVid,
      currentRoute: typeof window !== "undefined" ? window.location.pathname : "",
      primaryCtaLabel,
      backToDraftTarget: "/app/create",
      reviewLinksReady: true,
    };
    const key = JSON.stringify(payload);
    if (key === ownerReviewLinkStatusDiagKeyRef.current) return;
    ownerReviewLinkStatusDiagKeyRef.current = key;
    logOwnerReviewLinkStatus(payload);
  }, [
    agreementId,
    isPaidProReviewDonePath,
    reviewLinksReady,
    ownerHandoffDraft,
    ownerSigningLockVid,
    reviewApprovalAgg,
    reviewHandoffRows.length,
  ]);

  useEffect(() => {
    if (!isPaidProReviewDonePath || !reviewLinksReady) return;
    logReviewApprovalStatus({
      agreementIdShort: agreementId.trim().slice(0, 12),
      approvedCount: reviewApprovalAgg.approvedReviewerCount,
      reviewerCount: reviewApprovalAgg.requiredReviewerCount,
      status: reviewApprovalAgg.aggregateStatus,
    });
  }, [agreementId, isPaidProReviewDonePath, reviewLinksReady, reviewApprovalAgg]);

  useEffect(() => {
    if (!isPaidProReviewDonePath || !reviewLinksReady) return;
    const normalized = ownerReviewPresentation.normalizedReviewerRows;
    const anyHref = normalized.some((r) => r.reviewHref.trim().length > 0);
    const linksStillLoadingGate =
      reviewApprovalAgg.requiredReviewerCount > 1 && Boolean(reviewLinksPending) && confirmedSend;
    const linksIncompleteGate =
      reviewApprovalAgg.requiredReviewerCount > 1 &&
      !reviewLinksPending &&
      normalized.length > 0 &&
      normalized.length < reviewApprovalAgg.requiredReviewerCount;
    const agreementIdTrimmed = agreementId.trim();
    const openProposalCount = ownerHandoffDraft
      ? findOpenRecipientProposals(ownerHandoffDraft.audit_log).length
      : 0;
    const signingHandoffBaseReadyGate =
      reviewLinksReady && anyHref && !linksStillLoadingGate && !linksIncompleteGate;
    const canFinalize = canFinalizeReviewForSigning({
      agreementIdTrimmed,
      reviewLinksReady,
      anyReviewHref: anyHref,
      linksStillLoading: linksStillLoadingGate,
      linksIncomplete: linksIncompleteGate,
      reviewApprovalAggregate: reviewApprovalAgg,
    });
    const signingLockActiveGate = Boolean((ownerSigningLockVid || "").trim());
    let routeTarget = "none";
    if (signingLockActiveGate && signingHandoffBaseReadyGate) routeTarget = "vs01_esign_bridge";
    else if (reviewApprovalAgg.hasOpenChangeRequests && !signingLockActiveGate) {
      routeTarget = `/app/agreements/${encodeURIComponent(agreementIdTrimmed)}`;
    } else if (canFinalize && !signingLockActiveGate) routeTarget = "vs01_esign_bridge";
    const diagOn =
      (typeof import.meta !== "undefined" &&
        import.meta.env?.MODE !== "test" &&
        import.meta.env?.DEV) ||
      (typeof window !== "undefined" && window.localStorage?.getItem("lawdogReviewFlowDiag") === "1");
    if (!diagOn) return;
    const short =
      agreementIdTrimmed.length <= 12 ? agreementIdTrimmed : `${agreementIdTrimmed.slice(0, 8)}…`;
    // eslint-disable-next-line no-console
    console.info("[review-finalize-gate]", {
      agreementIdShort: short,
      approvalAggregateSource: ownerReviewPresentation.approvalAggregateSource,
      requiredReviewerCount: reviewApprovalAgg.requiredReviewerCount,
      approvedReviewerCount: reviewApprovalAgg.approvedReviewerCount,
      allReviewersApproved: reviewApprovalAgg.allReviewersApproved,
      openProposalCount,
      canFinalize,
      routeTarget,
    });
  }, [
    agreementId,
    confirmedSend,
    isPaidProReviewDonePath,
    ownerHandoffDraft,
    ownerReviewPresentation,
    ownerSigningLockVid,
    reviewApprovalAgg,
    reviewLinksPending,
    reviewLinksReady,
  ]);

  useEffect(() => {
    if (!isPaidProReviewDonePath || !reviewLinksReady) return;
    const pres = ownerReviewPresentation;
    if (pres.normalizedReviewerRows.length <= 1) return;
    const tableApproved = pres.rowStatuses.filter((s) => s === "approved").length;
    const draftApproved = pres.draftSignalsBaseline.approvedReviewerCount;
    if (tableApproved === draftApproved) return;
    const key = `${tableApproved}|${draftApproved}|${pres.aggregate.requiredReviewerCount}`;
    if (key === ownerReviewPresentationMismatchKeyRef.current) return;
    ownerReviewPresentationMismatchKeyRef.current = key;
    const diagOn =
      (typeof import.meta !== "undefined" &&
        import.meta.env?.MODE !== "test" &&
        import.meta.env?.DEV) ||
      (typeof window !== "undefined" && window.localStorage?.getItem("lawdogReviewFlowDiag") === "1");
    if (!diagOn) return;
    const id = agreementId.trim();
    const agreementIdShort = id.length <= 12 ? id : `${id.slice(0, 8)}…`;
    // eslint-disable-next-line no-console
    console.warn("[review-approval-aggregate-mismatch]", {
      agreementIdShort,
      tableApprovedCount: tableApproved,
      aggregateApprovedCount: pres.aggregate.approvedReviewerCount,
      requiredReviewerCount: pres.aggregate.requiredReviewerCount,
      draftSignalsApprovedCount: draftApproved,
      approvalAggregateSource: pres.approvalAggregateSource,
    });
  }, [agreementId, isPaidProReviewDonePath, reviewLinksReady, ownerReviewPresentation]);

  const retryRemintReviewLink = useCallback(async () => {
    const id = agreementId.trim();
    if (!id || remintBusy) return;
    setRemintBusy(true);
    let mintThrew = false;
    try {
      const { ok, draft } = await fetchAgreementDraft(id);
      if (!ok || !draft) {
        writeSimpleDoneReviewRecipientLinks({ agreementId: id, recipients: [], reviewLinksPending: true });
        setReviewLinksTick((t) => t + 1);
        return;
      }
      let linkRows: SimpleDoneReviewRecipientLinkRow[] = [];
      let attemptedMintCount = 0;
      try {
        const minted = await mintSimpleDoneReviewRecipientLinkRows({ agreementId: id, draft });
        linkRows = minted.rows;
        attemptedMintCount = minted.attemptedMintCount;
      } catch {
        mintThrew = true;
        linkRows = [];
      }
      const reviewLinksPendingLocal =
        linkRows.length === 0 && (attemptedMintCount > 0 || mintThrew || !draft);
      writeSimpleDoneReviewRecipientLinks({
        agreementId: id,
        recipients: linkRows,
        agreementPartyDisplayNames: orderedAuthoritativePartyDisplayNames(draft.parties),
        ...(reviewLinksPendingLocal ? { reviewLinksPending: true } : {}),
      });
      setReviewLinksTick((t) => t + 1);
    } finally {
      setRemintBusy(false);
    }
  }, [agreementId, remintBusy]);

  const copyRowReviewLink = useCallback((rowKey: string, href: string) => {
    const t = href.trim();
    if (!t) return;
    void navigator.clipboard.writeText(t).then(() => {
      setRowCopyFlashByKey((prev) => ({ ...prev, [rowKey]: true }));
      window.setTimeout(() => {
        setRowCopyFlashByKey((prev) => {
          const n = { ...prev };
          delete n[rowKey];
          return n;
        });
      }, 2000);
    });
  }, []);

  const backToDraft = useCallback(async () => {
    const id = agreementId.trim();
    logPaidProReviewTrackLifecycle("returned_to_owner", {
      agreementId: id,
      source: "simple_done_back_to_draft",
      canonicalHash: null,
    });
    logOwnerReviewLinkStatus({
      agreementId: id,
      action: "back_to_draft_click",
      backToDraftTarget: "/app/create",
      currentRoute: typeof window !== "undefined" ? window.location.pathname : "",
    });
    writeCreateReviewAgreementResumeId(id);
    try {
      clearPaidProEditReturnHandoff();
    } catch {
      /* ignore */
    }
    if (id) {
      const { ok, draft } = await fetchAgreementDraft(id);
      const hasRec = Boolean(ok && draft && paidProEditReturnHasRecoverableBody(draft));
      const recipientApprovalDetected = Boolean(draft && draftAuditHasRecipientRecordedApproval(draft));
      logOwnerReviewLinkStatus({
        agreementId: id,
        action: "back_to_draft_after_fetch",
        recipientApprovalDetected,
        willWritePaidProHandoff: shouldWritePaidProEditReturnHandoffAfterReview(draft, hasRec),
        backToDraftTarget: "/app/create",
      });
      if (shouldWritePaidProEditReturnHandoffAfterReview(draft, hasRec)) {
        writePaidProEditReturnHandoff({
          agreementId: id,
          liveDraft: draft!,
          premiumSendIntent: "review",
        });
      }
    }
    void navigate("/app/create");
  }, [agreementId, navigate]);

  const handleOwnerFinalizeOrContinueSigning = useCallback(async () => {
    const id = agreementId.trim();
    const openCount = ownerHandoffDraft ? findOpenRecipientProposals(ownerHandoffDraft.audit_log).length : 0;
    const recipientApprovalDetected = Boolean(
      ownerHandoffDraft && draftAuditHasRecipientRecordedApproval(ownerHandoffDraft),
    );
    const signingLockActive = Boolean((ownerSigningLockVid || "").trim());
    const primaryCtaLabel = signingLockActive ? "Continue to signing" : "Prepare signing packet";
    const negotiationHref = `/app/agreements/${encodeURIComponent(id)}`;

    if (openCount > 0) {
      logOwnerFinalizeRouteDecision({
        agreementId: id,
        recipientApprovalDetected,
        openProposalCount: openCount,
        signingLockActive,
        routeTarget: negotiationHref,
        primaryCtaLabel,
        reason: "open_recipient_proposals",
      });
      void navigate(negotiationHref);
      return;
    }

    if (!ownerHandoffDraft) {
      logOwnerFinalizeRouteDecision({
        agreementId: id,
        recipientApprovalDetected,
        openProposalCount: openCount,
        signingLockActive,
        routeTarget: negotiationHref,
        primaryCtaLabel,
        reason: "missing_draft_hydration",
      });
      void navigate(negotiationHref);
      return;
    }

    setFinalizeNavigating(true);
    try {
      const emailMergedDraft = mergeReviewLinkRecipientEmailsOntoHydratedDraft(ownerHandoffDraft, null);
      const handoff = readPremiumRecipientHandoff();
      const partyCap = Math.min((emailMergedDraft.parties ?? []).length, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
      const recipientSetup =
        handoff && partyCap > 0
          ? {
              recipientPartyEmails: linearPremiumRecipientSlots(handoff, partyCap).map((s) => s.email || ""),
              recipientPartySignerNames: linearPremiumRecipientSlots(handoff, partyCap).map(
                (s) => s.signerName || "",
              ),
              recipientPartySignerTitles: linearPremiumRecipientSlots(handoff, partyCap).map(
                (s) => s.signerTitle || "",
              ),
            }
          : null;
      const ok = await tryNavigatePaidProAgreementSenderFirstVs01Esign({
        navigate,
        agreementId: id,
        draft: emailMergedDraft,
        logReason: signingLockActive ? "simple_done_continue_vs01" : "simple_done_finalize_clean",
        reviewerApprovedCleanHandoff: true,
        recipientSetup,
      });
      if (ok) {
        logOwnerFinalizeRouteDecision({
          agreementId: id,
          recipientApprovalDetected,
          openProposalCount: openCount,
          signingLockActive,
          routeTarget: "vs01_esign_bridge",
          primaryCtaLabel,
          reason: "vs01_seed_navigate_ok",
        });
      } else {
        logOwnerFinalizeRouteDecision({
          agreementId: id,
          recipientApprovalDetected,
          openProposalCount: openCount,
          signingLockActive,
          routeTarget: negotiationHref,
          primaryCtaLabel,
          reason: "vs01_seed_navigate_failed",
        });
        void navigate(negotiationHref);
      }
    } finally {
      setFinalizeNavigating(false);
    }
  }, [agreementId, navigate, ownerHandoffDraft, ownerSigningLockVid]);

  function copyAllReviewLinks(): void {
    if (reviewHandoffRows.length === 0) return;
    const text =
      reviewHandoffRows.length === 1
        ? reviewHandoffRows[0]!.reviewHref
        : reviewHandoffRows.map((r) => `${r.displayName}: ${r.reviewHref}`).join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setReviewBundleCopyFlash(true);
      window.setTimeout(() => setReviewBundleCopyFlash(false), 2000);
    });
  }

  function onInviteOthers(): void {
    const subject = title ? `Agreement: ${title}` : "Agreement to review";
    const body = `Hi — here is our agreement to review and sign:\n${shareUrl}\n`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (isPaidProReviewDonePath) {
    const agreementTitle =
      normalizeAgreementDisplayTitle(
        (ownerHandoffDraft?.title || "").trim() || (title || "").trim() || "Agreement",
      ) ||
      (ownerHandoffDraft?.title || "").trim() ||
      (title || "").trim() ||
      "Agreement";
    const normalizedReviewerRows = ownerReviewPresentation.normalizedReviewerRows;
    const multiReviewer = normalizedReviewerRows.length > 1;
    const primaryReviewHref = (normalizedReviewerRows[0]?.reviewHref || "").trim();
    const primaryReviewHrefIsPreviewOnly = !extractReviewLinkTokenFromHref(primaryReviewHref);
    const anyReviewHref = normalizedReviewerRows.some((r) => r.reviewHref.trim().length > 0);
    const reviewerRowStatuses = ownerReviewPresentation.rowStatuses;
    const linksStillLoading =
      reviewApprovalAgg.requiredReviewerCount > 1 && Boolean(reviewLinksPending) && confirmedSend;
    const linksIncomplete =
      reviewApprovalAgg.requiredReviewerCount > 1 &&
      !reviewLinksPending &&
      normalizedReviewerRows.length > 0 &&
      normalizedReviewerRows.length < reviewApprovalAgg.requiredReviewerCount;
    const signingLockActive = Boolean((ownerSigningLockVid || "").trim());
    const noOpenChangeRequests =
      !ownerHandoffDraft || findOpenRecipientProposals(ownerHandoffDraft.audit_log).length === 0;
    const showAllReviewersApprovedNoEditsCopy =
      reviewApprovalAgg.allReviewersApproved && !signingLockActive && noOpenChangeRequests;
    const agreementIdTrimmed = agreementId.trim();
    const canFinalizeGate = canFinalizeReviewForSigning({
      agreementIdTrimmed,
      reviewLinksReady,
      anyReviewHref,
      linksStillLoading,
      linksIncomplete,
      reviewApprovalAggregate: reviewApprovalAgg,
    });
    const showTopContinueSigning = canContinueLockedSigningFromDonePage({
      agreementIdTrimmed,
      signingLockActive,
      reviewLinksReady,
      anyReviewHref,
      linksStillLoading,
      linksIncomplete,
    });
    const openProposalCount = ownerHandoffDraft
      ? findOpenRecipientProposals(ownerHandoffDraft.audit_log).length
      : 0;
    const showTopReviewSuggestedChanges = !signingLockActive && reviewApprovalAgg.hasOpenChangeRequests;
    const showTopFinalizeForSigning = !signingLockActive && canFinalizeGate;
    const qaOwnerReviewEnabled = isOwnerProposalReviewQaEnabled();
    const showOwnerQaProposalPanel = qaOwnerReviewEnabled || openProposalCount > 0;
    const showTopAnySigningPrimary =
      showTopContinueSigning ||
      showTopReviewSuggestedChanges ||
      showTopFinalizeForSigning;
    const openOwnerQaReview = () => {
      enableOwnerProposalReviewQaLocal();
      const path = buildOwnerQaReviewDonePath(agreementId);
      const absoluteUrl = buildOwnerQaReviewAbsoluteLink(agreementId);
      logOwnerReviewLinkBuilt({
        agreementId,
        path,
        absoluteUrl,
        source: "review_suggested_changes_cta",
      });
      void navigate(path);
      window.requestAnimationFrame(() => {
        const panel = document.querySelector('[data-testid="owner-proposal-review-qa-panel"]');
        if (panel && typeof panel.scrollIntoView === "function") {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    };
    const copyOwnerQaReviewLink = () => {
      enableOwnerProposalReviewQaLocal();
      const absoluteUrl = buildOwnerQaReviewAbsoluteLink(agreementId);
      logOwnerReviewLinkBuilt({
        agreementId,
        absoluteUrl,
        path: buildOwnerQaReviewDonePath(agreementId),
        source: "copy_owner_qa_review_link",
      });
      void navigator.clipboard.writeText(absoluteUrl).then(() => {
        setOwnerQaLinkCopyFlash(true);
        window.setTimeout(() => setOwnerQaLinkCopyFlash(false), 2000);
      });
    };
    const showBottomCopyPrimary =
      !multiReviewer &&
      reviewLinksReady &&
      anyReviewHref &&
      !showTopAnySigningPrimary;
    const flowShellTitle =
      !reviewLinksReady || !anyReviewHref
        ? "Review link could not be created"
        : signingLockActive
          ? "Ready to sign"
          : reviewApprovalAgg.flowShellTitle;
    const copyPrimaryReviewLink = () => {
      if (multiReviewer) return;
      const text = primaryReviewHref;
      if (!text.trim()) return;
      void navigator.clipboard.writeText(text).then(() => {
        setReviewBundleCopyFlash(true);
        window.setTimeout(() => setReviewBundleCopyFlash(false), 2000);
      });
    };
    const showReviewFlowDiagPanel = reviewFlowDiagLocal;
    const reviewReadyTitle =
      reviewLinksReady && anyReviewHref && reviewApprovalAgg.flowShellTitle === "Review link created"
        ? "Review link ready"
        : flowShellTitle;
    const reviewReadyDescription =
      reviewReadyTitle === "Review link ready"
        ? "Send this private link to the reviewer. Nothing is signed until all parties approve the same final draft."
        : reviewApprovalAgg.ownerStatusLine;

    return (
      <SimpleFlowShell title={reviewReadyTitle} hideHeader>
        <ReviewShell>
          <ReviewHeader
            title={reviewLinksReady && anyReviewHref ? reviewReadyTitle : "Review link needs attention"}
            description={
              reviewLinksReady && anyReviewHref
                ? reviewReadyDescription
                : "LawDog could not finish creating the reviewer link. You can retry or return to the draft."
            }
          />
          <div className="text-left">
            {reviewLinksReady && anyReviewHref ? (
              <>
                {linksStillLoading ? (
                  <ReviewNotice tone="warning" testId="simple-done-review-links-loading-warning">
                    Reviewer links are still loading. Refresh or try again.
                  </ReviewNotice>
                ) : null}
                {linksIncomplete ? (
                  <ReviewNotice tone="warning" testId="simple-done-review-links-incomplete-warning">
                    Some reviewer links did not load ({normalizedReviewerRows.length} of{" "}
                    {reviewApprovalAgg.requiredReviewerCount}). Try again from send or refresh this page.
                  </ReviewNotice>
                ) : null}
                {signingLockActive ? (
                  <ReviewNotice tone="success">
                    This agreement is locked for signature. Open it in your workspace to continue signing or copy
                    signing links.
                  </ReviewNotice>
                ) : showAllReviewersApprovedNoEditsCopy ? (
                  <ReviewNotice tone="success" testId="simple-done-all-approved-body">
                    {OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY}
                  </ReviewNotice>
                ) : reviewApprovalAgg.hasOpenChangeRequests ? (
                  <ReviewNotice tone="warning" testId="simple-done-open-change-requests">
                    <p className="font-semibold">Open change requests on this draft.</p>
                    <p className="mt-1">
                      A reviewer submitted proposed wording. Review suggested changes here before finalizing for signing.
                    </p>
                  </ReviewNotice>
                ) : reviewApprovalAgg.anyReviewerApproval ? (
                  <ReviewNotice>
                    {reviewApprovalAgg.requiredReviewerCount > 1
                      ? "Track each reviewer in the table. When everyone has approved without open change requests, you can finalize for signing."
                      : reviewApprovalAgg.ownerStatusLine}
                  </ReviewNotice>
                ) : null}
                {showOwnerQaProposalPanel ? (
                  <OwnerProposalReviewQaPanel
                    agreementId={agreementId}
                    draft={ownerHandoffDraft}
                    onDraftUpdated={setOwnerHandoffDraft}
                    forceVisible={openProposalCount > 0}
                  />
                ) : null}
                <span className="sr-only" data-testid="simple-done-owner-approval-status">
                  {signingLockActive ? "Signing version locked." : reviewApprovalAgg.ownerStatusLine}
                </span>
                {showTopAnySigningPrimary ? (
                  <div
                    className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
                    data-testid="simple-done-review-primary-actions"
                  >
                    {showTopContinueSigning ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                        data-testid="simple-done-continue-to-signing"
                        disabled={finalizeNavigating}
                        onClick={() => void handleOwnerFinalizeOrContinueSigning()}
                      >
                        {finalizeNavigating ? "Preparing signing packet…" : "Continue to signing"}
                      </button>
                    ) : null}
                    {showTopReviewSuggestedChanges ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                        data-testid="simple-done-review-suggested-changes"
                        onClick={openOwnerQaReview}
                      >
                        {OWNER_CTA_REVIEW_SUGGESTED_CHANGES}
                      </button>
                    ) : null}
                    {showTopReviewSuggestedChanges ? (
                      <button
                        type="button"
                        className="vs01-btn min-h-[2.5rem] border border-slate-300 bg-white px-4 text-sm text-slate-800 hover:bg-slate-50"
                        data-testid="simple-done-copy-owner-qa-review-link"
                        onClick={() => copyOwnerQaReviewLink()}
                      >
                        {ownerQaLinkCopyFlash ? "Copied QA link" : "Copy owner QA review link"}
                      </button>
                    ) : null}
                    {showTopFinalizeForSigning ? (
                      <button
                        type="button"
                        className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                        data-testid="simple-done-finalize-for-signing"
                        disabled={finalizeNavigating}
                        onClick={() => void handleOwnerFinalizeOrContinueSigning()}
                      >
                        {finalizeNavigating ? "Preparing signing packet…" : "Prepare signing packet"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <ReviewMetaGrid
                  className="mt-4"
                  items={[
                    { label: "Agreement", value: agreementTitle },
                    ...(!multiReviewer && reviewHandoffRows.length > 0
                      ? [
                          {
                            label: "Reviewer",
                            value: (
                              <span className="space-y-1">
                                {reviewHandoffRows.map((r) => (
                                  <span className="block" key={`${r.displayName}-${r.reviewHref}`}>
                                    {r.displayName}
                                    {r.recipientEmail ? <span className="text-slate-500"> · {r.recipientEmail}</span> : null}
                                  </span>
                                ))}
                              </span>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
                {ownerReviewFirstDisplayCorpus ? (
                  <ReviewDocumentFrame title="Review draft preview" className="mt-4" testId="simple-done-review-first-final-corpus-preview">
                    <p className="max-h-52 overflow-hidden whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {ownerReviewFirstDisplayCorpus.text.slice(0, 900)}
                    </p>
                  </ReviewDocumentFrame>
                ) : null}
                {multiReviewer ? (
                  <PaidProReviewReviewerLinksTable
                    rows={normalizedReviewerRows}
                    statuses={reviewerRowStatuses}
                    rowCopyFlashByKey={rowCopyFlashByKey}
                    onCopyRow={(k, href) => copyRowReviewLink(k, href)}
                    onOpenRow={(href, ctx) => {
                      const id = agreementId.trim();
                      const agreementIdShort = id.length <= 12 ? id : `${id.slice(0, 8)}…`;
                      const tok = extractReviewLinkTokenFromHref(href);
                      logReviewLinkRowOpen({
                        agreementIdShort,
                        partyIndex: ctx.partyIndex ?? ctx.rowIndex,
                        recipientId: (ctx.recipientId || "").trim() || "(none)",
                        hasToken: Boolean(tok),
                        tokenHashShort: recipientLinkTokenFingerprint(tok),
                      });
                      if (href.trim()) window.open(href, "_blank", "noopener,noreferrer");
                    }}
                  />
                ) : null}
                <ReviewActions className="mt-4">
                  {showBottomCopyPrimary ? (
                    <button
                      type="button"
                      className={reviewActionButtonClass("primary")}
                      data-testid="simple-done-copy-review-link-primary"
                      onClick={() => copyPrimaryReviewLink()}
                    >
                      {reviewBundleCopyFlash ? "Copied." : "Copy review link"}
                    </button>
                  ) : null}
                  {(signingLockActive || reviewApprovalAgg.anyReviewerApproval) && !multiReviewer ? (
                    <button
                      type="button"
                      className={reviewActionButtonClass("secondary")}
                      data-testid="simple-done-copy-review-link-secondary"
                      onClick={() => copyPrimaryReviewLink()}
                    >
                      {reviewBundleCopyFlash ? "Copied." : "Copy review link"}
                    </button>
                  ) : null}
                  {!multiReviewer ? (
                  <>
                    <button
                      type="button"
                      className={reviewActionButtonClass("secondary")}
                      data-testid="simple-done-open-reviewer-view-global"
                      title={
                        primaryReviewHrefIsPreviewOnly
                          ? "Preview only — copy the personal review link to submit edits."
                          : undefined
                      }
                      onClick={() => {
                        if (!primaryReviewHref) return;
                        logReviewLinkOpen({
                          agreementId,
                          href: primaryReviewHref,
                          source: "simple_done_open_reviewer_view",
                          previewOnly: primaryReviewHrefIsPreviewOnly,
                        });
                        logPaidProReviewTrackLifecycle("reviewer_link_opened", {
                          agreementId,
                          source: "simple_done_open_reviewer_view",
                          canonicalHash: null,
                        });
                        window.open(primaryReviewHref, "_blank", "noopener,noreferrer");
                      }}
                    >
                      {primaryReviewHrefIsPreviewOnly ? "Open preview (read-only)" : "Open reviewer view"}
                    </button>
                    {primaryReviewHrefIsPreviewOnly ? (
                      <p
                        className="w-full text-left text-[11px] leading-relaxed text-slate-500"
                        data-testid="simple-done-reviewer-preview-only-note"
                      >
                        Preview only — use Copy review link for a personal link that can submit proposed updates.
                      </p>
                    ) : null}
                  </>
                  ) : null}
                  <button
                    type="button"
                    className={reviewActionButtonClass("ghost")}
                    onClick={() => void backToDraft()}
                  >
                    Back to draft
                  </button>
                </ReviewActions>
              </>
            ) : (
              <>
                {reviewLinksPending && reviewApprovalAgg.requiredReviewerCount > 1 ? (
                  <p
                    className="text-sm leading-relaxed text-amber-100/95"
                    data-testid="simple-done-review-links-loading-only"
                  >
                    Reviewer links are still loading. Refresh or try again.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-300">
                    Review link could not be created. Please try again.
                  </p>
                )}
                <ReviewActions className="mt-4">
                  <button
                    type="button"
                    className={reviewActionButtonClass("primary")}
                    disabled={remintBusy}
                    onClick={() => void retryRemintReviewLink()}
                  >
                    {remintBusy ? "Working…" : "Try again"}
                  </button>
                  <button
                    type="button"
                    className={reviewActionButtonClass("secondary")}
                    onClick={() => void backToDraft()}
                  >
                    Back to draft
                  </button>
                </ReviewActions>
              </>
            )}
          </div>
          {showReviewFlowDiagPanel ? (
            <SimpleDoneReviewFlowDiagPanel
              visible
              agreementId={agreementId}
              requiredReviewerCount={reviewApprovalAgg.requiredReviewerCount}
              approvedReviewerCount={reviewApprovalAgg.approvedReviewerCount}
              rows={normalizedReviewerRows}
              statuses={reviewerRowStatuses}
            />
          ) : null}
        </ReviewShell>
      </SimpleFlowShell>
    );
  }

  return (
    <SimpleFlowShell
      step={lifecycleStepForStage("proof")}
      progressLabels={AGREEMENT_LIFECYCLE_PROGRESS_LABELS}
      title="Agreement complete"
      subtitle={title ? `“${title}”` : JOY_COPY.taglineMoveWithProof}
    >
      <div className="vs01-card vs01-card--envelope space-y-6 text-center sm:text-left">
        {showClaimBlock && csn ? (
          <ClaimRecordCard
            flow="agreement_complete"
            recordId={agreementId}
            visible
            className="text-left"
          />
        ) : null}
        {confirmedSend && showFirstWorkflowReinforcement ? (
          <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 px-4 py-4 text-left sm:px-5">
            <p className="text-sm font-medium leading-snug text-sky-100">
              You&apos;ve completed your first agreement — your records are now verifiable.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                onClick={() => {
                  markFirstWorkflowReinforcementDone();
                  setShowFirstWorkflowReinforcement(false);
                  navigate("/app/create");
                }}
              >
                Create another agreement
              </button>
              <button
                type="button"
                className="text-xs text-slate-500 underline-offset-2 hover:text-slate-400 hover:underline"
                onClick={() => {
                  markFirstWorkflowReinforcementDone();
                  setShowFirstWorkflowReinforcement(false);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={`rounded-xl border border-emerald-900/35 bg-emerald-950/25 px-5 py-6 ${
            signed || confirmedSend ? "lawdog-success-banner lawdog-success-panel-accent lawdog-success-panel-enter" : ""
          }`}
        >
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
            <JoyMilestoneMark className="shrink-0" />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              {signed ? (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <LawdogRecordedMark size="md" />
                    <span className="text-lg font-semibold text-emerald-100">Recorded</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-emerald-100">{JOY_COPY.signSealedProof}</p>
                  <p className="mt-2 text-sm text-slate-300">Everyone who needed to sign has signed.</p>
                  <p className="mt-3 text-sm font-medium text-emerald-100/95">
                    Agreement recorded. Your proof is secured.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-emerald-100">{headline}</p>
                  <p className="mt-2 text-sm text-slate-300">{subline}</p>
                </>
              )}
              {confirmedSend ? (
                csn ? (
                  <p className="mt-3 text-sm font-medium text-emerald-100/95">Sent. Save below if you want it in your workspace.</p>
                ) : (
                  <>
                    <p className="mt-3 text-sm font-medium text-emerald-100/95">
                      You created and sent this agreement.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      Now you can find and reuse this anytime.
                    </p>
                  </>
                )
              ) : null}
              {confirmedSend || signed ? (
                <p className="mt-3 text-[11px] leading-snug text-slate-500">{PROOF_LADDER_SUBTITLE}</p>
              ) : null}
              {confirmedSend || signed ? (
                <p className="mt-2 text-xs leading-relaxed text-emerald-200/85">{CANONICAL_PROOF_SENTENCE}</p>
              ) : null}
              {confirmedSend || signed ? (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <LawdogOnRecordStamp surface="dark" />
                </div>
              ) : null}
              {signed || confirmedSend ? (
                <p className="mt-3 text-left text-[11px] leading-relaxed text-slate-500 sm:text-center">
                  <span className="font-medium text-slate-400">Recorded</span> means your agreement has a secured proof
                  trail in LawDog.{" "}
                  {signed
                    ? "Share links from this flow if anyone still needs to sign; save below to keep everything in your workspace."
                    : "When everyone has signed, your proof finalizes here. Save below if you want this in your workspace."}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {showClaimBlock && !csn ? (
          <ClaimRecordCard
            flow="agreement_complete"
            recordId={agreementId}
            visible
            className="text-left"
          />
        ) : null}
        {confirmedSend && reviewLinksReady ? (
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 px-5 py-4 text-left">
            <p className="text-xs leading-relaxed text-slate-400">
              Personal review links (not the same as the public verify link below).
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                onClick={() => copyAllReviewLinks()}
              >
                {reviewBundleCopyFlash ? "Copied" : "Copy review link"}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl).then(() => {
                    setPublicVerifyCopyFlash(true);
                    window.setTimeout(() => setPublicVerifyCopyFlash(false), 2000);
                  });
                }}
              >
                {publicVerifyCopyFlash ? "Copied" : "Copy public verify link"}
              </button>
            </div>
          </div>
        ) : null}
        {confirmedSend && reviewLinksPending ? (
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/30 px-4 py-3 text-left text-sm text-slate-300">
            <p className="leading-snug">Review link is still preparing. Refresh or return to send.</p>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary mt-3 min-h-[2.25rem] px-3 text-xs"
              onClick={() => navigate(`/app/send/${encodeURIComponent(agreementId)}`)}
            >
              Back to send
            </button>
          </div>
        ) : null}
        <div className="rounded-xl border border-sky-900/35 bg-sky-950/20 px-5 py-4">
          <p className="text-sm font-medium text-sky-100">{JOY_COPY.proofSecured}</p>
          <p className="mt-1 text-xs text-slate-400">
            Share verification — others can see status on the public page, not your full agreement text there.
          </p>
        </div>
        {confirmedSend ? (
          <div className="rounded-lg border border-slate-800/70 bg-slate-950/30 px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Remember &amp; reuse</p>
            <p className="mt-1 text-xs text-slate-500">
              Find similar agreements or search your workspace by meaning — premium plans unlock Agreement Memory.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--compact text-[11px]"
                onClick={() =>
                  navigateToReuse(
                    "simple_done_reuse",
                    `/app/agreement-memory?similarTo=${encodeURIComponent(agreementId)}`
                  )
                }
              >
                Find similar agreements
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
                onClick={() => navigateToReuse("simple_done_reuse", "/app/agreement-memory")}
              >
                Find and reuse agreements
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              On Pro and eligible plans:{" "}
              <button
                type="button"
                className="font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
                onClick={() => navigateToWorkProduct("simple_done_reuse")}
              >
                Generate issue analysis or executive summary from your workspace
              </button>
              .
            </p>
          </div>
        ) : null}
        {confirmedSend ? (
          <div className="space-y-2">
            <p className="text-center text-[11px] leading-relaxed text-slate-500 sm:text-left">
              {RECORDS_DOWNLOAD_KEEP_COPY_SHORT} {PRODUCT_NOT_LAW_FIRM}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {!reviewLinksReady ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl).then(() => {
                  setCopyFlash(true);
                  window.setTimeout(() => setCopyFlash(false), 2000);
                });
              }}
            >
              {copyFlash ? "Copied" : "Copy public verify link"}
            </button>
            ) : null}
            <button type="button" className="vs01-btn vs01-btn--secondary w-full sm:w-auto" onClick={onInviteOthers}>
              Invite others
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canDownload}
              title={
                !canDownload ? "Upgrade to download without watermark (when enabled)." : "Open workspace for exports"
              }
              onClick={() => navigate(`/app/agreements/${encodeURIComponent(agreementId)}`)}
            >
              Download
            </button>
            </div>
          </div>
        ) : null}
        {confirmedSend ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary w-full sm:w-auto"
              onClick={() => {
                prepareFreshMarketingEntry();
                navigate("/app/create");
              }}
            >
              Create another agreement faster
            </button>
            <button
              type="button"
              className="text-sm font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline"
              onClick={() => {
                prepareFreshMarketingEntry();
                navigate("/");
              }}
            >
              Back to home
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mx-auto block text-sm font-medium text-teal-400/95 underline-offset-2 hover:text-teal-300 hover:underline sm:mx-0"
            onClick={() => {
              prepareFreshMarketingEntry();
              navigate("/");
            }}
          >
            Create your own agreement →
          </button>
        )}
        {signed ? <JoyShareMilestone agreementId={agreementId} /> : null}
        <JoinLeaderboardOptInCard variant="post_completion" eligible={Boolean(confirmedSend || signed)} />
        <p className="text-center text-[10px] leading-relaxed text-slate-600 sm:text-left">
          <span className="text-slate-500">Support reference — agreement ID:</span>{" "}
          <code className="break-all text-slate-500">{agreementId}</code>{" "}
          <button
            type="button"
            className="font-medium text-sky-400/95 underline-offset-2 hover:text-sky-300 hover:underline"
            onClick={() => void navigator.clipboard.writeText(agreementId)}
          >
            Copy
          </button>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          {!signed && !confirmedSend ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--primary"
              onClick={() => navigate(`/app/send/${encodeURIComponent(agreementId)}`)}
            >
              Send this agreement
            </button>
          ) : null}
          <button
            type="button"
            className="vs01-btn vs01-btn--primary"
            disabled={!signed && !confirmedSend}
            title={!signed && !confirmedSend ? "Send the agreement from the Send step first." : undefined}
            onClick={() => {
              emitActionCompleted("proof", { agreementId, meta: { surface: "done_cta_verify" } });
              navigate(`/app/verification/${encodeURIComponent(agreementId)}`);
            }}
          >
            View verification
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary"
            onClick={() => navigate(`/app/agreements/${encodeURIComponent(agreementId)}`)}
          >
            Open full editor
          </button>
        </div>
      </div>
    </SimpleFlowShell>
  );
}
