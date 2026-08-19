/**
 * Client-side draft-quality stage hashing (eval / flag-gated).
 *
 * Enable with VITE_DRAFT_QUALITY_TRACE=1 (or localStorage key
 * `claw.draftQualityTrace=1`). Emits lengths + SHA-256 only — never full corpus.
 *
 * SECURITY: Browser / localStorage flags MUST NOT and cannot authorize
 * server-side full-text tracing or corpus dumps. Server dump requires
 * process env auth (see evals/draft-quality/TRACE_SECURITY.md).
 */

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text || "");
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: non-crypto fingerprint for non-secure contexts (eval only).
  let h = 0;
  for (let i = 0; i < data.length; i++) h = (Math.imul(31, h) + data[i]!) | 0;
  return `fallback_${(h >>> 0).toString(16)}_${data.length}`;
}

export function draftQualityClientTraceEnabled(): boolean {
  try {
    if (typeof import.meta !== "undefined") {
      const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
      const v = (env?.VITE_DRAFT_QUALITY_TRACE || "").trim().toLowerCase();
      if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== "undefined") {
      const v = (localStorage.getItem("claw.draftQualityTrace") || "").trim().toLowerCase();
      if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export type DraftQualityClientStage = {
  stage: string;
  len: number;
  sha256: string;
  tMs: number;
  extra?: Record<string, unknown>;
};

export type DraftQualityClientTrace = {
  schemaVersion: "draft_quality_client_trace.v1";
  stages: DraftQualityClientStage[];
  serverTraceId?: string;
};

const started = typeof performance !== "undefined" ? performance.now() : Date.now();

export async function recordDraftQualityClientStage(
  trace: DraftQualityClientTrace,
  stage: string,
  corpus: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!draftQualityClientTraceEnabled()) return;
  const body = corpus || "";
  const sha256 = body ? await sha256Hex(body) : "";
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  trace.stages.push({
    stage,
    len: body.length,
    sha256,
    tMs: Math.round(now - started),
    ...(extra ? { extra } : {}),
  });
}

export function newDraftQualityClientTrace(serverTraceId?: string): DraftQualityClientTrace {
  return {
    schemaVersion: "draft_quality_client_trace.v1",
    stages: [],
    ...(serverTraceId ? { serverTraceId } : {}),
  };
}

export function logDraftQualityClientTrace(trace: DraftQualityClientTrace): void {
  if (!draftQualityClientTraceEnabled()) return;
  try {
    console.info("[draft-quality-trace:client]", JSON.stringify(trace));
  } catch {
    /* ignore */
  }
}
