import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

export type LawdogOutputPathStage =
  | "free_preview"
  | "premium_render_source"
  | "premium_readonly_pick"
  | "paid_pro_freeze"
  | "send_handoff"
  | "vs01_signing";

export function logLawdogOutputPathMap(payload: {
  stage: LawdogOutputPathStage | string;
  source: string | null;
  text?: string | null;
  len?: number;
  canMutateBody: boolean;
  canRejectBody: boolean;
  canFallback: boolean;
  reason: string;
}): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === "test") return;
  const text = payload.text ?? "";
  const len = payload.len ?? text.length;
  // eslint-disable-next-line no-console
  console.info("[lawdog-output-path-map]", {
    stage: payload.stage,
    source: payload.source,
    len,
    hash: text ? fingerprintAgreementBody(text) : null,
    canMutateBody: payload.canMutateBody,
    canRejectBody: payload.canRejectBody,
    canFallback: payload.canFallback,
    reason: payload.reason,
  });
}
