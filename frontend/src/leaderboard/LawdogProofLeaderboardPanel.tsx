import { useState } from "react";
import { buildLocalPublicLeaderboardRow } from "./buildPublicLeaderboardRow";
import { JoinLeaderboardOptInCard } from "./JoinLeaderboardOptInCard";
import { LawdogActivityFeedPanel } from "./LawdogActivityFeedPanel";
import { LawdogProofLeaderboardPreview } from "./LawdogProofLeaderboardPreview";

/**
 * Affiliate / pack surface — proof summary, opt-in, public preview scaffold, private activity feed.
 */
export function LawdogProofLeaderboardPanel() {
  const [tick, setTick] = useState(0);
  const row = buildLocalPublicLeaderboardRow();

  return (
    <div className="space-y-4">
      <JoinLeaderboardOptInCard variant="affiliate_surface" onPrefsChanged={() => setTick((t) => t + 1)} />
      <LawdogProofLeaderboardPreview row={row} />
      <LawdogActivityFeedPanel tick={tick} />
    </div>
  );
}
