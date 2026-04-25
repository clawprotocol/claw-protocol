import { useState } from "react";
import { agreementPublicVerifyPath } from "../agreement/agreementPublicVerify";
import { recordProofShareSignal } from "../launch/affiliate/opportunityGamification";
import { JOY_COPY } from "./clawJoyCopy";

/**
 * Public-safe: copies verify URL only (no document body).
 */
export function JoyShareMilestone(props: { agreementId: string }) {
  const { agreementId } = props;
  const [done, setDone] = useState(false);
  const path = agreementPublicVerifyPath(agreementId);
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 px-4 py-3 text-left">
      <p className="text-xs font-semibold text-slate-300">{JOY_COPY.shareMilestonePrompt}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{JOY_COPY.shareMilestoneHint}</p>
      <button
        type="button"
        className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            recordProofShareSignal();
            setDone(true);
          });
        }}
      >
        {done ? "Copied" : "Copy verification link"}
      </button>
    </div>
  );
}
