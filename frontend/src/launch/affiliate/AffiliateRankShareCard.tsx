import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import {
  affiliateRankCardFilename,
  downloadAffiliateRankBlob,
  exportAffiliateRankCardPng,
} from "./affiliateRankShareExport";
import {
  affiliateBadgeGlyph,
  AFFILIATE_BADGE_HINT,
} from "./affiliateBadgeGlyphs";
import type { LeaderboardEntry } from "./opportunityTypes";
import type { RankMovement } from "./affiliateGamificationApi";

export type RankShareMode = "rank" | "unlock" | "tier_upgrade";

export type AffiliateRankShareCardProps = {
  mode: RankShareMode;
  displayName: string;
  avatarUrl: string | null;
  tier: string;
  rank: number | null;
  momentum: number;
  streakDays: number;
  bestStreakDays: number;
  rankMovement?: RankMovement;
  badgeIds?: string[];
  unlockVisual?: string;
  unlockTitle?: string;
  tierUpgradeFrom?: string | null;
  tierUpgradeTo?: string | null;
  agreementsInfluenced?: number;
};

function formatMomentum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function movementLabel(m: RankMovement | undefined): { arrow: string; label: string } | null {
  if (!m) return null;
  if (m === "up") return { arrow: "↑", label: "Rising" };
  if (m === "down") return { arrow: "↓", label: "Cooling" };
  if (m === "same") return { arrow: "→", label: "Steady" };
  return { arrow: "✦", label: "New" };
}

function tierPillClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "legend")
    return "border-amber-500/50 bg-amber-950/45 text-amber-50 shadow-[0_0_24px_-4px_rgba(245,158,11,0.35)]";
  if (t === "rainmaker")
    return "border-violet-500/45 bg-violet-950/40 text-violet-100 shadow-[0_0_20px_-4px_rgba(139,92,246,0.28)]";
  if (t === "closer") return "border-emerald-500/45 bg-emerald-950/35 text-emerald-100";
  if (t === "climber") return "border-sky-500/45 bg-sky-950/35 text-sky-100";
  if (t === "starter") return "border-slate-600/55 bg-slate-900/55 text-slate-200";
  if (t === "alpha") return "border-amber-600/50 bg-amber-950/40 text-amber-100";
  if (t === "connector") return "border-sky-600/50 bg-sky-950/35 text-sky-100";
  if (t === "builder") return "border-emerald-700/50 bg-emerald-950/30 text-emerald-100";
  if (t === "pup") return "border-slate-500/50 bg-slate-900/50 text-slate-200";
  return "border-slate-600/50 bg-slate-900/45 text-slate-200";
}

function tierRingWrapClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "legend") return "from-amber-200/55 via-amber-500/40 to-amber-900/50";
  if (t === "rainmaker") return "from-violet-200/45 via-violet-500/40 to-fuchsia-950/55";
  if (t === "alpha") return "from-amber-300/45 via-amber-600/38 to-amber-950/55";
  return "from-violet-500/35 via-emerald-600/28 to-slate-900/55";
}

function tierAvatarGlow(tier: string): React.CSSProperties {
  const t = tier.toLowerCase();
  if (t === "legend")
    return {
      boxShadow:
        "0 0 0 1px rgba(251, 191, 36, 0.4), 0 0 40px -6px rgba(245, 158, 11, 0.35)",
    };
  if (t === "rainmaker")
    return {
      boxShadow:
        "0 0 0 1px rgba(167, 139, 250, 0.38), 0 0 36px -6px rgba(139, 92, 246, 0.32)",
    };
  return { boxShadow: "0 0 0 1px rgba(71, 85, 105, 0.5), 0 12px 40px -12px rgba(15, 23, 42, 0.9)" };
}

