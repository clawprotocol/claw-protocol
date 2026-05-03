import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { readPremiumRecipientHandoff } from "../../components/agreements/premiumPartyNamesHandoff";
import { stripRecipientEmailNoise } from "../../components/agreements/recipientEmailValidation";
import { isPlausibleEmail } from "../../vs01/detailsStepValidation";

const SIMPLE_SEND_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRole(role: string | undefined): string {
  return String(role ?? "").trim().toLowerCase();
}

/**
 * Row treated as agreement owner/sender for review-link counterparty math.
 * Prefer the first explicit `owner` role; if none, assume index 0 (create-flow convention).
 */
export function resolveReviewLinkAssumedOwnerPartyIndex(parties: readonly AgreementParty[] | undefined): number {
  const list = parties ?? [];
  const idx = list.findIndex((p) => normalizeRole(p.role) === "owner");
  if (idx >= 0) return idx;
  return 0;
}

function plausibleSlotEmail(raw: string | null | undefined): string {
  const s = stripRecipientEmailNoise(String(raw ?? ""));
  return isPlausibleEmail(s) ? s : "";
}

export function logReviewLinkRecipientEmailHandoffRead(payload: {
  handoffPresent: boolean;
  slotEmailsReadable: number;
}): void {
  // eslint-disable-next-line no-console
  console.info("[review-link-recipient-email-handoff-read]", payload);
}

/**
 * Paid simple-home review path: name + email only (no phone). Counterparty = not the assumed
 * owner row; non–signer/reviewer roles (e.g. `party`) still qualify on index ≥ 1 or when another row is owner.
 */
export function rowReadyForReviewLinkInvite(
  p: AgreementParty,
  partyIndex: number,
  parties: readonly AgreementParty[],
): boolean {
  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(parties);
  if (partyIndex === ownerIdx) return false;
  const name = (p.name || "").trim();
  const email = (p.email || "").trim();
  return Boolean(name && email && SIMPLE_SEND_EMAIL_RE.test(email));
}

export function countReadyReviewLinkInviteParties(parties: AgreementParty[] | undefined): number {
  const list = parties ?? [];
  return list.filter((p, i) => rowReadyForReviewLinkInvite(p, i, list)).length;
}

export function logReviewLinkRecipientEmailPreflight(draft: AgreementDraft | null): void {
  if (!draft) return;
  const parties = (draft.parties ?? []) as AgreementParty[];
  const ownerIdx = resolveReviewLinkAssumedOwnerPartyIndex(parties);
  let recipientEmailCount = 0;
  let counterpartyEmailCount = 0;
  parties.forEach((p, i) => {
    const em = stripRecipientEmailNoise(String((p as { email?: string }).email ?? ""));
    if (!isPlausibleEmail(em)) return;
    recipientEmailCount += 1;
    if (i !== ownerIdx) counterpartyEmailCount += 1;
  });
  const contactRequiredSlots = Math.max(0, parties.length - (parties.length > 0 ? 1 : 0));
  // eslint-disable-next-line no-console
  console.info("[review-link-recipient-email-preflight]", {
    recipientEmailCount,
    counterpartyEmailCount,
    contactRequiredSlots,
    partyRows: parties.length,
    assumedOwnerPartyIndex: ownerIdx,
  });
}

function handoffEmailForPartyName(fp: AgreementParty, handoff: NonNullable<ReturnType<typeof readPremiumRecipientHandoff>>): string {
  const fn = (fp.name || "").trim().toLowerCase();
  if (!fn) return "";
  for (const slot of [handoff.party1, handoff.party2]) {
    if ((slot.name || "").trim().toLowerCase() !== fn) continue;
    const e = plausibleSlotEmail(slot.email);
    if (e) return e;
  }
  return "";
}

function mergeHandoffOntoParties(
  base: AgreementParty[],
  handoff: NonNullable<ReturnType<typeof readPremiumRecipientHandoff>>,
): AgreementParty[] {
  const slotReadable = [handoff.party1, handoff.party2].filter((s) => plausibleSlotEmail(s.email)).length;
  logReviewLinkRecipientEmailHandoffRead({
    handoffPresent: true,
    slotEmailsReadable: slotReadable,
  });
  return base.map((fp, i) => {
    let email = plausibleSlotEmail(fp.email);
    if (email) return { ...fp, email };
    const slot = i === 0 ? handoff.party1 : i === 1 ? handoff.party2 : null;
    if (slot) {
      const fromSlot = plausibleSlotEmail(slot.email);
      if (fromSlot) return { ...fp, email: fromSlot };
    }
    const fromName = handoffEmailForPartyName(fp, handoff);
    if (fromName) return { ...fp, email: fromName };
    return { ...fp };
  });
}

/**
 * Merge primed / session recipient emails onto server-fetched parties. Preserves party `id`s
 * and non-email fields from `fetchedDraft` rows.
 */
export function mergeReviewLinkRecipientEmailsOntoHydratedDraft(
  fetchedDraft: AgreementDraft,
  primedDraft: AgreementDraft | null,
): AgreementDraft {
  const fetched = (Array.isArray(fetchedDraft.parties) ? [...fetchedDraft.parties] : []) as AgreementParty[];
  const primedList = (primedDraft && Array.isArray(primedDraft.parties) ? [...primedDraft.parties] : []) as AgreementParty[];

  let next = fetched.map((fp, i) => {
    const prim = primedList[i];
    let email = plausibleSlotEmail(fp.email);
    if (!email && prim) email = plausibleSlotEmail(prim.email);
    if (email) return { ...fp, email };
    return { ...fp };
  });

  const handoff = readPremiumRecipientHandoff();
  if (handoff) {
    next = mergeHandoffOntoParties(next, handoff);
  }

  return { ...fetchedDraft, parties: next };
}

export function mergeLiveDraftWithRecipientSetupForReviewLinks(
  liveDraft: AgreementDraft | null,
  recipientSetup: { recipient1Email?: string | null; recipient2Email?: string | null } | null,
): AgreementDraft | null {
  if (!liveDraft) return null;
  if (!recipientSetup) return liveDraft;
  const s1 = plausibleSlotEmail(recipientSetup.recipient1Email);
  const s2 = plausibleSlotEmail(recipientSetup.recipient2Email);
  if (!s1 && !s2) return liveDraft;
  const parties = [...(liveDraft.parties ?? [])] as AgreementParty[];
  let changed = false;
  const slots = [s1, s2];
  for (let i = 0; i < slots.length && i < parties.length; i++) {
    const raw = slots[i];
    if (!raw) continue;
    const prev = (parties[i].email ?? "").trim();
    if (prev === raw) continue;
    parties[i] = { ...parties[i], email: raw };
    changed = true;
  }
  return changed ? { ...liveDraft, parties } : liveDraft;
}
