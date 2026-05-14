import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { orderedAuthoritativePartyDisplayNames } from "../../agreement/handoffPartyDisplay";
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
import { writeCreateReviewAgreementResumeId } from "../../components/agreements/agreementIntakeStorage";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import {
  describePaidProSendModalBranch,
  type PaidProSendBranchMeta,
} from "../../components/agreements/sendHandoffAuthoritativeCorpus";
import {
  clearPostProUnlockCelebrate,
  fetchWorkspaceProEntitlement,
} from "../../agreement/agreementProFunnelGate";
import {
  clearPremiumSenderSignFirst,
  clearPremiumSendIntent,
  peekPremiumSendIntent,
  peekPremiumSenderSignFirst,
  writePremiumSendIntent,
  type PremiumSendIntent,
} from "./premiumSendIntent";
import {
  resolvePaidProEditReturnSourceDraft,
  paidProEditReturnHasRecoverableBody,
  writePaidProEditReturnHandoff,
} from "./paidProEditReturnHandoff";
import {
  clearSimpleDoneReviewRecipientLinks,
  mintSimpleDoneReviewRecipientLinkRows,
  reviewLinkMintHasUsableUrls,
  REVIEW_LINK_MINT_FAILURE_USER_COPY,
  writeSimpleDoneReviewRecipientLinks,
  type SimpleDoneReviewRecipientLinkRow,
} from "./simpleDoneReviewRecipientLinks";
import { readSimpleSendHandoffFromHistory, resolveSimpleSendOpenPhase } from "./simpleSendHandoff";
import {
  linearPremiumRecipientSlots,
  MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS,
  readPremiumRecipientHandoff,
} from "../../components/agreements/premiumPartyNamesHandoff";
import {
  buildAgreementVs01BridgeSession,
  fetchAgreementVs01SigningSeed,
  logAgreementToVs01EsignRoute,
  logAgreementVs01BridgePreflight,
  logAgreementVs01RecipientEmailMergeDiagnostics,
  logAgreementVs01SeedBlocked,
  mergeLiveDraftWithRecipientSetupForVs01Bridge,
  recipientSetupPlausibleInputFlags,
  setPaidProAgreementBridgeSkipMarker,
  writeAgreementVs01BridgeSession,
} from "./agreementToVs01SigningBridge";
import { getPricingCadencePreference } from "../pricingCadenceStorage";
import { useLaunchNav } from "../LaunchNavContext";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { SendConversionModal } from "./SendConversionModal";
import { PAYWALL_SEND_FINAL_HEADLINE, PAYWALL_SEND_FINAL_SUB } from "../paywallMessaging";
import { FIRST_WORKFLOW_GUARANTEE_SHORT, REVIEW_STRUCTURED_WIN_LINE } from "../pricingContent";

const FLOW_PROGRESS = SIMPLE_FLOW_PROGRESS_LABELS;

const SIMPLE_SEND_PHASE_SS_KEY = (id: string) => `claw_simple_send_phase_v1_${encodeURIComponent(id)}`;

/** After sender-first auto-route to VS01 `/app/esign/...` to avoid duplicate redirects. */
const SENDER_FIRST_WORKSPACE_ROUTED_SS_KEY = "claw_premium_sender_sign_first_workspace_routed_v1";

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

function formatVs01SeedFailureDetail(detail: unknown): string {
  if (detail == null || typeof detail !== "object") return "";
  const o = detail as Record<string, unknown>;
  const stage = typeof o.stage === "string" ? o.stage.trim() : "";
  const code = typeof o.code === "string" ? o.code.trim() : "";
  const msg = typeof o.message === "string" ? o.message.trim() : "";
  return [stage && `stage=${stage}`, code && `code=${code}`, msg && `message=${msg}`].filter(Boolean).join(" ");
}

