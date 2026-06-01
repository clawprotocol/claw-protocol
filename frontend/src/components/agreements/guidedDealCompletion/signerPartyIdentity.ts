/**
 * Canonical party identities from guided signer setup → authoritative agreement corpus.
 * Deterministic local substitution (no model call).
 */

import { buildPartyEntries, normalizeSignatureBlockHeadings } from "../paidProAgreementPolish";
import {
  repairAgreementTemplatePlaceholders,
} from "../agreementTemplatePlaceholderSafety";
import { isPlaceholderPartyName } from "../starterPartyLimits";
import type { PremiumRecipientHandoffV2 } from "../premiumPartyNamesHandoff";
import type { ResolveGuidedPreReviewSignerSlotsArgs } from "./resolveGuidedPreReviewSignerSlots";
import { paidProSignerMetadataForensicLineageEnabled } from "../paidProSignerMetadataAuthority";
import {
  findSignatureRegionEnd,
  findSignatureRegionStart,
  isSafeSignatureTailReplacement,
  signaturePatchStartIndex,
} from "./signatureRegion";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import {
  forbidPaidProExecutionBlockSynthesis,
  logPaidProExecutionBlockSynthesisBlocked,
} from "../paidProExecutionBlockAuthority";
import { repairPaidProSignatureSectionOrdering } from "../paidProSignatureSectionOrdering";
import {
  applyCanonicalManifestPlaceholdersToCorpus,
  buildCanonicalFinalPartyManifestFromIdentities,
  formatCanonicalFinalPartyManifestLines,
  manifestToCanonicalPartyIdentities,
  resolveCanonicalFinalPartyManifest,
} from "./canonicalFinalPartyManifest";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company)\.?$/i;

/** Legacy scan for placeholder detection in signature tail only. */
const SIG_TAIL_PLACEHOLDER_RE = /\bIN WITNESS WHEREOF\b/i;

export const SIGNER_IDENTITY_CORPUS_SHRINK_MIN_INPUT = 1500;
export const SIGNER_IDENTITY_CORPUS_SHRINK_MAX_RATIO = 0.8;

export type CanonicalPartyIdentity = {
  index: number;
  partyDisplayName: string;
  email: string;
  partyAddress?: string | null;
  representativeName: string | null;
  title: string | null;
  blockHeading: string;
  isIndividual: boolean;
};

/** Signature execution date line — blank until e-sign execution, never prefilled at review. */
export const SIGNATURE_DATE_BLANK_LINE = "Date: _____________________________";

export type ResolveCanonicalPartyIdentitiesArgs = ResolveGuidedPreReviewSignerSlotsArgs & {
  draftPartyRoles?: readonly string[];
  partySignerTitles?: readonly string[];
  handoff?: PremiumRecipientHandoffV2 | null;
};

