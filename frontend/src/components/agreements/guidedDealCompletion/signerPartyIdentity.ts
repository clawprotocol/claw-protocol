/**
 * Canonical party identities from guided signer setup → authoritative agreement corpus.
 * Deterministic local substitution (no model call).
 */

import { signerMetadataInputRaw } from "../../../agreement/signerMetadataNormalize";
import { isDisallowedPartyPhrase } from "../paidProPartyNamePreserve";
import { buildPartyEntries, normalizeSignatureBlockHeadings } from "../paidProAgreementPolish";
import {
  collectSemanticPartyPlaceholderFragments,
  repairAgreementTemplatePlaceholders,
} from "../agreementTemplatePlaceholderSafety";
import { looksLikeEmail, stripRecipientEmailNoise } from "../recipientEmailValidation";
import { isPlaceholderPartyName } from "../starterPartyLimits";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  type PremiumRecipientHandoffV2,
} from "../premiumPartyNamesHandoff";
import type { ResolveGuidedPreReviewSignerSlotsArgs } from "./resolveGuidedPreReviewSignerSlots";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company)\.?$/i;

const SIG_REGION_RE = /\b(?:IN WITNESS WHEREOF|SIGNATURES?|EXECUTION)\b/i;

export type CanonicalPartyIdentity = {
  index: number;
  partyDisplayName: string;
  email: string;
  representativeName: string | null;
  title: string | null;
  blockHeading: string;
  isIndividual: boolean;
};

