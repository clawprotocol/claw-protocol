import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  markClaimKeepGoingChosen,
  markClaimRecordViewStarted,
  markLawdogFunnelStep,
  markSignupCompletedViaClaim,
  takeTimeToClaimMsForRecord,
} from "../tracking/lawdogSession";
import { CreateLawDogAccountModal } from "./CreateLawDogAccountModal";
import { readProductLegalAcceptanceDetail } from "../launch/legal/legalAcceptanceLocal";
import { NOT_LEGAL_ADVICE, PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { LawdogOnRecordStamp } from "../components/ui/LawdogOnRecordStamp";
import {
  getClaimRecordEmailContinueHref,
  getClaimRecordGoogleAuthHref,
  isClaimAuthConfigured,
} from "./claimRecordAuth";
import { useAuth } from "../auth/AuthProvider";
import { captureContinuationFromLocation } from "../auth/authContinuationContext";
import { isGoogleAuthConfigured } from "../auth/supabaseAuthService";
import { useLaunchNav } from "../launch/LaunchNavContext";

export type ClaimRecordFlow = "esign_receipt" | "agreement_complete";

export type ClaimRecordCardProps = {
  flow: ClaimRecordFlow;
  /** Stable id for analytics (agreement id, or esign receipt id, or composite). */
  recordId: string;
  /** When false, nothing is rendered. */
  visible: boolean;
  /** Visual density: vs01 pages use compact chrome. */
  variant?: "default" | "vs01";
  className?: string;
};

export function ClaimRecordCard({
  flow,
  recordId,
  visible,
  variant = "default",
  className = "",
}: ClaimRecordCardProps) {
  const [declined, setDeclined] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [hesitationHint, setHesitationHint] = useState(false);
  const loggedRef = useRef({ created: false, viewed: false });
  const claimInteractRef = useRef(false);
  const lastRecordIdRef = useRef<string | null>(null);

  const auth = useAuth();
  const { navigate } = useLaunchNav();
  const googleHref = getClaimRecordGoogleAuthHref();
  const emailHref = getClaimRecordEmailContinueHref();
  const showGoogle = auth.enabled ? isGoogleAuthConfigured() : Boolean(googleHref);
  const referralRefCode = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("ref");
    return raw && raw.trim() ? raw.trim() : null;
  }, []);

  useEffect(() => {
    if (!visible || !recordId) return;
    if (lastRecordIdRef.current !== recordId) {
      lastRecordIdRef.current = recordId;
      loggedRef.current = { created: false, viewed: false };
    }
    if (!loggedRef.current.created) {
      loggedRef.current.created = true;
      markLawdogFunnelStep("claim");
      logProductEvent("record_created", { claim_flow: flow, record_id: recordId });
    }
    if (!loggedRef.current.viewed) {
      loggedRef.current.viewed = true;
      markClaimRecordViewStarted(recordId);
      logProductEvent("claim_record_viewed", { claim_flow: flow, record_id: recordId });
    }
  }, [visible, recordId, flow]);

  useEffect(() => {
    if (!visible || !recordId || declined) return;
    claimInteractRef.current = false;
    setHesitationHint(false);
    const t = window.setTimeout(() => {
      if (!claimInteractRef.current) setHesitationHint(true);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [visible, recordId, declined]);

  const assentAnalyticsContext = useMemo(
    () => ({ claim_flow: flow, record_id: recordId, signup_surface: "claim_modal" }),
    [flow, recordId],
  );

  const handoffEmail = useCallback(() => {
    const assent = readProductLegalAcceptanceDetail();
    captureContinuationFromLocation({
      agreementId: recordId,
      workflowStage: "claim",
      destinationPath:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/app/create",
    });
    markSignupCompletedViaClaim();
    logProductEvent("signup_completed", {
      claim_flow: flow,
      record_id: recordId,
      method: "email",
      surface: "claim_modal",
      account_creation_event: isClaimAuthConfigured() ? "claim_email_supabase" : "claim_email_redirect",
      ...(assent
        ? {
            terms_assent_at_iso: assent.at,
            terms_version_id: assent.terms_version_id,
            privacy_version_id: assent.privacy_version_id,
            legal_ack_version: assent.v,
            product_signup_assent_id: assent.server_assent_id,
          }
        : {}),
    });
    logProductEvent("claim_method_selected", { method: "email", record_id: recordId });
    setModalOpen(false);
    if (isClaimAuthConfigured()) {
      navigate("/app/settings");
      return;
    }
    window.location.assign(emailHref);
  }, [emailHref, flow, navigate, recordId, referralRefCode]);

  const handoffGoogle = useCallback(() => {
    const assent = readProductLegalAcceptanceDetail();
    captureContinuationFromLocation({
      agreementId: recordId,
      workflowStage: "claim",
      destinationPath:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/app/create",
    });
    markSignupCompletedViaClaim();
    logProductEvent("signup_completed", {
      claim_flow: flow,
      record_id: recordId,
      method: "google",
      surface: "claim_modal",
      account_creation_event: isClaimAuthConfigured() ? "claim_google_oauth" : "claim_google_redirect",
      ...(assent
        ? {
            terms_assent_at_iso: assent.at,
            terms_version_id: assent.terms_version_id,
            privacy_version_id: assent.privacy_version_id,
            legal_ack_version: assent.v,
            product_signup_assent_id: assent.server_assent_id,
          }
        : {}),
    });
    logProductEvent("claim_method_selected", { method: "google", record_id: recordId });
    if (referralRefCode) {
      logProductEvent("referral_signup", { ref_code: referralRefCode, method: "google", surface: "claim_modal" });
    }
    setModalOpen(false);
    if (isClaimAuthConfigured()) {
      logProductEvent("google_authentication_started", { surface: "claim_modal", record_id: recordId });
      void auth.signInGoogle();
      return;
    }
    if (!googleHref) return;
    window.location.assign(googleHref);
  }, [auth, flow, googleHref, recordId, referralRefCode]);

  const onSaveContinue = useCallback(() => {
    claimInteractRef.current = true;
    setHesitationHint(false);
    const timeToClaimMs = takeTimeToClaimMsForRecord(recordId);
    logProductEvent("claim_record_clicked", {
      claim_flow: flow,
      record_id: recordId,
      cta: "save_continue",
      ...(timeToClaimMs != null ? { time_to_claim_ms: timeToClaimMs } : {}),
    });
    markLawdogFunnelStep("signup");
    logProductEvent("signup_started", { claim_flow: flow, record_id: recordId, phase: "create_account_modal" });
    logProductEvent("claim_checkpoint_shown", { claim_flow: flow, record_id: recordId });
    setModalOpen(true);
  }, [flow, recordId]);

  const onKeepGoing = useCallback(() => {
    claimInteractRef.current = true;
    setHesitationHint(false);
    markClaimKeepGoingChosen();
    const timeToClaimMs = takeTimeToClaimMsForRecord(recordId);
    logProductEvent("claim_record_clicked", {
      claim_flow: flow,
      record_id: recordId,
      cta: "keep_going",
      ...(timeToClaimMs != null ? { time_to_claim_ms: timeToClaimMs } : {}),
    });
    setDeclined(true);
  }, [flow, recordId]);

  if (!visible || declined) return null;

  const shell =
    variant === "vs01"
      ? "rounded-xl border border-violet-900/35 bg-gradient-to-b from-violet-950/35 to-slate-950/40 px-5 py-5"
      : "rounded-xl border border-violet-900/40 bg-gradient-to-b from-violet-950/30 to-slate-950/50 px-5 py-6 shadow-lg shadow-black/20";

  return (
    <>
      <aside
        className={`${shell} ${className}`.trim()}
        aria-labelledby="claim-record-title"
        data-conversion="claim-record"
      >
        <div className="flex flex-wrap items-center gap-2">
          <LawdogOnRecordStamp surface="dark" />
        </div>
        <h3 id="claim-record-title" className="mt-4 text-lg font-semibold tracking-tight text-slate-50">
          You just created something real.
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">Save it. Keep your verification record.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {PRODUCT_NOT_LAW_FIRM} {NOT_LEGAL_ADVICE}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="button" className="vs01-btn vs01-btn--primary min-h-[2.5rem] sm:min-w-[11rem]" onClick={onSaveContinue}>
            Save it
          </button>
          <button
            type="button"
            className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
            onClick={onKeepGoing}
          >
            Skip for now
          </button>
        </div>
        {hesitationHint ? (
          <p className="mt-4 border-t border-violet-900/25 pt-3 text-center text-sm leading-relaxed text-slate-400 sm:text-left">
            You can save later — this reminder disappears once you choose.
          </p>
        ) : null}
      </aside>

      <CreateLawDogAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        showGoogle={showGoogle}
        onContinueEmail={handoffEmail}
        onContinueGoogle={showGoogle ? handoffGoogle : undefined}
        assentAnalyticsContext={assentAnalyticsContext}
      />
    </>
  );
}