/** Single source of truth for party display names used by polish, corpus, and handoff. */
export function resolveCanonicalPartyIdentitiesFromSignerSetup(
  args: ResolveCanonicalPartyIdentitiesArgs,
): CanonicalPartyIdentity[] {
  return manifestToCanonicalPartyIdentities(resolveCanonicalFinalPartyManifest(args));
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/** Replace generic Party A / Party B slot labels when signer setup has real names. */
export function replacePartySlotLabelsInBody(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const partyA = identities[0]?.partyDisplayName?.trim();
  const partyB = identities[1]?.partyDisplayName?.trim();
  if (!partyA || !partyB) return { text, count: 0 };
  if (isPlaceholderPartyName(partyA) || isPlaceholderPartyName(partyB)) {
    return { text, count: 0 };
  }
  let out = text;
  let count = 0;
  if (/\bParty\s+A\b/i.test(out)) {
    out = out.replace(/\bParty\s+A\b/gi, partyA);
    count += 1;
  }
  if (/\bParty\s+B\b/i.test(out)) {
    out = out.replace(/\bParty\s+B\b/gi, partyB);
    count += 1;
  }
  return { text: out, count };
}

function replaceGenericOpeningPartyLabels(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const client = identities[0]?.partyDisplayName?.trim();
  const provider = identities[1]?.partyDisplayName?.trim();
  if (!client || !provider) return { text, count: 0 };

  const headLen = Math.min(text.length, 2_500);
  let head = text.slice(0, headLen);
  const tail = text.slice(headLen);
  let count = 0;

  const replaceHead = (re: RegExp, replacement: string) => {
    head = head.replace(re, (...args: unknown[]) => {
      const match = String(args[0] ?? "");
      if (!match.trim()) return match;
      count += 1;
      return replacement;
    });
  };

  replaceHead(
    /\bbetween\s+(?:the\s+)?Client\s*(?:\(\s*["“]?Client["”]?\s*\))?\s+and\s+(?:the\s+)?Service Provider\s*(?:\(\s*["“]?Service Provider["”]?\s*\))?/i,
    `between ${client} ("Client") and ${provider} ("Service Provider")`,
  );
  replaceHead(
    /\bby\s+and\s+between\s+(?:the\s+)?Client\s*(?:\(\s*["“]?Client["”]?\s*\))?\s+and\s+(?:the\s+)?Service Provider\s*(?:\(\s*["“]?Service Provider["”]?\s*\))?/i,
    `by and between ${client} ("Client") and ${provider} ("Service Provider")`,
  );

  return { text: head + tail, count };
}

export function resolvePartyIndexForSignatureLine(
  lines: readonly string[],
  lineIndex: number,
  identities: readonly CanonicalPartyIdentity[],
): number {
  const fullText = lines.join("\n");
  const patchStart = signaturePatchStartIndex(fullText);
  for (let i = lineIndex; i >= 0; i--) {
    const trimmed = lines[i].trim();
    for (let p = 0; p < identities.length; p++) {
      const id = identities[p];
      if (!id.partyDisplayName) continue;
      const headingRe = new RegExp(`^${escapeRe(id.blockHeading)}\\s*:?\\s*$`, "i");
      if (headingRe.test(trimmed)) return p;
      if (trimmed.toLowerCase() === id.partyDisplayName.toLowerCase()) return p;
    }
    if (/^by\s*:/i.test(trimmed)) {
      let offset = 0;
      let byIndex = -1;
      for (let j = 0; j <= i; j++) {
        if (offset < patchStart) {
          offset += lines[j].length + 1;
          continue;
        }
        if (/^by\s*:/i.test(lines[j].trim())) {
          byIndex += 1;
        }
      }
      if (byIndex >= 0) {
        return Math.min(byIndex, Math.max(0, identities.length - 1));
      }
    }
  }
  return 0;
}

/** Name line on signature block: individual uses party name; entity uses representative when set. */
export function signatureNameForIdentity(id: CanonicalPartyIdentity): string {
  if (id.isIndividual) return id.partyDisplayName;
  return id.representativeName?.trim() ?? "";
}

function fillSignatureNameUnderscoreLines(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const marker = signaturePatchStartIndex(text);
  const lines = text.split("\n");
  let replacements = 0;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (offset < marker) {
      offset += lines[i].length + 1;
      continue;
    }
    const trimmed = lines[i].trim();
    for (let p = 0; p < identities.length; p++) {
      const id = identities[p];
      if (!id.partyDisplayName) continue;
      const headingRe = new RegExp(`^${escapeRe(id.blockHeading)}\\s*:?\\s*$`, "i");
      if (headingRe.test(trimmed)) {
        if (lines[i + 1]?.trim() === "" || isPlaceholderPartyName(lines[i + 1]?.trim() ?? "")) {
          const indent = lines[i + 1]?.match(/^\s*/)?.[0] ?? "";
          lines[i + 1] = `${indent}${id.partyDisplayName}`;
          replacements += 1;
        }
        break;
      }
    }

    if (/^name\s*:/i.test(trimmed)) {
      const partyIndex = resolvePartyIndexForSignatureLine(lines, i, identities);
      const id = identities[partyIndex];
      const signName = id ? signatureNameForIdentity(id) : "";
      if (!signName) continue;
      const wrongPartyName =
        id &&
        identities.some(
          (other, oi) =>
            oi !== partyIndex &&
            other.partyDisplayName &&
            trimmed.toLowerCase().includes(other.partyDisplayName.toLowerCase()),
        );
      if (/_{4,}/.test(trimmed) || /^name\s*:\s*$/i.test(trimmed) || wrongPartyName) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}Name: ${signName}`;
        replacements += 1;
      }
    }

    if (/^title\s*:/i.test(trimmed)) {
      const partyIndex = resolvePartyIndexForSignatureLine(lines, i, identities);
      const id = identities[partyIndex];
      const title = id?.title?.trim() ?? "";
      if (!title) continue;
      if (/_{4,}/.test(trimmed) || /^title\s*:\s*$/i.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}Title: ${title}`;
        replacements += 1;
      }
    }

    if (/^email\s+for\s+notices?\s*:/i.test(trimmed)) {
      const partyIndex = resolvePartyIndexForSignatureLine(lines, i, identities);
      const email = identities[partyIndex]?.email?.trim() ?? "";
      if (!email) continue;
      if (/_{4,}/.test(trimmed) || /^email\s+for\s+notices?\s*:\s*$/i.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        const label = /^email\s+for\s+notices\s*:/i.test(trimmed) ? "Email for Notices" : "Email for Notice";
        lines[i] = `${indent}${label}: ${email}`;
        replacements += 1;
      }
    }

    if (/^address\s+for\s+notices?\s*:/i.test(trimmed)) {
      const partyIndex = resolvePartyIndexForSignatureLine(lines, i, identities);
      const address = identities[partyIndex]?.partyAddress?.trim() ?? "";
      if (!address) continue;
      if (/_{4,}/.test(trimmed) || /^address\s+for\s+notices?\s*:\s*$/i.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        const label = /^address\s+for\s+notices\s*:/i.test(trimmed) ? "Address for Notices" : "Address for Notice";
        lines[i] = `${indent}${label}: ${address}`;
        replacements += 1;
      }
    }

    if (/^date\s*:/i.test(trimmed)) {
      const value = trimmed.replace(/^date\s*:\s*/i, "").trim();
      const hasCalendarDate =
        /\d{1,2}[\/\-]|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b20\d{2}\b/i.test(value);
      const notBlankField = value.length > 0 && !/_{4,}/.test(value);
      if (hasCalendarDate || notBlankField) {
        const indent = lines[i].match(/^\s*/)?.[0] ?? "";
        lines[i] = `${indent}${SIGNATURE_DATE_BLANK_LINE}`;
        replacements += 1;
      }
    }
  }

  return { text: lines.join("\n"), count: replacements };
}

