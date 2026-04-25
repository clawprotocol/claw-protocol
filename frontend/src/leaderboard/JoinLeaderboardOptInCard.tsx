import { useEffect, useMemo, useRef, useState } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import type { LeaderboardVisibility } from "./lawdogLeaderboardTypes";
import {
  dismissCompletionLeaderboardOptIn,
  readLawdogLeaderboardPrefs,
  revertLeaderboardToPrivate,
  setLeaderboardVisibility,
} from "./lawdogLeaderboardPrefs";
import { launchBadgeCatalog } from "./proofBadges";
import { readProofActivity } from "./proofActivityStore";
import { computeProofScore } from "./proofScore";
import { PROOF_TIER_ACCENTS, proofTierFromScore } from "./proofTier";

type Props = {
  /** After first send/finalize on simple done — hidden once dismissed or opted in. */
  variant: "post_completion" | "affiliate_surface";
  /** When false, post_completion variant renders nothing. */
  eligible?: boolean;
  onPrefsChanged?: () => void;
};

function BadgeGlyph({ id }: { id: string }) {
  const map: Record<string, string> = {
    first_record: "①",
    closer: "✓",
    proven: "◆",
  };
  return <span aria-hidden>{map[id] ?? "·"}</span>;
}

export function JoinLeaderboardOptInCard(props: Props) {
  const { variant, eligible = true, onPrefsChanged } = props;
  const [prefs, setPrefs] = useState(() => readLawdogLeaderboardPrefs());
  const [alias, setAlias] = useState(() => readLawdogLeaderboardPrefs().public_display_handle || "Anonymous creator");
  const [doginalAck, setDoginalAck] = useState(() => readLawdogLeaderboardPrefs().doginal_verified_badge);
  const [err, setErr] = useState<string | null>(null);
  const viewLogged = useRef(false);

  const activity = useMemo(() => readProofActivity(), [prefs]);
  const score = useMemo(() => computeProofScore(activity), [activity]);
  const tier = useMemo(() => proofTierFromScore(score.score), [score.score]);

  const showPostPrompt =
    variant === "post_completion" &&
    eligible &&
    prefs.visibility === "private" &&
    !prefs.completion_opt_in_dismissed;

  useEffect(() => {
    const p = readLawdogLeaderboardPrefs();
    setPrefs(p);
    setAlias(p.public_display_handle || "Anonymous creator");
    setDoginalAck(p.doginal_verified_badge);
  }, []);

  useEffect(() => {
    const shouldLog = variant === "affiliate_surface" || showPostPrompt;
    if (!shouldLog || viewLogged.current) return;
    viewLogged.current = true;
    logProductEvent("leaderboard_opt_in_viewed", { surface: variant });
  }, [variant, showPostPrompt]);

  function refresh(): void {
    const next = readLawdogLeaderboardPrefs();
    setPrefs(next);
    setAlias(next.public_display_handle || "Anonymous creator");
    setDoginalAck(next.doginal_verified_badge);
    onPrefsChanged?.();
  }

  function choose(vis: LeaderboardVisibility): void {
    setErr(null);
    if (vis === "private") {
      dismissCompletionLeaderboardOptIn();
      logProductEvent("leaderboard_visibility_chosen", { choice: "private", surface: variant });
      refresh();
      return;
    }
    const handle = alias.trim();
    if (handle.length < 2) {
      setErr("Add a display handle (2+ characters).");
      return;
    }
    setLeaderboardVisibility(vis, {
      public_display_handle: handle,
      doginal_verified_badge: vis === "full_public" ? doginalAck : false,
    });
    logProductEvent("leaderboard_visibility_chosen", {
      choice: vis,
      surface: variant,
      doginal_badge: vis === "full_public" && doginalAck,
    });
    refresh();
  }

  if (variant === "post_completion" && !showPostPrompt) return null;

  return (
    <section
      className="rounded-xl border border-violet-900/40 bg-gradient-to-b from-violet-950/25 to-slate-950/40 px-4 py-4 text-left shadow-lg shadow-black/15"
      aria-labelledby="lawdog-lb-opt-title"
    >
      <h2 id="lawdog-lb-opt-title" className="text-sm font-semibold text-violet-100">
        {variant === "post_completion" ? "Join the leaderboard" : "Leaderboard & proof status"}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Optionally show your handle, Proof Score, and earned proof badges — or stay fully private. Proof Score
        reflects sends, signatures, and how often sends complete; it&apos;s not a game score. You can change this from
        the affiliate area anytime.
      </p>

      <div
        className={`mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400 ${tier.tier_key === "rose" ? "lawdog-tier-glow-rose" : ""}`}
        style={{ borderLeftColor: PROOF_TIER_ACCENTS[tier.tier_key], borderLeftWidth: 3 }}
      >
        <span className="font-semibold text-slate-200">Your Proof Score (this device)</span>
        <span className="mx-1.5 text-slate-600">·</span>
        <span className="tabular-nums text-slate-200">{score.score}</span>
        <span className="mx-1.5 text-slate-600">·</span>
        <span style={{ color: PROOF_TIER_ACCENTS[tier.tier_key] }}>{tier.tier_label}</span>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">{score.summary}</p>
      </div>

      {prefs.visibility !== "private" ? (
        <p className="mt-3 text-xs text-emerald-200/90">
          You&apos;re opted in as <span className="font-medium text-white">{prefs.public_display_handle}</span> (
          {prefs.visibility === "alias_public" ? "alias public" : "full public"}).
        </p>
      ) : (
        <>
          <label className="mt-3 block text-[11px] font-medium text-slate-400" htmlFor="lawdog-lb-alias">
            Public display handle
          </label>
          <input
            id="lawdog-lb-alias"
            className="mt-1 w-full rounded-lg border border-slate-700/90 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none ring-violet-500/30 focus:ring-2"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Anonymous creator"
            maxLength={40}
            autoComplete="nickname"
          />
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={doginalAck}
              onChange={(e) => setDoginalAck(e.target.checked)}
            />
            <span>
              For <span className="text-slate-300">Join publicly</span>: show a separate &quot;Doginal verified
              (honor)&quot; marker — I have operator-verified Doginal status (not on-chain proof).
            </span>
          </label>
          {err ? <p className="mt-2 text-xs text-amber-200/95">{err}</p> : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact w-full sm:w-auto"
              onClick={() => choose("private")}
            >
              Keep private
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact w-full sm:w-auto"
              onClick={() => choose("alias_public")}
            >
              Join with alias
            </button>
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact w-full sm:w-auto"
              onClick={() => choose("full_public")}
            >
              Join publicly
            </button>
          </div>
        </>
      )}

      {prefs.visibility !== "private" && variant === "affiliate_surface" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary vs01-btn--compact"
            onClick={() => {
              revertLeaderboardToPrivate();
              logProductEvent("leaderboard_visibility_chosen", { choice: "private", surface: "affiliate_revert" });
              refresh();
            }}
          >
            Go private again
          </button>
        </div>
      ) : null}

      {variant === "affiliate_surface" ? (
        <details className="mt-4 border-t border-slate-800/80 pt-3 text-[10px] text-slate-500">
          <summary className="cursor-pointer text-slate-400">Earned proof badges (reference)</summary>
          <ul className="mt-2 list-none space-y-1 p-0">
            {launchBadgeCatalog().map((b) => (
              <li key={b.id} className="flex gap-2">
                <BadgeGlyph id={b.id} />
                <span>
                  <span className="font-medium text-slate-300">{b.title}</span> — {b.hint}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
