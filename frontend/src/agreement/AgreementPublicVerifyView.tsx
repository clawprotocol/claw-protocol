import { useEffect, useState } from "react";
import {
  agreementPublicVerifyPath,
  fetchPublicAgreementVerify,
  type PublicVerifyPayload,
} from "./agreementPublicVerify";
import { ClawTrustFooter } from "../components/claw/ClawTrustFooter";
import { type ProofBadgeState, ProofBadge } from "../components/claw/ProofBadge";
import { LawdogOnRecordStamp } from "../components/ui/LawdogOnRecordStamp";
import { PROOF_LADDER_SUBTITLE } from "../components/proof/proofTrustLadder";
import { CANONICAL_PROOF_SENTENCE } from "../joy/clawJoyCopy";

type Props = {
  agreementId: string;
  onClose?: () => void;
};

function statusLabel(status: string | undefined): string {
  switch ((status || "").trim()) {
    case "fully_executed":
      return "Fully executed";
    case "partially_signed":
      return "Partially signed";
    case "locked_for_signing":
      return "Locked for signing";
    case "in_negotiation":
      return "In negotiation";
    default:
      return status || "—";
  }
}

function formatTs(iso: string | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString();
}

function proofStateFromPayload(data: PublicVerifyPayload): ProofBadgeState {
  if (String(data.record_status || "").trim().toLowerCase() === "pending") return "pending";
  if (data.signature_status?.fully_executed) return "verified";
  const s = String(data.summary?.status || "").trim();
  if (s === "partially_signed" || s === "locked_for_signing") return "pending";
  return "draft";
}