export type ResolveCanonicalPartyIdentitiesArgs = ResolveGuidedPreReviewSignerSlotsArgs & {
  draftPartyRoles?: readonly string[];
  partySignerTitles?: readonly string[];
  handoff?: PremiumRecipientHandoffV2 | null;
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usablePartyName(raw: string): string {
  const t = (raw || "").trim();
  if (t.length < 2 || isPlaceholderPartyName(t) || isDisallowedPartyPhrase(t)) return "";
  return t;
}

export function isIndividualPartyName(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || ENTITY_SUFFIX.test(t)) return false;
  if (isPlaceholderPartyName(t)) return false;
  if (/^party\s+[a-z0-9]+$/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  return words.every((w) => /^[A-Z][A-Za-z'.-]*$/.test(w) || /^[A-Z]\.$/.test(w));
}

function defaultBlockHeading(index: number, roleLabel?: string): string {
  const role = (roleLabel || "").trim().toLowerCase();
  if (/client|company|customer|buyer/.test(role)) return "CLIENT";
  if (/provider|vendor|contractor|consultant|service|developer/.test(role)) return "SERVICE PROVIDER";
  if (index === 0) return "CLIENT";
  if (index === 1) return "SERVICE PROVIDER";
  return `PARTY ${index + 1}`;
}

function displayLabelForHeading(heading: string): string {
  if (heading === "CLIENT") return "Client";
  if (heading === "SERVICE PROVIDER") return "Service Provider";
  return heading
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Single source of truth for party display names used by polish, corpus, and handoff. */
export function resolveCanonicalPartyIdentitiesFromSignerSetup(
  args: ResolveCanonicalPartyIdentitiesArgs,
): CanonicalPartyIdentity[] {
  const handoff = args.handoff ?? readPremiumRecipientHandoff();
  const slotCount = Math.max(args.partyCount, 2);
  const handoffSlots = handoff ? linearPremiumRecipientSlots(handoff, slotCount) : [];
  const identities: CanonicalPartyIdentity[] = [];

  for (let i = 0; i < slotCount; i++) {
    const slot = handoffSlots[i];
    const recipientDisplay =
      i === 0 ? args.recipient1Name : i === 1 ? args.recipient2Name : "";
    const signerRef = usablePartyName((args.partySignerNames[i] ?? "").trim());
    const signerHandoff = usablePartyName(signerMetadataInputRaw(slot?.signerName));
    const handoffName = usablePartyName(slot?.name ?? "");
    const draftName = usablePartyName((args.draftPartyNames[i] ?? "").trim());

    let partyDisplayName =
      usablePartyName(recipientDisplay) ||
      handoffName ||
      draftName ||
      signerRef ||
      signerHandoff;

    if (!partyDisplayName && signerRef) partyDisplayName = signerRef;
    if (!partyDisplayName && signerHandoff) partyDisplayName = signerHandoff;

    let representativeName: string | null = null;
    if (
      signerRef &&
      partyDisplayName &&
      normLoose(signerRef) !== normLoose(partyDisplayName) &&
      ENTITY_SUFFIX.test(partyDisplayName)
    ) {
      representativeName = signerRef;
    } else if (
      signerHandoff &&
      partyDisplayName &&
      normLoose(signerHandoff) !== normLoose(partyDisplayName) &&
      ENTITY_SUFFIX.test(partyDisplayName)
    ) {
      representativeName = signerHandoff;
    }

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
    identities.push({
      index: i,
      partyDisplayName,
      email,
      representativeName,
      title,
      blockHeading: defaultBlockHeading(i, role),
      isIndividual: partyDisplayName ? isIndividualPartyName(partyDisplayName) : false,
    });
  }

  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[signer-party-identity-resolved]", {
      partyCount: identities.length,
      names: identities.map((p) => p.partyDisplayName),
      withEmail: identities.filter((p) => p.email).length,
      individuals: identities.filter((p) => p.isIndividual).length,
    });
  }

  return identities;
}

function normLoose(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function resolvePaidProPolishPartyNamesFromIdentities(
  identities: readonly CanonicalPartyIdentity[],
): string[] {
  return identities.map((p) => p.partyDisplayName).filter((n) => n.length >= 2);
}

const BRACKET_PARTY_MAP: readonly { re: RegExp; partyIndex: number }[] = [
  { re: /\[your\s+company\s+name\]/gi, partyIndex: 0 },
  { re: /\[service\s+provider\s+name\]/gi, partyIndex: 1 },
  { re: /\[client\s+legal\s+name\]/gi, partyIndex: 0 },
  { re: /\[counterparty\s+name\]/gi, partyIndex: 1 },
];

function replaceBracketPartyPlaceholders(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): string {
  let out = text;
  for (const { re, partyIndex } of BRACKET_PARTY_MAP) {
    const name = identities[partyIndex]?.partyDisplayName;
    if (!name) continue;
    out = out.replace(re, name);
  }
  return out;
}

function replaceRecitalPartyTokens(text: string, identities: readonly CanonicalPartyIdentity[]): string {
  let out = text;
  const head = out.slice(0, Math.min(out.length, 6_000));
  if (identities[0]?.partyDisplayName) {
    out =
      head.replace(/\{\{\s*party[_\s-]?a\s*\}\}/gi, identities[0].partyDisplayName) +
      out.slice(head.length);
  }
  if (identities[1]?.partyDisplayName) {
    const head2 = out.slice(0, Math.min(out.length, 6_000));
    out =
      head2.replace(/\{\{\s*party[_\s-]?b\s*\}\}/gi, identities[1].partyDisplayName) +
      out.slice(head2.length);
  }
  return out;
}

function fillSignatureNameUnderscoreLines(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const marker = text.search(SIG_REGION_RE);
  if (marker < 0) return { text, count: 0 };
  const lines = text.split("\n");
  let replacements = 0;
  let activeParty = 0;

  for (let i = 0; i < lines.length; i++) {
    if (i < marker) continue;
    const trimmed = lines[i].trim();
    for (let p = 0; p < identities.length; p++) {
      const id = identities[p];
      if (!id.partyDisplayName) continue;
      const headingRe = new RegExp(`^${escapeRe(id.blockHeading)}\\s*:?\\s*$`, "i");
      if (headingRe.test(trimmed)) {
        activeParty = p;
        if (lines[i + 1]?.trim() === "" || isPlaceholderPartyName(lines[i + 1]?.trim() ?? "")) {
          const indent = lines[i + 1]?.match(/^\s*/)?.[0] ?? "";
          lines[i + 1] = `${indent}${id.partyDisplayName}`;
          replacements += 1;
        }
        break;
      }
    }

    if (/^name\s*:/i.test(trimmed)) {
      const id = identities[activeParty] ?? identities[0];
      if (id?.partyDisplayName && /_{4,}/.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}Name: ${id.partyDisplayName}`;
        replacements += 1;
      } else if (id?.partyDisplayName && /^name\s*:\s*$/i.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}Name: ${id.partyDisplayName}`;
        replacements += 1;
      }
    }
  }

  return { text: lines.join("\n"), count: replacements };
}

function polishSignatureBlocksWithPartyIdentities(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const marker = text.search(SIG_REGION_RE);
  if (marker < 0) return { text, count: 0 };

  let count = 0;
  const blocks: string[] = [];

  for (const id of identities) {
    if (!id.partyDisplayName) continue;
    const lines: string[] = [`${id.blockHeading}:`];
    lines.push(id.partyDisplayName);
    if (!id.isIndividual) {
      lines.push("By: __________________________");
    }
    const signName = id.representativeName || id.partyDisplayName;
    lines.push(`Name: ${signName}`);
    lines.push(`Title: ${id.title?.trim() || "_________________________"}`);
    lines.push("Date: _________________________");
    blocks.push(lines.join("\n"));
    count += 1;
  }

  if (!blocks.length) return { text, count: 0 };

  const tail = text.slice(marker);
  const existingSigBody = tail.replace(/^\s*(?:IN WITNESS WHEREOF[^\n]*\n)?/i, "").trim();
  const witnessLine = tail.match(/^\s*(IN WITNESS WHEREOF[^\n]*)/i)?.[1] ?? "IN WITNESS WHEREOF";
  const mergedTail = `${witnessLine}\n\n${blocks.join("\n\n")}\n`;
  const hasPlaceholderSig =
    /\[your\s+company\s+name\]/i.test(existingSigBody) ||
    /\[service\s+provider\s+name\]/i.test(existingSigBody) ||
    /name\s*:\s*_{6,}/i.test(existingSigBody);

  if (hasPlaceholderSig) {
    return { text: text.slice(0, marker) + mergedTail, count };
  }

  const filled = fillSignatureNameUnderscoreLines(text, identities);
  return { text: filled.text, count: filled.count };
}

export function applySignerPartyIdentityToAuthoritativeAgreement(
  body: string,
  identities: readonly CanonicalPartyIdentity[],
  intakeRaw: string,
): {
  text: string;
  partyNames: string[];
  signaturePolishCount: number;
  repaired: string[];
} {
  const partyNames = resolvePaidProPolishPartyNamesFromIdentities(identities);
  if (partyNames.length < 2) {
    return { text: body, partyNames, signaturePolishCount: 0, repaired: [] };
  }

  let out = body;
  out = replaceBracketPartyPlaceholders(out, identities);
  out = replaceRecitalPartyTokens(out, identities);

  const repair = repairAgreementTemplatePlaceholders(out, {
    intakeRaw,
    partyNames,
  });
  out = repair.text;

  const sigFill = fillSignatureNameUnderscoreLines(out, identities);
  out = sigFill.text;
  const blockPolish = polishSignatureBlocksWithPartyIdentities(out, identities);
  out = blockPolish.text;

  const headings = normalizeSignatureBlockHeadings(out, buildPartyEntries(partyNames));
  out = headings.text;

  const signaturePolishCount = sigFill.count + blockPolish.count + headings.log.replacedCount;

  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[signer-party-identity-applied-to-corpus]", {
      bodyLenBefore: body.length,
      bodyLenAfter: out.length,
      partyNames,
      signaturePolishCount,
      repaired: repair.repaired.length,
    });
    if (signaturePolishCount > 0) {
      // eslint-disable-next-line no-console
      console.info("[signature-block-party-polish-applied]", {
        replacedCount: signaturePolishCount,
      });
    }
  }

  return { text: out, partyNames, signaturePolishCount, repaired: repair.repaired };
}