function ShareAvatar(props: {
  url: string | null;
  initial: string;
  tier: string;
  sizePx: number;
}) {
  const { url, initial, tier, sizePx } = props;
  const dim = { width: sizePx, height: sizePx };
  const inner = url ? (
    <img
      src={url}
      alt=""
      width={sizePx}
      height={sizePx}
      crossOrigin="anonymous"
      className="rounded-full object-cover"
      style={dim}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 via-violet-800 to-emerald-800 font-bold text-white"
      style={{ ...dim, fontSize: sizePx * 0.38 }}
      aria-hidden
    >
      {initial}
    </div>
  );
  return (
    <div
      className={`rounded-full bg-gradient-to-br p-[3px] ${tierRingWrapClass(tier)}`}
      style={tierAvatarGlow(tier)}
    >
      <div className="rounded-full bg-slate-950 p-[3px]">{inner}</div>
    </div>
  );
}

export const AffiliateRankShareCard = forwardRef<HTMLDivElement, AffiliateRankShareCardProps>(
  function AffiliateRankShareCard(props, ref) {
    const {
      mode,
      displayName,
      avatarUrl,
      tier,
      rank,
      momentum,
      streakDays,
      bestStreakDays,
      rankMovement,
      badgeIds = [],
      unlockVisual,
      unlockTitle,
      tierUpgradeFrom,
      tierUpgradeTo,
      agreementsInfluenced = 0,
    } = props;

    const move = movementLabel(rankMovement);
    const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";
    const badges = badgeIds.slice(0, 5);
    const extraBadges = Math.max(0, badgeIds.length - 5);
    const firstBadge = badgeIds[0];
    const resolvedUnlockGlyph = unlockVisual ?? (firstBadge ? affiliateBadgeGlyph(firstBadge) : "✦");
    const resolvedUnlockTitle =
      unlockTitle ??
      (firstBadge ? AFFILIATE_BADGE_HINT[firstBadge] ?? firstBadge.replace(/_/g, " ") : "Earned mark on the board");

    const tierFromStr = tierUpgradeFrom?.trim() || "";
    const tierToStr = (tierUpgradeTo?.trim() || tier).trim();
    const tierUp = Boolean(tierFromStr && tierToStr && tierFromStr !== tierToStr);

    const subline =
      mode === "rank"
        ? "Earn with LawDog"
        : mode === "unlock"
          ? "Shared with LawDog"
          : tierUp
            ? "Shared with LawDog"
            : "My LawDog referral";

    let body: ReactNode;
    if (mode === "unlock") {
      body = (
        <div className="relative flex flex-1 flex-col items-center justify-center px-14 pb-10 pt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200/85">Latest unlock</p>
          <p className="mt-4 text-[6.5rem] font-light leading-none text-violet-100/95">{resolvedUnlockGlyph}</p>
          <p className="mt-5 max-w-[38rem] text-[1.85rem] font-semibold leading-snug text-white">
            {resolvedUnlockTitle}
          </p>
          <div className="mt-8 flex items-center gap-4">
            <ShareAvatar url={avatarUrl} initial={initial} tier={tier} sizePx={72} />
            <div className="text-left">
              <p className="text-lg font-semibold text-white">{displayName}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {tier} · momentum {formatMomentum(momentum)}
              </p>
            </div>
          </div>
        </div>
      );
    } else if (mode === "tier_upgrade") {
      body = (
        <div className="relative flex flex-1 flex-col justify-center px-14 pb-12 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/85">
            {tierUp ? "Shared with LawDog" : "My LawDog referral"}
          </p>
          {tierUp ? (
            <div className="mt-5 flex flex-wrap items-center gap-5">
              <span
                className={`inline-flex rounded-full border px-5 py-2.5 text-lg font-bold uppercase tracking-wide ${tierPillClass(tierFromStr)}`}
              >
                {tierFromStr}
              </span>
              <span className="text-4xl font-light text-slate-500">→</span>
              <span
                className={`inline-flex rounded-full border px-5 py-2.5 text-lg font-bold uppercase tracking-wide ${tierPillClass(tierToStr)}`}
              >
                {tierToStr}
              </span>
            </div>
          ) : (
            <div className="mt-5">
              <span
                className={`inline-flex rounded-full border px-6 py-3 text-xl font-bold uppercase tracking-wide ${tierPillClass(tierToStr)}`}
              >
                Current · {tierToStr}
              </span>
            </div>
          )}
          <div className="mt-10 flex items-center gap-5">
            <ShareAvatar url={avatarUrl} initial={initial} tier={tier} sizePx={112} />
            <div>
              <p className="text-3xl font-bold tracking-tight text-white">{displayName}</p>
              <p className="mt-2 text-sm text-slate-400">
                Momentum <span className="font-semibold tabular-nums text-emerald-200">{formatMomentum(momentum)}</span>
                {rank != null ? (
                  <>
                    {" "}
                    · Rank <span className="font-semibold text-slate-200">#{rank}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="relative mt-4 flex flex-1 items-end gap-10 px-14 pb-11">
          <ShareAvatar url={avatarUrl} initial={initial} tier={tier} sizePx={144} />
          <div className="min-w-0 flex-1 pb-1">
            <p className="truncate text-[2.35rem] font-bold tracking-tight text-white">{displayName}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full border px-4 py-1.5 text-sm font-bold uppercase tracking-wide ${tierPillClass(tier)}`}
              >
                {tier}
              </span>
              {move ? (
                <span className="rounded-full border border-slate-600/60 bg-slate-900/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
                  {move.arrow} {move.label}
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-10">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Momentum</p>
                <p className="text-[4.25rem] font-black leading-none tracking-tight text-emerald-200 tabular-nums">
                  {formatMomentum(momentum)}
                </p>
              </div>
              <div className="pb-2">
                <p className="text-sm font-medium text-slate-400">
                  Run <span className="font-semibold text-amber-200/90 tabular-nums">{streakDays}d</span>
                  <span className="mx-2 text-slate-600">·</span>
                  Best <span className="font-semibold text-slate-300 tabular-nums">{bestStreakDays}d</span>
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Sends influenced ·{" "}
                  <span className="font-semibold tabular-nums text-slate-300">{agreementsInfluenced}</span>
                </p>
              </div>
            </div>
            {badges.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {badges.map((id) => (
                  <span
                    key={id}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-violet-500/35 bg-violet-950/55 text-[1.35rem] text-violet-100 shadow-md shadow-violet-950/30"
                  >
                    {affiliateBadgeGlyph(id)}
                  </span>
                ))}
                {extraBadges > 0 ? (
                  <span className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-sm font-bold tabular-nums text-slate-400">
                    +{extraBadges}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="relative box-border flex flex-col overflow-hidden rounded-[28px] border border-white/[0.12] bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/35 text-left"
        style={{
          width: 1200,
          height: 630,
          fontFamily: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_-10%,rgba(139,92,246,0.22),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_110%,rgba(16,185,129,0.14),transparent_52%)]"
          aria-hidden
        />
        <p
          className="pointer-events-none absolute right-10 top-10 text-8xl font-black leading-none text-white/[0.04]"
          aria-hidden
        >
          PAW
        </p>

        <div className="relative flex items-start justify-between px-14 pt-9">
          <div>
            <p className="text-[2.65rem] font-black tracking-[0.09em] text-white">CLAW</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.38em] text-emerald-200/78">{subline}</p>
          </div>
          {mode === "rank" && rank != null ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-950/45 px-5 py-3 text-right shadow-lg shadow-amber-900/25">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/85">Rank</p>
              <p className="text-[3.25rem] font-black leading-none tracking-tight text-amber-50 tabular-nums">#{rank}</p>
            </div>
          ) : null}
        </div>

        {body}

        <div className="pointer-events-none absolute bottom-5 left-14 right-14 flex items-end justify-between text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-600">
          <span>Create and send agreements in minutes</span>
          <span className="text-slate-700">claw</span>
        </div>
      </div>
    );
  },
);

type DashboardSharePayload = {
  profile: {
    display_name: string;
    avatar_url: string | null;
    progression_tier: string;
    leaderboard_rank: number | null;
    momentum_score: number;
    agreements_influenced: number;
  };
  streak: { current_streak_days: number; best_streak_days: number };
  celebrations: { tier_upgrade: { previous_tier: string; new_tier: string } | null } | null;
  recentWin?: { title: string; visual: string; badge_id: string } | null;
  badgeIdsOrdered: string[];
};

function cardPropsForDashboard(mode: RankShareMode, d: DashboardSharePayload): AffiliateRankShareCardProps {
  const p = d.profile;
  const tu = d.celebrations?.tier_upgrade;
  const rw = d.recentWin;
  return {
    mode,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    tier: p.progression_tier,
    rank: p.leaderboard_rank,
    momentum: p.momentum_score,
    streakDays: d.streak.current_streak_days,
    bestStreakDays: d.streak.best_streak_days,
    badgeIds: d.badgeIdsOrdered,
    agreementsInfluenced: p.agreements_influenced,
    unlockVisual: mode === "unlock" ? rw?.visual : undefined,
    unlockTitle: mode === "unlock" ? rw?.title : undefined,
    tierUpgradeFrom: mode === "tier_upgrade" ? (tu?.previous_tier ?? null) : null,
    tierUpgradeTo: mode === "tier_upgrade" ? (tu?.new_tier ?? p.progression_tier) : null,
  };
}

export function AffiliateRankShareDeck(props: { data: DashboardSharePayload }) {
  const { data } = props;
  const [mode, setMode] = useState<RankShareMode>("rank");
  const exportRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const propsForMode = useMemo(() => cardPropsForDashboard(mode, data), [mode, data]);

  const canUnlock =
    Boolean(data.recentWin) || (data.badgeIdsOrdered.length > 0 && Boolean(data.badgeIdsOrdered[0]));

  const runExport = useCallback(
    async (kind: "download" | "share") => {
      const el = exportRef.current;
      if (!el) return;
      setBusy(true);
      try {
        const blob = await exportAffiliateRankCardPng(el);
        const name = affiliateRankCardFilename(mode);
        if (kind === "share" && typeof navigator !== "undefined" && navigator.share) {
          const file = new File([blob], name, { type: "image/png" });
          const canFiles = navigator.canShare?.({ files: [file] }) ?? false;
          if (canFiles) {
            await navigator.share({
              files: [file],
              title: "Earn with LawDog",
              text: "My LawDog referral — create and send agreements in minutes.",
            });
            logProductEvent("affiliate_rank_card_shared", { mode, channel: "web_share_files" });
          } else {
            downloadAffiliateRankBlob(blob, name);
            logProductEvent("affiliate_rank_card_shared", { mode, channel: "download_fallback" });
          }
        } else {
          downloadAffiliateRankBlob(blob, name);
          logProductEvent("affiliate_rank_card_shared", { mode, channel: "download" });
        }
      } catch {
        logProductEvent("affiliate_rank_card_share_failed", { mode });
      } finally {
        setBusy(false);
      }
    },
    [mode],
  );

  return (
    <div className="mt-5 border-t border-slate-800/70 pt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Share cards</p>
      <p className="mt-1 text-[11px] text-slate-600">
        Avatar-forward · built for timelines. Save PNG or use system share when available.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          onClick={() => setMode("rank")}
        >
          Earn with LawDog
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact disabled:opacity-40"
          disabled={!canUnlock}
          title={canUnlock ? undefined : "Unlock a badge or grab a recent win first"}
          onClick={() => setMode("unlock")}
        >
          Share latest unlock
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          onClick={() => setMode("tier_upgrade")}
          title={
            data.celebrations?.tier_upgrade
              ? "Includes your last tier bump"
              : "Current tier — pair with this image after a real upgrade"
          }
        >
          {data.celebrations?.tier_upgrade ? "Shared with LawDog" : "My LawDog referral"}
        </button>
      </div>

      <div
        className="mt-4 w-full max-w-xl overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/50"
        style={{ height: 630 * 0.48 }}
      >
        <div
          className="origin-top-left"
          style={{
            transform: "scale(0.48)",
            width: 1200,
            height: 630,
          }}
        >
          <AffiliateRankShareCard {...propsForMode} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--compact"
          disabled={busy}
          onClick={() => void runExport("share")}
        >
          {busy ? "Working…" : "Share image"}
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          disabled={busy}
          onClick={() => void runExport("download")}
        >
          Download PNG
        </button>
      </div>

      <div
        ref={exportRef}
        className="pointer-events-none fixed left-[-14000px] top-0 -z-10 opacity-0"
        aria-hidden
      >
        <AffiliateRankShareCard {...propsForMode} />
      </div>
    </div>
  );
}

export function AffiliateLeaderboardRankShareStrip(props: { row: LeaderboardEntry }) {
  const { row } = props;
  const [mode, setMode] = useState<RankShareMode>("rank");
  const [busy, setBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const firstBadge = row.badgeIds?.[0];
  const canUnlock = Boolean(firstBadge);

  const cardProps = useMemo((): AffiliateRankShareCardProps => {
    return {
      mode,
      displayName: row.displayHandle,
      avatarUrl: row.avatarUrl ?? null,
      tier: String(row.packTier),
      rank: row.rank,
      momentum: row.momentumScore ?? row.keysGenerated,
      streakDays: row.streakDays ?? 0,
      bestStreakDays: row.bestStreakDays ?? 0,
      rankMovement: row.rankMovement,
      badgeIds: row.badgeIds ?? [],
      agreementsInfluenced: row.agreementsInfluenced,
      unlockVisual: firstBadge ? affiliateBadgeGlyph(firstBadge) : undefined,
      unlockTitle: firstBadge ? AFFILIATE_BADGE_HINT[firstBadge] ?? firstBadge.replace(/_/g, " ") : undefined,
      tierUpgradeFrom: null,
      tierUpgradeTo: String(row.packTier),
    };
  }, [row, mode, firstBadge]);

  const runExport = useCallback(
    async (kind: "download" | "share") => {
      const el = exportRef.current;
      if (!el) return;
      setBusy(true);
      try {
        const blob = await exportAffiliateRankCardPng(el);
        const name = affiliateRankCardFilename(mode);
        if (kind === "share" && typeof navigator !== "undefined" && navigator.share) {
          const file = new File([blob], name, { type: "image/png" });
          const canFiles = navigator.canShare?.({ files: [file] }) ?? false;
          if (canFiles) {
            await navigator.share({
              files: [file],
              title: "Earn with LawDog",
              text: "Shared with LawDog.",
            });
            logProductEvent("affiliate_rank_card_shared", { mode, surface: "leaderboard", channel: "web_share_files" });
          } else {
            downloadAffiliateRankBlob(blob, name);
            logProductEvent("affiliate_rank_card_shared", { mode, surface: "leaderboard", channel: "download_fallback" });
          }
        } else {
          downloadAffiliateRankBlob(blob, name);
          logProductEvent("affiliate_rank_card_shared", { mode, surface: "leaderboard", channel: "download" });
        }
      } catch {
        logProductEvent("affiliate_rank_card_share_failed", { mode, surface: "leaderboard" });
      } finally {
        setBusy(false);
      }
    },
    [mode],
  );

  return (
    <div className="mt-4 rounded-lg border border-slate-800/75 bg-slate-900/30 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Share image</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          onClick={() => setMode("rank")}
        >
          Rank card
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact disabled:opacity-40"
          disabled={!canUnlock}
          onClick={() => setMode("unlock")}
        >
          Unlock card
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          onClick={() => setMode("tier_upgrade")}
        >
          Tier card
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--compact"
          disabled={busy}
          onClick={() => void runExport("share")}
        >
          {busy ? "…" : "Share"}
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
          disabled={busy}
          onClick={() => void runExport("download")}
        >
          PNG
        </button>
      </div>
      <div
        className="mt-2 w-full max-w-md overflow-hidden rounded-lg border border-slate-800/60"
        style={{ height: 630 * 0.36 }}
      >
        <div className="origin-top-left" style={{ transform: "scale(0.36)", width: 1200, height: 630 }}>
          <AffiliateRankShareCard {...cardProps} />
        </div>
      </div>
      <div
        ref={exportRef}
        className="pointer-events-none fixed left-[-14000px] top-0 -z-10 opacity-0"
        aria-hidden
      >
        <AffiliateRankShareCard {...cardProps} />
      </div>
    </div>
  );
}
