/**
 * Canonical policy: starter/free preview surfaces must never run paid-Pro polish passes.
 */

export const STARTER_DOCUMENT_SURFACES = [
  "preview_starter",
  "starter_document_surface",
  "free_starter",
  "starter_preview",
] as const;

const STARTER_SURFACE_RE =
  /(?:^|_)(?:starter|free_starter|preview_starter|starter_preview|starter_document)(?:$|_)/i;

const FREE_TIER_RE = /^(?:free|basic|starter)$/i;

export type StarterSurfaceContext = {
  surface?: string | null;
  tier?: string | null;
  starterPreview?: boolean;
};

export function isStarterDocumentSurface(ctx: StarterSurfaceContext): boolean {
  if (ctx.starterPreview === true) return true;
  const surface = (ctx.surface || "").trim().toLowerCase();
  if (!surface) return false;
  if (STARTER_DOCUMENT_SURFACES.some((s) => surface === s || surface.includes(s))) return true;
  if (STARTER_SURFACE_RE.test(surface)) return true;
  const tier = (ctx.tier || "").trim().toLowerCase();
  if (tier && FREE_TIER_RE.test(tier)) return true;
  return false;
}

/** True when paid-Pro recital/signature/enterprise/structure polish must not run. */
export function shouldSkipPaidProPolish(ctx: StarterSurfaceContext): boolean {
  return isStarterDocumentSurface(ctx);
}

export function assertPaidProPolishNotOnStarter(ctx: StarterSurfaceContext, caller: string): void {
  if (shouldSkipPaidProPolish(ctx) && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn("[paid-pro-polish-blocked]", { caller, surface: ctx.surface, tier: ctx.tier });
  }
}
