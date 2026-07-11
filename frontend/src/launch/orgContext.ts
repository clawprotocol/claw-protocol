import { ensureAnonymousSession } from "../auth/anonymousSessionApi";

const ORG_KEY = "claw_org_id";

export function getOrgId(): string {
  if (typeof localStorage === "undefined") return "local-org";
  try {
    const v = localStorage.getItem(ORG_KEY)?.trim();
    if (v) return v;
    return "local-org";
  } catch {
    return "local-org";
  }
}

export function setOrgId(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const t = id.trim();
    if (t) localStorage.setItem(ORG_KEY, t);
    else localStorage.removeItem(ORG_KEY);
  } catch {
    /* ignore */
  }
}

/** Bootstrap server-minted anonymous workspace before first agreement API call. */
export async function bootstrapWorkspaceOrg(): Promise<string> {
  const existing = getOrgId().trim();
  if (existing.startsWith("user-")) return existing;
  const session = await ensureAnonymousSession();
  if (session.org_id) return session.org_id;
  return getOrgId();
}
