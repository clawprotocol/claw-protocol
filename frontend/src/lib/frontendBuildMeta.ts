/** Build-time metadata resolved during Vite/Railway builds (no secrets). */

export type FrontendBuildIdentity = {
  git_commit: string;
  git_commit_short: string;
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
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function shortSha(fullSha: string): string {
  const sha = fullSha.trim();
  return sha.length >= 7 ? sha.slice(0, 7) : sha;
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
  const environment = firstNonEmpty(
    env.VITE_LAWDOG_ENV,
    env.VITE_APP_ENV,
    env.VITE_RAILWAY_ENVIRONMENT_NAME,
    env.NODE_ENV,
  ).toLowerCase();
  const apiBase = firstNonEmpty(env.VITE_CLAW_API_BASE, env.VITE_API_BASE);
  return {
    git_commit: gitCommit,
    git_commit_short: gitCommitShort,
    build_timestamp: opts?.buildTimestamp ?? new Date().toISOString(),
    environment,
    api_base: apiBase,
  };
}
