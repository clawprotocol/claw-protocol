import { useEffect, useState } from "react";
import {
  getApiReachabilityState,
  probeApiHealth,
  subscribeApiReachability,
  type ApiReachabilityState,
} from "../lib/apiReachability";
import { isProductionApiMisconfigured } from "../lib/clawApi";

/**
 * Non-blocking banner when the configured API origin is unreachable (split deploy).
 * Does not replace page content — existing flows keep working offline where possible.
 */
export function ApiReachabilityBanner() {
  const [state, setState] = useState<ApiReachabilityState>(() => getApiReachabilityState());

  useEffect(() => {
    return subscribeApiReachability(() => setState(getApiReachabilityState()));
  }, []);

  if (state === "ok" || state === "unknown") return null;

  if (state === "misconfigured" || isProductionApiMisconfigured()) {
    return (
      <div
        className="border-b border-amber-800/60 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
        role="status"
      >
        LawDog API URL is misconfigured for this build. Set{" "}
        <code className="text-amber-200">VITE_CLAW_API_BASE</code> to your hosted API origin and redeploy.
      </div>
    );
  }

  return (
    <div
      className="border-b border-slate-700/80 bg-slate-900/95 px-4 py-2 text-center text-sm text-slate-300"
      role="status"
    >
      We cannot reach the LawDog API right now. Drafting may be limited until the service is back.{" "}
      <button
        type="button"
        className="underline text-slate-100 hover:text-white"
        onClick={() => void probeApiHealth(true)}
      >
        Retry
      </button>
    </div>
  );
}
