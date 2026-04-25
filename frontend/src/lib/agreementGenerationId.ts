const SESSION_KEY = "claw_active_agreement_generation_id_v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gen_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getSessionAgreementGenerationId(): string {
  if (typeof sessionStorage === "undefined") return randomId();
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (s) return s;
  } catch {
    /* ignore */
  }
  return randomId();
}

export function setSessionAgreementGenerationId(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Bumps a new id (call when starting a fresh agreement or when clearing stale Pro state).
 */
export function bumpAgreementGenerationId(): string {
  const n = randomId();
  setSessionAgreementGenerationId(n);
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[agreement-generation]", { event: "bump", active_generation_id: n, ts: new Date().toISOString() });
  }
  return n;
}

/**
 * On first use in a tab, persist the initial id.
 */
export function getOrInitSessionAgreementGenerationId(): string {
  const e = getSessionAgreementGenerationId();
  const t = (() => {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  })();
  if (!t) {
    setSessionAgreementGenerationId(e);
    return e;
  }
  return t;
}

function cyrb32(s: string): string {
  let h = 9;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x9e37_79b1);
  return (h ^ (h >>> 16) >>> 0).toString(16).padStart(8, "0");
}

export function shortIntakeFingerprint(s: string): string {
  return cyrb32((s || "").replace(/\r\n/g, "\n").trim().slice(0, 32_000));
}
