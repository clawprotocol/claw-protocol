import type { LawdogPublicLeaderboardEntry } from "./lawdogLeaderboardTypes";
import { launchBadgeCatalog } from "./proofBadges";
import { PROOF_TIER_ACCENTS } from "./proofTier";

function badgeTitle(id: string): string {
  return launchBadgeCatalog().find((b) => b.id === id)?.title ?? id;
}

export function LawdogProofLeaderboardPreview(props: { row: LawdogPublicLeaderboardEntry | null }) {
  const { row } = props;
  return (
    <section
      className="rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-4 text-left"
      aria-labelledby="lawdog-pub-lb-title"
    >
      <h2 id="lawdog-pub-lb-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Public row preview (safe fields)
      </h2>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
        Handle, Proof Score, tier, earned badges, and proof band only — never agreement text, parties, or documents.
        Doginal markers are separate from badges. Synced leaderboards are a later step; this row stays on-device for
        now.
      </p>
      {!row ? (
        <p className="mt-3 text-xs text-slate-500">You&apos;re private — nothing is published from this device.</p>
      ) : (
        <div
          className={`mt-4 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-3 ${row.tier_key === "rose" ? "lawdog-tier-glow-rose" : ""}`}
          style={{ borderTopColor: PROOF_TIER_ACCENTS[row.tier_key], borderTopWidth: 3 }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{row.display_handle}</span>
            {row.doginal_community_marker ? (
              <span
                className="rounded-full border border-sky-800/45 bg-sky-950/35 px-2 py-0.5 text-[10px] text-sky-100/90"
                title="Arrived via a Doginal campaign link — not a holder check."
              >
                Doginal community
              </span>
            ) : null}
            {row.doginal_verified_marker ? (
              <span
                className="rounded-full border border-violet-800/50 bg-violet-950/40 px-2 py-0.5 text-[10px] text-violet-200/90"
                title="Honor attestation only — not on-chain ownership proof."
              >
                Doginal verified (honor)
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Proof Score <span className="font-semibold tabular-nums text-slate-200">{row.proof_score}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span style={{ color: PROOF_TIER_ACCENTS[row.tier_key] }}>{row.tier_label}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            {row.rank_band_label}
          </p>
          {row.badge_ids.length ? (
            <ul className="mt-2 flex flex-wrap gap-2 p-0 list-none">
              {row.badge_ids.map((id) => (
                <li
                  key={id}
                  className="rounded-full border border-slate-700/80 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300"
                >
                  {badgeTitle(id)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-slate-600">No badges yet — sends and signatures earn them.</p>
          )}
        </div>
      )}
    </section>
  );
}
