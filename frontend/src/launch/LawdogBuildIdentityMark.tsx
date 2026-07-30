import { readFrontendBuildIdentity, readLawdogBuildLabel } from "../lib/frontendBuildIdentity";

/**
 * Staging-visible, non-secret build marker (short SHA + build timestamp id).
 * Inspect via footer text or `data-lawdog-build` on this element / <html>.
 */
export function LawdogBuildIdentityMark({ className = "" }: { className?: string }) {
  const identity = readFrontendBuildIdentity();
  const label = readLawdogBuildLabel();
  const short = identity.git_commit_short || "unknown";
  return (
    <p
      className={`m-0 font-mono text-[10px] leading-snug tracking-wide text-slate-600 ${className}`.trim()}
      data-testid="lawdog-build-identity"
      data-lawdog-build={label}
      data-lawdog-git-commit={identity.git_commit || short}
      title={`LawDog frontend build ${label}`}
    >
      Build {label}
    </p>
  );
}