function buildSignatureBlocks(identities: readonly CanonicalPartyIdentity[]): {
  blocks: string[];
  count: number;
} {
  const blocks: string[] = [];
  let count = 0;
  for (const id of identities) {
    if (!id.partyDisplayName) continue;
    const lines: string[] = [`${id.blockHeading}:`];
    lines.push(id.partyDisplayName);
    lines.push("By: __________________________");
    const signName = signatureNameForIdentity(id);
    lines.push(signName ? `Name: ${signName}` : "Name: __________________________");
    if (!id.isIndividual || id.title?.trim()) {
      lines.push(`Title: ${id.title?.trim() || "_________________________"}`);
    }
    const email = id.email?.trim();
    if (email) {
      lines.push(`Email for Notice: ${email}`);
    } else {
      lines.push("Email for Notice: __________________________");
    }
    const address = id.partyAddress?.trim();
    if (address) {
      lines.push(`Address for Notice: ${address}`);
    } else {
      lines.push("Address for Notice: ________________________");
    }
    lines.push(SIGNATURE_DATE_BLANK_LINE);
    blocks.push(lines.join("\n"));
    count += 1;
  }
  return { blocks, count };
}

export function rebuildSignatureBlocksWithPartyIdentities(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  if (forbidPaidProExecutionBlockSynthesis(text)) {
    logPaidProExecutionBlockSynthesisBlocked({
      surface: "rebuildSignatureBlocksWithPartyIdentities",
      reason: "authoritative_execution_block_present",
    });
    return { text, count: 0 };
  }
  const { blocks, count } = buildSignatureBlocks(identities);
  if (!blocks.length) return { text, count: 0 };
  const ordered = repairPaidProSignatureSectionOrdering(text.trimEnd());
  const trimmed = ordered.text.trimEnd();
  const marker = findSignatureRegionStart(trimmed);
  const witnessLine = "IN WITNESS WHEREOF, the Parties execute this Agreement.";
  const signatureTail = `${witnessLine}\n\n${blocks.join("\n\n")}\n`;

  if (marker < 0) {
    const witnessAlready = /\bIN WITNESS WHEREOF\b/i.test(trimmed.slice(-1200));
    return {
      text: witnessAlready
        ? `${trimmed}\n\n${blocks.join("\n\n")}\n`
        : `${trimmed}\n\n${signatureTail}`,
      count,
    };
  }

  const patchEnd = findSignatureRegionEnd(trimmed, marker);
  const before = trimmed.slice(0, marker).trimEnd();
  const after = trimmed.slice(patchEnd).trimStart();
  const rebuilt = after ? `${before}\n\n${signatureTail.trimEnd()}\n\n${after}\n` : `${before}\n\n${signatureTail}`;
  return { text: rebuilt, count };
}

