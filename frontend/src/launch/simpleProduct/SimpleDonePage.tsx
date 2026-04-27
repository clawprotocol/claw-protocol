import { useEffect, useRef, useState } from "react";
import { agreementPublicVerifyPath, fetchPublicAgreementVerify } from "../../agreement/agreementPublicVerify";
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
import { ProofOpportunityBridgeCard } from "../affiliate/ProofOpportunityBridgeCard";
import { ClaimRecordCard } from "../../conversion/ClaimRecordCard";
import { JoinLeaderboardOptInCard } from "../../leaderboard/JoinLeaderboardOptInCard";
import { trackProofFinalizeMilestone, trackProofSendMilestone } from "../../leaderboard/trackProofLifecycle";
import { PROOF_LADDER_SUBTITLE } from "../../components/proof/proofTrustLadder";
import { LawdogOnRecordStamp } from "../../components/ui/LawdogOnRecordStamp";
import { LawdogRecordedMark } from "../../components/ui/LawdogRecordedMark";
import { PRODUCT_NOT_LAW_FIRM, RECORDS_DOWNLOAD_KEEP_COPY_SHORT } from "../../compliance/disclosureCopy";

export function SimpleDonePage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const { navigateToReuse, navigateToWorkProduct } = usePowerGatedNavigation();
  const [signed, setSigned] = useState<boolean | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [confirmedSend, setConfirmedSend] = useState(() => hasMarkedSimpleFlowSent(agreementId));
  const [copyFlash, setCopyFlash] = useState(false);
  const [showFirstWorkflowReinforcement, setShowFirstWorkflowReinforcement] = useState(false);
  const finalizeLoggedRef = useRef(false);

  const verifyPath = agreementPublicVerifyPath(agreementId);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${verifyPath}` : verifyPath;
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
      ? "Agreement saved"
      : JOY_COPY.readyToSendHeadline;
  const subline = signed
    ? "Everyone who needed to sign has signed."
    : confirmedSend
      ? "It’s in your Agreement Memory — share links from there when you are ready."
      : JOY_COPY.readyToSendSubline;

  function onInviteOthers(): void {
    const subject = title ? `Agreement: ${title}` : "Agreement to review";
    const body = `Hi — here is our agreement to review and sign:\n${shareUrl}\n`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
        {confirmedSend ? (
          <div className="rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Where things stand</p>
            <p className="mt-1 text-[10px] leading-snug text-slate-600">
              Live statuses ship next — here&apos;s the path recipients follow.
            </p>
            <ol className="mt-4 flex list-none flex-wrap justify-center gap-2 sm:justify-start" aria-label="Agreement progress">
              <li className="rounded-lg border border-emerald-800/45 bg-emerald-950/25 px-3 py-2 text-xs font-medium text-emerald-100">
                <span aria-hidden>✓</span> Sent
              </li>
              <li
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  signed ? "border-slate-600 text-slate-400" : "border-amber-800/35 bg-amber-950/15 text-amber-100/90"
                }`}
              >
                <span aria-hidden>⏳</span> Viewed
              </li>
              <li
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  signed
                    ? "border-emerald-800/45 bg-emerald-950/20 text-emerald-100"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                <span aria-hidden>✍️</span> Signed
              </li>
              <li className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400">
                <span aria-hidden>💰</span> Paid
              </li>
            </ol>
          </div>
        ) : null}
        {confirmedSend ? (
          <ProofOpportunityBridgeCard agreementId={agreementId} mode={signed ? "proof_ready" : "sent_pending"} />
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
              {copyFlash ? "Copied" : "Copy link"}
            </button>
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
