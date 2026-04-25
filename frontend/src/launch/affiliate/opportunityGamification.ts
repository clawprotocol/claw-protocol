import type { OpportunitySnapshot } from "./clawOpportunityStore";
import { packTierFromNetwork } from "./clawOpportunityStore";
import { logProductEvent } from "../../lib/experimentation/productEvents";
import { getMergedDynamicConfig } from "../../lib/runtimeConfig/runtimeConfigStore";
import type {
  ChallengeProgressView,
  LeaderboardEntry,
  NextPackMilestone,
  OpportunityGamificationView,
} from "./opportunityTypes";

const PROOF_SHARE_FLAG = "claw_oppo_challenge_proof_shared";

/** Call when user successfully copies a proof/verify link (challenges + trust loop). */
export function recordProofShareSignal(): void {
  try {
    localStorage.setItem(PROOF_SHARE_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
  logProductEvent("proof_shared", { surface: "verify_or_bridge" });
}

export function readProofShareSignal(): boolean {
  try {
    return Boolean(localStorage.getItem(PROOF_SHARE_FLAG));
  } catch {
    return false;
  }
}

function scoreLeaderboard(a: { agreementsInfluenced: number; keysGenerated: number }): number {
  return a.agreementsInfluenced * 10_000 + a.keysGenerated;
}

function shortHandleFromReferralId(referralId: string): string {
  const tail = referralId.replace(/^claw_/, "").slice(0, 10);
  return `You · @${tail || "you"}`;
}

function nextSundayEndMs(now: number): number {
  const d = new Date(now);
  const dow = d.getDay();
  const addDays = dow === 0 ? 0 : 7 - dow;
  const end = new Date(d);
  end.setDate(d.getDate() + addDays);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Ends soon";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d left`;
  if (h >= 1) return `${h}h left`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m}m left`;
}

function agreementsInRolling7d(snapshot: OpportunitySnapshot): number {
  const cutoff = Date.now() - 7 * 24 * 3_600_000;
  return snapshot.network.activity.filter(
    (a) => a.at >= cutoff && a.message.includes("Agreement started"),
  ).length;
}

function buildPreviewPeers(): Omit<LeaderboardEntry, "rank" | "isCurrentUser">[] {
  const seeds = [
    { id: "demo_ridge", handle: "Preview · Ridge (demo)", agreements: 2, keys: 25 },
    { id: "demo_river", handle: "Preview · River (demo)", agreements: 1, keys: 10 },
    { id: "demo_north", handle: "Preview · North (demo)", agreements: 0, keys: 5 },
  ];
  return seeds.map((s) => {
    const faux = {
      peopleJoined: 0,
      agreementsCreated: s.agreements,
      keysUsed: s.keys,
      revenueGeneratedUsd: 0,
      payoutAccruedUsd: 0,
      activity: [],
    };
    const tier = packTierFromNetwork(faux);
    return {
      referralId: s.id,
      displayHandle: s.handle,
      packTier: tier,
      agreementsInfluenced: s.agreements,
      keysGenerated: s.keys,
      earningsUsd: null,
      showEarningsColumn: false,
      rowKind: "preview_peer" as const,
    };
  });
}

export function buildNextPackMilestone(snapshot: OpportunitySnapshot): NextPackMilestone | null {
  const n = snapshot.network;
  const score = n.peopleJoined + n.agreementsCreated * 2 + Math.floor(n.keysUsed / 10);
  const bp = getMergedDynamicConfig().affiliate.packTierBreakpoints;
  if (score >= bp.alphaMinScore) return null;
  const tier = packTierFromNetwork(n);
  if (tier === "Pup") {
    return {
      nextTier: "Builder",
      detail: "One real recruit or one agreement humming through your link — that’s the story that bumps you to Builder.",
    };
  }
  if (tier === "Builder") {
    const need = Math.max(0, bp.connectorMinScore - score);
    return {
      nextTier: "Connector",
      detail:
        need <= 0
          ? "Connector is in reach — stack another week of substance, not noise."
          : `~${need} more flow points to Connector (people who stick around + agreements + real usage).`,
    };
  }
  if (tier === "Connector") {
    const need = Math.max(0, bp.alphaMinScore - score);
    return {
      nextTier: "Alpha",
      detail: `~${need} flow points to Alpha — a sharp week of closes and sends can jump you a tier.`,
    };
  }
  return null;
}

function distanceToNextRankCopy(entries: LeaderboardEntry[]): string | null {
  const you = entries.find((e) => e.isCurrentUser);
  if (!you) return null;
  if (you.rank <= 1) {
    return "You’re on top of this board — worth a tasteful share while it’s true.";
  }
  const ahead = entries.find((e) => e.rank === you.rank - 1);
  if (!ahead) return null;
  const gapA = ahead.agreementsInfluenced - you.agreementsInfluenced;
  const gapK = ahead.keysGenerated - you.keysGenerated;
  if (gapA > 0) {
    return `${gapA} more influenced agreement${gapA === 1 ? "" : "s"} to clear the row above.`;
  }
  if (gapK > 0) {
    return `${gapK} more flow in usage to edge past the row above.`;
  }
  return "Next rank is a single solid send away — double down on people who actually ship.";
}

export function buildOpportunityGamificationView(snapshot: OpportunitySnapshot): OpportunityGamificationView {
  const tier = packTierFromNetwork(snapshot.network);
  const youRow: Omit<LeaderboardEntry, "rank" | "isCurrentUser"> = {
    referralId: snapshot.referralId,
    displayHandle: shortHandleFromReferralId(snapshot.referralId),
    packTier: tier,
    agreementsInfluenced: snapshot.network.agreementsCreated,
    keysGenerated: snapshot.network.keysUsed,
    earningsUsd: null,
    showEarningsColumn: false,
    rowKind: "current_user",
  };

  const peers = buildPreviewPeers();
  const allRaw = [
    { ...youRow, isCurrentUser: true as const },
    ...peers.map((p) => ({ ...p, isCurrentUser: false as const })),
  ];

  const sorted = [...allRaw].sort((a, b) => {
    const ds = scoreLeaderboard(b) - scoreLeaderboard(a);
    if (ds !== 0) return ds;
    if (a.isCurrentUser) return -1;
    if (b.isCurrentUser) return 1;
    return a.displayHandle.localeCompare(b.displayHandle);
  });

  const leaderboard: LeaderboardEntry[] = sorted.map((row, i) => ({
    rank: i + 1,
    referralId: row.referralId,
    displayHandle: row.displayHandle,
    packTier: row.packTier,
    agreementsInfluenced: row.agreementsInfluenced,
    keysGenerated: row.keysGenerated,
    earningsUsd: row.earningsUsd,
    showEarningsColumn: false,
    isCurrentUser: row.isCurrentUser,
    rowKind: row.isCurrentUser ? "current_user" : "preview_peer",
  }));

  const weekEnd = nextSundayEndMs(Date.now());
  const stubMode = true;

  const challengeDefs = getMergedDynamicConfig().affiliate.challengeDefinitions;
  const challenges: ChallengeProgressView[] = challengeDefs.map((def) => {
    let current = 0;
    switch (def.metric) {
      case "agreements_total":
        current = snapshot.network.agreementsCreated;
        break;
      case "agreements_rolling_7d":
        current = agreementsInRolling7d(snapshot);
        break;
      case "keys_total":
        current = snapshot.network.keysUsed > 0 ? 1 : 0;
        break;
      case "share_proof":
        current = readProofShareSignal() ? 1 : 0;
        break;
      default:
        current = 0;
    }
    const capped = Math.min(def.target, current);
    const completed = current >= def.target;
    const remaining = Math.max(0, weekEnd - Date.now());
    return {
      definition: def,
      current: capped,
      target: def.target,
      completed,
      endsAtMs: weekEnd,
      timeRemainingLabel: `${formatTimeRemaining(remaining)} · ${def.windowLabel}`,
    };
  });

  return {
    source: stubMode ? "local_preview" : "live",
    leaderboard,
    challenges,
    nextPackMilestone: buildNextPackMilestone(snapshot),
  };
}

export function getLeaderboardMotivationLine(
  snapshot: OpportunitySnapshot,
  view: OpportunityGamificationView,
): string {
  const you = view.leaderboard.find((e) => e.isCurrentUser);
  if (!you) return "You’re in the pack — link’s live, story’s yours to write.";
  if (snapshot.network.agreementsCreated === 0 && snapshot.network.keysUsed === 0) {
    return "Board’s warm — first agreement through your link is your opening move.";
  }
  const dist = distanceToNextRankCopy(view.leaderboard);
  return dist ?? "Another week of real sends beats a month of empty clicks.";
}
