import { ensureAnonymousSession } from "../auth/anonymousSessionApi";

const ORG_KEY = "claw_org_id";
export const ORG_CONTEXT_CHANGED_EVENT = "lawdog:org-context-changed";

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
    const previous = getOrgId();
    const t = id.trim();
    if (t) localStorage.setItem(ORG_KEY, t);
    else localStorage.removeItem(ORG_KEY);
    const next = getOrgId();
    if (previous !== next && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event(ORG_CONTEXT_CHANGED_EVENT));
    }
  } catch {
    /* ignore */
  }
}

/** Subscribe to same-tab and cross-tab workspace identity changes. */
export function subscribeToOrgContextChanges(listener: (orgId: string) => void): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
  const onContextChange = () => listener(getOrgId());
  const onStorage = (event: StorageEvent) => {
    if (event.key === ORG_KEY) onContextChange();
  };
  window.addEventListener(ORG_CONTEXT_CHANGED_EVENT, onContextChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ORG_CONTEXT_CHANGED_EVENT, onContextChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Bootstrap server-minted anonymous workspace before first agreement API call. */
export async function bootstrapWorkspaceOrg(): Promise<string> {
  const existing = getOrgId().trim();
  if (existing.startsWith("user-")) return existing;
  const session = await ensureAnonymousSession();
  if (session.org_id) return session.org_id;
  return getOrgId();
}
