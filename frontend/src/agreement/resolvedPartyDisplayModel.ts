/**
 * Canonical resolved agreement identity for review/send surfaces.
 * Priority: signer name → recipient email label → intake-derived → draft party → placeholder last.
 */

import type { AgreementDraft, AgreementParty } from "./agreementTypes";
import { isPlaceholderPartyName } from "../components/agreements/starterPartyLimits";
import { finalizePartyDisplayNameForUserFacing } from "./partyNameDisplayCasing";
import { participantDisplayName } from "./participantModel";
import { stripRecipientEmailNoise } from "../components/agreements/recipientEmailValidation";
import { isPlausibleEmail } from "../vs01/detailsStepValidation";
import { readPremiumRecipientHandoff, linearPremiumRecipientSlots } from "../components/agreements/premiumPartyNamesHandoff";
import { isGenericOrEmptyTitle, resolveCanonicalAgreementTitle } from "../components/agreements/canonicalAgreementTitle";
import type { AgreementFamily } from "../components/agreements/agreementFamilyRouter";

export type ResolvedPartyDisplaySlot = {
  index: number;
  displayName: string;
  source: "signer" | "email" | "intake" | "draft" | "fallback";
  email?: string;
};

const BRACKET_PLACEHOLDER_RE =
  /\[your\s+company\s+name\]|\[service\s+provider\s+name\]|\[client\s+name\]|\[counterparty\s+name\]/i;

function isSemanticPartyPlaceholder(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (isPlaceholderPartyName(t)) return true;
  if (BRACKET_PLACEHOLDER_RE.test(t)) return true;
  if (/^party[_\s-]?[ab]$/i.test(t)) return true;
  if (/^agreement$/i.test(t)) return true;
  return false;
}

function formatEmailLocalPart(email: string): string {
  const em = stripRecipientEmailNoise(email);
  const at = em.indexOf("@");
  if (at < 1) return em;
  const local = em.slice(0, at).replace(/[._+-]+/g, " ").trim();
  if (!local) return em;
  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function pickDisplayName(args: {
  signerName?: string;
  entityName?: string;
  email?: string;
  intakeText?: string | null;
}): { displayName: string; source: ResolvedPartyDisplaySlot["source"] } {
  const signer = (args.signerName || "").trim();
  const entity = (args.entityName || "").trim();
  const email = stripRecipientEmailNoise(args.email || "");

  if (signer && !isSemanticPartyPlaceholder(signer) && signer.toLowerCase() !== entity.toLowerCase()) {
    return { displayName: finalizePartyDisplayNameForUserFacing(signer, args.intakeText), source: "signer" };
  }
  if (entity && !isSemanticPartyPlaceholder(entity)) {
    return { displayName: finalizePartyDisplayNameForUserFacing(entity, args.intakeText), source: "draft" };
  }
  if (isPlausibleEmail(email)) {
    return { displayName: formatEmailLocalPart(email), source: "email" };
  }
  if (signer && !isSemanticPartyPlaceholder(signer)) {
    return { displayName: finalizePartyDisplayNameForUserFacing(signer, args.intakeText), source: "signer" };
  }
  return { displayName: entity || "Signer", source: "fallback" };
}

export function buildResolvedPartyDisplayModel(args: {
  parties: AgreementDraft["parties"] | null | undefined;
  intakeText?: string | null;
  recipientEmails?: readonly (string | null | undefined)[];
  recipientSignerNames?: readonly (string | null | undefined)[];
}): ResolvedPartyDisplaySlot[] {
  const parties = (args.parties ?? []) as AgreementParty[];
  const handoff = readPremiumRecipientHandoff();
  const hoSlots = handoff ? linearPremiumRecipientSlots(handoff, parties.length) : [];
  const out: ResolvedPartyDisplaySlot[] = [];

  for (let i = 0; i < parties.length; i++) {
    const p = parties[i]!;
    const ho = hoSlots[i];
    const email =
      stripRecipientEmailNoise(String(args.recipientEmails?.[i] ?? "")) ||
      stripRecipientEmailNoise(String(ho?.email ?? p.email ?? ""));
    const signerName = (args.recipientSignerNames?.[i] ?? ho?.signerName ?? p.signerName ?? "").trim();
    const entity = (p.name || "").trim() || participantDisplayName(p, i).trim();
    const picked = pickDisplayName({
      signerName,
      entityName: entity,
      email,
      intakeText: args.intakeText,
    });
    out.push({ index: i, displayName: picked.displayName, source: picked.source, email: email || undefined });
  }
  return out;
}

export function formatResolvedPartyDisplayHeadline(slots: readonly ResolvedPartyDisplaySlot[]): string {
  const names = slots.map((s) => s.displayName).filter((n) => n.length > 0);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} ↔ ${names[1]}`;
  return names.join(" · ");
}

export function resolvePersistedAgreementTitle(args: {
  draftTitle: string | null | undefined;
  intakeText?: string | null;
  family?: AgreementFamily;
  liveDocTitle?: string | null;
}): string {
  const resolved = resolveCanonicalAgreementTitle({
    currentTitle: args.draftTitle,
    liveDocTitle: args.liveDocTitle,
    family: args.family ?? "generic_business_agreement",
    intakeText: args.intakeText,
  });
  if (isGenericOrEmptyTitle(resolved.title, args.family ?? "generic_business_agreement")) {
    return resolved.title;
  }
  return resolved.title;
}

export function detectPlaceholderRegressionInPartyLabels(
  slots: readonly ResolvedPartyDisplaySlot[],
  recipientsCaptured: boolean,
): boolean {
  if (!recipientsCaptured) return false;
  return slots.some((s) => isSemanticPartyPlaceholder(s.displayName));
}
