import {
  PLACEHOLDER_SAFETY_PREVIEW_BLOCKED,
  type PlaceholderSafetyContext,
} from "./agreementTemplatePlaceholderSafety";

/** Minimum rendered starter preview length before fatal placeholder scan may block. */
export const STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN = 400;

const REJECTED_AUTHORITATIVE_SOURCES = new Set(["none", "blocked_short_preview"]);

export type PlaceholderPreviewTransientGateInput = {
  text: string;
  surface?: string;
  len?: number;
  isGenerating?: boolean;
  hasDraftPayload?: boolean;
  authoritativeSource?: string | null;
  createFlowPhase?: string;
  displayPhase?: string;
};

export type StarterPreviewLoadingReleaseReason = "server_payload_ready" | "valid_preview_fallback";

/** True when starter preview may leave transient / loading (API payload or stable local preview). */
export function resolveEffectiveStarterHasDraftPayload(input: {
  hasDraftPayload?: boolean;
  createFlowPhase?: string;
  displayPhase?: string;
  previewLen?: number;
  isGenerating?: boolean;
}): boolean {
  if (input.hasDraftPayload === true) return true;
  if (input.isGenerating === true) return false;
  const previewLen = input.previewLen ?? 0;
  if (previewLen < STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) return false;
  if (input.createFlowPhase !== "draft_ready_for_review") return false;
  const phase = (input.displayPhase ?? "").trim();
  if (phase && phase !== "review" && phase !== "preparing_review" && phase !== "hydrating_generated") {
    return false;
  }
  return true;
}

export function isPlaceholderSafetyBlockedPreviewText(text: string): boolean {
  return text.trim() === PLACEHOLDER_SAFETY_PREVIEW_BLOCKED.trim();
}

export function shouldSkipPlaceholderScanForTransientPreview(
  input: PlaceholderPreviewTransientGateInput,
): boolean {
  const trimmed = (input.text || "").trim();
  const len = input.len ?? trimmed.length;
  if (!trimmed) return true;
  if (isPlaceholderSafetyBlockedPreviewText(trimmed)) return true;
  if (input.isGenerating === true) return true;
  const effectivePayload = resolveEffectiveStarterHasDraftPayload({
    hasDraftPayload: input.hasDraftPayload,
    createFlowPhase: input.createFlowPhase,
    displayPhase: input.displayPhase,
    previewLen: len,
    isGenerating: input.isGenerating,
  });
  if (effectivePayload && len >= STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) {
    const source = (input.authoritativeSource ?? "").trim();
    if (source && REJECTED_AUTHORITATIVE_SOURCES.has(source)) return true;
    return false;
  }
  if (len < STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) return true;
  if (input.hasDraftPayload === false) return true;
  const source = (input.authoritativeSource ?? "").trim();
  if (source && REJECTED_AUTHORITATIVE_SOURCES.has(source)) return true;
  return false;
}

export function shouldDeferStarterPreviewToLoadingShell(
  input: PlaceholderPreviewTransientGateInput & { hasLocalDraft?: boolean },
): boolean {
  if (!input.hasLocalDraft) return false;
  if (input.isGenerating === true) return true;
  const trimmed = (input.text || "").trim();
  const previewLen = input.len ?? trimmed.length;
  const effectivePayload = resolveEffectiveStarterHasDraftPayload({
    hasDraftPayload: input.hasDraftPayload,
    createFlowPhase: input.createFlowPhase,
    displayPhase: input.displayPhase,
    previewLen,
    isGenerating: input.isGenerating,
  });
  if (!effectivePayload) return true;
  if (!trimmed) return true;
  if (isPlaceholderSafetyBlockedPreviewText(trimmed)) return true;
  if (previewLen < STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) return true;
  return false;
}

export function resolveStarterPreviewLoadingReleaseReason(input: {
  hasDraftPayload?: boolean;
  createFlowPhase?: string;
  displayPhase?: string;
  previewLen?: number;
  isGenerating?: boolean;
  hasLocalDraft?: boolean;
  previewText?: string;
}): StarterPreviewLoadingReleaseReason | null {
  if (!input.hasLocalDraft) return null;
  if (input.isGenerating === true) return null;
  const previewLen =
    input.previewLen ?? (input.previewText || "").trim().length;
  if (
    shouldDeferStarterPreviewToLoadingShell({
      text: input.previewText ?? "",
      len: previewLen,
      hasLocalDraft: input.hasLocalDraft,
      isGenerating: input.isGenerating,
      hasDraftPayload: input.hasDraftPayload,
      createFlowPhase: input.createFlowPhase,
      displayPhase: input.displayPhase,
    })
  ) {
    return null;
  }
  if (input.hasDraftPayload === true) return "server_payload_ready";
  return "valid_preview_fallback";
}

export function logStarterPreviewLoadingRelease(payload: {
  reason: StarterPreviewLoadingReleaseReason;
  previewLen: number;
  createFlowPhase?: string;
  displayPhase?: string;
  hasDraftPayload?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[starter-preview-loading-release]", payload);
}

export function logPlaceholderScanSkippedTransient(payload: {
  surface: string;
  len: number;
  isGenerating?: boolean;
  hasDraftPayload?: boolean;
  authoritativeSource?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[placeholder-scan-skipped-transient]", payload);
}

export function transientGateInputFromPlaceholderContext(
  ctx: PlaceholderSafetyContext,
  text: string,
): PlaceholderPreviewTransientGateInput {
  return {
    text,
    surface: ctx.surface,
    len: text.trim().length,
    isGenerating: ctx.isGenerating,
    hasDraftPayload: ctx.hasDraftPayload,
    authoritativeSource: ctx.authoritativeSource ?? null,
  };
}

export function stripPlaceholderBlockerFromPersistPlain(text: string): string {
  return isPlaceholderSafetyBlockedPreviewText(text) ? "" : text;
}
