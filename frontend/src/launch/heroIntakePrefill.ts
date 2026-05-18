/** One-shot handoff from marketing hero → /app/create. */

import {
  AGREEMENT_CREATOR_INTAKE_STORAGE_KEY,
  clearAgreementCreatorIntakeStorage,
} from "../components/agreements/agreementIntakeStorage";

const SESSION_KEY = "claw_hero_intake_prefill_v1";

/** Ignore stale session handoffs (e.g. old tab) so ghost text cannot reappear days later. */
const HERO_HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

type SessionPayloadV2 = { v: 2; text: string; ts: number };

/** Result of stopping the hero mic for navigation (shared with `useHeroMediaDictation`). */
export type FinalizeRecordingResult =
  | { status: "none" }
  | { status: "ok"; transcript: string }
  | { status: "failed"; reason: "short" | "rate_limit" | "empty" | "network" | "error" };

export type HeroHandoffPayload = {
  text: string;
  /** User submitted from the marketing hero (never treat as “restored from browser”). */
  fromHome: boolean;
  /** Transcript was merged from an in-flight mic finalize before navigation. */
  voiceFinalize: boolean;
  /** Homepage submit with text — auto-run starter draft parse on `/app/create` mount. */
  autoGenerate?: boolean;
  /** Typed intake from `/app/quick` → Generate draft agreement (continuity UI on create). */
  quickSendTypedHandoff?: boolean;
};

/** `undefined` = not yet read (Strict Mode–safe cache). */
let handoffReadCache: HeroHandoffPayload | null | undefined = undefined;

function trimOrNull(s: string | null | undefined): string | null {
  const t = (s || "").trim();
  return t || null;
}

/** Merge typed hero text with a finalized transcript (Start drafting while recording). */
export function mergeHomeHeroDraftForHandoff(
  typedTrimmed: string,
  fin: FinalizeRecordingResult,
): { merged: string; voiceFinalize: boolean } {
  if (fin.status !== "ok" || !fin.transcript.trim()) {
    return { merged: typedTrimmed, voiceFinalize: false };
  }
  const t = fin.transcript.trim();
  return {
    merged: typedTrimmed ? `${typedTrimmed} ${t}` : t,
    voiceFinalize: true,
  };
}

function parseHistoryHandoff(st: Record<string, unknown> | null): HeroHandoffPayload | null {
  if (!st || typeof st !== "object") return null;
  if (st.clawHeroFromHome === true) {
    const text = typeof st.clawHeroIntake === "string" ? st.clawHeroIntake : "";
    const base = {
      text,
      fromHome: true as const,
      voiceFinalize: st.clawHeroVoiceFinalize === true,
      autoGenerate: st.clawHeroAutoGenerate === true,
    };
    if (st.clawHeroQuickSendTypedHandoff === true) {
      return { ...base, quickSendTypedHandoff: true };
    }
    return base;
  }
  if (typeof st.clawHeroIntake === "string") {
    const t = st.clawHeroIntake.trim();
    if (t) return { text: t, fromHome: false, voiceFinalize: false };
  }
  return null;
}

/**
 * Call when navigating to /app/create without a fresh hero payload so stale session handoff is not applied.
 */
export function resetHeroHandoffForCreateNavigationWithoutPayload(): void {
  handoffReadCache = undefined;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  clearAgreementCreatorIntakeStorage();
}

/**
 * Prepare handoff from the homepage. Invalidates read cache.
 * With `fromHomeSubmit`, empty merged text clears persisted intake so archived drafts cannot win.
 */