export function SimpleSendPage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate, pathname } = useLaunchNav();
  const [flash, setFlash] = useState<"draft_ready" | null>(null);
  /** Inline error when review-link mint yields no usable URLs (stay on /app/send). */
  const [reviewLinkMintFailure, setReviewLinkMintFailure] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCopy, setPaywallCopy] = useState<{ headline: string; sub: string } | null>(null);
  const [workspaceProEntitled, setWorkspaceProEntitled] = useState(false);
  const sendLanding = useMemo(() => readSimpleSendHandoffFromHistory(agreementId), [agreementId, pathname]);
  const [simpleFlowPremiumHandoffIntent, setSimpleFlowPremiumHandoffIntent] = useState(
    () => sendLanding.premiumIntent ?? peekPremiumSendIntent(),
  );
  const resolveSimpleFlowPhase = useCallback(
    (intent: "review" | "signature" | null): "review" | "send" => {
      if (typeof window === "undefined") return "review";
      const q = new URLSearchParams(window.location.search);
      const urlPhase = q.get("phase") === "send" ? "send" : null;
      const persistedSendPhase = readPersistedSendPhase(agreementId) === "send" ? "send" : null;
      const primed = sendLanding.primed;
      const canAccessSendActions =
        canAccessSimpleSendActions(agreementId) ||
        workspaceProEntitled ||
        isPaidProAgreementAuthoritative({ draft: primed ?? null, agreementId }) ||
        describePaidProSendModalBranch(primed, { agreementId }).paidProSendAllowed;
      return resolveSimpleSendOpenPhase({
        urlPhase,
        handoffOpenPhase: sendLanding.openFlowPhase,
        canAccessSendActions,
        premiumIntent: intent,
        persistedSendPhase,
      });
    },
    [agreementId, sendLanding.openFlowPhase, sendLanding.primed, workspaceProEntitled],
  );
  const [simpleFlowPhase, setSimpleFlowPhase] = useState<"review" | "send">(() =>
    resolveSimpleFlowPhase(sendLanding.premiumIntent ?? peekPremiumSendIntent()),
  );
  const initialDraftSnapshot = sendLanding.primed;
  /** Live draft from {@link AgreementReview} (recipient emails); falls back to handoff primed snapshot. */
  const bridgeHandoffDraftRef = useRef<AgreementDraft | null>((initialDraftSnapshot as AgreementDraft | null) ?? null);
  useEffect(() => {
    bridgeHandoffDraftRef.current = (initialDraftSnapshot as AgreementDraft | null) ?? null;
  }, [initialDraftSnapshot]);
  const streamlinedSimpleFlow = sendLanding.streamlined;
  const sendAuthoritative = useMemo(
    () => isPaidProAgreementAuthoritative({ draft: initialDraftSnapshot ?? null, agreementId }),
    [initialDraftSnapshot, agreementId],
  );
  const [paidProSendBranch, setPaidProSendBranch] = useState<PaidProSendBranchMeta>(() =>
    describePaidProSendModalBranch(initialDraftSnapshot, { agreementId }),
  );
  /** Re-evaluate `canAccessSimpleSendActions` after session unlock from authoritative Pro load. */
  const [sendUnlockTick, setSendUnlockTick] = useState(0);
  const [senderFirstBannerDismissed, setSenderFirstBannerDismissed] = useState(false);
  const [senderFirstSigningRouteOpening, setSenderFirstSigningRouteOpening] = useState(false);
  /** VS01 seed failed: stay on page, blocking card (no /agreements/.../sign, no premium signing-route fallback). */
  const [senderFirstVs01SeedBlocked, setSenderFirstVs01SeedBlocked] = useState(false);
  /** Structured API error when POST vs01-signing-seed fails (shown in banner; logged via logAgreementToVs01EsignRoute). */
  const [senderFirstVs01SeedFailure, setSenderFirstVs01SeedFailure] = useState<{
    reason: string;
    httpStatus?: number;
    detail?: unknown;
  } | null>(null);
  const [senderFirstRouteRetryTick, setSenderFirstRouteRetryTick] = useState(0);
  const [editReturnNavigateBlocked, setEditReturnNavigateBlocked] = useState<string | null>(null);
  const authoritativeProBypassRef = useRef(paidProSendBranch.paidProSendAllowed);
  authoritativeProBypassRef.current = paidProSendBranch.paidProSendAllowed;
  const premiumSendUnlocked = useMemo(() => {
    void sendUnlockTick;
    return (
      canAccessSimpleSendActions(agreementId) ||
      workspaceProEntitled ||
      sendAuthoritative ||
      paidProSendBranch.paidProSendAllowed
    );
  }, [
    agreementId,
    workspaceProEntitled,
    sendAuthoritative,
    paidProSendBranch.paidProSendAllowed,
    sendUnlockTick,
  ]);

  const navigateBackToCreateForEdit = useCallback(() => {
    const id = agreementId.trim();
    setEditReturnNavigateBlocked(null);
    if (!id) {
      void navigate("/app/create");
      return;
    }
    writeCreateReviewAgreementResumeId(id);
    const paidSurface =
      premiumSendUnlocked ||
      sendAuthoritative ||
      paidProSendBranch.paidProSendAllowed ||
      workspaceProEntitled;
    const resolved = resolvePaidProEditReturnSourceDraft({
      live: bridgeHandoffDraftRef.current,
      initial: (initialDraftSnapshot as AgreementDraft | null) ?? null,
      primed: sendLanding.primed,
      agreementId: id,
    });
    if (paidSurface && !paidProEditReturnHasRecoverableBody(resolved)) {
      setEditReturnNavigateBlocked("We're still loading the Pro document. Try again in a moment.");
      return;
    }
    if (paidSurface && resolved) {
      const rawIntent =
        simpleFlowPremiumHandoffIntent ?? sendLanding.premiumIntent ?? peekPremiumSendIntent();
      const premiumSendIntent: PremiumSendIntent = rawIntent === "signature" ? "signature" : "review";
      writePaidProEditReturnHandoff({
        agreementId: id,
        liveDraft: resolved,
        premiumSendIntent,
      });
    }
    void navigate("/app/create");
  }, [
    agreementId,
    navigate,
    initialDraftSnapshot,
    sendLanding.premiumIntent,
    sendLanding.primed,
    simpleFlowPremiumHandoffIntent,
    premiumSendUnlocked,
    sendAuthoritative,
    paidProSendBranch.paidProSendAllowed,
    workspaceProEntitled,
  ]);

  useEffect(() => {
    setPaidProSendBranch(describePaidProSendModalBranch(initialDraftSnapshot, { agreementId }));
  }, [initialDraftSnapshot, agreementId]);

  useEffect(() => {
    if (!paidProSendBranch.paidProSendAllowed) return;
    if (!isSimpleSendPaywallActive()) return;
    if (canAccessSimpleSendActions(agreementId)) return;
    markSimpleFlowSendUnlocked(agreementId);
    setSendUnlockTick((n) => n + 1);
  }, [paidProSendBranch.paidProSendAllowed, agreementId]);

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
    if (!paywallOpen) return;
    if (workspaceProEntitled || sendAuthoritative) {
      markSimpleFlowSendUnlocked(agreementId);
      setPaywallOpen(false);
      setPaywallCopy(null);
    }
  }, [paywallOpen, workspaceProEntitled, agreementId, sendAuthoritative]);

  useEffect(() => {
    const onPaywallRequired = (e: Event) => {
      if (workspaceProEntitled || authoritativeProBypassRef.current || sendAuthoritative) return;
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
  }, [workspaceProEntitled, sendAuthoritative]);

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
    if (!premiumSendUnlocked) {
      navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
      return;
    }
    url.searchParams.delete("phase");
    const qs = url.searchParams.toString();
    window.history.replaceState(window.history.state, "", qs ? `${url.pathname}?${qs}` : url.pathname);
  }, [agreementId, navigate, premiumSendUnlocked]);

  useEffect(() => {
    if (simpleFlowPhase !== "send") return;
    if (!premiumSendUnlocked) {
      setSimpleFlowPhase("review");
      navigate(`/app/ready/${encodeURIComponent(agreementId)}`);
    }
  }, [agreementId, simpleFlowPhase, navigate, premiumSendUnlocked]);

  /** After `?phase=send` is stripped from the URL, keep send so refresh on `/app/send/:id` stays on the send step. */
  useEffect(() => {
    if (simpleFlowPhase !== "send") return;
    persistSendPhase(agreementId);
  }, [agreementId, simpleFlowPhase]);

  /** Premium create-flow: jump to Send once paywall unlocks if intent was signature. */
  useEffect(() => {
    const intent = simpleFlowPremiumHandoffIntent;
    if (intent !== "signature") return;
    if (!premiumSendUnlocked) return;
    setSimpleFlowPhase("send");
  }, [agreementId, paywallOpen, simpleFlowPremiumHandoffIntent, premiumSendUnlocked]);

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
  const shellTitle = useMemo(() => {
    if (!premiumSendUnlocked) return "Your Agreement";
    if (simpleFlowPremiumHandoffIntent === "review") return "Prepare review link";
    if (simpleFlowPremiumHandoffIntent === "signature") return "Owner workspace";
    return "Your Agreement";
  }, [premiumSendUnlocked, simpleFlowPremiumHandoffIntent]);
  const showPremiumFork = premiumSendUnlocked && simpleFlowPhase === "review" && simpleFlowPremiumHandoffIntent === null;

  const subtitle =
    showPremiumFork
      ? "Pick how you close: collaborate on changes before signing, or send for tracked signature — both paths keep you looking deal-ready."
      : premiumSendUnlocked && simpleFlowPremiumHandoffIntent === "review"
        ? "Choose who can review this agreement. Nothing is signed."
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

  useEffect(() => {
    setSenderFirstBannerDismissed(false);
    setSenderFirstVs01SeedBlocked(false);
    setSenderFirstSigningRouteOpening(false);
    setSenderFirstVs01SeedFailure(null);
  }, [agreementId]);

  useEffect(() => {
    const id = agreementId.trim();
    if (!id || !premiumSendUnlocked) return;
    if (simpleFlowPremiumHandoffIntent !== "signature") return;
    if (!peekPremiumSenderSignFirst()) return;
    if (!sendAuthoritative) return;
    if (simpleFlowPhase !== "send") return;
    let cancelled = false;
    let startedResolve = false;
    void (async () => {
      try {
        if (sessionStorage.getItem(SENDER_FIRST_WORKSPACE_ROUTED_SS_KEY) === id) return;
      } catch {
        return;
      }
      startedResolve = true;
      if (!cancelled) {
        setSenderFirstSigningRouteOpening(true);
        setSenderFirstVs01SeedBlocked(false);
        setSenderFirstVs01SeedFailure(null);
      }

      const vs01Seed = await fetchAgreementVs01SigningSeed(id);
      if (!cancelled && vs01Seed.ok) {
        setSenderFirstVs01SeedFailure(null);
        const live = bridgeHandoffDraftRef.current ?? (initialDraftSnapshot as AgreementDraft | null) ?? null;
        const ho = readPremiumRecipientHandoff();
        const partyCap = Math.min((live?.parties ?? []).length, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
        const recipientSetup =
          live != null && ho && partyCap > 0
            ? {
                recipientPartyEmails: linearPremiumRecipientSlots(ho, partyCap).map((s) => s.email || ""),
              }
            : live != null
              ? {
                  recipient1Email: (live.parties?.[0] as { email?: string } | undefined)?.email,
                  recipient2Email: (live.parties?.[1] as { email?: string } | undefined)?.email,
                }
              : null;
        const finalBridgeDraft = mergeLiveDraftWithRecipientSetupForVs01Bridge(live, recipientSetup);
        logAgreementVs01RecipientEmailMergeDiagnostics(
          finalBridgeDraft,
          recipientSetupPlausibleInputFlags(recipientSetup),
        );
        const bridge = buildAgreementVs01BridgeSession({
          agreementId: id,
          vs01DocumentId: vs01Seed.documentId,
          draft: finalBridgeDraft,
          senderFirstLawdogHandoff: true,
        });
        logAgreementVs01BridgePreflight(bridge);
        writeAgreementVs01BridgeSession(bridge);
        setPaidProAgreementBridgeSkipMarker(vs01Seed.documentId);
        // eslint-disable-next-line no-console
        console.info("[agreement-vs01-bridge-session-written]", {
          source: bridge.source,
          signerFirst: bridge.signerFirst,
          senderFirstLawdogHandoff: bridge.senderFirstLawdogHandoff,
          hasCreatorEmail: Boolean((bridge.creatorEmail || "").trim()),
          counterpartyCount: bridge.counterparties?.length ?? 0,
          vs01DocumentId: bridge.vs01DocumentId,
        });
        try {
          if (sessionStorage.getItem(SENDER_FIRST_WORKSPACE_ROUTED_SS_KEY) !== id) {
            sessionStorage.setItem(SENDER_FIRST_WORKSPACE_ROUTED_SS_KEY, id);
          }
        } catch {
          return;
        }
        const route = `/app/esign/${encodeURIComponent(vs01Seed.documentId)}?agreement_bridge=1`;
        logAgreementToVs01EsignRoute({
          agreementId: id,
          seedDocumentId: vs01Seed.documentId,
          route,
          reason: "vs01_signing_seed_ok",
        });
        if (startedResolve && !cancelled) setSenderFirstSigningRouteOpening(false);
        void navigate(route);
        return;
      }
      if (!cancelled && !vs01Seed.ok) {
        setSenderFirstVs01SeedFailure({
          reason: vs01Seed.reason,
          httpStatus: vs01Seed.httpStatus,
          detail: vs01Seed.detail,
        });
        logAgreementToVs01EsignRoute({
          agreementId: id,
          seedDocumentId: null,
          route: null,
          reason: "vs01_seed_failed",
          status: vs01Seed.httpStatus ?? null,
          detail: vs01Seed.detail ?? vs01Seed.reason,
        });
        logAgreementVs01SeedBlocked({
          agreementId: id,
          status: vs01Seed.httpStatus ?? null,
          detail: vs01Seed.detail ?? vs01Seed.reason,
          source: "paid_pro_sender_first",
        });
        if (startedResolve && !cancelled) setSenderFirstSigningRouteOpening(false);
        if (!cancelled) setSenderFirstVs01SeedBlocked(true);
        return;
      }

      if (startedResolve && !cancelled) setSenderFirstSigningRouteOpening(false);
    })();
    return () => {
      cancelled = true;
      if (startedResolve) setSenderFirstSigningRouteOpening(false);
    };
  }, [
    agreementId,
    navigate,
    premiumSendUnlocked,
    sendAuthoritative,
    simpleFlowPhase,
    simpleFlowPremiumHandoffIntent,
    initialDraftSnapshot,
    senderFirstRouteRetryTick,
  ]);

  return (
    <SimpleFlowShell step={shellStep as 1 | 2 | 3 | 4} progressLabels={FLOW_PROGRESS} title={shellTitle} subtitle={subtitle}>
      {flash === "draft_ready" && !streamlinedSimpleFlow ? (
        <JoyFlashBanner kind="draft_ready" onDismiss={() => setFlash(null)} />
      ) : null}

      {editReturnNavigateBlocked ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-600/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-50/95"
        >
          {editReturnNavigateBlocked}
        </div>
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

      {premiumSendUnlocked &&
      simpleFlowPremiumHandoffIntent === "signature" &&
      simpleFlowPhase === "send" &&
      peekPremiumSenderSignFirst() &&
      !senderFirstBannerDismissed ? (
        senderFirstVs01SeedBlocked ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/25 px-4 py-4 text-sm leading-snug text-rose-50/95 sm:px-5"
          >
            <p className="font-semibold text-rose-100">We could not open the e-sign workspace.</p>
            <p className="mt-2 text-xs text-rose-100/90">
              {senderFirstVs01SeedFailure?.httpStatus != null ? (
                <span className="font-mono">Status {senderFirstVs01SeedFailure.httpStatus}</span>
              ) : (
                <span className="font-mono">Request failed</span>
              )}
              {senderFirstVs01SeedFailure ? (
                <>
                  {" "}
                  <span className="block font-mono text-[11px] leading-relaxed text-rose-100/85 sm:mt-1">
                    {senderFirstVs01SeedFailure.reason}
                    {formatVs01SeedFailureDetail(senderFirstVs01SeedFailure.detail)
                      ? ` · ${formatVs01SeedFailureDetail(senderFirstVs01SeedFailure.detail)}`
                      : ""}
                  </span>
                </>
              ) : null}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary min-h-[2.5rem] px-4 text-sm"
                onClick={() => {
                  setSenderFirstVs01SeedBlocked(false);
                  setSenderFirstVs01SeedFailure(null);
                  setSenderFirstRouteRetryTick((n) => n + 1);
                }}
              >
                Try again
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary min-h-[2.5rem] px-4 text-sm text-slate-200"
                onClick={() => {
                  clearPremiumSenderSignFirst();
                  setSenderFirstVs01SeedBlocked(false);
                  setSenderFirstVs01SeedFailure(null);
                  setSenderFirstSigningRouteOpening(false);
                }}
              >
                Continue without VS01 e-sign
              </button>
            </div>
          </div>
        ) : senderFirstSigningRouteOpening ? (
          <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm leading-snug text-amber-50/95">
            <span className="font-semibold">Sign first:</span> Opening your signing step…
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm leading-snug text-amber-50/95">
            <span className="font-semibold">Sign first:</span> when your signing step opens, complete it there, then
            return here to create links for other signers.{" "}
            <button
              type="button"
              className="font-medium text-amber-200 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-50"
              onClick={() => {
                clearPremiumSenderSignFirst();
                setSenderFirstBannerDismissed(true);
              }}
            >
              Dismiss
            </button>
          </div>
        )
      ) : null}

      <AgreementReviewErrorBoundary onBack={navigateBackToCreateForEdit}>
        <AgreementReview
          agreementId={agreementId}
          section="simpleHomeReview"
          embeddedInCard
          initialDraftSnapshot={initialDraftSnapshot}
          onBridgeHandoffDraftSnapshot={(d) => {
            bridgeHandoffDraftRef.current = d;
          }}
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
            if (workspaceProEntitled || paidProSendBranch.paidProSendAllowed || sendAuthoritative) {
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
          onBackToNew={navigateBackToCreateForEdit}
          onPaidProSendBranchMeta={setPaidProSendBranch}
          reviewLinkMintFailureMessage={reviewLinkMintFailure}
          onSimpleFlowContinue={async () => {
            if (simpleFlowPhase === "review") {
              logProductEvent("send_clicked", { agreementId, phase: "review" });
              const blockPaywall =
                !workspaceProEntitled &&
                isSimpleSendPaywallActive() &&
                !paidProSendBranch.paidProSendAllowed &&
                !sendAuthoritative;
              if (import.meta.env.DEV) {
                console.info("[premium-send-gate]", {
                  paidProSendAllowed: paidProSendBranch.paidProSendAllowed,
                  reason: paidProSendBranch.reason,
                  corpusLen: paidProSendBranch.authoritativeLen,
                  source: paidProSendBranch.premium_render_source,
                  hasMaterialPremiumPipelineCorpus: paidProSendBranch.hasMaterialPremiumPipelineCorpus,
                });
                console.info("[paid-pro-send-modal-branch]", {
                  modal: blockPaywall ? "conversion" : "none",
                  reason: paidProSendBranch.reason,
                  premium_render_source: paidProSendBranch.premium_render_source,
                  authoritativeLen: paidProSendBranch.authoritativeLen,
                });
              }
              if (blockPaywall) {
                setPaywallOpen(true);
              } else {
                setSimpleFlowPhase("send");
              }
              return;
            }
            const id = agreementId.trim();
            const draft =
              bridgeHandoffDraftRef.current ?? (initialDraftSnapshot as AgreementDraft | null) ?? null;
            const shortAgIdForMintLog = (aid: string) => {
              const t = aid.trim();
              return t.length <= 12 ? t : `${t.slice(0, 8)}…`;
            };

            if (simpleFlowPremiumHandoffIntent === "review" && id) {
              setReviewLinkMintFailure(null);
              let linkRows: SimpleDoneReviewRecipientLinkRow[] = [];
              let attemptedMintCount = 0;
              let firstErrorStatus: number | undefined;
              let lastMintErrorDetail: string | undefined;
              let lastMintErrorCode: string | undefined;
              let mintThrew = false;
              try {
                if (draft) {
                  const minted = await mintSimpleDoneReviewRecipientLinkRows({ agreementId: id, draft });
                  linkRows = minted.rows;
                  attemptedMintCount = minted.attemptedMintCount;
                  firstErrorStatus = minted.firstErrorStatus;
                  lastMintErrorDetail = minted.lastMintErrorDetail;
                  lastMintErrorCode = minted.lastMintErrorCode;
                }
              } catch {
                mintThrew = true;
                linkRows = [];
              }
              const successCount = linkRows.filter((r) => r.reviewHref?.trim()).length;
              const mintStatus =
                !draft || mintThrew
                  ? "exception_or_no_draft"
                  : successCount > 0
                    ? "ok"
                    : attemptedMintCount > 0
                      ? "partial_failure"
                      : "skipped_no_counterparties";
              // eslint-disable-next-line no-console
              console.info("[review-link-mint]", {
                attemptedCount: attemptedMintCount,
                successCount,
                status: mintStatus,
                ...(typeof firstErrorStatus === "number" ? { httpStatus: firstErrorStatus } : {}),
                agreementIdShort: shortAgIdForMintLog(id),
              });

              const mintSucceeded = reviewLinkMintHasUsableUrls(linkRows);
              if (!mintSucceeded) {
                clearSimpleDoneReviewRecipientLinks(id);
                persistSendPhase(agreementId);
                // eslint-disable-next-line no-console
                console.info("[review-link-create-failed]", {
                  agreementIdShort: shortAgIdForMintLog(id),
                  attemptedCount: attemptedMintCount,
                  successCount,
                  ...(typeof firstErrorStatus === "number" ? { httpStatus: firstErrorStatus } : {}),
                  ...(lastMintErrorCode ? { errorCode: lastMintErrorCode } : {}),
                  ...(lastMintErrorDetail ? { errorMessage: lastMintErrorDetail } : {}),
                });
                setReviewLinkMintFailure(REVIEW_LINK_MINT_FAILURE_USER_COPY);
                return;
              }

              // eslint-disable-next-line no-console
              console.info("[review-link-create-success]", {
                agreementIdShort: shortAgIdForMintLog(id),
                recipientCount: linkRows.length,
              });
              clearPersistedSendPhase(agreementId);
              writeSimpleDoneReviewRecipientLinks({
                agreementId: id,
                recipients: linkRows,
                agreementPartyDisplayNames: draft ? orderedAuthoritativePartyDisplayNames(draft.parties) : undefined,
              });
              markSimpleFlowSent(agreementId);
              emitActionCompleted("send", { agreementId });
              navigate(`/app/done/${encodeURIComponent(id || agreementId)}`);
              return;
            }

            clearPersistedSendPhase(agreementId);
            if (id) {
              clearSimpleDoneReviewRecipientLinks(id);
            }
            markSimpleFlowSent(agreementId);
            emitActionCompleted("send", { agreementId });
            navigate(`/app/done/${encodeURIComponent(id || agreementId)}`);
          }}
          onSimpleFlowBack={() => {
            if (simpleFlowPhase === "send") {
              clearPersistedSendPhase(agreementId);
              setSimpleFlowPhase("review");
              return;
            }
            navigateBackToCreateForEdit();
          }}
        />
      </AgreementReviewErrorBoundary>

      <SendConversionModal
        open={paywallOpen && !sendAuthoritative}
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
