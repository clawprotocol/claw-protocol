import { userFacingAnchorHeadline } from "./anchorLabels";
import type { ExecutionPacket } from "./executionPacket";

type Props = {
  packet: ExecutionPacket;
  onClose: () => void;
};

export function ExecutionPacketView({ packet, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-labelledby="signing-record-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 id="signing-record-title" className="text-sm font-semibold text-slate-100">
            Signing record
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-200">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agreement</h3>
            <p className="text-slate-200">{packet.agreement.title || "—"}</p>
            {packet.agreement.jurisdiction ? (
              <p className="text-xs text-slate-400">Governing law: {packet.agreement.jurisdiction}</p>
            ) : null}
            {packet.agreement.effectiveDate ? (
              <p className="text-xs text-slate-400">Effective date: {packet.agreement.effectiveDate}</p>
            ) : null}
            <ul className="list-inside list-disc text-xs text-slate-400">
              {packet.agreement.parties.map((p, i) => (
                <li key={`p_${i}`}>
                  {p.name}
                  {p.role ? ` — ${p.role}` : ""}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500">
              Final rendered document is included in the JSON download (HTML body).
            </p>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signers</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {packet.signers.map((s, i) => (
                <li key={`s_${i}`} className="rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                  <span className="font-medium text-slate-200">{s.name}</span>
                  <span className="text-slate-500"> · {s.role}</span>
                  {s.signingLink ? (
                    <div className="mt-1 break-all font-mono text-[10px] text-sky-300/90">{s.signingLink}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review summary</h3>
            <ul className="space-y-1 text-xs text-slate-400">
              <li>Total versions: {packet.negotiationSummary.totalVersions}</li>
              <li>Review events: {packet.negotiationSummary.totalNegotiationEvents}</li>
              <li>Final version at signing: {packet.negotiationSummary.finalState}</li>
              {packet.negotiationSummary.topFrictionClauses.length > 0 ? (
                <li>Focus areas: {packet.negotiationSummary.topFrictionClauses.join(", ")}</li>
              ) : null}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version history</h3>
            <ul className="space-y-2 text-xs text-slate-400">
              {packet.versionHistory.map((row) => (
                <li key={`${row.versionId}_${row.timestamp}`} className="border-b border-slate-800/60 pb-2 last:border-0">
                  <div className="text-slate-500">{new Date(row.timestamp).toLocaleString()}</div>
                  <div className="text-slate-300">
                    {row.actor}: {row.event}
                  </div>
                  {row.changedFields?.length ? (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Changed: {row.changedFields.join(", ")}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit status</h3>
            <p className="text-xs text-slate-400">Finalized for signing</p>
            <ul className="text-xs text-slate-500">
              <li>Locked at: {new Date(packet.audit.lockedAt).toLocaleString()}</li>
              <li>Locked by: {packet.audit.lockedBy}</li>
            </ul>
          </section>

          <section className="mt-6 space-y-2 border-t border-slate-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Proof &amp; anchor status
            </h3>
            {packet.proof ? (
              <ul className="space-y-1 text-xs text-slate-400">
                <li>
                  Receipt:{" "}
                  {packet.proof.receipt_id
                    ? `created (${packet.proof.receipt_hash_sha256?.slice(0, 12) ?? "…"}…)`
                    : "—"}
                </li>
                <li>
                  Anchor status:{" "}
                  <span className="text-slate-200">
                    {userFacingAnchorHeadline(packet.proof)}
                  </span>
                </li>
                {packet.proof.anchor_error && packet.proof.anchor_status === "failed" ? (
                  <li className="text-rose-300/90 break-words text-[11px]">
                    {packet.proof.anchor_error.slice(0, 500)}
                    {typeof packet.proof.anchor_attempts === "number"
                      ? ` (attempts: ${packet.proof.anchor_attempts})`
                      : ""}
                  </li>
                ) : null}
                {packet.proof.anchor_network ? (
                  <li>
                    Network: <span className="font-mono text-slate-300">{packet.proof.anchor_network}</span>
                  </li>
                ) : null}
                {packet.proof.anchor_txid ? (
                  <li className="break-all font-mono text-[10px] text-sky-300/90">
                    Txid: {packet.proof.anchor_txid}
                  </li>
                ) : null}
                {packet.proof.anchor_explorer_url ? (
                  <li>
                    <a
                      href={packet.proof.anchor_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300/90 underline"
                    >
                      View on-chain anchor
                    </a>
                  </li>
                ) : null}
                {packet.proof.anchor_canonical_explorer_url ? (
                  <li>
                    <a
                      href={packet.proof.anchor_canonical_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-300/90 underline"
                    >
                      View Bitcoin anchor
                    </a>
                    {packet.proof.anchor_canonical_txid ? (
                      <span className="ml-2 break-all font-mono text-[10px] text-slate-500">
                        {packet.proof.anchor_canonical_txid}
                      </span>
                    ) : null}
                  </li>
                ) : null}
                {packet.proof.anchor_mirror_explorer_url ? (
                  <li>
                    <a
                      href={packet.proof.anchor_mirror_explorer_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-300/90 underline"
                    >
                      View Dogecoin mirror
                    </a>
                    {packet.proof.anchor_mirror_txid ? (
                      <span className="ml-2 break-all font-mono text-[10px] text-slate-500">
                        {packet.proof.anchor_mirror_txid}
                      </span>
                    ) : null}
                  </li>
                ) : null}
                {packet.proof.anchor_dual_chain_ops ? (
                  <li className="rounded border border-slate-700/80 bg-slate-900/40 p-2 text-[10px] text-slate-500">
                    <div className="mb-1 font-semibold text-slate-400">Operator — chain detail</div>
                    <div>
                      Primary record ({packet.proof.anchor_dual_chain_ops.canonical_role}):{" "}
                      <span className="font-mono text-slate-400">
                        {String(
                          (packet.proof.anchor_dual_chain_ops.btc as { status?: string } | undefined)
                            ?.status ?? "—",
                        )}
                      </span>
                      {packet.proof.anchor_dual_chain_ops.btc &&
                      (packet.proof.anchor_dual_chain_ops.btc as { broadcast_at?: string }).broadcast_at ? (
                        <span className="ml-1">
                          · submitted{" "}
                          {String(
                            (packet.proof.anchor_dual_chain_ops.btc as { broadcast_at?: string })
                              .broadcast_at,
                          )}
                        </span>
                      ) : null}
                      {packet.proof.anchor_dual_chain_ops.btc &&
                      (packet.proof.anchor_dual_chain_ops.btc as { confirmed_at?: string }).confirmed_at ? (
                        <span className="ml-1">
                          · confirmed{" "}
                          {String(
                            (packet.proof.anchor_dual_chain_ops.btc as { confirmed_at?: string })
                              .confirmed_at,
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1">
                      Mirror ({packet.proof.anchor_dual_chain_ops.mirror_role}):{" "}
                      <span className="font-mono text-slate-400">
                        {String(
                          (packet.proof.anchor_dual_chain_ops.doge as { status?: string } | undefined)
                            ?.status ?? "—",
                        )}
                      </span>
                      {packet.proof.anchor_dual_chain_ops.doge &&
                      (packet.proof.anchor_dual_chain_ops.doge as { broadcast_at?: string }).broadcast_at ? (
                        <span className="ml-1">
                          · submitted{" "}
                          {String(
                            (packet.proof.anchor_dual_chain_ops.doge as { broadcast_at?: string })
                              .broadcast_at,
                          )}
                        </span>
                      ) : null}
                      {packet.proof.anchor_dual_chain_ops.doge &&
                      (packet.proof.anchor_dual_chain_ops.doge as { confirmed_at?: string }).confirmed_at ? (
                        <span className="ml-1">
                          · confirmed{" "}
                          {String(
                            (packet.proof.anchor_dual_chain_ops.doge as { confirmed_at?: string })
                              .confirmed_at,
                          )}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ) : null}
                {packet.proof.batch_id ? (
                  <li className="break-all font-mono text-[10px] text-slate-500">
                    Batch: {packet.proof.batch_id}
                    {packet.proof.batch_merkle_root_sha256
                      ? ` · Merkle root: ${packet.proof.batch_merkle_root_sha256.slice(0, 16)}…`
                      : ""}
                  </li>
                ) : null}
                {typeof packet.proof.anchor_cadence_blocks === "number" ? (
                  <li className="text-[11px] text-slate-500">
                    Scheduling hint for this network: ~{packet.proof.anchor_cadence_blocks} blocks/day equiv.
                  </li>
                ) : (
                  <li className="text-[11px] text-slate-500">
                    Primary anchor: Bitcoin. Dogecoin mirror uses the same batch commitment (secondary for
                    verification). Launch default: weekly on-chain windows (operator-scheduled).
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                Receipt not registered yet. Finalize for signing registers a deterministic receipt and queues it
                for periodic batch anchoring.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