export function AgreementPublicVerify({ agreementId, onClose }: Props) {
  const [data, setData] = useState<PublicVerifyPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoading(true);
      const p = await fetchPublicAgreementVerify(agreementId);
      if (!cancel) {
        setData(p);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [agreementId]);

  const verifyUrl =
    typeof window !== "undefined" ? `${window.location.origin}${agreementPublicVerifyPath(agreementId)}` : "";

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-400">Loading verification…</div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <p className="text-sm text-rose-300">
          We couldn&apos;t load public verification for this link. The ID may be wrong, the agreement may not exist yet,
          or public verification may be off for this workspace.
        </p>
        <p className="text-xs leading-relaxed text-slate-500">
          If you contact support, include this agreement ID:{" "}
          <span className="font-mono text-slate-400 break-all">{agreementId}</span>
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

  const vfy = data.verification;
  const sig = data.signature_status;
  const proofState = proofStateFromPayload(data);
  const recordPending = String(data.record_status || "").trim().toLowerCase() === "pending";
  const versionHistory = data.version_history ?? [];
  const signatureEvents = data.signature_events ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2 border-b border-slate-800/90 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          LawDog · Public verification
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ProofBadge state={proofState} />
          <span className="rounded-md border border-slate-700/80 bg-slate-900/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            Public status (LawDog)
          </span>
          <LawdogOnRecordStamp surface="dark" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {(data.summary.title || "").trim() || "Agreement"}
        </h1>
        <p className="text-[11px] leading-snug text-slate-500">{PROOF_LADDER_SUBTITLE}</p>
        {recordPending ? (
          <p className="rounded-md border border-amber-800/40 bg-amber-950/25 px-3 py-2 text-xs leading-snug text-amber-100/95">
            {vfy.record_note?.trim() ||
              "Public verification details are still preparing. This page shows agreement metadata only — not full agreement text."}
          </p>
        ) : null}
        <p className="text-sm text-slate-400">
          {data.summary.jurisdiction ? `${data.summary.jurisdiction} · ` : null}
          <span className="text-slate-300">{statusLabel(data.summary.status)}</span>
        </p>
        <p className="text-xs leading-relaxed text-slate-500">{CANONICAL_PROOF_SENTENCE}</p>
        <p className="text-[11px] text-slate-600">
          Agreement ID: <span className="font-mono text-slate-500">{data.agreement_id}</span>
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
            onClick={() => void navigator.clipboard.writeText(verifyUrl).catch(() => {})}
          >
            Copy verification link
          </button>
          {onClose ? (
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-900/70"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="verify-summary-heading" className="space-y-2">
        <h2 id="verify-summary-heading" className="text-sm font-semibold text-slate-200">
          Agreement summary
        </h2>
        <dl className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="text-slate-300">{formatTs(data.summary.created_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last updated</dt>
            <dd className="text-slate-300">{formatTs(data.summary.updated_at)}</dd>
          </div>
          {data.summary.review_sent_at ? (
            <div>
              <dt className="text-slate-500">Review sent</dt>
              <dd className="text-slate-300">{formatTs(data.summary.review_sent_at)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-[11px] leading-relaxed text-slate-600">
          Full agreement text, purpose, and commercial terms are not shown on this public page.
        </p>
      </section>

      <section aria-labelledby="verify-participants-heading" className="space-y-2">
        <h2 id="verify-participants-heading" className="text-sm font-semibold text-slate-200">
          Participants
        </h2>
        {data.participants.length === 0 ? (
          <p className="text-xs text-slate-500">No parties listed.</p>
        ) : (
          <ul className="divide-y divide-slate-800/90 rounded-lg border border-slate-800/90 bg-slate-950/40">
            {data.participants.map((p, i) => (
              <li key={`${p.name}_${i}`} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span className="text-slate-100">{p.name?.trim() || "—"}</span>
                <span className="text-xs text-slate-500">{p.role || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verify-versions-heading" className="space-y-2">
        <h2 id="verify-versions-heading" className="text-sm font-semibold text-slate-200">
          Version history
        </h2>
        {versionHistory.length === 0 ? (
          <p className="text-xs text-slate-500">No version rows on record.</p>
        ) : (
          <ul className="space-y-2">
            {versionHistory.map((v) => (
              <li
                key={`${v.version}_${v.created_at}`}
                className="rounded-lg border border-slate-800/80 bg-slate-900/35 px-4 py-3 text-xs"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-200">Version {v.version}</span>
                  <span className="text-slate-500">{formatTs(v.created_at)}</span>
                </div>
                {v.note ? <p className="mt-1 text-slate-500">{v.note}</p> : null}
                <p className="mt-2 font-mono text-[10px] text-slate-600 break-all">Hash: {v.version_hash}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verify-sig-heading" className="space-y-2">
        <h2 id="verify-sig-heading" className="text-sm font-semibold text-slate-200">
          Signature status
        </h2>
        <div className="rounded-lg border border-slate-800/90 bg-slate-950/40 px-4 py-3 text-xs text-slate-300">
          <p>
            <span className="text-slate-500">State: </span>
            {sig?.fully_executed ? "Fully executed" : "Not fully executed"}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Signatures recorded: </span>
            {sig?.signatures_recorded ?? 0}
            {sig?.signer_party_count != null ? ` / ${sig.signer_party_count} signer parties` : null}
          </p>
          {sig?.locked_version_id ? (
            <p className="mt-1 font-mono text-[10px] text-slate-500 break-all">
              Locked version: {sig.locked_version_id}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="verify-proof-heading" className="space-y-2">
        <h2 id="verify-proof-heading" className="text-sm font-semibold text-slate-200">
          Verification
        </h2>
        <details className="group rounded-lg border border-violet-900/40 bg-violet-950/20 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-violet-200 marker:content-none">
            <span className="underline decoration-violet-700 underline-offset-2 group-open:no-underline">
              View proof record details
            </span>
          </summary>
          <div className="mt-4 space-y-4 border-t border-violet-900/30 pt-4 text-xs">
            <div>
              <p className="font-semibold text-slate-400">Agreement hash (public overview)</p>
              {vfy.agreement_hash?.trim() ? (
                <p className="mt-1 break-all font-mono text-[11px] text-violet-100/90">{vfy.agreement_hash}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  {vfy.record_note?.trim() || "Not available yet for this record."}
                </p>
              )}
              <p className="mt-1 text-[10px] text-slate-500">
                SHA-256 of canonical metadata and version index — excludes document body, purpose, and payment terms (
                {vfy.schema}).
              </p>
            </div>
            {vfy.signing_commitment_hash ? (
              <div>
                <p className="font-semibold text-slate-400">Signing commitment hash</p>
                <p className="mt-1 break-all font-mono text-[11px] text-violet-100/90">{vfy.signing_commitment_hash}</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Matches the ceremony payload for the locked version (full substantive snapshot used when signing is
                  active).
                </p>
              </div>
            ) : (
              <p className="text-slate-500">No signing lock — commitment hash is not yet fixed.</p>
            )}
            {data.claw_feed ? (
              <div>
                <p className="font-semibold text-slate-400">Public feed anchor</p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Bitcoin is the canonical anchor; Dogecoin (if shown) is a mirror — same commitment, secondary for verification.
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Network:{" "}
                  <span className="text-slate-400">{data.claw_feed.anchor_network || "—"}</span>
                  {" · "}
                  Status:{" "}
                  <span className="text-slate-400">{data.claw_feed.anchor_status || "—"}</span>
                </p>
                {data.claw_feed.anchor_txid ? (
                  <p className="mt-1 break-all font-mono text-[11px] text-violet-100/90">
                    {data.claw_feed.anchor_txid}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-500">No feed transaction ID yet.</p>
                )}
              </div>
            ) : null}
            {data.settlement_anchor?.note ? (
              <p className="text-[10px] leading-relaxed text-slate-600">{data.settlement_anchor.note}</p>
            ) : null}
            <div>
              <p className="font-semibold text-slate-400">Signature events</p>
              {signatureEvents.length === 0 ? (
                <p className="mt-1 text-slate-500">None recorded.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {signatureEvents.map((ev, idx) => (
                    <li
                      key={`${ev.event_type}_${ev.at}_${idx}`}
                      className="rounded border border-slate-800/80 bg-slate-900/50 px-3 py-2"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium text-slate-200">{ev.event_type.replace(/_/g, " ")}</span>
                        <span className="text-slate-500">{formatTs(ev.at)}</span>
                      </div>
                      {ev.participant_display_name ? (
                        <p className="mt-1 text-slate-400">Participant: {ev.participant_display_name}</p>
                      ) : null}
                      {ev.typed_name ? (
                        <p className="mt-1 text-slate-500">Typed confirmation: {ev.typed_name}</p>
                      ) : null}
                      {ev.agreement_version_hash ? (
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                          Version hash: {ev.agreement_version_hash}
                        </p>
                      ) : null}
                      {ev.locked_version_id ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-600">Lock: {ev.locked_version_id}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      </section>

      <ClawTrustFooter agreementId={data.agreement_id} className="!text-left" />
    </div>
  );
}
