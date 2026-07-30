import type { FrontendBuildIdentity } from "./frontendBuildMeta";
import { formatLawdogBuildLabel, resolveFrontendBuildIdentity } from "./frontendBuildMeta";

declare const __FRONTEND_BUILD_IDENTITY__: FrontendBuildIdentity | undefined;

export type { FrontendBuildIdentity } from "./frontendBuildMeta";
export { formatLawdogBuildLabel } from "./frontendBuildMeta";

export function readFrontendBuildIdentity(): FrontendBuildIdentity {
  if (typeof __FRONTEND_BUILD_IDENTITY__ !== "undefined") {
    const baked = __FRONTEND_BUILD_IDENTITY__;
    // Older embeds may omit build_id — normalize for inspectable label.
    if (!(baked.build_id || "").trim()) {
      return {
        ...baked,
        build_id: formatLawdogBuildLabel(baked),
      };
    }
    return baked;
  }
  return resolveFrontendBuildIdentity(
    typeof import.meta !== "undefined" ? (import.meta.env as Record<string, string | undefined>) : {},
  );
}

export function readLawdogBuildLabel(): string {
  return formatLawdogBuildLabel(readFrontendBuildIdentity());
}

/** Apply inspectable build identity on <html> for staging deploy proof. */
export function applyLawdogBuildIdentityToDocument(
  doc: Document = typeof document !== "undefined" ? document : (undefined as unknown as Document),
): string {
  const label = readLawdogBuildLabel();
  if (!doc?.documentElement) return label;
  doc.documentElement.setAttribute("data-lawdog-build", label);
  return label;
}

/** Boot-time diagnostic — distinct from backend GET /version. */
export function logFrontendBuildIdentity(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const identity = readFrontendBuildIdentity();
  const label = formatLawdogBuildLabel(identity);
  // eslint-disable-next-line no-console
  console.info("[frontend-build-identity]", label, {
    git_commit: identity.git_commit,
    git_commit_short: identity.git_commit_short,
    build_id: identity.build_id || label,
    build_timestamp: identity.build_timestamp,
    environment: identity.environment,
    api_base: identity.api_base,
  });
}
