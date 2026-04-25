import { isProductionApiMisconfigured } from "../lib/clawApi";

/**
 * Surfaces dangerous production misconfiguration without blocking the shell.
 */
export function LaunchConfigBanner() {
  if (!isProductionApiMisconfigured()) return null;
  return (
    <div
      className="border-b border-amber-700/60 bg-amber-950/90 px-4 py-2 text-center text-xs font-medium text-amber-100"
      role="alert"
    >
      This build targets a loopback URL for the LawDog API. Configure the public API origin in your frontend build, then
      rebuild.
    </div>
  );
}
