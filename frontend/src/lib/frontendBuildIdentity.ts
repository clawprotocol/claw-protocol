import type { FrontendBuildIdentity } from "./frontendBuildMeta";
import { resolveFrontendBuildIdentity } from "./frontendBuildMeta";

declare const __FRONTEND_BUILD_IDENTITY__: FrontendBuildIdentity | undefined;

export type { FrontendBuildIdentity } from "./frontendBuildMeta";

export function readFrontendBuildIdentity(): FrontendBuildIdentity {
  if (typeof __FRONTEND_BUILD_IDENTITY__ !== "undefined") {
    return __FRONTEND_BUILD_IDENTITY__;
  }
  return resolveFrontendBuildIdentity(
    typeof import.meta !== "undefined" ? (import.meta.env as Record<string, string | undefined>) : {},
  );
}

/** Boot-time diagnostic — distinct from backend GET /version. */
export function logFrontendBuildIdentity(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[frontend-build-identity]", readFrontendBuildIdentity());
}
