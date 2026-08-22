/**
 * Guest checkout authority for anonymous "Continue with Pro" flywheel.
 *
 * Flow:
 * 1. Homepage → Draft free (guest starter) → Continue with Pro
 * 2. markGuestCheckoutAuthority() is called before navigation to checkout
 * 3. Guest reaches /app/checkout/__claw_create_checkout__ (allowed by authority)
 * 4. Simulated POS completes, createDemoSessionUser() creates a basic account from payment info
 * 5. Guest (now demo session user) returns to /app/create?restore=starterReview&premiumCompletion=1
 * 6. Demo session user is recognized as authenticated for the session
 *
 * Direct navigation to /app/checkout without the handoff marker is still blocked.
 */

const GUEST_CHECKOUT_AUTHORITY_KEY = "claw_guest_checkout_authority_v1";
const DEMO_SESSION_USER_KEY = "claw_demo_session_user_v1";

export type GuestCheckoutAuthorityMarker = {
  v: 1;
  origin: "starter_pro_checkout";
  markedAt: number;
  /** The checkout path this authority was granted for (prevents reuse for other paths). */
  targetPath: string;
};

/**
 * Demo session user created after simulated POS succeeds.
 * Acts as an authenticated user for the session without requiring Supabase login.
 */
export type DemoSessionUser = {
  v: 1;
  id: string;
  displayName: string;
  email: string | null;
  createdAt: number;
  source: "demo_checkout";
  /** Receipt ID from the settlement that created this user. */
  settlementReceiptId: string;
};

/**
 * Mark guest checkout authority when a guest clicks "Continue with Pro" from starter flow.
 * This should be called BEFORE navigating to the checkout page.
 */
export function markGuestCheckoutAuthority(targetPath: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const marker: GuestCheckoutAuthorityMarker = {
      v: 1,
      origin: "starter_pro_checkout",
      markedAt: Date.now(),
      targetPath,
    };
    sessionStorage.setItem(GUEST_CHECKOUT_AUTHORITY_KEY, JSON.stringify(marker));
  } catch {
    /* ignore */
  }
}

export function readGuestCheckoutAuthority(): GuestCheckoutAuthorityMarker | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GUEST_CHECKOUT_AUTHORITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestCheckoutAuthorityMarker>;
    if (
      parsed?.v !== 1 ||
      parsed.origin !== "starter_pro_checkout" ||
      typeof parsed.markedAt !== "number" ||
      typeof parsed.targetPath !== "string"
    ) {
      return null;
    }
    return parsed as GuestCheckoutAuthorityMarker;
  } catch {
    return null;
  }
}

export function hasGuestCheckoutAuthority(): boolean {
  return readGuestCheckoutAuthority() !== null;
}

/**
 * Check if guest checkout authority is active for a specific checkout path.
 * Requires BOTH:
 * 1. The sessionStorage marker exists
 * 2. The fresh handoff flag (history.state.clawGuestCheckout) is present
 *
 * This ensures typed URLs don't bypass the guest handoff requirement.
 */
export function isGuestCheckoutAuthorityActiveForPath(currentPath: string): boolean {
  if (typeof window === "undefined") return false;
  const marker = readGuestCheckoutAuthority();
  if (!marker) return false;
  const markerPathBase = marker.targetPath.split("?")[0] || "";
  const checkPathBase = currentPath.split("?")[0] || "";
  if (markerPathBase !== checkPathBase) return false;
  if (!markerPathBase.includes("__claw_create_checkout__")) return false;
  try {
    const state = window.history.state as Record<string, unknown> | null;
    return state?.clawGuestCheckout === true;
  } catch {
    return false;
  }
}

export function clearGuestCheckoutAuthority(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(GUEST_CHECKOUT_AUTHORITY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Create a demo session user after simulated POS succeeds.
 * This user acts as an authenticated user for the session.
 */
export function createDemoSessionUser(args: {
  displayName: string;
  email?: string | null;
  settlementReceiptId: string;
}): DemoSessionUser {
  const user: DemoSessionUser = {
    v: 1,
    id: `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    displayName: args.displayName.trim() || "Pro User",
    email: args.email?.trim() || null,
    createdAt: Date.now(),
    source: "demo_checkout",
    settlementReceiptId: args.settlementReceiptId,
  };
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(DEMO_SESSION_USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }
  clearGuestCheckoutAuthority();
  return user;
}

export function readDemoSessionUser(): DemoSessionUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSessionUser>;
    if (
      parsed?.v !== 1 ||
      typeof parsed.id !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.createdAt !== "number" ||
      parsed.source !== "demo_checkout" ||
      typeof parsed.settlementReceiptId !== "string"
    ) {
      return null;
    }
    return parsed as DemoSessionUser;
  } catch {
    return null;
  }
}

export function hasDemoSessionUser(): boolean {
  return readDemoSessionUser() !== null;
}

/** Demo POS already painted Pro. Snapshot persist still 401s without a JWT — Save may continue to final review. */
export function demoSessionMayContinueWithoutServerSnapshot(code: string): boolean {
  if (!hasDemoSessionUser()) return false;
  return code === "auth_required" || code === "authenticated_session_required";
}

export function clearDemoSessionUser(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(DEMO_SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Clear all guest checkout authorities (for logout, session reset, etc).
 */
export function clearAllGuestCheckoutAuthorities(): void {
  clearGuestCheckoutAuthority();
  clearDemoSessionUser();
}
