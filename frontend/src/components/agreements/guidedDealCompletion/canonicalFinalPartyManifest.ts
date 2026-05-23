/**
 * Canonical final-party manifest — single source for signer summary, corpus substitution,
 * signature blocks, and review/send/sign packets.
 */

import { signerMetadataInputRaw } from "../../../agreement/signerMetadataNormalize";
import { isDisallowedPartyPhrase } from "../paidProPartyNamePreserve";
import { looksLikeEmail, stripRecipientEmailNoise } from "../recipientEmailValidation";
import { isPlaceholderPartyName } from "../starterPartyLimits";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  type PremiumRecipientHandoffV2,
} from "../premiumPartyNamesHandoff";
import type { ResolveGuidedPreReviewSignerSlotsArgs } from "./resolveGuidedPreReviewSignerSlots";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import { isIndividualPartyName } from "./signerPartyIdentity";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company)\.?$/i;

export type CanonicalFinalPartyRole = "client" | "service_provider" | `party_${number}`;

export type CanonicalFinalPartyEntry = {
  index: number;
  role: CanonicalFinalPartyRole;
  partyName: string;
  email: string;
  signerName: string | null;
  signerTitle: string | null;
  roleLabel: string;
  signerKind: "entity_representative" | "individual";
  isSenderSide: boolean;
  isIndividual: boolean;
};

export type CanonicalFinalPartyManifest = {
  parties: CanonicalFinalPartyEntry[];
};

export type ResolveCanonicalFinalPartyManifestArgs = ResolveGuidedPreReviewSignerSlotsArgs & {
  draftPartyRoles?: readonly string[];
  partySignerTitles?: readonly string[];
  handoff?: PremiumRecipientHandoffV2 | null;
};

export type GuidedFinalReviewPartyBlockReason =
  | "client_party_name_missing"
  | "service_provider_party_name_missing";

