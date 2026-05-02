import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ProofStatus, vs01ReceiptToProofStatusData } from "../components/proof/ProofStatus";
import { LawdogRecordedMark } from "../components/ui/LawdogRecordedMark";
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

function truncateMiddle(s: string, max = 22): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const keep = max - 3;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${t.slice(0, head)}…${t.slice(t.length - tail)}`;
}

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
    if (!handoff?.receiptId?.trim()) return;
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
    if (sp.get("vs01_saved") !== "1") return;
    sp.delete("vs01_saved");
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

  const openProofDetails = useCallback(() => {
    const el = proofDetailsRef.current;
    if (!el) return;
    el.open = true;
    window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  if (!visible || !handoff) return null;

  const title = handoff.agreementTitle.trim() || "Agreement";
  const signers = handoff.signers;
  const primaryForLink = signers.find((s) => s.signingUrl?.trim()) ?? signers[0];
  const firstSigningUrl = primaryForLink?.signingUrl?.trim() ?? "";

  const namedPending = signers.filter((s) => s.displayName?.trim().length);
  const firstNamed = namedPending[0];
  const awaitingStatus =
    namedPending.length === 0
      ? "Awaiting signature"
      : namedPending.length === 1
        ? `Awaiting ${firstNamed!.displayName.trim()}`
        : "Awaiting signatures";

  const completionLine =
    signers.length === 0
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
            Saved in LawDog
          </h3>
          <p className="text-sm font-medium text-slate-100">{completionLine}</p>
          <p className="text-xs font-medium text-slate-400">{awaitingStatus}</p>
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
                Open signing link
              </button>
              <button
                type="button"
                className="vs01-btn vs01-btn--secondary vs01-btn--auto min-h-[2.5rem] px-4 text-sm text-slate-200"
                onClick={openProofDetails}
              >
                View proof
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact shrink-0 text-xs" onClick={dismiss}>
          Dismiss
        </button>
      </div>

      {signers.length > 1 ? (
        <details className="mt-4 border-t border-slate-800/60 pt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">Other signing links</summary>
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
                <p className="mt-2 font-mono text-[10px] text-slate-600" title={s.signingUrl}>
                  {truncateMiddle(s.signingUrl, 56)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : signers.length === 1 && firstSigningUrl ? (
        <p className="mt-3 border-t border-slate-800/60 pt-3 font-mono text-[10px] text-slate-600" title={firstSigningUrl}>
          {truncateMiddle(firstSigningUrl, 72)}
        </p>
      ) : null}

      <div className="mt-4 border-t border-slate-800/60 pt-4">
        <ProofStatus
          {...vs01ReceiptToProofStatusData({
            receipt,
            receiptId: handoff.receiptId,
            receiptHashSha256: handoff.receiptHashSha256,
          })}
          exportReceiptId={handoff.receiptId.trim()}
          className="mt-0"
        />
        {receiptLoadError ? (
          <p className="mt-2 text-xs text-amber-200/90">Could not refresh receipt payload: {receiptLoadError}</p>
        ) : null}
        <details ref={proofDetailsRef} className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">Proof & receipt details</summary>
          <dl className="mt-2 space-y-1 text-xs text-slate-400">
            <div className="flex gap-2">
              <dt className="shrink-0 text-slate-500">Receipt ID</dt>
              <dd className="min-w-0 break-all font-mono text-slate-300">{handoff.receiptId}</dd>
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
        </details>
      </div>
    </section>
  );
}
