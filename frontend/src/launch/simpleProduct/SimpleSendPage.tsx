import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgreementReviewErrorBoundary } from "../../agreement/AgreementReviewErrorBoundary";
import AgreementReview from "../../components/agreements/AgreementReview";
import { JoyFlashBanner } from "../../joy/JoyFlashBanner";
import { SIMPLE_FLOW_PROGRESS_LABELS } from "../../joy/clawJoyCopy";
import { consumeJoyFlash, emitActionCompleted } from "../../joy/joyTelemetry";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { markSimpleFlowSent } from "../simpleFlowSent";
import {
  canAccessSimpleSendActions,
  isSimpleSendPaywallActive,
  markSimpleFlowSendUnlocked,
} from "../simpleFlowSendUnlock";
import { authoritativeProBypassSimpleSendPaywall } from "../../components/agreements/sendHandoffAuthoritativeCorpus";
import {
  clearPostProUnlockCelebrate,
  fetchWorkspaceProEntitlement,
} from "../../agreement/agreementProFunnelGate";
import { clearPremiumSendIntent, peekPremiumSendIntent, writePremiumSendIntent } from "./premiumSendIntent";
import { readSimpleSendHandoffFromHistory, resolveSimpleSendOpenPhase } from "./simpleSendHandoff";
import { getPricingCadencePreference } from "../pricingCadenceStorage";
import { useLaunchNav } from "../LaunchNavContext";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { SendConversionModal } from "./SendConversionModal";
import { PAYWALL_SEND_FINAL_HEADLINE, PAYWALL_SEND_FINAL_SUB } from "../paywallMessaging";
import { FIRST_WORKFLOW_GUARANTEE_SHORT, REVIEW_STRUCTURED_WIN_LINE } from "../pricingContent";

const FLOW_PROGRESS = SIMPLE_FLOW_PROGRESS_LABELS;

const SIMPLE_SEND_PHASE_SS_KEY = (id: string) => `claw_simple_send_phase_v1_${encodeURIComponent(id)}`;

function readPersistedSendPhase(id: string): "send" | null {
  try {
    return sessionStorage.getItem(SIMPLE_SEND_PHASE_SS_KEY(id)) === "send" ? "send" : null;
  } catch {
    return null;
  }
}

function persistSendPhase(id: string) {
  try {
    sessionStorage.setItem(SIMPLE_SEND_PHASE_SS_KEY(id), "send");
  } catch {
    /* ignore */
  }
}

function clearPersistedSendPhase(id: string) {
  try {
    sessionStorage.removeItem(SIMPLE_SEND_PHASE_SS_KEY(id));
  } catch {
    /* ignore */
  }
}