const TEMPLATE_PARTY_PLACEHOLDER_RES: readonly RegExp[] = [
  /^\[?\s*your\s+company\s+name\s*\]?$/i,
  /^\[?\s*service\s+provider\s+name\s*\]?$/i,
  /^\[?\s*client(?:'s)?(?:\s+full)?\s+legal\s+name\s*\]?$/i,
  /^\[?\s*client\s+name\s*\]?$/i,
  /^\[?\s*provider\s+name\s*\]?$/i,
  /^\[?\s*counterparty\s+name\s*\]?$/i,
  /^your\s+company\s+name$/i,
  /^service\s+provider\s+name$/i,
  /^client$/i,
  /^service\s+provider$/i,
];

export function isTemplatePartyPlaceholderName(name: string | null | undefined): boolean {
  const t = (name || "").trim();
  if (!t) return true;
  if (isPlaceholderPartyName(t)) return true;
  return TEMPLATE_PARTY_PLACEHOLDER_RES.some((re) => re.test(t));
}

export function isEmailLikePartyName(name: string | null | undefined): boolean {
  const t = stripRecipientEmailNoise(String(name ?? "").trim());
  return Boolean(t) && looksLikeEmail(t);
}

function normLoose(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function usablePartyName(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  if (t.length < 2) return "";
  if (isTemplatePartyPlaceholderName(t)) return "";
  if (isEmailLikePartyName(t)) return "";
  if (isDisallowedPartyPhrase(t)) return "";
  return t;
}

function roleForIndex(index: number, roleLabel?: string): CanonicalFinalPartyRole {
  if (index === 0) return "client";
  if (index === 1) return "service_provider";
  const role = (roleLabel || "").trim().toLowerCase();
  if (/client|company|customer|buyer/.test(role)) return "client";
  if (/provider|vendor|contractor|consultant|service|developer/.test(role)) return "service_provider";
  return `party_${index + 1}`;
}

function resolvePartyNameForSlot(args: ResolveCanonicalFinalPartyManifestArgs, index: number): string {
  const handoff = args.handoff ?? readPremiumRecipientHandoff();
  const slot = handoff ? linearPremiumRecipientSlots(handoff, Math.max(args.partyCount, 2))[index] : undefined;
  const recipientDisplay = index === 0 ? args.recipient1Name : index === 1 ? args.recipient2Name : "";
  const signerRef = usablePartyName((args.partySignerNames[index] ?? "").trim());
  const signerHandoff = usablePartyName(signerMetadataInputRaw(slot?.signerName));
  const handoffName = usablePartyName(slot?.name ?? "");
  const draftName = usablePartyName((args.draftPartyNames[index] ?? "").trim());
  const recipientName = usablePartyName(recipientDisplay);

  if (recipientName) return recipientName;
  if (handoffName) return handoffName;
  if (draftName) return draftName;
  // Client/sender slot: never promote human representative to legal entity party name.
  if (index === 0) return "";
  if (signerRef && isIndividualPartyName(signerRef)) return signerRef;
  if (signerHandoff && isIndividualPartyName(signerHandoff)) return signerHandoff;
  if (signerRef) return signerRef;
  if (signerHandoff) return signerHandoff;
  return "";
}

function roleLabelForEntry(role: CanonicalFinalPartyRole, index: number): string {
  if (role === "client") return "Client";
  if (role === "service_provider") return "Service Provider";
  return `Party ${index + 1}`;
}

function resolveSignerRepresentative(
  partyName: string,
  signerRef: string,
  signerHandoff: string,
  otherPartyNames: readonly string[],
): string | null {
  const signer = usablePartyName(signerRef) || usablePartyName(signerHandoff);
  if (!partyName) return signer || null;
  if (
    signer &&
    otherPartyNames.some((other) => other && normLoose(signer) === normLoose(other))
  ) {
    return null;
  }
  if (isIndividualPartyName(partyName)) {
    if (signer && normLoose(signer) !== normLoose(partyName)) return signer;
    return partyName;
  }
  if (!signer) return null;
  if (ENTITY_SUFFIX.test(partyName) && normLoose(signer) !== normLoose(partyName)) return signer;
  if (normLoose(signer) !== normLoose(partyName) && !isIndividualPartyName(signer)) return signer;
  return null;
}

export function resolveCanonicalFinalPartyManifest(
  args: ResolveCanonicalFinalPartyManifestArgs,
): CanonicalFinalPartyManifest {
  const handoff = args.handoff ?? readPremiumRecipientHandoff();
  const slotCount = Math.max(args.partyCount, 2);
  const handoffSlots = handoff ? linearPremiumRecipientSlots(handoff, slotCount) : [];
  const parties: CanonicalFinalPartyEntry[] = [];

  for (let i = 0; i < slotCount; i++) {
    const slot = handoffSlots[i];
    const partyName = resolvePartyNameForSlot(args, i);
    const signerRef = (args.partySignerNames[i] ?? "").trim();
    const signerHandoff = signerMetadataInputRaw(slot?.signerName);
    const otherNames = parties.map((p) => p.partyName).filter(Boolean);
    const signerName = resolveSignerRepresentative(partyName, signerRef, signerHandoff, otherNames);
    const titleRaw =
      signerMetadataInputRaw(slot?.signerTitle) ||
      signerMetadataInputRaw((args.partySignerTitles ?? [])[i]);
    const title = titleRaw.trim() || null;
    const emailRaw =
      i === 0
        ? args.recipient1Email
        : i === 1
          ? args.recipient2Email
          : args.extraPartyReviewEmails[i - 2] ?? slot?.email ?? "";
    const email = looksLikeEmail(stripRecipientEmailNoise(emailRaw))
      ? stripRecipientEmailNoise(emailRaw)
      : "";
    const role = args.draftPartyRoles?.[i] ?? slot?.role ?? "";
    const canonicalRole = roleForIndex(i, role);
    const isIndividual = partyName ? isIndividualPartyName(partyName) : false;
    parties.push({
      index: i,
      role: canonicalRole,
      partyName,
      email,
      signerName,
      signerTitle: title,
      roleLabel: roleLabelForEntry(canonicalRole, i),
      signerKind: isIndividual ? "individual" : "entity_representative",
      isSenderSide: i === 0,
      isIndividual,
    });
  }

  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[canonical-final-party-manifest]", {
      parties: parties.map((p) => ({
        role: p.role,
        partyName: p.partyName,
        signerName: p.signerName,
        email: p.email ? "[set]" : "",
      })),
    });
  }

  return { parties };
}

