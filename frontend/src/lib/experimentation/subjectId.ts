const SUBJECT_KEY = "claw_exp_subject_v1";

export function getOrCreateExperimentSubjectId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = localStorage.getItem(SUBJECT_KEY);
    if (existing && existing.length > 4) return existing;
    const created = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(SUBJECT_KEY, created);
    return created;
  } catch {
    return `sub_fallback_${Date.now().toString(36)}`;
  }
}

export function resetExperimentSubjectForTests(): void {
  try {
    localStorage.removeItem(SUBJECT_KEY);
  } catch {
    /* ignore */
  }
}
