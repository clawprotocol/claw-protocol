import { useEffect } from "react";
import { useLaunchNav } from "../LaunchNavContext";
import {
  GENESIS_DOG_ONBOARDING_DESTINATION,
  rememberGenesisDogOnboardingIntent,
} from "./genesisDogOnboardingCapture";

/** Marketing entry `/genesis-dogs` → persist intent and continue into app signup. */
export function GenesisDogOnboardingRedirect() {
  const { navigate } = useLaunchNav();

  useEffect(() => {
    rememberGenesisDogOnboardingIntent();
    navigate(GENESIS_DOG_ONBOARDING_DESTINATION);
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-400">
      Continuing to Genesis Dog signup…
    </div>
  );
}
