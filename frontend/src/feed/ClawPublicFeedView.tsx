import { useEffect, useState } from "react";
import { agreementPublicVerifyPath } from "../agreement/agreementPublicVerify";
import {
  clawPublicFeedPath,
  fetchPublicClawFeed,
  type PublicFeedEvent,
  type PublicFeedResponse,
} from "./clawPublicFeed";

function formatTs(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

function eventTypeLabel(t: string | undefined): string {
  switch ((t || "").trim()) {
    case "created":
      return "Created";
    case "revision_applied":
      return "Revision";
    case "finalized":
      return "Locked for signing";
    case "signed":
      return "Fully executed";
    default:
      return (t || "Event").replace(/_/g, " ");
  }
}

function anchorBadge(ev: PublicFeedEvent): { label: string; subtle: string } {
  const net = (ev.anchor_network || "").toLowerCase();
  const st = (ev.anchor_status || "").toLowerCase();
  if (st === "anchored" && net.startsWith("dogecoin")) {
    return {
      label: "Mirrored to Dogecoin",
      subtle: ev.anchor_txid ? `Tx: ${ev.anchor_txid}` : "",
    };
  }
  if (st === "anchored" && net.startsWith("bitcoin")) {
    return {
      label: "Anchored to Bitcoin",
      subtle: ev.anchor_txid ? `Tx: ${ev.anchor_txid}` : "",
    };
  }
  if (st === "anchored") {
    return { label: `Anchored · ${ev.anchor_network || "chain"}`, subtle: ev.anchor_txid ? `Tx: ${ev.anchor_txid}` : "" };
  }
  if (st === "failed") {
    const hint = (ev.anchor_error || "").trim();
    return {
      label: "Anchor failed",
      subtle: hint ? hint.slice(0, 160) : "See server logs / worker retries",
    };
  }
  return { label: "Pending anchor", subtle: "Batch commitment queued (Bitcoin-first)" };
}

type Props = {
  onClose?: () => void;
};

export function ClawPublicFeedView({ onClose }: Props) {
  const [data, setData] = useState<PublicFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoading(true);
      const r = await fetchPublicClawFeed(80);
      if (!cancel) {
        setData(r);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-400">
        Loading public feed…
      </div>
    );
  }

  if (!data || !data.events?.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <p className="text-sm text-slate-400">
          No public CLAW feed items yet, or the feed API is disabled for this workspace.
        </p>
        <p className="text-[11px] text-slate-600">
          Agreements must be explicitly marked public to appear here. Summaries are redacted.
        </p>
        {onClose ? (
          <button
            type="button"
            className="text-xs text-slate-400 underline"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>
    );
  }

  const policy = data.policy;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2 border-b border-slate-800/90 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">CLAW · Feed</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-emerald-900/50 bg-emerald-950/25 px-2 py-0.5 text-[10px] font-medium text-emerald-200/90">
            CLAW public feed
          </span>
          <span className="text-[10px] text-slate-600">
            Redacted, opt-in timeline
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Agreement highlights</h1>
        <p className="text-sm text-slate-400">
          Redacted summaries only — no full agreement text or payment detail unless the publisher allowed a
          minimal hint.
        </p>
        {policy?.feed_event_anchor_network_default ? (
          <p className="text-[11px] text-slate-600">
            Feed events anchor on{" "}
            <span className="text-slate-500">{policy.feed_event_anchor_network_default}</span> when the worker
            runs; Merkle settlements may use{" "}
            <span className="text-slate-500">{policy.settlement_anchor_network_hint || "Bitcoin-class"}</span>{" "}
            separately.
          </p>
        ) : null}
      </header>

      <ul className="space-y-4">
        {data.events.map((ev) => {
          const aid = (ev.agreement_id || "").trim();
          const verifyPath = aid ? agreementPublicVerifyPath(aid) : clawPublicFeedPath();
          const ab = anchorBadge(ev);
          return (
            <li key={`${ev.event_id || ev.at}_${ev.agreement_id}_${ev.event_type}`}>
              <button
                type="button"
                className="w-full rounded-xl border border-slate-800/90 bg-slate-950/40 p-4 text-left transition hover:border-slate-700/90 hover:bg-slate-900/30"
                onClick={() => {
                  if (aid) window.location.assign(verifyPath);
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-200">
                    {eventTypeLabel(ev.event_type)}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      (ev.anchor_status || "").toLowerCase() === "anchored"
                        ? "bg-emerald-950/40 text-emerald-200/90"
                        : "bg-amber-950/35 text-amber-100/90"
                    }`}
                  >
                    {ab.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-200">{ev.summary}</p>
                {ev.participants && ev.participants.length > 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {ev.participants
                      .map((p) => `${p.name || "—"} (${p.role || "party"})`)
                      .join(" · ")}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>{formatTs(ev.at)}</span>
                  {aid ? (
                    <span className="font-mono text-[10px] text-slate-600">{aid}</span>
                  ) : null}
                </div>
                {ab.subtle ? <p className="mt-1 text-[10px] text-slate-600">{ab.subtle}</p> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {onClose ? (
        <button
          type="button"
          className="text-xs text-slate-400 underline"
          onClick={onClose}
        >
          Close
        </button>
      ) : null}
    </div>
  );
}
