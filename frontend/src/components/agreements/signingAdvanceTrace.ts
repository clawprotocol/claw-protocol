/** Dev/E2E-only breadcrumb for signing-advance diagnostics (no PII). */
export function traceSigningAdvance(step: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = "claw_signing_advance_trace_v1";
    const prev = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[];
    const next = [...prev, `${Date.now()}:${step}`].slice(-24);
    sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readSigningAdvanceTrace(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem("claw_signing_advance_trace_v1") ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function clearSigningAdvanceTrace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("claw_signing_advance_trace_v1");
  } catch {
    /* ignore */
  }
}
