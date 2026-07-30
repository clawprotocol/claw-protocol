/** Build-time metadata resolved during Vite/Railway builds (no secrets). */

export type FrontendBuildIdentity = {
  git_commit: string;
  git_commit_short: string;
  /** Inspectable staging label: shortSha|buildTimestamp (no secrets). */
  build_id: string;
  build_timestamp: string;
  environment: string;
  api_base: string;
};

export type FrontendBuildMetaEnv = {
  [key: string]: string | undefined;
  RAILWAY_GIT_COMMIT_SHA?: string;
  RAILWAY_GIT_COMMIT?: string;
  VITE_LAWDOG_ENV?: string;
  VITE_APP_ENV?: string;
  VITE_RAILWAY_ENVIRONMENT_NAME?: string;
  VITE_CLAW_API_BASE?: string;
  VITE_API_BASE?: string;
  NODE_ENV?: string;
};

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  return (
    values
      .map((value) => String(value ?? "").trim())
      .find((trimmed) => trimmed.length > 0) ?? ""
  );
}

function shortSha(fullSha: string): string {
  const sha = fullSha.trim();
  return sha.length >= 7 ? sha.slice(0, 7) : sha;
}

/** Compact non-secret label for `data-lawdog-build` / footer inspection. */
export function formatLawdogBuildLabel(identity: Pick<FrontendBuildIdentity, "git_commit_short" | "build_timestamp" | "build_id">): string {
  const fromId = (identity.build_id || "").trim();
  if (fromId) return fromId;
  const short = (identity.git_commit_short || "").trim() || "unknown";
  const ts = (identity.build_timestamp || "")
    .trim()
    .replace(/\.\d+Z$/i, "")
    .replace(/Z$/i, "")
    .replace(/:/g, "");
  return `${short}|${ts || "local"}`;
}

/** Pure resolver — unit-tested; Vite/Railpack invoke at build time. */
export function resolveFrontendBuildIdentity(
  env: FrontendBuildMetaEnv = process.env,
  opts?: { gitCommit?: string; gitCommitShort?: string; buildTimestamp?: string },
): FrontendBuildIdentity {
  const gitCommit = firstNonEmpty(
    opts?.gitCommit,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.RAILWAY_GIT_COMMIT,
  );
  const gitCommitShort = firstNonEmpty(opts?.gitCommitShort, shortSha(gitCommit));
  const buildTimestamp = opts?.buildTimestamp ?? new Date().toISOString();
  const environment = firstNonEmpty(
    env.VITE_LAWDOG_ENV,
    env.VITE_APP_ENV,
    env.VITE_RAILWAY_ENVIRONMENT_NAME,
    env.NODE_ENV,
  ).toLowerCase();
  const apiBase = firstNonEmpty(env.VITE_CLAW_API_BASE, env.VITE_API_BASE);
  const build_id = formatLawdogBuildLabel({
    git_commit_short: gitCommitShort,
    build_timestamp: buildTimestamp,
    build_id: "",
  });
  return {
    git_commit: gitCommit,
    git_commit_short: gitCommitShort,
    build_id,
    build_timestamp: buildTimestamp,
    environment,
    api_base: apiBase,
  };
}
