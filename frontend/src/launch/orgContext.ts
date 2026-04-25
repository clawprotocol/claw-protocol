const ORG_KEY = "claw_org_id";
const DEFAULT_ORG = "local-org";

export function getOrgId(): string {
  if (typeof localStorage === "undefined") return DEFAULT_ORG;
  try {
    const v = localStorage.getItem(ORG_KEY)?.trim();
    return v || DEFAULT_ORG;
  } catch {
    return DEFAULT_ORG;
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
