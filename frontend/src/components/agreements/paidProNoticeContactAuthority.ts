/**
 * Notice contact authority for paid Pro acceptance, SoT freeze, and display parity.
 * Ensures intake/signer contact values replace operative tokens before any authoritative freeze.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { ensureOperativeIfToNoticeDelivery } from "./paidProPartyNoticeDetails";
import type { PaidProPartyRoleContext } from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import {
  containsUnresolvedRenderTokens,
  enforceUserVisibleRenderTokenAuthority,
} from "./userVisibleRenderTokenAuthority";

export type PaidProNoticeContactAuthorityOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  surface?: string;
  /** When true (default), unresolved tokens after authority repair block the caller. */
  blockOnUnresolved?: boolean;
};

export type PaidProNoticeContactAuthorityResult = {
  text: string;
  repairs: string[];
  ok: boolean;
  blocked: boolean;
};

export function applyPaidProNoticeContactAuthority(
  raw: string,
  opts?: PaidProNoticeContactAuthorityOpts,
): PaidProNoticeContactAuthorityResult {
  const surface = opts?.surface ?? "paid_pro_notice_contact_authority";
  const intakeRaw = opts?.intakeText ?? null;
  const parties = resolvePartiesForReviewRender({ draft: opts?.draft, intakeText: intakeRaw });
  const roleContext: PaidProPartyRoleContext = {
    intakeText: intakeRaw,
    draftPartyNames: (opts?.draft?.parties ?? [])
      .map((p) => String(p?.name ?? "").trim())
      .filter(Boolean),
  };
  const repairs: string[] = [];
  let out = (raw || "").replace(/\r\n/g, "\n");

  if (parties.length >= 2) {
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(out, parties, roleContext);
    if (noticeDelivery.repairs.length > 0) {
      out = noticeDelivery.text;
      repairs.push(...noticeDelivery.repairs.map((r) => `notice:${r}`));
    }
  }

  const tokenGate = enforceUserVisibleRenderTokenAuthority(out, {
    intakeRaw,
    parties: parties.length >= 2 ? parties : undefined,
    partyNames: parties.map((p) => p.partyLegalName),
    surface,
    blockOnUnresolved: opts?.blockOnUnresolved ?? true,
  });
  out = tokenGate.text;
  repairs.push(...tokenGate.repairs);

  return {
    text: out,
    repairs: [...new Set(repairs)],
    ok: tokenGate.ok,
    blocked: tokenGate.blocked,
  };
}

/** Terminal gate before authoritative Pro freeze — repaired body or throw. */
export function assertPaidProNoticeContactAuthorityForFreeze(
  text: string,
  opts?: PaidProNoticeContactAuthorityOpts,
): string {
  const result = applyPaidProNoticeContactAuthority(text, {
    ...opts,
    blockOnUnresolved: true,
  });
  if (!result.ok || result.blocked || containsUnresolvedRenderTokens(result.text)) {
    throw new Error(
      `[paid-pro-notice-contact-authority-blocked] surface=${opts?.surface ?? "freeze"}`,
    );
  }
  return result.text;
}
