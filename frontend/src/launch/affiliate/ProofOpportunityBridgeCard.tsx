import { agreementPublicVerifyPath } from "../../agreement/agreementPublicVerify";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { useExperimentVariant } from "../../config/experiments/useExperimentVariant";
import { useFeatureGate } from "../../config/featureFlags/useFeatureGate";
import { recordProofShareSignal } from "./opportunityGamification";
import { useLaunchNav } from "../LaunchNavContext";

type BridgeMode = "proof_ready" | "sent_pending";

export function ProofOpportunityBridgeCard(props: { agreementId: string; mode: BridgeMode }) {
  const { agreementId, mode } = props;
  const { navigate } = useLaunchNav();
  const bridgeOn = useFeatureGate("proof_share_bridge_enabled");
  const dc = useDynamicConfig();
  const copy = dc.proofBridge;
  const { variant: bridgeCopyVariant } = useExperimentVariant("proof_share_bridge_copy");

  const path = agreementPublicVerifyPath(agreementId);
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  if (!bridgeOn) return null;

  const title =
    mode === "proof_ready" ? copy.proofReadyTitle : copy.sentTitle;
  let subtitle =
    mode === "proof_ready" ? copy.proofReadySubtitle : copy.sentSubtitle;
  let body =
    mode === "proof_ready" ? copy.bodyProofReady : copy.bodySentPending;

  if (bridgeCopyVariant === "short") {
    subtitle =
      mode === "proof_ready"
        ? "Share it. Grow the pack."
        : "Share now · proof seals after signing.";
    body =
      mode === "proof_ready"
        ? "Your link earns when real agreements flow through CLAW."
        : "Invite with your link while recipients finish signing.";
  }

  async function copyProof(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      recordProofShareSignal();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-emerald-900/40 bg-gradient-to-br from-emerald-950/40 via-slate-950/50 to-amber-950/20 px-5 py-5 text-center sm:text-left">
      <p className="text-base font-semibold text-emerald-100">{title}</p>
      <p className="mt-1 text-sm font-medium text-slate-200">{subtitle}</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{body}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => void copyProof()}>
          {copy.ctaShareProof}
        </button>
        <button type="button" className="vs01-btn vs01-btn--primary" onClick={() => navigate("/app/opportunity")}>
          {copy.ctaEarnLink}
        </button>
      </div>
    </div>
  );
}
