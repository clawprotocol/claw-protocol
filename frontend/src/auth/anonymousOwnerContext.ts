/**
 * Per-browser anonymous workspace identity (server header: X-Claw-Org-Id → org:anon-{uuid}).
 * Distinct from shared legacy `local-org`; new sessions without an org get a unique anon id.
 */

const ANON_OWNER_KEY = "claw_anonymous_owner_id";

function randomOpaqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/** Raw opaque id (no prefix). */
export function getOrCreateAnonymousOwnerId(): string {
  if (typeof localStorage === "undefined") return randomOpaqueId();
  try {
    const existing = localStorage.getItem(ANON_OWNER_KEY)?.trim();
    if (existing) return existing;
    const created = randomOpaqueId();
    localStorage.setItem(ANON_OWNER_KEY, created);
    return created;
  } catch {
    return randomOpaqueId();
  }
}

/** Workspace org id for an anonymous visitor (`anon-{opaque}`). */
export function anonymousWorkspaceOrgId(): string {
  return `anon-${getOrCreateAnonymousOwnerId()}`;
}

export function isAnonymousWorkspaceOrg(orgId: string): boolean {
  return orgId.trim().startsWith("anon-");
}

export function isLegacySharedLocalOrg(orgId: string): boolean {
  return orgId.trim() === "local-org";
}