function polishSignatureBlocksWithPartyIdentities(
  text: string,
  identities: readonly CanonicalPartyIdentity[],
): { text: string; count: number } {
  const marker = findSignatureRegionStart(text);
  const { blocks, count: blockCount } = buildSignatureBlocks(identities);
  if (!blocks.length) return { text, count: 0 };

  const patchStart = marker >= 0 ? marker : signaturePatchStartIndex(text);
  const tail = text.slice(patchStart);
  const existingSigBody = tail.replace(/^\s*(?:IN WITNESS WHEREOF[^\n]*\n)?/i, "").trim();
  const witnessLine = tail.match(/^\s*(IN WITNESS WHEREOF[^\n]*)/i)?.[1] ?? "IN WITNESS WHEREOF";
  const mergedTail = `${witnessLine}\n\n${blocks.join("\n\n")}\n`;
  const hasPlaceholderSig =
    /\[your\s+company\s+name\]/i.test(existingSigBody) ||
    /\[service\s+provider\s+name\]/i.test(existingSigBody) ||
    /name\s*:\s*_{6,}/i.test(existingSigBody);

  if (hasPlaceholderSig && isSafeSignatureTailReplacement(text, marker)) {
    return { text: text.slice(0, marker) + mergedTail, count: blockCount };
  }

  if (hasPlaceholderSig && marker < 0) {
    const trimmed = text.trimEnd();
    const witnessAlready = /\bIN WITNESS WHEREOF\b/i.test(trimmed.slice(-1200));
    const appended = witnessAlready
      ? `${trimmed}\n\n${blocks.join("\n\n")}\n`
      : `${trimmed}\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n${blocks.join("\n\n")}\n`;
    return { text: appended, count: blockCount };
  }

  const filled = fillSignatureNameUnderscoreLines(text, identities);
  return { text: filled.text, count: filled.count + (hasPlaceholderSig ? 0 : 0) };
}

export function shouldRejectSignerIdentityCorpusShrink(
  beforeLen: number,
  afterLen: number,
): boolean {
  return (
    beforeLen >= SIGNER_IDENTITY_CORPUS_SHRINK_MIN_INPUT &&
    afterLen < beforeLen * SIGNER_IDENTITY_CORPUS_SHRINK_MAX_RATIO
  );
}

export function logSignerPartyIdentityApplyRejected(payload: {
  beforeLen: number;
  afterLen: number;
  reason: "corpus_shrink";
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signer-party-identity-apply-rejected]", payload);
}

