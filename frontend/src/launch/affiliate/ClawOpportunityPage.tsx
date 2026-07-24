/**
 * Legacy opportunity URL — commercial affiliate UI is Genesis Referral only.
 * Deep links to /app/opportunity or /app/affiliate redirect after the active-Genesis gate.
 */
import { useEffect } from "react";
import { RequireActiveGenesisAffiliate } from "../genesisReferral/RequireActiveGenesisAffiliate";
import { useLaunchNav } from "../LaunchNavContext";

export function ClawOpportunityPage() {
  return (
    <RequireActiveGenesisAffiliate>
      <RedirectToGenesisReferralDashboard />
    </RequireActiveGenesisAffiliate>
  );
}

function RedirectToGenesisReferralDashboard() {
  const { navigate } = useLaunchNav();
  useEffect(() => {
    navigate("/app/genesis-referral");
  }, [navigate]);
  return (
    <p className="text-sm text-slate-400" data-testid="legacy-opportunity-redirect">
      Redirecting to your referral dashboard…
    </p>
  );
}
