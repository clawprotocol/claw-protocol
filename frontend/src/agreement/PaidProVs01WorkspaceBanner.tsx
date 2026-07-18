import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ProofStatus, vs01ReceiptToProofStatusData } from "../components/proof/ProofStatus";
import { LawdogRecordedMark } from "../components/ui/LawdogRecordedMark";
import { openReceiptProofBundleDownload } from "../export/dataExportApi";
import {
  readCachedSigningPacketDelivery,
  signingPacketDeliveryClaimsSent,
  signingPacketDeliveryUserMessage,
} from "./signingPacketDeliveryApi";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { getReceipt } from "../vs01/vs01Api";
import {
  clearPaidProVs01PostSignHandoff,
  readPaidProVs01PostSignHandoff,
  type PaidProVs01PostSignHandoffV1,
} from "../vs01/vs01PaidProPostSignHandoff";

type Props = {
  agreementId: string;
  /** After workspace draft is ready so this sits above AgreementReview, not over loading chrome. */
  visible: boolean;
};


/**
 * Shown on `/app/agreements/:id` after paid Pro VS01 handoff: saved status, copy signing link, proof details.
 */
export function PaidProVs01WorkspaceBanner({ agreementId, visible }: Props) {
  const nav = useLaunchNav();
  const panelId = useId();
  const proofDetailsRef = useRef<HTMLDetailsElement>(null);
  const [handoff, setHandoff] = useState<PaidProVs01PostSignHandoffV1 | null>(null);
  const [receipt, setReceipt] = useState<unknown>(null);
  const [receiptLoadError, setReceiptLoadError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const showProofDiag =
    typeof window !== "undefined" &&
    (import.meta.env.DEV ||
      localStorage.getItem("lawdogProofDiag") === "1" ||
      new URLSearchParams(window.location.search).get("proof_diag") === "1");

  useEffect(() => {
    if (!visible) return;
    const aid = agreementId.trim();
    if (!aid) {
      setHandoff(null);
      return;
    }
    const h = readPaidProVs01PostSignHandoff(aid);
    setHandoff(h);
  }, [agreementId, visible]);

  useEffect(() => {
    if (!handoff?.receiptId?.trim() || handoff.packetPrepareOnly) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReceipt(handoff.receiptId.trim());
        if (cancelled) return;
        const raw = data.receipt !== undefined ? data.receipt : data;
        setReceipt(raw);
        setReceiptLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setReceiptLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff?.receiptId]);

  useEffect(() => {
    if (!handoff) return;
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const saved = sp.get("vs01_saved") === "1";
    const packet = sp.get("vs01_packet_ready") === "1";
    if (!saved && !packet) return;
    if (saved) sp.delete("vs01_saved");
    if (packet) sp.delete("vs01_packet_ready");
    const qs = sp.toString();
    const path = window.location.pathname;
    nav.navigate(qs ? `${path}?${qs}` : path);
  }, [handoff, nav]);

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(() => {
    clearPaidProVs01PostSignHandoff();
    setHandoff(null);
  }, []);


  if (!visible || !handoff) return null;

  const title = handoff.agreementTitle.trim() || "Agreement";
  const signers = handoff.signers;
  const primaryForLink = signers.find((s) => s.signingUrl?.trim()) ?? signers[0];
  const packetPrepare = Boolean(handoff.packetPrepareOnly) || !handoff.receiptId?.trim();
  const firstSigningUrl = packetPrepare
    ? (handoff.ownerSigningUrl?.trim() || primaryForLink?.signingUrl?.trim() || "")
    : (primaryForLink?.signingUrl?.trim() ?? "");

  const namedPending = signers.filter((s) => s.displayName?.trim().length);
  const firstNamed = namedPending[0];
  const totalSigners = signers.length + (handoff.ownerSigningUrl?.trim() ? 1 : 0);
  const deliveryStatus = readCachedSigningPacketDelivery(agreementId);
  const deliveryLine = packetPrepare ? signingPacketDeliveryUserMessage(deliveryStatus) : null;
  const invitationsSent = signingPacketDeliveryClaimsSent(deliveryStatus);
  const completionLine = packetPrepare
    ? deliveryLine ??
      (signers.length === 0
        ? "Signature links are ready. Add signing recipients from the workspace when you have their details."
        : invitationsSent
          ? totalSigners === 1
            ? "Signature links are ready. LawDog sent a signing link — track progress below."
            : "Signature links are ready. LawDog sent signing links to all parties. Each party can sign independently."
          : "Signature packet is activated. Track signing progress below.")
    : signers.length === 0
      ? "Your signature is complete. Add recipients from the workspace when you are ready to collect remaining signatures."
      : namedPending.length === 1
        ? `Your signature is complete. ${firstNamed!.displayName.trim()} still needs to sign.`
        : signers.length > 1
          ? "Your signature is complete. Other signers still need to sign."
          : "Your signature is complete. One signer still needs to sign.";

  return (
    <section
      className="mb-5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-4 shadow-sm"
      aria-labelledby={`${panelId}-title`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <LawdogRecordedMark size="sm" />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 id={`${panelId}-title`} className="text-base font-semibold tracking-tight text-emerald-100">
            {packetPrepare ? "Signature links are ready" : "Saved in LawDog"}
          </h3>
          <p className="text-sm font-medium text-slate-100">{completionLine}</p>
          <p className="text-xs text-slate-500">{title}</p>
          {firstSigningUrl ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="vs01-btn vs01-btn--primary vs01-btn--auto min-h-[2.5rem] px-4 text-sm"
                onClick={() => void copyText("hero-signing", firstSigningUrl)}
              >
                {copiedKey === "hero-signing" ? "Copied" : "Copy signing link"}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto min-h-[2.5rem] px-4 text-sm"
                onClick={() => window.open(firstSigningUrl, "_blank", "noopener,noreferrer")}
              >
                {packetPrepare ? "Open my signing view" : "Open signing link"}
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto min-h-[2.5rem] px-4 text-sm text-slate-200"
                disabled={!handoff.receiptId?.trim()}
                onClick={() => handoff.receiptId?.trim() && openReceiptProofBundleDownload(handoff.receiptId.trim())}
              >
                Download proof
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0 text-xs" onClick={dismiss}>
          Dismiss
        </button>
      </div>

      {signers.length > 0 ? (
        <details className="mt-4 border-t border-slate-800/60 pt-4" open={signers.length === 1}>
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            All signing links
          </summary>
          <ul className="mt-3 space-y-3">
            {signers.map((s) => (
              <li key={s.counterpartyId} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                <div className="text-sm font-medium text-slate-100">{s.displayName}</div>
                {s.email ? <div className="text-xs text-slate-500">{s.email}</div> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--auto text-xs"
                    onClick={() => void copyText(`cp-${s.counterpartyId}`, s.signingUrl)}
                  >
                    {copiedKey === `cp-${s.counterpartyId}` ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary vs01-btn--auto text-xs"
                    onClick={() => window.open(s.signingUrl, "_blank", "noopener,noreferrer")}
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="mt-3 border-t border-slate-800/60 pt-3 text-[11px] text-slate-300">
        {packetPrepare
          ? "Packet prepared. Proof downloads become available after signers complete their sessions."
          : "Proof record saved. Verification package available."}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        Optional public timestamp &middot; Not requested yet
      </p>

      {showProofDiag ? (
        <details ref={proofDetailsRef} className="mt-4 border-t border-slate-800/60 pt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">Proof status and receipt details</summary>
          <div className="mt-3">
            {handoff.receiptId?.trim() ? (
              <ProofStatus
                {...vs01ReceiptToProofStatusData({
                  receipt,
                  receiptId: handoff.receiptId,
                  receiptHashSha256: handoff.receiptHashSha256,
                })}
                exportReceiptId={handoff.receiptId.trim()}
                className="mt-0"
              />
            ) : (
              <p className="text-xs text-slate-400">
                No signer-session receipt yet. Proof and verification exports appear after the first completed signing
                session.
              </p>
            )}
            {receiptLoadError ? (
              <p className="mt-2 text-xs text-amber-200/90">Could not refresh receipt payload: {receiptLoadError}</p>
            ) : null}
            <dl className="mt-3 space-y-1 text-xs text-slate-400">
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-500">Receipt ID</dt>
                <dd className="min-w-0 break-all font-mono text-slate-300">{handoff.receiptId?.trim() || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-slate-500">SHA-256</dt>
                <dd className="min-w-0 break-all font-mono text-slate-300">
                  {handoff.receiptHashSha256?.trim() || "—"}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3 text-xs"
              disabled={!handoff.receiptHashSha256?.trim()}
              onClick={() =>
                void copyText(
                  "proof-hash",
                  `${handoff.receiptId}\n${handoff.receiptHashSha256?.trim() ?? ""}`.trim(),
                )
              }
            >
              {copiedKey === "proof-hash" ? "Copied" : "Copy proof receipt"}
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
