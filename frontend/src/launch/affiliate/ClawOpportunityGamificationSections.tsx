import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useDynamicConfig } from "../../config/dynamicConfig/useDynamicConfig";
import { useFeatureGate } from "../../config/featureFlags/useFeatureGate";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import type { ChallengeProgressView } from "./opportunityTypes";
import type { LeaderboardEntry } from "./opportunityTypes";
import type { OpportunityGamificationView } from "./opportunityTypes";
import type { OpportunitySnapshot } from "./clawOpportunityStore";
import { getLeaderboardMotivationLine } from "./opportunityGamification";
import { fetchAffiliateMomentumLeaderboard, mapApiLeaderboardToEntries } from "./affiliateGamificationApi";
import { AFFILIATE_BADGE_GLYPH, AFFILIATE_BADGE_HINT } from "./affiliateBadgeGlyphs";
import { AffiliateLeaderboardRankShareStrip } from "./AffiliateRankShareCard";

/** Subtle collectible “ring light” — warm precious-metal energy without kitsch. */
function tierAvatarWrapperStyle(tier: LeaderboardEntry["packTier"]): CSSProperties {
  const t = String(tier || "").toLowerCase();
  if (t === "legend")
    return {
      boxShadow:
        "0 0 0 1px rgba(251, 191, 36, 0.35), 0 0 32px -6px rgba(245, 158, 11, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
    };
  if (t === "rainmaker")
    return {
      boxShadow:
        "0 0 0 1px rgba(167, 139, 250, 0.35), 0 0 28px -6px rgba(139, 92, 246, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    };
  if (t === "closer")
    return {
      boxShadow:
        "0 0 0 1px rgba(52, 211, 153, 0.32), 0 0 26px -6px rgba(16, 185, 129, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    };
  if (t === "climber")
    return {
      boxShadow:
        "0 0 0 1px rgba(56, 189, 248, 0.3), 0 0 22px -6px rgba(14, 165, 233, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
    };
  if (t === "starter")
    return { boxShadow: "0 0 0 1px rgba(100, 116, 139, 0.35), 0 4px 20px -8px rgba(15, 23, 42, 0.85)" };
  switch (tier) {
    case "Alpha":
      return {
        boxShadow:
          "0 0 0 1px rgba(251, 191, 36, 0.28), 0 0 24px -6px rgba(217, 119, 6, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      };
    default:
      return { boxShadow: "0 0 0 1px rgba(71, 85, 105, 0.45), 0 4px 18px -8px rgba(15, 23, 42, 0.9)" };
  }
}

function tierRingGradient(tier: LeaderboardEntry["packTier"]): string {
  const t = String(tier || "").toLowerCase();
  if (t === "legend") return "from-amber-200/50 via-amber-500/35 to-amber-900/50";
  if (t === "rainmaker") return "from-violet-200/40 via-violet-500/35 to-fuchsia-950/50";
  if (t === "closer") return "from-emerald-200/35 via-emerald-500/30 to-emerald-950/55";
  if (t === "climber") return "from-sky-200/35 via-sky-500/28 to-sky-950/55";
  if (t === "starter") return "from-slate-300/25 via-slate-500/25 to-slate-900/60";
  switch (tier) {
    case "Alpha":
      return "from-amber-300/40 via-amber-600/35 to-amber-950/55";
    case "Connector":
      return "from-sky-300/35 via-sky-600/30 to-sky-950/55";
    case "Builder":
      return "from-emerald-300/35 via-emerald-700/28 to-emerald-950/55";
    default:
      return "from-slate-400/25 via-slate-600/30 to-slate-900/60";
  }
}

function AffiliateAvatar(props: {
  url?: string | null;
  displayName: string;
  tier: LeaderboardEntry["packTier"];
  size?: "md" | "lg";
}) {
  const { url, displayName, tier, size = "md" } = props;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";
  const dim = size === "lg" ? "h-[4.25rem] w-[4.25rem] text-lg" : "h-12 w-12 text-sm";
  const inner = url ? (
    <img src={url} alt="" className={`${dim} rounded-full object-cover`} loading="lazy" />
  ) : (
    <div
      className={`flex ${dim} items-center justify-center rounded-full bg-gradient-to-br from-violet-600/95 via-violet-800/90 to-emerald-800/85 font-bold text-white`}
      aria-hidden
    >
      {initial}
    </div>
  );
  return (
    <div
      className={`rounded-full bg-gradient-to-br p-[2.5px] shadow-lg ${tierRingGradient(tier)}`}
      style={tierAvatarWrapperStyle(tier)}
    >
      <div className="rounded-full bg-slate-950 p-[2px]">{inner}</div>
    </div>
  );
}

function PodiumRankOrb(props: { rank: number }) {
  const { rank } = props;
  if (rank === 1) {
    return (
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/50 bg-gradient-to-b from-amber-200/25 to-amber-900/40 text-[11px] font-bold tabular-nums text-amber-100 shadow-md shadow-amber-900/30"
        aria-label="First place"
      >
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/35 bg-gradient-to-b from-slate-100/18 to-slate-800/50 text-[10px] font-bold tabular-nums text-slate-100 shadow-md shadow-slate-950/40"
        aria-label="Second place"
      >
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-500/35 bg-gradient-to-b from-orange-200/15 to-orange-950/45 text-[10px] font-bold tabular-nums text-orange-100 shadow-md shadow-orange-950/35"
        aria-label="Third place"
      >
        3
      </div>
    );
  }
  return (
    <div className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-lg border border-slate-700/60 bg-slate-900/70 px-1.5 text-[10px] font-semibold tabular-nums text-slate-300">
      {rank}
    </div>
  );
}

function movementPill(movement: LeaderboardEntry["rankMovement"] | undefined): { label: string; arrow: string } | null {
  if (!movement) return null;
  if (movement === "up") return { label: "Rising", arrow: "↑" };
  if (movement === "down") return { label: "Cooling", arrow: "↓" };
  if (movement === "same") return { label: "Steady", arrow: "→" };
  return { label: "New", arrow: "✦" };
}

function packBadgeClass(tier: LeaderboardEntry["packTier"]): string {
  const t = String(tier || "").toLowerCase();
  if (t === "legend") return "border-amber-500/45 bg-amber-950/40 text-amber-50 shadow-[0_0_20px_-4px_rgba(245,158,11,0.35)]";
  if (t === "rainmaker") return "border-violet-500/40 bg-violet-950/35 text-violet-100 shadow-[0_0_18px_-4px_rgba(139,92,246,0.3)]";
  if (t === "closer") return "border-emerald-500/42 bg-emerald-950/32 text-emerald-100 shadow-[0_0_16px_-4px_rgba(16,185,129,0.22)]";
  if (t === "climber") return "border-sky-500/42 bg-sky-950/30 text-sky-100";
  if (t === "starter") return "border-slate-600/50 bg-slate-900/45 text-slate-200";
  switch (tier) {
    case "Alpha":
      return "border-amber-700/50 bg-amber-950/35 text-amber-100";
    case "Connector":
      return "border-sky-700/45 bg-sky-950/30 text-sky-100";
    case "Builder":
      return "border-emerald-800/45 bg-emerald-950/25 text-emerald-100";
    default:
      return "border-slate-600/50 bg-slate-900/40 text-slate-200";
  }
}

/** Card shell: podium treatment for 1–3, calm slab for the rest. */
function rankCardShell(rank: number, isYou: boolean): string {
  const you = isYou ? "ring-1 ring-emerald-500/40 ring-offset-2 ring-offset-slate-950/80" : "";
  if (rank === 1) {
    return `relative overflow-hidden border-amber-500/25 bg-gradient-to-br from-amber-950/35 via-slate-950/50 to-slate-950/80 shadow-[0_0_40px_-12px_rgba(245,158,11,0.25)] lawdog-tier-glow-rose ${you}`;
  }
  if (rank === 2) {
    return `relative overflow-hidden border-slate-400/20 bg-gradient-to-br from-slate-800/25 via-slate-950/55 to-slate-950/85 shadow-[0_0_28px_-12px_rgba(148,163,184,0.12)] ${you}`;
  }
  if (rank === 3) {
    return `relative overflow-hidden border-orange-600/22 bg-gradient-to-br from-orange-950/25 via-slate-950/55 to-slate-950/85 shadow-[0_0_26px_-12px_rgba(234,88,12,0.12)] ${you}`;
  }
  return `relative border-slate-800/60 bg-slate-950/45 ${you}`;
}

function badgeRibbon(badgeIds: string[] | undefined): ReactNode {
  const ids = badgeIds ?? [];
  if (ids.length === 0) return null;
  const max = 5;
  const shown = ids.slice(0, max);
  const extra = ids.length - max;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Earned badges">
      {shown.map((b) => (
        <span
          key={b}
          title={AFFILIATE_BADGE_HINT[b] ?? b.replace(/_/g, " ")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-500/25 bg-gradient-to-b from-violet-950/55 to-slate-950/80 text-sm text-violet-100/95 shadow-sm shadow-violet-950/40"
        >
          {AFFILIATE_BADGE_GLYPH[b] ?? "·"}
        </span>
      ))}
      {extra > 0 ? (
        <span className="rounded-md border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[9px] font-semibold tabular-nums text-slate-400">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export function ClawOpportunityGamificationSections(props: {
  snapshot: OpportunitySnapshot;
  gamification: OpportunityGamificationView;
  /** When set, loads server Momentum leaderboard (replaces local preview table on success). */
  orgId?: string | null;
}) {
  const { snapshot, gamification, orgId } = props;
  const dc = useDynamicConfig();
  const opp = dc.opportunity;
  const aff = dc.affiliate;
  const leaderboardOn = useFeatureGate("affiliate_leaderboard_enabled");
  const challengesOn = useFeatureGate("affiliate_challenges_enabled");
  const [liveLeaderboard, setLiveLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const mergedGamification: OpportunityGamificationView =
    liveLeaderboard != null
      ? { ...gamification, leaderboard: liveLeaderboard, source: "live" }
      : gamification;
  const motivation = getLeaderboardMotivationLine(snapshot, mergedGamification);
  const stub = mergedGamification.source === "local_preview";
  const youRow = mergedGamification.leaderboard.find((e) => e.isCurrentUser) ?? null;

  const lbLogged = useRef(false);
  useEffect(() => {
    if (!leaderboardOn || lbLogged.current) return;
    lbLogged.current = true;
    logProductEvent("leaderboard_viewed", { source: mergedGamification.source });
  }, [leaderboardOn, mergedGamification.source]);

  useEffect(() => {
    if (!leaderboardOn || !orgId?.trim()) return;
    let cancel = false;
    void (async () => {
      try {
        const res = await fetchAffiliateMomentumLeaderboard(orgId.trim(), 30);
        if (cancel || !res.leaderboard?.length) return;
        setLiveLeaderboard(mapApiLeaderboardToEntries(res.leaderboard));
      } catch {
        /* keep preview */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [leaderboardOn, orgId]);

  const chLogged = useRef(false);
  useEffect(() => {
    if (!challengesOn || chLogged.current) return;
    chLogged.current = true;
    logProductEvent("challenge_viewed", { source: mergedGamification.source });
  }, [challengesOn, mergedGamification.source]);

  return (
    <>
      {leaderboardOn ? (
        <section
          className="rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-5 sm:px-5"
          aria-labelledby="oppo-leaderboard"
        >
          <h2 id="oppo-leaderboard" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {liveLeaderboard ? `${opp.leaderboardTitle} · live` : opp.leaderboardTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {liveLeaderboard
              ? "This board pays for depth — activations, paid conversions, retention, real sends. Vanity traffic ages badly."
              : opp.leaderboardSubtext}
          </p>
          {stub ? (
            <p className="mt-2 rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-400">Local preview.</span> {aff.leaderboardStubBanner}
            </p>
          ) : null}
          <p className="mt-4 text-xs font-medium text-emerald-200/90">{motivation}</p>
          <details className="mt-3 rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-400">
              What is Momentum?
            </summary>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              One number that prefers proof over hype: referrals who activate, pay, stick around, and send agreements.
              Big on each row when live; in local preview it may mirror activity until your org syncs.
            </p>
          </details>
          {mergedGamification.nextPackMilestone ? (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-400">
                Next tier · {mergedGamification.nextPackMilestone.nextTier}.
              </span>{" "}
              {mergedGamification.nextPackMilestone.detail}
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              You&apos;re maxed on pack tier — defend rank with quality sends; status follows substance.
            </p>
          )}

          {!stub && youRow?.rowKind === "live_peer" ? (
            <AffiliateLeaderboardRankShareStrip row={youRow} />
          ) : null}

          <div className="mt-5 space-y-3" role="list">
            {mergedGamification.leaderboard.map((row) => (
              <LeaderboardRow key={row.referralId} row={row} earningsLabel={aff.earningsColumnLabel} />
            ))}
          </div>
        </section>
      ) : null}

      {challengesOn ? (
        <section
          className="rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-5 sm:px-5"
          aria-labelledby="oppo-challenges"
        >
          <h2 id="oppo-challenges" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {opp.challengesTitle}
          </h2>
          <p className="mt-2 text-xs text-slate-500">{opp.challengesPreamble}</p>
          <ul className="mt-4 list-none space-y-3 p-0">
            {mergedGamification.challenges.map((c) => (
              <ChallengeCard key={c.definition.id} progress={c} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function LeaderboardRow(props: { row: LeaderboardEntry; earningsLabel: string }) {
  const { row, earningsLabel } = props;
  const momentumDisplay = row.momentumScore != null ? row.momentumScore : row.keysGenerated;
  const move = movementPill(row.rankMovement);
  const isLive = row.rowKind === "live_peer";
  const topDog = row.rank <= 3;

  return (
    <div
      role="listitem"
      className={`rounded-2xl border px-3 py-3.5 sm:px-4 sm:py-4 ${rankCardShell(row.rank, row.isCurrentUser)}`}
    >
      {row.rank === 1 ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/35 to-transparent"
          aria-hidden
        />
      ) : null}
      <div className="relative flex gap-3 sm:gap-4">
        {/* Avatar column — identity first */}
        <div className="relative flex shrink-0 flex-col items-center">
          <div className="absolute -left-0.5 -top-0.5 z-10 sm:-left-1 sm:-top-1">
            <PodiumRankOrb rank={row.rank} />
          </div>
          <div className="pt-4 sm:pt-5">
            <AffiliateAvatar
              url={row.avatarUrl}
              displayName={row.displayHandle}
              tier={row.packTier}
              size={topDog ? "lg" : "md"}
            />
          </div>
          {row.rowKind === "preview_peer" ? (
            <span className="mt-1.5 text-[8px] font-semibold uppercase tracking-wider text-slate-600">Demo</span>
          ) : null}
        </div>

        {/* Main identity + stats */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold tracking-tight text-slate-50">{row.displayHandle}</p>
                {row.isCurrentUser ? (
                  <span className="rounded-full border border-emerald-500/35 bg-emerald-950/35 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200/95">
                    Your card
                  </span>
                ) : null}
                {move ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full border border-slate-600/55 bg-slate-900/65 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-200"
                    title="Recent rank movement"
                  >
                    <span className="text-slate-400" aria-hidden>
                      {move.arrow}
                    </span>
                    {move.label}
                  </span>
                ) : null}
              </div>
              {row.tagline ? (
                <p className="mt-0.5 truncate text-[11px] italic text-slate-500">&ldquo;{row.tagline}&rdquo;</p>
              ) : null}
              <p className="mt-1 text-[10px] text-slate-500">
                {row.rowKind === "preview_peer"
                  ? "Warm-up row — not scored against you"
                  : row.rowKind === "live_peer"
                    ? "Pack affiliate · ranked on outcomes that survive daylight"
                    : "You — copy a status line when the numbers feel honest"}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${packBadgeClass(row.packTier)}`}
              >
                {row.packTier}
              </span>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500" title="Outcomes-weighted score">
                  Momentum
                </p>
                <p className="text-xl font-semibold tabular-nums leading-none text-emerald-200/95">{momentumDisplay}</p>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800/50 pt-2 text-[11px] text-slate-400">
            <span className="tabular-nums">
              <span className="text-slate-600">{isLive ? "Sends" : "Agreements"}</span>{" "}
              <span className="font-medium text-slate-300">{row.agreementsInfluenced}</span>
            </span>
            {row.streakDays != null && row.streakDays > 0 ? (
              <span className="tabular-nums text-amber-200/85" title="Current streak">
                Run <span className="font-medium">{row.streakDays}d</span>
              </span>
            ) : null}
            {row.bestStreakDays != null && row.bestStreakDays > 0 ? (
              <span className="tabular-nums text-slate-500" title="Best streak">
                Best <span className="font-medium text-slate-400">{row.bestStreakDays}d</span>
              </span>
            ) : null}
          </div>

          {badgeRibbon(row.badgeIds)}

          {row.showEarningsColumn && row.earningsUsd != null ? (
            <p className="mt-2 text-right text-[11px] text-slate-500">
              <span className="font-medium text-emerald-200/90">${row.earningsUsd.toFixed(2)}</span>
              <span className="ml-1.5 text-[9px] uppercase tracking-wide text-slate-600">{earningsLabel}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChallengeCard(props: { progress: ChallengeProgressView }) {
  const { progress } = props;
  const { definition: d, current, target, completed, timeRemainingLabel } = progress;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const completedLogged = useRef(false);
  useEffect(() => {
    if (!completed || completedLogged.current) return;
    completedLogged.current = true;
    logProductEvent("challenge_completed", { challengeId: d.id });
  }, [completed, d.id]);

  return (
    <li
      className={`rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 sm:p-4 ${
        completed ? "claw-oppo-challenge-done border-emerald-800/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-100">{d.name}</p>
            {completed ? (
              <span className="text-lg leading-none text-emerald-400" aria-label="Completed">
                ✓
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{d.description}</p>
        </div>
        <p className="shrink-0 text-[10px] text-slate-600">{timeRemainingLabel}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800/80" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            completed ? "bg-emerald-500/80" : "bg-emerald-600/50"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="tabular-nums">
          Progress · {current}/{target}
        </span>
        <span className="text-slate-600">{d.rewardCopyStub}</span>
      </div>
    </li>
  );
}
