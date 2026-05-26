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
};

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
  if (len < STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) return true;
  if (input.isGenerating === true) return true;
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
  if (input.hasDraftPayload === false) return true;
  const trimmed = (input.text || "").trim();
  if (!trimmed) return true;
  if (isPlaceholderSafetyBlockedPreviewText(trimmed)) return true;
  if (trimmed.length < STARTER_PREVIEW_PLACEHOLDER_GATE_MIN_LEN) return true;
  return false;
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
