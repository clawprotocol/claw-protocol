import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";
import {
  loadRecipientMagicLinkSession,
  type RecipientMagicLinkSession,
} from "./recipientMagicLinkSession";

function safeParse(raw: string | null): RecipientMagicLinkSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as RecipientMagicLinkSession;
    if (!o || typeof o.agreementId !== "string" || typeof o.token !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Recover a scoped magic-link session after the URL token query was stripped.
 * Only returns rows for the requested agreement id.
 */
export function loadAnyRecipientMagicLinkSessionForAgreement(
  agreementId: string,
): RecipientMagicLinkSession | null {
  const want = (agreementId || "").trim();
  if (!want || typeof sessionStorage === "undefined") return null;
  try {
    const prefix = `claw_rml_v2:${want}:`;
    let best: RecipientMagicLinkSession | null = null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const cur = safeParse(sessionStorage.getItem(key));
      if (!cur || cur.agreementId !== want || !cur.token.trim()) continue;
      best = cur;
      break;
    }
    return best;
  } catch {
    return null;
  }
}

export function resolveReviewerEffectiveAccessToken(args: {
  agreementId: string;
  urlToken?: string | null;
  propToken?: string | null;
}): { token: string; source: "url" | "session" | "prop" | "none" } {
  const urlTok = (args.urlToken || "").trim();
  if (urlTok) return { token: urlTok, source: "url" };
  const propTok = (args.propToken || "").trim();
  if (propTok) return { token: propTok, source: "prop" };
  const session = loadAnyRecipientMagicLinkSessionForAgreement(args.agreementId);
  if (session?.token.trim()) return { token: session.token.trim(), source: "session" };
  return { token: "", source: "none" };
}

export function resolveReviewerEffectiveParticipantId(args: {
  agreementId: string;
  participantPartyId?: string | null;
  recipientAccessToken?: string | null;
  validatedPartyId?: string | null;
}): string {
  const fromValidated = (args.validatedPartyId || "").trim();
  if (fromValidated) return fromValidated;
  const fromProp = (args.participantPartyId || "").trim();
  if (fromProp) return fromProp;
  const tok = (args.recipientAccessToken || "").trim();
  if (tok) {
    const session = loadRecipientMagicLinkSession(args.agreementId, tok);
    const fromScopedSession = (session?.recipientPartyId || "").trim();
    if (fromScopedSession) return fromScopedSession;
  }
  const anySession = loadAnyRecipientMagicLinkSessionForAgreement(args.agreementId);
  return (anySession?.recipientPartyId || "").trim();
}

export function reviewerNeedsPersonalizedLink(args: {
  entryKind: string;
  partiesHaveIds: boolean;
  participantPid: string;
  recipientAccessToken: string;
}): boolean {
  if (args.entryKind !== "review") return false;
  if (!args.partiesHaveIds) return false;
  if (args.recipientAccessToken.trim()) return false;
  return !args.participantPid.trim();
}

export function logReviewerTokenDetected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-detected]", payload);
}

export function logReviewerTokenPersisted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-persisted]", payload);
}

export function logReviewerTokenMissing(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[reviewer-token-missing]", payload);
}

export function logReviewFirstSubmitAuthority(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-submit-authority]", payload);
}

export function reviewerTokenHashShort(token: string): string | null {
  const t = (token || "").trim();
  if (!t) return null;
  return recipientLinkTokenFingerprint(t);
}