export function stashHeroIntakePrefill(
  text: string,
  opts?: { fromHomeSubmit?: boolean; autoGenerate?: boolean },
): void {
  handoffReadCache = undefined;
  const t = (text || "").trim();
  try {
    if (opts?.fromHomeSubmit && !t) {
      sessionStorage.removeItem(SESSION_KEY);
      try {
        localStorage.removeItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (t) {
      const payload: SessionPayloadV2 = { v: 2, text: t, ts: Date.now() };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      try {
        localStorage.setItem(AGREEMENT_CREATOR_INTAKE_STORAGE_KEY, t);
      } catch {
        /* ignore */
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Idempotent read for the current navigation. Survives React Strict Mode double mount.
 * Precedence: in-memory cache → history.state (structured handoff) → sessionStorage.
 */
export function readHeroIntakeHandoffForCreate(): HeroHandoffPayload | null {
  if (handoffReadCache !== undefined) return handoffReadCache;
  try {
    const st =
      typeof history !== "undefined" ? (history.state as Record<string, unknown> | null) : null;
    const fromHist = parseHistoryHandoff(st);
    if (fromHist) {
      handoffReadCache = fromHist;
      return fromHist;
    }
    const rawSess = sessionStorage.getItem(SESSION_KEY);
    if (rawSess) {
      let textFromSession: string | null = null;
      try {
        const parsed = JSON.parse(rawSess) as SessionPayloadV2 | unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as SessionPayloadV2).v === 2 &&
          typeof (parsed as SessionPayloadV2).text === "string" &&
          typeof (parsed as SessionPayloadV2).ts === "number"
        ) {
          const p = parsed as SessionPayloadV2;
          if (Date.now() - p.ts <= HERO_HANDOFF_MAX_AGE_MS) {
            textFromSession = p.text;
          } else {
            sessionStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        /* legacy plain string: one-shot read then remove to avoid repeat ghost mounts */
        const legacy = trimOrNull(rawSess);
        if (legacy) {
          textFromSession = legacy;
          try {
            sessionStorage.removeItem(SESSION_KEY);
          } catch {
            /* ignore */
          }
        }
      }
      if (textFromSession) {
        handoffReadCache = { text: textFromSession, fromHome: false, voiceFinalize: false };
        return handoffReadCache;
      }
    }
    handoffReadCache = null;
    return null;
  } catch {
    handoffReadCache = null;
    return null;
  }
}

/** Clear transport after the handoff has been applied to the intake (e.g. agreement created). */
export function clearHeroIntakeHandoffAfterApply(): void {
  handoffReadCache = undefined;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (typeof history === "undefined") return;
    const st = history.state as Record<string, unknown> | null;
    if (st && typeof st === "object") {
      const hasAny =
        "clawHeroIntake" in st ||
        "clawHeroFromHome" in st ||
        "clawHeroVoiceFinalize" in st ||
        "clawHeroQuickSendTypedHandoff" in st ||
        "clawHeroAutoGenerate" in st;
      if (hasAny) {
        const next = { ...st };
        delete next.clawHeroIntake;
        delete next.clawHeroFromHome;
        delete next.clawHeroVoiceFinalize;
        delete next.clawHeroQuickSendTypedHandoff;
        delete next.clawHeroAutoGenerate;
        const keys = Object.keys(next);
        history.replaceState(keys.length ? next : null, "", window.location.href);
      }
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Use readHeroIntakeHandoffForCreate + clearHeroIntakeHandoffAfterApply */
export function consumeHeroIntakePrefill(): string | null {
  const v = readHeroIntakeHandoffForCreate();
  if (!v) return null;
  const text = v.text;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (typeof history !== "undefined") {
      const st = history.state as Record<string, unknown> | null;
      if (st && typeof st === "object") {
        const hasAny =
          "clawHeroIntake" in st ||
          "clawHeroFromHome" in st ||
          "clawHeroVoiceFinalize" in st ||
          "clawHeroQuickSendTypedHandoff" in st;
        if (hasAny) {
          const next = { ...st };
          delete next.clawHeroIntake;
          delete next.clawHeroFromHome;
          delete next.clawHeroVoiceFinalize;
          delete next.clawHeroQuickSendTypedHandoff;
          const keys = Object.keys(next);
          history.replaceState(keys.length ? next : null, "", window.location.href);
        }
      }
    }
  } catch {
    /* ignore */
  }
  handoffReadCache = undefined;
  return text.trim() ? text : null;
}
