/**
 * Production invariant: no hard-coded transformation may introduce a material
 * contract term without authoritative input (intake, playbook, accepted redline,
 * or explicit user confirmation).
 *
 * Inventing floors (enterprise polish SLA/fees, mutual-consulting/AI quality
 * floors, milestone acceptance invents) are DISABLED by default everywhere.
 *
 * A production build cannot re-enable inventing via VITE_* flags.
 * Nonproduction/dev may opt in only with VITE_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS=1.
 * Vitest may temporarily opt in via setUnauthorizedSemanticInsertsForTests(true).
 */

let testAllowUnauthorizedInserts = false;

function metaEnv(): Record<string, unknown> {
  try {
    return ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env || {}) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

export function setUnauthorizedSemanticInsertsForTests(allow: boolean): void {
  if (String(metaEnv().MODE || "") !== "test") {
    throw new Error("setUnauthorizedSemanticInsertsForTests is test-only");
  }
  testAllowUnauthorizedInserts = Boolean(allow);
}

export function resetUnauthorizedSemanticInsertsForTests(): void {
  if (String(metaEnv().MODE || "") !== "test") return;
  testAllowUnauthorizedInserts = false;
}

/**
 * When false (default), inventing semantic floors must no-op.
 */
export function unauthorizedSemanticInsertsAllowed(): boolean {
  const env = metaEnv();
  // Production builds: never allow hard-coded inventing floors.
  if (env.PROD === true) return false;
  if (String(env.MODE || "") === "test" && testAllowUnauthorizedInserts) return true;
  if (env.DEV === true) {
    const v = String(env.VITE_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS || "")
      .trim()
      .toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  }
  return false;
}

/**
 * Pre-SoT gate must fail-closed in production. Frontend is an early check only;
 * backend persistence is authoritative.
 */
export function preSoTSemanticInsertGateMustEnforce(): boolean {
  const env = metaEnv();
  if (env.PROD === true) return true;
  if (String(env.MODE || "") === "test") return true;
  // Dev: enforce unless explicitly allowing inventing floors for local experiments.
  return !unauthorizedSemanticInsertsAllowed();
}
