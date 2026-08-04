/**
 * Genesis Dog GTM onboarding — signup intent capture for affiliate candidacy.
 * Mirrors ?ref= persistence patterns (localStorage + cookie) without granting access.
 */

const INTENT_KEY = "claw_genesis_dog_signup_intent_v1";
const INTENT_COOKIE = "claw_genesis_dog_join";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 90;

export const GENESIS_DOG_COMMUNITY_SLUG = "genesis-dogs";
export const GENESIS_DOG_SIGNUP_INTENT = "genesis-referral";
export const GENESIS_DOG_JOIN_PARAM = "join";
export const GENESIS_DOG_JOIN_VALUE = "genesis-dogs";
export const GENESIS_DOG_ONBOARDING_PATH = "/genesis-dogs";
export const GENESIS_DOG_ONBOARDING_DESTINATION = `/app?${GENESIS_DOG_JOIN_PARAM}=${GENESIS_DOG_JOIN_VALUE}`;

export type GenesisDogOnboardingIntent = {
  community_slug: typeof GENESIS_DOG_COMMUNITY_SLUG;
  signup_intent: typeof GENESIS_DOG_SIGNUP_INTENT;
  affiliate_candidate: true;
};

const INTENT: GenesisDogOnboardingIntent = {
  community_slug: GENESIS_DOG_COMMUNITY_SLUG,
  signup_intent: GENESIS_DOG_SIGNUP_INTENT,
  affiliate_candidate: true,
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";").map((c) => c.trim())) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return part.slice(prefix.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isGenesisDogJoinValue(raw: string | null | undefined): boolean {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-") === GENESIS_DOG_JOIN_VALUE;
}

export function rememberGenesisDogOnboardingIntent(): GenesisDogOnboardingIntent {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify(INTENT));
  } catch {
    /* ignore */
  }
  writeCookie(INTENT_COOKIE, GENESIS_DOG_JOIN_VALUE);
  return INTENT;
}

export function clearGenesisDogOnboardingIntent(): void {
  try {
    localStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
  clearCookie(INTENT_COOKIE);
}

export function getGenesisDogOnboardingIntent(): GenesisDogOnboardingIntent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GenesisDogOnboardingIntent>;
      if (
        parsed?.community_slug === GENESIS_DOG_COMMUNITY_SLUG &&
        parsed?.signup_intent === GENESIS_DOG_SIGNUP_INTENT &&
        parsed?.affiliate_candidate === true
      ) {
        return INTENT;
      }
    }
  } catch {
    /* ignore */
  }
  if (isGenesisDogJoinValue(readCookie(INTENT_COOKIE))) {
    return rememberGenesisDogOnboardingIntent();
  }
  return null;
}

export function hasGenesisDogOnboardingIntent(): boolean {
  return getGenesisDogOnboardingIntent() != null;
}

/** Capture from `/genesis-dogs` or `?join=genesis-dogs` (also accepts `/app?join=…`). */
export function captureGenesisDogOnboardingFromLocation(
  pathname: string,
  search: string,
): GenesisDogOnboardingIntent | null {
  const path = (pathname.replace(/\/$/, "") || "/").split("?")[0];
  if (path === GENESIS_DOG_ONBOARDING_PATH) {
    return rememberGenesisDogOnboardingIntent();
  }
  try {
    const join = new URLSearchParams(search || "").get(GENESIS_DOG_JOIN_PARAM);
    if (isGenesisDogJoinValue(join)) {
      return rememberGenesisDogOnboardingIntent();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function buildGenesisDogSignupLink(origin?: string): string {
  const base = (origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}${GENESIS_DOG_ONBOARDING_PATH}`;
}

/** Payload for bind / finalize-auth identity stamping. */
export function genesisDogOnboardingBindFields(): {
  community_slug: string;
  signup_intent: string;
  affiliate_candidate: boolean;
} | null {
  const intent = getGenesisDogOnboardingIntent();
  if (!intent) return null;
  return {
    community_slug: intent.community_slug,
    signup_intent: intent.signup_intent,
    affiliate_candidate: true,
  };
}

/** Suggest a referral code from email local-part or display name. */
export function suggestGenesisReferralCode(args: {
  email?: string | null;
  displayName?: string | null;
  userId?: string | null;
}): string {
  const emailLocal = String(args.email || "")
    .split("@")[0]
    ?.replace(/\+.*/, "")
    .trim();
  const fromName = String(args.displayName || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .slice(0, 16);
  const fromEmail = (emailLocal || "")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .slice(0, 16);
  const fromUid = String(args.userId || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8);
  const base = (fromName || fromEmail || `DOG${fromUid}` || "GENESISDOG").toUpperCase();
  return base.slice(0, 24) || "GENESISDOG";
}
