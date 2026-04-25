import { apiUrl } from "../lib/clawApi";

export type ActionCompletedType = "sign" | "draft" | "send" | "finalize" | "proof";

export type ActionCompletedPayload = {
  event: "action_completed";
  type: ActionCompletedType;
  timestamp: string;
  agreement_id?: string;
  meta?: Record<string, unknown>;
};

const FLASH_KEY = "claw_joy_flash";
export type JoyFlashKind = "draft_ready";

/** One-shot UI flash across history-based navigation (no router state). */
export function setJoyFlash(kind: JoyFlashKind): void {
  try {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ kind, t: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function consumeJoyFlash(): JoyFlashKind | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_KEY);
    const j = JSON.parse(raw) as { kind?: string };
    if (j.kind === "draft_ready") return j.kind;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Lightweight hook for UI listeners and optional server ack.
 * Does not block; never throws to callers.
 */
export function emitActionCompleted(
  type: ActionCompletedType,
  options?: { agreementId?: string; meta?: Record<string, unknown> }
): void {
  const payload: ActionCompletedPayload = {
    event: "action_completed",
    type,
    timestamp: new Date().toISOString(),
    ...(options?.agreementId ? { agreement_id: options.agreementId } : {}),
    ...(options?.meta ? { meta: options.meta } : {}),
  };
  try {
    window.dispatchEvent(new CustomEvent("claw:action-completed", { detail: payload }));
  } catch {
    /* ignore */
  }
  const enabled = String((import.meta as unknown as { env?: { VITE_CLAW_JOY_TELEMETRY?: string } }).env?.VITE_CLAW_JOY_TELEMETRY ?? "").trim() === "1";
  if (!enabled) return;
  void fetch(apiUrl("/v1/client/events"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
