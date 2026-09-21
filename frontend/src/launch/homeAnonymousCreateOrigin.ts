/**
 * Durable authority for anonymous homepage → Starter review handoff.
 *
 * History state (`clawHeroFromHome`) can be lost on hard refresh; this session marker
 * survives navigation to /app/create and blocks paid-dashboard / provisional Pro inference.
 */

export const HOME_ANONYMOUS_CREATE_ORIGIN = "home_anonymous_create" as const;
export const HOME_ANONYMOUS_INTENDED_SURFACE = "starter_review" as const;

const KEY = "claw_home_anonymous_create_origin_v1";

export type HomeAnonymousCreateOriginMarker = {
  v: 1;
  origin: typeof HOME_ANONYMOUS_CREATE_ORIGIN;
  intendedSurface: typeof HOME_ANONYMOUS_INTENDED_SURFACE;
  markedAt: number;
};

export function markHomeAnonymousCreateOrigin(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const marker: HomeAnonymousCreateOriginMarker = {
      v: 1,
      origin: HOME_ANONYMOUS_CREATE_ORIGIN,
      intendedSurface: HOME_ANONYMOUS_INTENDED_SURFACE,
      markedAt: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(marker));
  } catch {
    /* ignore */
  }
}

export function clearHomeAnonymousCreateOrigin(reason?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test" && reason) {
      // eslint-disable-next-line no-console
      console.info("[home-anonymous-create-origin]", { action: "clear", reason });
    }
  } catch {
    /* ignore */
  }
}

export function readHomeAnonymousCreateOrigin(): HomeAnonymousCreateOriginMarker | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeAnonymousCreateOriginMarker>;
    if (
      parsed?.v !== 1 ||
      parsed.origin !== HOME_ANONYMOUS_CREATE_ORIGIN ||
      parsed.intendedSurface !== HOME_ANONYMOUS_INTENDED_SURFACE ||
      typeof parsed.markedAt !== "number"
    ) {
      return null;
    }
    return parsed as HomeAnonymousCreateOriginMarker;
  } catch {
    return null;
  }
}

export function hasHomeAnonymousCreateOrigin(): boolean {
  return readHomeAnonymousCreateOrigin() !== null;
}

/**
 * Returns true if authority should be granted for anonymous create.
 *
 * Authority is the in-memory navigation handoff (``history.state.clawHeroFromHome``).
 * A typed URL, bookmark, or hard refresh clears that state, so a stale
 * sessionStorage marker cannot open create. StrictMode remount keeps the
 * same history entry, so the first-paint consume must not be required.
 */
export function isHomeAnonymousStarterAuthorityActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const state = window.history.state as Record<string, unknown> | null;
    return state?.clawHeroFromHome === true;
  } catch {
    return false;
  }
}

/**
 * Consume the anonymous create authority after the handoff is complete.
 * Call this after the create page has loaded and used the authority.
 * This ensures subsequent navigations to /app/create require a fresh homepage click.
 */
export function consumeHomeAnonymousCreateAuthority(): void {
  clearHomeAnonymousCreateOrigin("authority_consumed");
}

export function logHomeAnonymousCreateOrigin(args?: {
  action?: "mark" | "active" | "clear";
  reason?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const marker = readHomeAnonymousCreateOrigin();
  // eslint-disable-next-line no-console
  console.info("[home-anonymous-create-origin]", {
    action: args?.action ?? (marker ? "active" : "absent"),
    origin: marker?.origin ?? null,
    intendedSurface: marker?.intendedSurface ?? null,
    reason: args?.reason ?? null,
  });
}