export function SimpleSendPage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const [flash, setFlash] = useState<"draft_ready" | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCopy, setPaywallCopy] = useState<{ headline: string; sub: string } | null>(null);
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  const sendLanding = useMemo(() => readSimpleSendHandoffFromHistory(agreementId), [agreementId]);
  const [simpleFlowPremiumHandoffIntent, setSimpleFlowPremiumHandoffIntent] = useState(
    () => sendLanding.premiumIntent ?? peekPremiumSendIntent(),
  );
  const resolveSimpleFlowPhase = useCallback((intent: "review" | "signature" | null): "review" | "send" => {
    if (typeof window === "undefined") return "review";
    const q = new URLSearchParams(window.location.search);
    const urlPhase = q.get("phase") === "send" ? "send" : null;
    const persistedSendPhase = readPersistedSendPhase(agreementId) === "send" ? "send" : null;
    return resolveSimpleSendOpenPhase({
      urlPhase,
      handoffOpenPhase: sendLanding.openFlowPhase,
      canAccessSendActions: canAccessSimpleSendActions(agreementId),
      premiumIntent: intent,
      persistedSendPhase,
    });
  }, [agreementId, sendLanding.openFlowPhase]);
  const [simpleFlowPhase, setSimpleFlowPhase] = useState<"review" | "send">(() =>
    resolveSimpleFlowPhase(sendLanding.premiumIntent ?? peekPremiumSendIntent()),
  );
  const initialDraftSnapshot = sendLanding.primed;
  const streamlinedSimpleFlow = sendLanding.streamlined;
  const [authoritativeProBypass, setAuthoritativeProBypass] = useState(() =>
    authoritativeProBypassSimpleSendPaywall(initialDraftSnapshot),
  );
  /** Re-evaluate `canAccessSimpleSendActions` after session unlock from authoritative Pro load. */
  const [sendUnlockTick, setSendUnlockTick] = useState(0);
  const authoritativeProBypassRef = useRef(authoritativeProBypass);
  authoritativeProBypassRef.current = authoritativeProBypass;
  const premiumSendUnlocked = useMemo(() => {
    void sendUnlockTick;
    return canAccessSimpleSendActions(agreementId) || workspaceProEntitled;
  }, [agreementId, workspaceProEntitled, sendUnlockTick]);

  useEffect(() => {
    setAuthoritativeProBypass(authoritativeProBypassSimpleSendPaywall(initialDraftSnapshot));
  }, [initialDraftSnapshot]);

  useEffect(() => {
    if (!authoritativeProBypass) return;
    if (!isSimpleSendPaywallActive()) return;
    if (canAccessSimpleSendActions(agreementId)) return;
    markSimpleFlowSendUnlocked(agreementId);
    setSendUnlockTick((n) => n + 1);
  }, [authoritativeProBypass, agreementId]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceProEntitlement().then((ok) => {
      if (!cancelled) setWorkspaceProEntitled(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const k = consumeJoyFlash();
    if (k === "draft_ready") setFlash("draft_ready");
  }, []);

  useEffect(() => {
    if (!paywallOpen || !workspaceProEntitled) return;
    markSimpleFlowSendUnlocked(agreementId);
    setPaywallOpen(false);
    setPaywallCopy(null);
  }, [paywallOpen, workspaceProEntitled, agreementId]);

  useEffect(() => {
    const onPaywallRequired = (e: Event) => {
      if (workspaceProEntitled || authoritativeProBypassRef.current) return;
      const d = (e as CustomEvent<Record<string, unknown>>).detail ?? {};
      setPaywallOpen(true);
      const h = d.paywallHeadline;
      const s = d.paywallSub;
      if (typeof h === "string" && typeof s === "string" && h.trim() && s.trim()) {
        setPaywallCopy({ headline: h.trim(), sub: s.trim() });
      } else {
        setPaywallCopy(null);
      }
    };
    window.addEventListener("claw:paywall-required", onPaywallRequired);
    return () => window.removeEventListener("claw:paywall-required", onPaywallRequired);
  }, [workspaceProEntitled]);

  useEffect(() => {
    const intent = sendLanding.premiumIntent ?? peekPremiumSendIntent();
    setSimpleFlowPremiumHandoffIntent(intent);
    setSimpleFlowPhase(resolveSimpleFlowPhase(intent));
    clearPremiumSendIntent();
  }, [agreementId, resolveSimpleFlowPhase, sendLanding.openFlowPhase, sendLanding.premiumIntent]);

  useEffect(() => {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      console.debug("[SimpleSend] review route", agreementId, { hasPrimedDraft: Boolean(initialDraftSnapshot) });
    }
  }, [agreementId, initialDraftSnapshot]);

  /** Deep-link cleanup: ?phase=send requires unlock; strip query once valid. */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("phase") !== "send") return;
    if (!canAccessSimpleSendActions(agreementId)) {
      navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
      return;
    }
    url.searchParams.delete("phase");
    const qs = url.searchParams.toString();
    window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
  }, [agreementId, navigate]);

  useEffect(() => {
    if (simpleFlowPhase !== "send") return;
    if (!canAccessSimpleSendActions(agreementId)) {
      setSimpleFlowPhase("review");
      navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
    }
  }, [agreementId, simpleFlowPhase, navigate]);

  /** After `?phase=send` is stripped from the URL, keep send so refresh on `/app/send/:id` stays on the send step. */
  useEffect(() => {
    if (simpleFlowPhase !== "send") return;
    persistSendPhase(agreementId);
  }, [agreementId, simpleFlowPhase]);

  /** Premium create-flow: jump to Send once paywall unlocks if intent was signature. */
  useEffect(() => {
    const intent = simpleFlowPremiumHandoffIntent;
    if (intent !== "signature") return;
    if (!canAccessSimpleSendActions(agreementId)) return;
    setSimpleFlowPhase("send");
  }, [agreementId, paywallOpen, simpleFlowPremiumHandoffIntent]);

  /**
   * Reopened in-progress send with no stored intent:
   * infer signature mode from current workflow state so we do not force a fresh fork.
   */
  useEffect(() => {
    if (!premiumSendUnlocked) return;
    if (simpleFlowPremiumHandoffIntent !== null) return;
    if (simpleFlowPhase !== "send") return;
    writePremiumSendIntent("signature");
    setSimpleFlowPremiumHandoffIntent("signature");
  }, [premiumSendUnlocked, simpleFlowPremiumHandoffIntent, simpleFlowPhase]);

  const shellStep = simpleFlowPhase === "review" ? 2 : 3;
  const title = "Your Agreement";
  const showPremiumFork = premiumSendUnlocked && simpleFlowPhase === "review" && simpleFlowPremiumHandoffIntent === null;

  const subtitle =
    showPremiumFork
      ? "Pick how you close: collaborate on changes before signing, or send for tracked signature — both paths keep you looking deal-ready."
      : premiumSendUnlocked && simpleFlowPremiumHandoffIntent === "review"
        ? simpleFlowPhase === "review"
          ? "Collaboration — redline together, then share a review link when the terms feel right."
          : "Deliver your review link — counterparties see a clean workspace; nothing finalizes until you confirm."
        : premiumSendUnlocked && simpleFlowPremiumHandoffIntent === "signature"
          ? simpleFlowPhase === "review"
            ? "Signature — lock the draft, add signers, then send a tracked request with proof on file."
            : "Tracked signature — professional delivery, signer progress, and proof when it matters."
          : streamlinedSimpleFlow && simpleFlowPhase === "review"
            ? "Create → Review → Send. Preview and key terms, then continue."
            : streamlinedSimpleFlow && simpleFlowPhase === "send"
              ? "Review recipients and confirm send."
              : simpleFlowPhase === "review"
                ? "Draft → Review → Send. Create instantly, then send professionally when you’re ready."
                : "Review the recipient and send your agreement link. Nothing is sent until you confirm.";

  const billingReturnTo = `/app/send/${encodeURIComponent(agreementId)}?phase=send`;

  return (
    <SimpleFlowShell step={shellStep as 1 | 2 | 3 | 4} progressLabels={FLOW_PROGRESS} title={title} subtitle={subtitle}>
      {flash === "draft_ready" && !streamlinedSimpleFlow ? (
        <JoyFlashBanner kind="draft_ready" onDismiss={() => setFlash(null)} />
      ) : null}

      {simpleFlowPhase === "review" && !streamlinedSimpleFlow ? (
        <div className="mb-8 rounded-xl border border-emerald-800/35 bg-emerald-950/20 px-4 py-4 sm:px-5">
          <p className="text-center text-sm font-semibold text-emerald-100 sm:text-left">{REVIEW_STRUCTURED_WIN_LINE}</p>
          <p className="mt-1.5 text-center text-xs leading-relaxed text-slate-400 sm:text-left">
            Review details on the right, then continue — nothing is sent until you confirm.
          </p>
          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500 sm:text-left">
            {FIRST_WORKFLOW_GUARANTEE_SHORT}
          </p>
        </div>
      ) : null}

      {showPremiumFork ? (
        <div className="mb-8 rounded-xl border border-slate-800/70 bg-slate-950/[0.35] px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Premium path</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary w-full min-h-[2.75rem] px-6"
              onClick={() => {
                writePremiumSendIntent("review");
                setSimpleFlowPremiumHandoffIntent("review");
                setSimpleFlowPhase("review");
              }}
            >
              Review link path
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary w-full min-h-[2.75rem] px-6"
              onClick={() => {
                writePremiumSendIntent("signature");
                setSimpleFlowPremiumHandoffIntent("signature");
                setSimpleFlowPhase("send");
              }}
            >
              Signing link path
            </button>
          </div>
        </div>
      ) : null}

      <AgreementReviewErrorBoundary
        onBack={() => {
          navigate(`/app/create`);
        }}
      >
        <AgreementReview
          agreementId={agreementId}
          section="simpleHomeReview"
          embeddedInCard
          initialDraftSnapshot={initialDraftSnapshot}
          simpleFlowPhase={simpleFlowPhase}
          simpleSendActionsUnlocked={premiumSendUnlocked}
          streamlinedSimpleFlow={streamlinedSimpleFlow}
          simpleFlowPremiumHandoffIntent={premiumSendUnlocked ? simpleFlowPremiumHandoffIntent : undefined}
          simpleFlowReviewPrimaryCtaLabel="Continue to send"
          simpleFlowUnlockCtaLabel="Upgrade to send"
          onContinueToReviewerSetup={() => {
            clearPostProUnlockCelebrate(agreementId);
            setSimpleFlowPhase("review");
          }}
          onRequestSendUnlock={() => {
            if (workspaceProEntitled || authoritativeProBypass) {
              markSimpleFlowSendUnlocked(agreementId);
              setSendUnlockTick((n) => n + 1);
              return;
            }
            if (isSimpleSendPaywallActive()) {
              logProductEvent("send_clicked", { agreementId, phase: "unlock_bar" });
              setPaywallOpen(true);
              return;
            }
            navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
          }}
          onBackToNew={() => navigate("/app/create")}
          onAuthoritativeProBypassChange={setAuthoritativeProBypass}
          onSimpleFlowContinue={() => {
            if (simpleFlowPhase === "review") {
              logProductEvent("send_clicked", { agreementId, phase: "review" });
              const blockPaywall =
                !workspaceProEntitled && isSimpleSendPaywallActive() && !authoritativeProBypass;
              if (import.meta.env.DEV) {
                console.info("[paid-pro-send-modal-branch]", {
                  authoritativePro: Boolean(workspaceProEntitled || authoritativeProBypass),
                  modal: blockPaywall ? "upgrade_paywall" : "none",
                });
              }
              if (blockPaywall) {
                setPaywallOpen(true);
              } else {
                setSimpleFlowPhase("send");
              }
              return;
            }
            clearPersistedSendPhase(agreementId);
            markSimpleFlowSent(agreementId);
            emitActionCompleted("send", { agreementId });
            navigate(`/app/done/${encodeURIComponent(agreementId)}`);
          }}
          onSimpleFlowBack={() => {
            if (simpleFlowPhase === "send") {
              clearPersistedSendPhase(agreementId);
              setSimpleFlowPhase("review");
              return;
            }
            void navigate("/app/create");
          }}
        />
      </AgreementReviewErrorBoundary>

      <SendConversionModal
        open={paywallOpen}
        agreementId={agreementId}
        paywallHeadline={paywallCopy?.headline ?? PAYWALL_SEND_FINAL_HEADLINE}
        paywallSub={paywallCopy?.sub ?? PAYWALL_SEND_FINAL_SUB}
        onClose={() => {
          setPaywallOpen(false);
          setPaywallCopy(null);
        }}
        onContinueToSend={() => {
          markSimpleFlowSendUnlocked(agreementId);
          setPaywallOpen(false);
          setPaywallCopy(null);
          setSimpleFlowPhase("send");
        }}
        onFreeCreditSend={() => {
          markSimpleFlowSendUnlocked(agreementId);
          setPaywallOpen(false);
          setPaywallCopy(null);
          setSimpleFlowPhase("send");
        }}
        onUpgradeAndSend={() => {
          setPaywallOpen(false);
          navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
        }}
        onGoPro={() => {
          setPaywallOpen(false);
          const cadence = getPricingCadencePreference();
          navigate(
            `/app/checkout/${encodeURIComponent(agreementId)}?tier=pro&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(billingReturnTo)}`,
          );
        }}
        onBeginOneTimeUnlock={() => {
          setPaywallOpen(false);
          setPaywallCopy(null);
          navigate(
            `/app/checkout/${encodeURIComponent(agreementId)}?intent=single_agreement&returnTo=${encodeURIComponent(billingReturnTo)}`,
          );
        }}
      />
    </SimpleFlowShell>
  );
}