/** Build a full manifest entry set from canonical party identities (shared by finalizer, polish, scans). */
export function buildCanonicalFinalPartyManifestFromIdentities(
  identities: readonly CanonicalPartyIdentity[],
): CanonicalFinalPartyManifest {
  return {
    parties: identities.map((p) => {
      const role = roleForIndex(p.index);
      const isIndividual =
        p.isIndividual ?? (p.partyDisplayName ? isIndividualPartyName(p.partyDisplayName) : false);
      return {
        index: p.index,
        role,
        partyName: p.partyDisplayName,
        email: p.email,
        signerName: p.representativeName,
        signerTitle: p.title,
        roleLabel: roleLabelForEntry(role, p.index),
        signerKind: isIndividual ? ("individual" as const) : ("entity_representative" as const),
        isSenderSide: p.index === 0,
        isIndividual,
      };
    }),
  };
}

export function manifestToCanonicalPartyIdentities(
  manifest: CanonicalFinalPartyManifest,
): CanonicalPartyIdentity[] {
  return manifest.parties.map((p) => ({
    index: p.index,
    partyDisplayName: p.partyName,
    email: p.email,
    representativeName: p.signerName,
    title: p.signerTitle,
    blockHeading: p.index === 0 ? "CLIENT" : p.index === 1 ? "SERVICE PROVIDER" : `PARTY ${p.index + 1}`,
    isIndividual: p.partyName ? isIndividualPartyName(p.partyName) : false,
  }));
}

export function formatCanonicalFinalPartyManifestLines(manifest: CanonicalFinalPartyManifest): string[] {
  return manifest.parties
    .filter((p) => p.partyName)
    .map((p) => {
      const label = p.role === "client" ? "Client" : p.role === "service_provider" ? "Service Provider" : `Party ${p.index + 1}`;
      const rep =
        p.signerName && p.signerName !== p.partyName
          ? ` (${p.signerName}${p.signerTitle ? `, ${p.signerTitle}` : ""})`
          : p.signerTitle
            ? ` (${p.signerTitle})`
            : "";
      const email = p.email ? ` ${p.email}` : "";
      return `${label}: ${p.partyName}${rep}${email}`;
    });
}

export function resolveGuidedFinalReviewPartyBlockReason(
  manifest: CanonicalFinalPartyManifest,
): GuidedFinalReviewPartyBlockReason | null {
  const client = manifest.parties[0];
  const provider = manifest.parties[1];
  if (!client?.partyName?.trim()) return "client_party_name_missing";
  if (!provider?.partyName?.trim()) return "service_provider_party_name_missing";
  return null;
}

export function userMessageForGuidedFinalReviewPartyBlock(
  reason: GuidedFinalReviewPartyBlockReason,
): string {
  switch (reason) {
    case "client_party_name_missing":
      return "Add the Client legal party name (for example, Acme LLC) before continuing to final review.";
    case "service_provider_party_name_missing":
      return "Add the Service Provider party name before continuing to final review.";
    default:
      return "Complete signer party names before continuing to final review.";
  }
}

export function focusFieldSelectorForGuidedFinalReviewPartyBlock(
  reason: GuidedFinalReviewPartyBlockReason,
): string {
  switch (reason) {
    case "client_party_name_missing":
      return '[data-claw-recipient-field="r1-name"]';
    case "service_provider_party_name_missing":
      return '[data-claw-recipient-field="r2-name"]';
    default:
      return '[data-claw-recipient-field="r1-name"]';
  }
}