export function agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup(
  text: string,
): boolean {
  const semantic = collectSemanticPartyPlaceholderFragments(text);
  if (semantic.some((f) => /Your Company Name|Service Provider Name/i.test(f))) return true;
  if (/\[your\s+company\s+name\]/i.test(text)) return true;
  if (/\[service\s+provider\s+name\]/i.test(text)) return true;

  const marker = text.search(SIG_REGION_RE);
  if (marker >= 0) {
    const tail = text.slice(marker);
    if (/^name\s*:\s*_{6,}\s*$/im.test(tail)) return true;
    if (/^name\s*:\s*$/im.test(tail)) return true;
  }
  return false;
}

export function logSignerPartyPlaceholderBlockedFinalReview(payload: {
  fragments: string[];
  bodyLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-party-placeholder-blocked-final-review]", payload);
}

export function formatSignerPartyIdentityConfirmationLines(
  identities: readonly CanonicalPartyIdentity[],
): string[] {
  return identities
    .filter((p) => p.partyDisplayName)
    .map((p) => {
      const label = displayLabelForHeading(p.blockHeading);
      const email = p.email ? ` ${p.email}` : "";
      return `${label}: ${p.partyDisplayName}${email}`;
    });
}

export function mergeDraftPartiesFromCanonicalIdentities<
  T extends {
    parties?: Array<{
      name?: string | null;
      email?: string | null;
      role?: string | null;
      signerName?: string | null;
      signerTitle?: string | null;
    }>;
  },
>(draft: T, identities: readonly CanonicalPartyIdentity[]): T {
  const parties = [...(draft.parties ?? [])];
  for (const id of identities) {
    if (!id.partyDisplayName) continue;
    while (parties.length <= id.index) {
      parties.push({ name: "", role: "party", email: "" });
    }
    const prev = parties[id.index] ?? {};
    parties[id.index] = {
      ...prev,
      name: id.partyDisplayName,
      email: id.email || String(prev.email ?? "").trim() || undefined,
      role: prev.role || "party",
      signerName: id.representativeName ?? prev.signerName ?? undefined,
      signerTitle: id.title ?? prev.signerTitle ?? undefined,
    };
  }
  return { ...draft, parties };
}
