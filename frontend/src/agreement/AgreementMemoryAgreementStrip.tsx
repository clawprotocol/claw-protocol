import { useEffect, useMemo, useState } from "react";
import { useAccess } from "../access/AccessContext";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { triggerPaywall } from "../launch/triggerPaywall";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { fetchAgreementMemoryStatus, type AgreementMemoryTier } from "./agreementMemoryApi";
import { postDraftFromPriorAgreement } from "./agreementWorkspaceApi";
import {
  canReuseTemplates,
  readLawDogUserMonetizationState,
} from "../monetization/lawDogMonetization";
import { usePowerPaywall } from "../monetization/PowerPaywallContext";

const PAYWALL_COPY = {
  headline: "Remember & reuse live on paid tiers.",
  sub: "Unlock Agreement Memory to search by meaning and fork from deals you already ran — the step after send.",
};

/** Productivity strip — assistive memory; proof stays on canonical records. */
export function AgreementMemoryAgreementStrip(props: { agreementId: string }) {
  const { agreementId } = props;
  const { navigate } = useLaunchNav();
  const access = useAccess();
  const { openPowerPaywall } = usePowerPaywall();
  const monetizationState = useMemo(
    () => readLawDogUserMonetizationState(access.tier, access.usage),
    [access.tier, access.usage]
  );
  const [tier, setTier] = useState<AgreementMemoryTier | null>(null);
  const [forking, setForking] = useState(false);
  const [forkErr, setForkErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const s = await fetchAgreementMemoryStatus();
      if (cancel) return;
      setTier(s.data?.tier ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const requirePremium = () => {
    if (tier === null) return false;
    if (tier === "none") {
      logProductEvent("memory_paywall_shown", { surface: "agreement_strip" });
      triggerPaywall({
        code: "agreement_memory_paywall",
        surface: "agreement_strip",
        message: `${PAYWALL_COPY.headline} ${PAYWALL_COPY.sub}`,
      });
      return false;
    }
    return true;
  };

  const requirePowerReuse = () => {
    if (canReuseTemplates(monetizationState)) return true;
    openPowerPaywall("agreement_memory_strip", "reuse_templates");
    return false;
  };

  const withDraftContext = (path: string) => {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}fromDraft=${encodeURIComponent(agreementId)}`;
  };

  const onReuseStructure = async () => {
    if (!requirePremium()) return;
    if (!requirePowerReuse()) return;
    logProductEvent("start_from_similar_clicked", { agreement_id: agreementId, surface: "wizard_strip" });
    setForkErr(null);
    setForking(true);
    const r = await postDraftFromPriorAgreement(agreementId);
    setForking(false);
    if (!r.ok || !r.newAgreementId) {
      setForkErr(r.error || "Could not create a new draft.");
      return;
    }
    navigate(`/app/agreements/${encodeURIComponent(r.newAgreementId)}`);
  };

  if (!agreementId.trim()) return null;

  if (tier === null) {
    return (
      <div className="mb-4 rounded-lg border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-[11px] text-slate-600">
        Agreement Memory …
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-800/90 bg-slate-950/40 px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agreement Memory</p>
        {tier === "none" ? (
          <p className="text-[11px] text-slate-500">
            <span className="text-slate-300">{PAYWALL_COPY.headline}</span> {PAYWALL_COPY.sub}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">Create → Send → Remember → Reuse → Produce (studio on Pro).</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
          onClick={() => {
            if (!requirePremium()) return;
            if (!requirePowerReuse()) return;
            navigate(withDraftContext("/app/agreement-memory"));
          }}
        >
          Ask your agreements
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
          onClick={() => {
            if (!requirePremium()) return;
            if (!requirePowerReuse()) return;
            logProductEvent("similar_agreement_requested", { agreement_id: agreementId, surface: "wizard_strip" });
            navigate(withDraftContext(`/app/agreement-memory?similarTo=${encodeURIComponent(agreementId)}`));
          }}
        >
          Find similar
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
          onClick={() => {
            if (!requirePremium()) return;
            if (!requirePowerReuse()) return;
            logProductEvent("clause_reuse_suggested", {
              agreement_id: agreementId,
              surface: "wizard_strip_prior_clauses",
            });
            navigate(withDraftContext("/app/agreement-memory"));
          }}
        >
          Reuse prior clauses
        </button>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary vs01-btn--compact text-[11px]"
          disabled={forking}
          onClick={() => void onReuseStructure()}
        >
          {forking ? "Starting…" : "Start from this agreement"}
        </button>
      </div>
      {forkErr ? (
        <p className="mt-2 text-[11px] text-rose-300" role="alert">
          {forkErr}
        </p>
      ) : null}
    </div>
  );
}
