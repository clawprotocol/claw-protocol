import { useEffect, useRef, useState } from "react";
import {
  fetchPublicAgreementVerify,
  type PublicVerifyPayload,
} from "../../agreement/agreementPublicVerify";
import {
  CANONICAL_PROOF_SENTENCE,
  JOY_COPY,
  SIMPLE_FLOW_PROGRESS_LABELS,
} from "../../joy/clawJoyCopy";
import { PROOF_LADDER_SUBTITLE } from "../../components/proof/proofTrustLadder";
import { LawdogOnRecordStamp } from "../../components/ui/LawdogOnRecordStamp";
import { JoyMilestoneMark } from "../../joy/JoyMilestone";
import { emitActionCompleted } from "../../joy/joyTelemetry";
import { SimpleFlowShell } from "./SimpleFlowShell";
import { useLaunchNav } from "../LaunchNavContext";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { ProofOpportunityBridgeCard } from "../affiliate/ProofOpportunityBridgeCard";
import { recordProofShareSignal } from "../affiliate/opportunityGamification";

function shortRef(hex: string | undefined | null): string {
  const h = (hex || "").trim();
  if (h.length < 12) return h || "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export function SimpleVerificationPage(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const [data, setData] = useState<PublicVerifyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const proofLoggedRef = useRef(false);
  const productProofLogged = useRef(false);

  useEffect(() => {
    proofLoggedRef.current = false;
    productProofLogged.current = false;
  }, [agreementId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const v = await fetchPublicAgreementVerify(agreementId);
      if (cancel) return;
      if (!v) {
        setError(
          "We couldn’t load verification yet. The link may be wrong, the agreement may not be ready, or public verify may be disabled — ask the sender to confirm.",
        );
      }
      setData(v);
      if (v && !proofLoggedRef.current) {
        proofLoggedRef.current = true;
        emitActionCompleted("proof", { agreementId, meta: { surface: "verification_page" } });
      }
      if (v && !productProofLogged.current) {
        productProofLogged.current = true;
        logProductEvent("proof_viewed", { agreementId });
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId]);

  const hash = data?.verification?.agreement_hash;
  const when = data?.summary?.updated_at || data?.summary?.created_at;
  const statusOk = Boolean(data?.signature_status?.fully_executed);

  return (
    <SimpleFlowShell
      step={4}
      progressLabels={SIMPLE_FLOW_PROGRESS_LABELS}
      title="Verification"
      subtitle="Check status, fingerprints, and version history for this agreement."
    >
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <div className="rounded-lg border border-rose-800/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-100" role="alert">
          <p>{error}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-rose-200/90">
            Support reference — agreement ID:{" "}
            <span className="font-mono text-rose-100/85 break-all">{agreementId}</span>
          </p>
        </div>
      ) : null}

      {!loading && data ? (
        <div className="vs01-card vs01-card--envelope space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <JoyMilestoneMark className="scale-90" />
              <p className="text-sm font-medium text-slate-200">{JOY_COPY.proofSecured}</p>
            </div>
            <LawdogOnRecordStamp surface="dark" />
          </div>
          <p className="text-[11px] leading-snug text-slate-500">{PROOF_LADDER_SUBTITLE}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                statusOk ? "bg-emerald-900/50 text-emerald-100" : "bg-slate-800 text-slate-200"
              }`}
            >
              {statusOk ? "Status · fully signed" : "Status · in progress"}
            </span>
            {when ? (
              <span className="text-xs text-slate-500">Updated {new Date(when).toLocaleString()}</span>
            ) : null}
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="font-medium text-slate-200">Agreement ID (for support):</span>{" "}
              <code className="break-all rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">{agreementId}</code>{" "}
              <button
                type="button"
                className="text-xs font-medium text-sky-400/95 underline-offset-2 hover:text-sky-300 hover:underline"
                onClick={() => void navigator.clipboard.writeText(agreementId)}
              >
                Copy
              </button>
            </p>
            {hash ? (
              <p>
                <span className="font-medium text-slate-200">Proof record fingerprint (SHA-256, short):</span>{" "}
                <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">{shortRef(hash)}</code>
              </p>
            ) : null}
          </div>
          <p className="text-sm leading-relaxed text-slate-400">{CANONICAL_PROOF_SENTENCE}</p>
          <p className="text-xs leading-relaxed text-slate-500">
            You can confirm this agreement was not altered after it was captured.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => {
                const url = `${window.location.origin}/verify/${encodeURIComponent(agreementId)}`;
                void navigator.clipboard.writeText(url).then(() => recordProofShareSignal());
              }}
            >
              Copy shareable link
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              onClick={() => navigate(`/app/done/${encodeURIComponent(agreementId)}`)}
            >
              Back to summary
            </button>
          </div>
          <ProofOpportunityBridgeCard agreementId={agreementId} mode="proof_ready" />
        </div>
      ) : null}
    </SimpleFlowShell>
  );
}
