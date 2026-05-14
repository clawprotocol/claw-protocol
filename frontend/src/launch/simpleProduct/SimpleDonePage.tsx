import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { agreementPublicVerifyPath, fetchPublicAgreementVerify } from "../../agreement/agreementPublicVerify";
import { fetchAgreementDraft, fetchAgreementDraftWithSigningLock } from "../../agreement/agreementWorkspaceApi";
import { writeCreateReviewAgreementResumeId } from "../../components/agreements/agreementIntakeStorage";
import {
  CANONICAL_PROOF_SENTENCE,
  JOY_COPY,
  SIMPLE_FLOW_PROGRESS_LABELS,
} from "../../joy/clawJoyCopy";
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
import {
  mintSimpleDoneReviewRecipientLinkRows,
  readSimpleDoneReviewRecipientLinks,
  writeSimpleDoneReviewRecipientLinks,
  type SimpleDoneReviewRecipientLinkRow,
} from "./simpleDoneReviewRecipientLinks";
import {
  draftAuditHasRecipientRecordedApproval,
  logOwnerFinalizeRouteDecision,
  logOwnerReviewLinkStatus,
  shouldWritePaidProEditReturnHandoffAfterReview,
} from "../../components/agreements/draftRecipientReviewSignals";
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
  formatAuthoritativeAgreementPartiesHeadline,
  orderedAuthoritativePartyDisplayNames,
} from "../../agreement/handoffPartyDisplay";

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
      setTitle((v?.summary?.title || "").trim() || null);
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

  const reviewHandoffRows = reviewRecipientHandoff?.recipients ?? [];
  const reviewLinksReady = confirmedSend && reviewHandoffRows.length > 0;
  const reviewLinksPending =
    confirmedSend &&
    reviewRecipientHandoff?.intent === "review" &&
    (reviewRecipientHandoff.reviewLinksPending === true || reviewHandoffRows.length === 0);
  const isPaidProReviewDonePath =
    Boolean(confirmedSend && !signed && reviewRecipientHandoff?.intent === "review");

  const cachedAgreementPartyDisplayNames = reviewRecipientHandoff?.agreementPartyDisplayNames;
  const paidProDoneAgreementPartyNames = useMemo(() => {
    const fromDraft = orderedAuthoritativePartyDisplayNames(ownerHandoffDraft?.parties);
    if (fromDraft.length > 0) return fromDraft;
    return cachedAgreementPartyDisplayNames ?? [];
  }, [ownerHandoffDraft?.parties, cachedAgreementPartyDisplayNames]);

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
    const recipientApprovalDetected = Boolean(
      ownerHandoffDraft && draftAuditHasRecipientRecordedApproval(ownerHandoffDraft),
    );
    const signingLockActive = Boolean((ownerSigningLockVid || "").trim());
    const primaryCtaLabel = signingLockActive
      ? "Continue to signing"
      : recipientApprovalDetected
        ? "Finalize for signing"
        : "Copy review link";
    const payload = {
      agreementId,
      recipientApprovalDetected,
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
  }, [agreementId, isPaidProReviewDonePath, reviewLinksReady, ownerHandoffDraft, ownerSigningLockVid]);

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

  const backToDraft = useCallback(async () => {
    const id = agreementId.trim();
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
    const primaryCtaLabel = signingLockActive ? "Continue to signing" : "Finalize for signing";
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
      (ownerHandoffDraft?.title || "").trim() || (title || "").trim() || "Agreement";
    const primaryReviewHref = (reviewHandoffRows[0]?.reviewHref || "").trim();
    const recipientApprovalDetected = Boolean(
      ownerHandoffDraft && draftAuditHasRecipientRecordedApproval(ownerHandoffDraft),
    );
    const signingLockActive = Boolean((ownerSigningLockVid || "").trim());
    const noOpenChangeRequests =
      !ownerHandoffDraft || findOpenRecipientProposals(ownerHandoffDraft.audit_log).length === 0;
    const showApprovedNoEditsCopy =
      recipientApprovalDetected && !signingLockActive && noOpenChangeRequests;
    const flowShellTitle =
      !reviewLinksReady || !primaryReviewHref
        ? "Review link could not be created"
        : signingLockActive
          ? "Ready to sign"
          : recipientApprovalDetected
            ? "Reviewer approved"
            : "Review link created";
    const copyPrimaryReviewLink = () => {
      const text =
        reviewHandoffRows.length <= 1
          ? primaryReviewHref
          : reviewHandoffRows.map((r) => `${r.displayName}: ${r.reviewHref}`).join("\n");
      if (!text.trim()) return;
      void navigator.clipboard.writeText(text).then(() => {
        setReviewBundleCopyFlash(true);
        window.setTimeout(() => setReviewBundleCopyFlash(false), 2000);
      });
    };

    return (
      <SimpleFlowShell title={flowShellTitle}>
        <div className="vs01-card vs01-card--envelope space-y-5 text-center sm:text-left">
          <div className="rounded-xl border border-emerald-900/35 bg-emerald-950/25 px-5 py-6">
            {reviewLinksReady && primaryReviewHref ? (
              <>
                {signingLockActive ? (
                  <p className="text-sm leading-relaxed text-emerald-100/95">
                    This agreement is locked for signature. Open it in your workspace to continue signing or copy
                    signing links.
                  </p>
                ) : showApprovedNoEditsCopy ? (
                  <>
                    <p className="text-base font-semibold text-emerald-100">
                      Reviewer approved this draft without requesting changes.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      Nothing is signed yet. Open the agreement workspace to finalize for signing when you are ready.
                    </p>
                  </>
                ) : recipientApprovalDetected ? (
                  <>
                    <p className="text-base font-semibold text-emerald-100">Reviewer accepted this draft.</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {noOpenChangeRequests
                        ? "Open your agreement workspace to finalize for signing when you are ready."
                        : "There are still open change requests on this agreement. Open the workspace to resolve them before finalizing."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-300">
                    Nothing has been signed. Copy this private link and send it to the reviewer.
                  </p>
                )}
                {recipientApprovalDetected ? (
                  <p
                    className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-950/40 px-3 py-2 text-left text-xs font-medium text-emerald-50"
                    data-testid="simple-done-owner-approval-status"
                  >
                    Status:{" "}
                    {signingLockActive
                      ? "Signing version locked — continue in workspace"
                      : "Reviewer approved — ready to sign"}
                  </p>
                ) : null}
                <dl className="mt-5 space-y-3 text-left text-sm text-slate-300">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement</dt>
                    <dd className="mt-0.5 font-medium text-slate-100">{agreementTitle}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement parties</dt>
                    <dd className="mt-0.5 text-slate-200">
                      {paidProDoneAgreementPartyNames.length > 2 ? (
                        <ol className="list-decimal space-y-0.5 pl-5">
                          {paidProDoneAgreementPartyNames.map((n, i) => (
                            <li key={`simple_done_party_${i}`}>{n}</li>
                          ))}
                        </ol>
                      ) : ownerHandoffDraft?.parties?.length ? (
                        formatAuthoritativeAgreementPartiesHeadline(ownerHandoffDraft.parties)
                      ) : paidProDoneAgreementPartyNames.length > 0 ? (
                        paidProDoneAgreementPartyNames.join(", ")
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  {reviewHandoffRows.length > 0 ? (
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Reviewer{reviewHandoffRows.length > 1 ? "s" : ""}
                      </dt>
                      <dd className="mt-0.5 space-y-1">
                        {reviewHandoffRows.map((r) => (
                          <div key={`${r.displayName}-${r.reviewHref}`}>
                            <span className="font-medium text-slate-100">{r.displayName}</span>
                            {r.recipientEmail ? (
                              <span className="text-slate-400"> · {r.recipientEmail}</span>
                            ) : null}
                          </div>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <label className="mt-5 block text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Review link
                  <input
                    type="text"
                    readOnly
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2.5 font-mono text-[11px] text-slate-200"
                    value={primaryReviewHref}
                    aria-label="Review link URL"
                  />
                </label>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {signingLockActive ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                      data-testid="simple-done-continue-to-signing"
                      disabled={finalizeNavigating}
                      onClick={() => void handleOwnerFinalizeOrContinueSigning()}
                    >
                      {finalizeNavigating ? "Opening…" : "Continue to signing"}
                    </button>
                  ) : recipientApprovalDetected ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                      data-testid="simple-done-finalize-for-signing"
                      disabled={finalizeNavigating}
                      onClick={() => void handleOwnerFinalizeOrContinueSigning()}
                    >
                      {finalizeNavigating ? "Opening…" : "Finalize for signing"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                      onClick={() => copyPrimaryReviewLink()}
                    >
                      {reviewBundleCopyFlash ? "Copied" : "Copy review link"}
                    </button>
                  )}
                  {signingLockActive || recipientApprovalDetected ? (
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm"
                      data-testid="simple-done-copy-review-link-secondary"
                      onClick={() => copyPrimaryReviewLink()}
                    >
                      {reviewBundleCopyFlash ? "Copied" : "Copy review link"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm"
                    onClick={() => {
                      if (primaryReviewHref) window.open(primaryReviewHref, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Open reviewer view
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-400 hover:underline sm:min-h-[2.5rem]"
                    onClick={() => void backToDraft()}
                  >
                    Back to draft
                  </button>
                </div>
                <p className="mt-4 text-left text-[11px] leading-relaxed text-slate-500">
                  To test the reviewer experience, open the reviewer link in incognito or another browser.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-slate-300">
                  Review link could not be created. Please try again.
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm disabled:opacity-50"
                    disabled={remintBusy}
                    onClick={() => void retryRemintReviewLink()}
                  >
                    {remintBusy ? "Working…" : "Try again"}
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm"
                    onClick={() => void backToDraft()}
                  >
                    Back to draft
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </SimpleFlowShell>
    );
  }

  return (
    <SimpleFlowShell
      step={4}
      progressLabels={SIMPLE_FLOW_PROGRESS_LABELS}
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