export function applyCanonicalManifestPlaceholdersToCorpus(
  body: string,
  manifest: CanonicalFinalPartyManifest,
): { text: string; repairs: string[] } {
  const client = manifest.parties[0];
  const provider = manifest.parties[1];
  let out = body;
  const repairs: string[] = [];
  const replaceAll = (re: RegExp, value: string, label: string) => {
    if (!value || !re.test(out)) return;
    re.lastIndex = 0;
    out = out.replace(re, value);
    repairs.push(label);
  };

  if (client?.partyName) {
    replaceAll(/\[?\s*Your Company Name\s*\]?/gi, client.partyName, "party:your_company_name");
    replaceAll(/\[Client(?:'s)?(?:\s+Full)?\s+Legal Name\]/gi, client.partyName, "party:client_legal_name");
    replaceAll(/\[Client's Full Legal Name\]/gi, client.partyName, "party:client_legal_name_apostrophe");
    replaceAll(/\[Client Name\]/gi, client.partyName, "party:client_name");
    replaceAll(/\bYour Company Name\b/g, client.partyName, "party:your_company_name_plain");
  }
  if (provider?.partyName) {
    replaceAll(/\[?\s*Service Provider Name\s*\]?/gi, provider.partyName, "party:service_provider_name");
    replaceAll(/\[Provider Name\]/gi, provider.partyName, "party:provider_name");
    replaceAll(/\bService Provider Name\b/g, provider.partyName, "party:service_provider_name_plain");
  }

  const addressPhrase = "address on file";
  replaceAll(/\[Your Company(?:'s)? Address\]/gi, addressPhrase, "address:client");
  replaceAll(/\[Your Company's Address\]/gi, addressPhrase, "address:client_alt");
  replaceAll(/\[Client(?:'s)? Address\]/gi, addressPhrase, "address:client_legal");
  replaceAll(/\[Service Provider(?:'s)? Address\]/gi, addressPhrase, "address:provider");
  replaceAll(/\[Service Provider Address\]/gi, addressPhrase, "address:provider_alt");
  replaceAll(/\bAddress on file\b/gi, addressPhrase, "address:on_file");

  if (client?.email) {
    replaceAll(/\[Client Email Address\]/gi, client.email, "email:client");
  }
  if (provider?.email) {
    replaceAll(/\[Service Provider Email Address\]/gi, provider.email, "email:provider");
  }

  return { text: out, repairs };
}

const FATAL_PARTY_NAME_PLACEHOLDER_RES: readonly RegExp[] = [
  /\[?\s*Your Company Name\s*\]?/i,
  /\[?\s*Service Provider Name\s*\]?/i,
  /\[Client(?:'s)?(?:\s+Full)?\s+Legal Name\]/i,
  /\[Client Name\]/i,
  /\[Provider Name\]/i,
  /\bYour Company Name\b/,
  /\bService Provider Name\b/,
];

export function collectFatalPartyNamePlaceholders(
  text: string,
  manifest?: CanonicalFinalPartyManifest,
): string[] {
  const found: string[] = [];
  for (const re of FATAL_PARTY_NAME_PLACEHOLDER_RES) {
    if (re.test(text)) found.push(re.source);
  }
  const partiesComplete =
    (manifest?.parties ?? []).filter((p) => p.partyName.trim().length >= 2).length >= 2;
  if (!partiesComplete) {
    const tailMarker = text.search(/\bIN WITNESS WHEREOF\b/i);
    if (tailMarker >= 0) {
      const tail = text.slice(tailMarker);
      if (/^name\s*:\s*_{6,}\s*$/im.test(tail)) found.push("blank_signature_name");
      if (/^name\s*:\s*$/im.test(tail)) found.push("empty_signature_name");
    }
  }
  return [...new Set(found)];
}

export function scanFatalPartyPlaceholdersAfterManifestApply(args: {
  body: string;
  manifest: CanonicalFinalPartyManifest;
}): { ok: boolean; fatalPlaceholders: string[]; missingPartyReason: GuidedFinalReviewPartyBlockReason | null } {
  const missingPartyReason = resolveGuidedFinalReviewPartyBlockReason(args.manifest);
  const fatalPlaceholders =
    missingPartyReason === null
      ? collectFatalPartyNamePlaceholders(args.body, args.manifest)
      : ["party_name_missing"];
  return {
    ok: missingPartyReason === null && fatalPlaceholders.length === 0,
    fatalPlaceholders,
    missingPartyReason,
  };
}