export function applySignerPartyIdentityToAuthoritativeAgreement(
  body: string,
  identities: readonly CanonicalPartyIdentity[],
  intakeRaw: string,
  options?: { signatureRegionOnly?: boolean },
): {
  text: string;
  partyNames: string[];
  signaturePolishCount: number;
  repaired: string[];
  rejected?: boolean;
  rejectReason?: "corpus_shrink";
} {
  const partyNames = resolvePaidProPolishPartyNamesFromIdentities(identities);
  if (partyNames.length < 2) {
    return { text: body, partyNames, signaturePolishCount: 0, repaired: [] };
  }

  if (options?.signatureRegionOnly !== false) {
    const marker = signaturePatchStartIndex(body);
    if (marker >= 0 && marker < body.length - 80) {
      const prefix = body.slice(0, marker);
      const tail = body.slice(marker);
      const tailApply = applySignerPartyIdentityToAuthoritativeAgreement(tail, identities, intakeRaw, {
        signatureRegionOnly: false,
      });
      if (tailApply.rejected) {
        return { text: body, partyNames, signaturePolishCount: 0, repaired: [], rejected: true, rejectReason: "corpus_shrink" };
      }
      const merged = `${prefix}${tailApply.text}`;
      return {
        text: merged,
        partyNames: tailApply.partyNames,
        signaturePolishCount: tailApply.signaturePolishCount,
        repaired: tailApply.repaired,
      };
    }
  }

  const bodyLenBefore = body.length;
  let out = body;
  const manifest = buildCanonicalFinalPartyManifestFromIdentities(identities);
  const manifestPatch = applyCanonicalManifestPlaceholdersToCorpus(out, manifest);
  out = manifestPatch.text;
  out = replaceBracketPartyPlaceholders(out, identities);
  out = replaceRecitalPartyTokens(out, identities);
  const openingPatch = replaceGenericOpeningPartyLabels(out, identities);
  out = openingPatch.text;
  const slotPatch = replacePartySlotLabelsInBody(out, identities);
  out = slotPatch.text;

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

  if (shouldRejectSignerIdentityCorpusShrink(bodyLenBefore, out.length)) {
    logSignerPartyIdentityApplyRejected({
      beforeLen: bodyLenBefore,
      afterLen: out.length,
      reason: "corpus_shrink",
    });
    return {
      text: body,
      partyNames,
      signaturePolishCount: 0,
      repaired: [],
      rejected: true,
      rejectReason: "corpus_shrink",
    };
  }

  const signaturePolishCount =
    openingPatch.count + slotPatch.count + sigFill.count + blockPolish.count + headings.log.replacedCount;

  logSignerPartyIdentityAppliedOnce({
    bodyLenBefore,
    bodyLenAfter: out.length,
    partyNames,
    signaturePolishCount,
    repairedCount: repair.repaired.length,
    corpusHash: fingerprintAgreementBody(out),
  });

  return { text: out, partyNames, signaturePolishCount, repaired: repair.repaired };
}

let lastSignerPartyIdentityLogHash = "";

function logSignerPartyIdentityAppliedOnce(payload: {
  bodyLenBefore: number;
  bodyLenAfter: number;
  partyNames: string[];
  signaturePolishCount: number;
  repairedCount: number;
  corpusHash: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!paidProSignerMetadataForensicLineageEnabled()) return;
  if (payload.corpusHash === lastSignerPartyIdentityLogHash) return;
  lastSignerPartyIdentityLogHash = payload.corpusHash;
  // eslint-disable-next-line no-console
  console.info("[signer-party-identity-applied-to-corpus]", {
    bodyLenBefore: payload.bodyLenBefore,
    bodyLenAfter: payload.bodyLenAfter,
    partyNames: payload.partyNames,
    signaturePolishCount: payload.signaturePolishCount,
    repaired: payload.repairedCount,
  });
  if (payload.signaturePolishCount > 0) {
    // eslint-disable-next-line no-console
    console.info("[signature-block-party-polish-applied]", {
      replacedCount: payload.signaturePolishCount,
    });
  }
}

export function agreementHasUnresolvedPartyPlaceholdersAfterSignerSetup(
  text: string,
): boolean {
  if (/\[your\s+company\s+name\]/i.test(text)) return true;
  if (/\[service\s+provider\s+name\]/i.test(text)) return true;
  if (/\bYour Company Name\b/i.test(text)) return true;
  if (/\bService Provider Name\b/i.test(text)) return true;

  const marker = text.search(SIG_TAIL_PLACEHOLDER_RE);
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
  return formatCanonicalFinalPartyManifestLines(buildCanonicalFinalPartyManifestFromIdentities(identities));
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
      signerName:
        id.representativeName ??
        (id.isIndividual ? id.partyDisplayName : undefined) ??
        prev.signerName ??
        undefined,
      signerTitle: id.isIndividual
        ? id.title ?? undefined
        : id.title ?? prev.signerTitle ?? undefined,
    };
  }
  return { ...draft, parties };
}
