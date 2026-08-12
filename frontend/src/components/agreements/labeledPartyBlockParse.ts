/**
 * Parse explicit labeled party blocks from intake (Party N + Legal Entity / Signer fields).
 * Authoritative when 2+ blocks are present — not inferred from prose, revenue, or confidentiality.
 *
 * Also supports stacked unlabeled lines under `Party N:` (entity, signer name, title, email).
 */

import {
  looksLikeStackedPartyEmailLine,
  looksLikeStackedPartyLegalEntityLine,
  looksLikeStackedPartyPersonNameLine,
  looksLikeStackedPartyTitleLine,
} from "./starterPartyIdentityIsolation";
import {
  isIntakeSectionLabelLine,
  isInvalidPartyMetadataValue,
  isPartyMetadataFieldLabelLine,
  isPartyMetadataLabelValue,
  isStructuredPromptSectionLabelToken,
} from "./intakeSectionLabels";
import {
  isPartyAddressBoundaryLine,
  joinCanonicalPartyAddressLines,
  mergeCanonicalPartyAddresses,
  normalizeCanonicalPartyAddress,
} from "./canonicalPartyStructuredAddress";
import { extractAgreementEntityCandidates, dedupeEntityCandidatesToLegalParties } from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { resolveLegalIdentitiesFromExtraction } from "./legalIdentityResolution";
import {
  extractNumberedListPartyLegalEntities,
} from "./partySlotIdentityNormalize";
import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";

export type LabeledPartyBlock = {
  /** 1-based index from the prompt ("Party 1" → 1). */
  index: number;
  /** Intake role label when present (`Party 1 (Client):`, quoted roles, etc.). */
  roleLabel: string;
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  address: string;
};

const UNKNOWN_VALUE_RE =
  /^(?:unknown|n\/?a|tbd|tba|none|—|–|-|\[not\s+yet\s+specified\]|\[?\s*not\s+yet\s+specified\s*\]?)$/i;

const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;
const PARTY_BLOCK_WITH_ROLE_INLINE_RE =
  /^\s*party\s*(\d+)\s*\(\s*([^)]+?)\s*\)\s*:\s*(.+)$/i;
const PARTY_BLOCK_WITH_ROLE_HEADER_RE = /^\s*party\s*(\d+)\s*\(\s*([^)]+?)\s*\)\s*:?\s*$/i;
const COORDINATOR_BLOCK_HEADER_RE = /^\s*coordinator\s*[:\-]?\s*$/i;

const ROLE_LABEL_PARTY_HEADER_RE =
  /^\s*(?:client|service\s+provider|provider|contractor|consultant|subcontractor|prime\s+contractor)\s*:\s*$/i;
const ROLE_LABEL_INLINE_RE =
  /^\s*(?:client|service\s+provider|provider|contractor|consultant|subcontractor|prime\s+contractor)\s*:\s*(.+)$/i;

const QUOTED_ROLE_LINE_RE =
  /^\s*([A-Z][^("\n]{2,120}?)\s*\(\s*["“”']([^"”'\n]{2,72})["”']\s*\)\s*\.?\s*$/;
const INLINE_QUOTED_ROLE_RE =
  /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\s*\(\s*["“”']([^"”'\n]{2,72})["”']\s*\)/g;

/** Strip list bullets and numbered list prefixes before labeled-field matching. */
export function stripIntakeBulletPrefix(line: string): string {
  return String(line ?? "")
    .replace(/^\s*[*•\u2022\-–—]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

function looksLikeUnlabeledSignerTitleLine(line: string): boolean {
  const t = stripIntakeBulletPrefix(line);
  if (!t || isPartyMetadataFieldLabelLine(t)) return false;
  // Next-party headers must never become the prior block's title
  // (e.g. "Party 2 (Lead Consultant):" after Party 1's entity line).
  if (
    PARTY_BLOCK_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(t) ||
    COORDINATOR_BLOCK_HEADER_RE.test(t)
  ) {
    return false;
  }
  if (looksLikeStackedPartyEmailLine(t)) return false;
  if (looksLikeStackedPartyLegalEntityLine(t) && !t.includes(":")) return false;
  if (looksLikeStackedPartyPersonNameLine(t)) return false;
  if (looksLikeStackedPartyTitleLine(t)) return true;
  if (
    /\b(?:president|director|officer|operations|executive|manager|consultant|member|partner|secretary|treasurer|vp|vice)\b/i.test(
      t,
    )
  ) {
    return t.split(/\s+/).length <= 8;
  }
  return false;
}

function isPositionalSignerTitleCandidate(line: string): boolean {
  const t = stripIntakeBulletPrefix(line);
  if (!t || isPartyMetadataFieldLabelLine(t)) return false;
  if (matchLabeledPartyField(t)) return false;
  if (looksLikeStackedPartyEmailLine(t)) return false;
  if (looksLikeStackedPartyLegalEntityLine(t) && !t.includes(":")) return false;
  if (
    PARTY_BLOCK_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(t) ||
    COORDINATOR_BLOCK_HEADER_RE.test(t)
  ) {
    return false;
  }
  return true;
}

function consumeRepresentedByStackedFields(
  block: LabeledPartyBlock,
  lines: string[],
  startIndex: number,
): number {
  let index = startIndex + 1;
  while (index < lines.length) {
    const candidate = stripIntakeBulletPrefix(lines[index]?.trim() ?? "");
    if (!candidate) {
      index += 1;
      continue;
    }
    if (matchLabeledPartyField(candidate) || isPartyMetadataFieldLabelLine(candidate)) break;
    if (PARTY_BLOCK_HEADER_RE.test(candidate) || COORDINATOR_BLOCK_HEADER_RE.test(candidate)) break;
    if (!block.signerName && looksLikeStackedPartyPersonNameLine(candidate)) {
      block.signerName = cleanFieldValue(candidate);
      index += 1;
      continue;
    }
    if (!block.signerTitle && block.signerName && isPositionalSignerTitleCandidate(candidate)) {
      block.signerTitle = cleanFieldValue(candidate);
      index += 1;
      break;
    }
    break;
  }
  return index - 1;
}

function consumeAddressHeaderStackedFields(
  block: LabeledPartyBlock,
  lines: string[],
  startIndex: number,
): number {
  let index = startIndex + 1;
  const parts: string[] = [];
  while (index < lines.length) {
    const candidate = stripIntakeBulletPrefix(lines[index]?.trim() ?? "");
    if (!candidate) {
      index += 1;
      continue;
    }
    if (!parts.length && !isAddressContinuationLine(candidate)) break;
    if (parts.length > 0 && !isAddressContinuationLine(candidate)) break;
    parts.push(cleanFieldValue(candidate));
    index += 1;
  }
  if (parts.length > 0) {
    block.address = normalizeCanonicalPartyAddress(joinCanonicalPartyAddressLines(parts), {
      source: "consumeAddressHeaderStackedFields",
    });
  }
  return index - 1;
}

const REPRESENTED_BY_HEADER_RE = /^\s*represented\s+by\s*:?\s*$/i;
const ADDRESS_HEADER_ONLY_RE =
  /^\s*(?:address|physical\s+address|mailing\s+address|party\s+address)\s*:?\s*$/i;

/**
 * TEST570: role-header intake shapes label the human signer with an "Authorized signer:" (or
 * "Signatory:") prefix and pack "Name, Title, email" onto one line. Recognize that label so the
 * value is split into structured name/title/email instead of stored verbatim as the signer name.
 */
const AUTHORIZED_SIGNER_LABEL_LINE_RE = /\bauthori[sz]ed\s+sign(?:er|atory)\b|\bsignatory\b/i;
const AUTHORIZED_SIGNER_LABEL_PREFIX_RE =
  /^\s*(?:authori[sz]ed\s+sign(?:er|atory)|signatory)\s*[:\-]\s*/i;

const LABELED_FIELD_RES: ReadonlyArray<{ key: keyof Omit<LabeledPartyBlock, "index">; re: RegExp }> = [
  {
    key: "legalEntity",
    re: /^\s*(?:legal\s+entity(?:\s*\/\s*party\s+name)?|party\s+name|party)\s*[:\-]\s*(.+)$/i,
  },
  {
    key: "signerName",
    re: /^\s*(?:signer\s+name|representative(?:\s+name)?(?:\s*\([^)]*\))?|human\s+signer|authori[sz]ed\s+representative|authori[sz]ed\s+sign(?:er|atory)|signatory|represented\s+by|rep\.?)\s*[:\-]\s*(.+)$/i,
  },
  { key: "signerTitle", re: /^\s*(?:signer\s+title|representative\s+title|title)\s*[:\-]\s*(.+)$/i },
  { key: "signerEmail", re: /^\s*(?:signer\s+email|email)\s*[:\-]\s*(.+)$/i },
  {
    key: "address",
    re: /^\s*(?:address|physical\s+address|mailing\s+address|party\s+address)\s*[:\-]\s*(.+)$/i,
  },
];

const ENTITY_INLINE_CONTACT_RE =
  /^(.{4,120}?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\.?\s*[—–-]\s*(.+)$/i;

const ENTITY_COLON_INLINE_CONTACT_RE =
  /^(.+?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\.?\s*:\s*(.+)$/i;

function parseEntityInlineContactLine(line: string): { legalEntity: string; tail: string } | null {
  const dash = line.match(ENTITY_INLINE_CONTACT_RE);
  if (dash?.[1] && dash?.[2]) {
    return { legalEntity: cleanFieldValue(dash[1]), tail: dash[2] };
  }
  const colon = line.match(ENTITY_COLON_INLINE_CONTACT_RE);
  if (colon?.[1] && colon?.[2]) {
    const legalEntity = cleanFieldValue(colon[1]);
    if (/\b(?:between|among|create|draft|prepare|write|generate)\b/i.test(legalEntity)) return null;
    return { legalEntity, tail: colon[2] };
  }
  return null;
}

function splitRepresentedByInlineValue(value: string): { name: string; title: string } {
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return { name: "", title: "" };
  const commaIdx = t.indexOf(",");
  if (commaIdx < 0) return { name: cleanFieldValue(t), title: "" };
  return {
    name: cleanFieldValue(t.slice(0, commaIdx)),
    title: cleanFieldValue(t.slice(commaIdx + 1)),
  };
}

function applyRepresentedByField(block: LabeledPartyBlock, rawValue: string): void {
  const split = splitRepresentedByInlineValue(rawValue);
  if (split.name && !block.signerName) block.signerName = split.name;
  if (split.title && !block.signerTitle) block.signerTitle = split.title;
}

/** Boundary-only: true when a line may continue a multiline address block (not postal validation). */
export function isAddressContinuationLine(line: string): boolean {
  const t = stripIntakeBulletPrefix(line);
  if (!t) return false;
  if (isPartyAddressBoundaryLine(t)) return false;
  if (matchLabeledPartyField(t)) return false;
  if (PARTY_BLOCK_HEADER_RE.test(t) || COORDINATOR_BLOCK_HEADER_RE.test(t)) return false;
  if (PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(t) || PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(t)) return false;
  if (ROLE_LABEL_PARTY_HEADER_RE.test(t)) return false;
  if (isIntakeSectionLabelLine(t)) return false;
  if (isStructuredPromptSectionLabelToken(t)) return false;
  if (looksLikeStackedPartyEmailLine(t)) return false;
  if (looksLikeStackedPartyLegalEntityLine(t) && !t.includes(":")) return false;
  if (REPRESENTED_BY_HEADER_RE.test(t)) return false;
  return true;
}

function appendMultilineAddress(block: LabeledPartyBlock, firstLine: string, lines: string[], startIndex: number): number {
  const parts = [cleanFieldValue(firstLine)];
  let index = startIndex;
  while (index + 1 < lines.length) {
    const nextRaw = lines[index + 1]?.trim() ?? "";
    if (!nextRaw) {
      index += 1;
      continue;
    }
    if (!isAddressContinuationLine(nextRaw)) break;
    parts.push(cleanFieldValue(stripIntakeBulletPrefix(nextRaw)));
    index += 1;
  }
  block.address = normalizeCanonicalPartyAddress(joinCanonicalPartyAddressLines(parts), {
    source: "appendMultilineAddress",
  });
  return index;
}

function matchLabeledPartyField(line: string): { key: keyof Omit<LabeledPartyBlock, "index">; value: string } | null {
  const normalized = stripIntakeBulletPrefix(line);
  if (!normalized) return null;
  for (const { key, re } of LABELED_FIELD_RES) {
    const m = normalized.match(re);
    if (!m?.[1]) continue;
    // Keep Unknown/TBD matches as labeled fields with empty values so they do not
    // fall through to stacked address capture (TEST367).
    return { key, value: cleanFieldValue(m[1]) };
  }
  return null;
}

function applyLabeledFieldToBlock(
  block: LabeledPartyBlock,
  labeled: { key: keyof Omit<LabeledPartyBlock, "index">; value: string },
  rawLine: string,
  lines: string[],
  lineIndex: number,
): number {
  if (labeled.key === "signerName" && /represented\s+by/i.test(rawLine)) {
    applyRepresentedByField(block, labeled.value);
    return lineIndex;
  }
  if (labeled.key === "signerName" && AUTHORIZED_SIGNER_LABEL_LINE_RE.test(rawLine)) {
    applyAuthorizedSignerInlineValue(block, labeled.value);
    return lineIndex;
  }
  if (labeled.key === "address") {
    // Empty/Unknown address labels must not start multiline capture into Purpose/prose.
    if (!labeled.value) return lineIndex;
    return appendMultilineAddress(block, labeled.value, lines, lineIndex);
  }
  block[labeled.key] = labeled.value;
  return lineIndex;
}

/** Treat Unknown / TBD / [Not yet specified] as blank — never a literal party or signer value. */
export function isUnknownIntakePlaceholderValue(value: string | null | undefined): boolean {
  const t = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true;
  return UNKNOWN_VALUE_RE.test(t);
}

function cleanFieldValue(value: string): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (isUnknownIntakePlaceholderValue(t)) return "";
  if (isPartyMetadataLabelValue(t)) return "";
  return t;
}

function emptyBlock(index: number): LabeledPartyBlock {
  return {
    index,
    roleLabel: "",
    legalEntity: "",
    signerName: "",
    signerTitle: "",
    signerEmail: "",
    address: "",
  };
}

/** Stacked `Party N:` blocks without `Legal Entity:` labels (Test372 free starter). */
function applyStackedPartyLine(block: LabeledPartyBlock, line: string): void {
  const t = line.trim();
  if (!t) return;
  if (looksLikeStackedPartyEmailLine(t)) {
    if (!block.signerEmail) block.signerEmail = cleanFieldValue(t);
    return;
  }
  if (!block.legalEntity && looksLikeStackedPartyLegalEntityLine(t)) {
    block.legalEntity = cleanFieldValue(t);
    return;
  }
  if (!block.signerName && looksLikeStackedPartyPersonNameLine(t)) {
    block.signerName = cleanFieldValue(t);
    return;
  }
  if (!block.signerTitle && block.signerName && isPositionalSignerTitleCandidate(t)) {
    block.signerTitle = cleanFieldValue(t);
    return;
  }
  if (!block.signerTitle && looksLikeUnlabeledSignerTitleLine(t)) {
    block.signerTitle = cleanFieldValue(t);
    return;
  }
  if (block.address && isAddressContinuationLine(t)) {
    block.address = mergeCanonicalPartyAddresses(block.address, cleanFieldValue(t));
    return;
  }
  if (
    PARTY_BLOCK_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(t) ||
    PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(t) ||
    COORDINATOR_BLOCK_HEADER_RE.test(t)
  ) {
    return;
  }
  if (
    !block.address &&
    !isIntakeSectionLabelLine(t) &&
    !isStructuredPromptSectionLabelToken(t) &&
    !isInvalidPartyMetadataValue(t)
  ) {
    block.address = cleanFieldValue(t);
  }
}

export type QuotedRolePartyLine = {
  legalEntity: string;
  roleLabel: string;
};

/** Parse stacked or inline `Entity LLC ("Role")` party declarations (Test384). */
export function parseQuotedRolePartyLines(raw: string): QuotedRolePartyLine[] {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const out: QuotedRolePartyLine[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(QUOTED_ROLE_LINE_RE);
    if (!match?.[1] || !match[2]) continue;
    const legalEntity = cleanFieldValue(match[1]);
    const roleLabel = match[2].replace(/\s+/g, " ").trim();
    if (legalEntity.length < 2 || !looksLikeStackedPartyLegalEntityLine(legalEntity)) continue;
    const key = legalEntity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ legalEntity, roleLabel });
  }

  INLINE_QUOTED_ROLE_RE.lastIndex = 0;
  for (const match of text.matchAll(INLINE_QUOTED_ROLE_RE)) {
    const legalEntity = cleanFieldValue(match[1] ?? "");
    const roleLabel = (match[2] ?? "").replace(/\s+/g, " ").trim();
    if (legalEntity.length < 2 || roleLabel.length < 2) continue;
    const key = legalEntity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ legalEntity, roleLabel });
  }

  return out;
}

/** Ordered full legal entity names from quoted role lines. */
export function quotedRolePartyLegalEntities(raw: string): string[] {
  return parseQuotedRolePartyLines(raw).map((entry) => entry.legalEntity);
}

/**
 * Parse `Party N` blocks with labeled sub-fields from raw intake (newlines preserved).
 * Returns blocks in ascending Party N order; omits blocks with no legal entity.
 */
export function parseLabeledPartyBlocks(raw: string): LabeledPartyBlock[] {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  if (!/\bparty\s*\d+\b/i.test(text)) return [];

  const lines = text.split("\n");
  const blocksByIndex = new Map<number, LabeledPartyBlock>();
  let currentIndex: number | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const line = rawLine.trim();
    if (!line) continue;

    if (isIntakeSectionLabelLine(line)) {
      currentIndex = null;
      continue;
    }

    const roleInline = line.match(PARTY_BLOCK_WITH_ROLE_INLINE_RE);
    if (roleInline?.[1] && roleInline?.[2] && roleInline?.[3]) {
      currentIndex = Number.parseInt(roleInline[1], 10);
      if (!Number.isFinite(currentIndex) || currentIndex < 1) {
        currentIndex = null;
        continue;
      }
      const block = blocksByIndex.get(currentIndex) ?? emptyBlock(currentIndex);
      block.roleLabel = cleanFieldValue(roleInline[2]);
      block.legalEntity = cleanFieldValue(roleInline[3]);
      blocksByIndex.set(currentIndex, block);
      continue;
    }

    const roleHeader = line.match(PARTY_BLOCK_WITH_ROLE_HEADER_RE);
    if (roleHeader?.[1] && roleHeader?.[2]) {
      currentIndex = Number.parseInt(roleHeader[1], 10);
      if (!Number.isFinite(currentIndex) || currentIndex < 1) {
        currentIndex = null;
        continue;
      }
      const block = blocksByIndex.get(currentIndex) ?? emptyBlock(currentIndex);
      block.roleLabel = cleanFieldValue(roleHeader[2]);
      blocksByIndex.set(currentIndex, block);
      continue;
    }

    const header = line.match(PARTY_BLOCK_HEADER_RE);
    if (header?.[1]) {
      currentIndex = Number.parseInt(header[1], 10);
      if (!Number.isFinite(currentIndex) || currentIndex < 1) {
        currentIndex = null;
        continue;
      }
      if (!blocksByIndex.has(currentIndex)) {
        blocksByIndex.set(currentIndex, emptyBlock(currentIndex));
      }
      continue;
    }

    if (COORDINATOR_BLOCK_HEADER_RE.test(line)) {
      currentIndex = null;
      continue;
    }

    if (currentIndex != null) {
      const block = blocksByIndex.get(currentIndex) ?? emptyBlock(currentIndex);
      const normalized = stripIntakeBulletPrefix(line);
      if (REPRESENTED_BY_HEADER_RE.test(normalized)) {
        lineIndex = consumeRepresentedByStackedFields(block, lines, lineIndex);
      } else if (ADDRESS_HEADER_ONLY_RE.test(normalized)) {
        lineIndex = consumeAddressHeaderStackedFields(block, lines, lineIndex);
      } else {
        const labeled = matchLabeledPartyField(line);
        if (labeled) {
          lineIndex = applyLabeledFieldToBlock(block, labeled, line, lines, lineIndex);
        } else {
          applyStackedPartyLine(block, normalized);
        }
      }
      blocksByIndex.set(currentIndex, block);
    }
  }

  return [...blocksByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, block]) => block)
    .filter((block) => block.legalEntity.length >= 2);
}

/** True when intake has 2+ labeled party blocks with legal entities. */
export function intakeHasAuthoritativeLabeledPartyBlocks(raw: string): boolean {
  return parseLabeledPartyBlocks(raw).length >= 2;
}

/**
 * Parse entity-heading contact blocks without `Party N` headers (TEST477).
 * Cedar Ridge LLC / Representative: … / Title: … / Email: … / Physical address: …
 */
export function parseEntityHeaderContactBlocks(raw: string): LabeledPartyBlock[] {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const blocks: LabeledPartyBlock[] = [];
  let current: LabeledPartyBlock | null = null;

  const flushCurrent = () => {
    if (current?.legalEntity && current.legalEntity.length >= 2) {
      blocks.push(current);
    }
    current = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const line = stripIntakeBulletPrefix(rawLine.trim());
    if (!line) continue;
    if (isIntakeSectionLabelLine(line)) {
      flushCurrent();
      continue;
    }
    if (
      PARTY_BLOCK_HEADER_RE.test(line) ||
      PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(line) ||
      PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(line) ||
      COORDINATOR_BLOCK_HEADER_RE.test(line)
    ) {
      flushCurrent();
      continue;
    }

    const labeled = matchLabeledPartyField(line);
    if (labeled) {
      if (!current) current = emptyBlock(blocks.length + 1);
      if (labeled.key === "legalEntity" && !current.legalEntity) {
        current.legalEntity = labeled.value;
      } else if (labeled.key === "signerName" && /represented\s+by/i.test(line)) {
        applyRepresentedByField(current, labeled.value);
      } else if (labeled.key === "signerName" && AUTHORIZED_SIGNER_LABEL_LINE_RE.test(line)) {
        applyAuthorizedSignerInlineValue(current, labeled.value);
      } else if (labeled.key === "address") {
        lineIndex = appendMultilineAddress(current, labeled.value, lines.map((l) => l.trim()), lineIndex);
      } else if (labeled.key !== "legalEntity" && !current[labeled.key]) {
        current[labeled.key] = labeled.value;
      }
      continue;
    }

    if (REPRESENTED_BY_HEADER_RE.test(line)) {
      if (!current) current = emptyBlock(blocks.length + 1);
      lineIndex = consumeRepresentedByStackedFields(current, lines, lineIndex);
      continue;
    }

    if (ADDRESS_HEADER_ONLY_RE.test(line)) {
      if (!current) current = emptyBlock(blocks.length + 1);
      lineIndex = consumeAddressHeaderStackedFields(current, lines, lineIndex);
      continue;
    }

    if (
      looksLikeStackedPartyLegalEntityLine(line) &&
      !line.includes(":") &&
      !ROLE_LABEL_PARTY_HEADER_RE.test(line)
    ) {
      flushCurrent();
      current = emptyBlock(blocks.length + 1);
      const entityOnly = line.split(/\s*[—–-]\s+/)[0]?.trim() ?? line;
      current.legalEntity = cleanFieldValue(
        looksLikeStackedPartyLegalEntityLine(entityOnly) ? entityOnly : line,
      );
      continue;
    }

    if (current) {
      applyStackedPartyLine(current, line);
    }
  }

  flushCurrent();
  return blocks;
}

function parseInlineContactTail(tail: string): Pick<LabeledPartyBlock, "signerName" | "signerTitle" | "signerEmail" | "address"> {
  const parts = tail
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { signerName: "", signerTitle: "", signerEmail: "", address: "" };
  }
  let signerName = cleanFieldValue(parts[0] ?? "");
  let signerTitle = "";
  let signerEmail = "";
  let address = "";
  const rest = parts.slice(1);
  const emailIdx = rest.findIndex((p) => looksLikeEmail(stripRecipientEmailNoise(p)));
  if (emailIdx >= 0) {
    const rawEmail = stripRecipientEmailNoise(rest[emailIdx] ?? "");
    signerEmail = looksLikeEmail(rawEmail) ? rawEmail : "";
    if (emailIdx === 0 && rest.length > 1) {
      signerTitle = cleanFieldValue(rest[0] ?? "");
      address = cleanFieldValue(rest.slice(emailIdx + 1).join(", "));
    } else {
      signerTitle = cleanFieldValue(rest.slice(0, emailIdx).join(", "));
      address = cleanFieldValue(rest.slice(emailIdx + 1).join(", "));
    }
  } else if (rest.length === 1) {
    signerTitle = cleanFieldValue(rest[0] ?? "");
  } else if (rest.length >= 2) {
    signerTitle = cleanFieldValue(rest[0] ?? "");
    address = cleanFieldValue(rest.slice(1).join(", "));
  }
  return { signerName, signerTitle, signerEmail, address };
}

/**
 * TEST570: split an "Authorized signer: Name, Title, email[, address]" value into structured signer
 * metadata. The leading label (when present) is stripped, then the remaining comma-delimited tail is
 * parsed like any inline contact tail (name first, then title/email/address).
 */
export function splitAuthorizedSignerLabeledValue(
  rawName: string | null | undefined,
  existingTitle?: string | null,
): { signerName: string; signerTitle: string; signerEmail: string } {
  const raw = String(rawName ?? "").replace(/\s+/g, " ").trim();
  const title = String(existingTitle ?? "").trim();
  const stripped = raw.replace(AUTHORIZED_SIGNER_LABEL_PREFIX_RE, "").trim();
  const hadLabel = stripped !== raw;
  // Never mangle a clean standalone name: only split when the value was explicitly labeled or when a
  // comma-delimited title/email tail exists and no title has been captured yet.
  if (!hadLabel && (!stripped.includes(",") || title)) {
    return { signerName: stripped, signerTitle: title, signerEmail: "" };
  }
  const parsed = parseInlineContactTail(stripped);
  return {
    signerName: parsed.signerName || stripped,
    signerTitle: title || parsed.signerTitle,
    signerEmail: parsed.signerEmail,
  };
}

function applyAuthorizedSignerInlineValue(block: LabeledPartyBlock, rawValue: string): void {
  const parsed = splitAuthorizedSignerLabeledValue(rawValue, block.signerTitle);
  if (parsed.signerName && !block.signerName) block.signerName = parsed.signerName;
  if (parsed.signerTitle && !block.signerTitle) block.signerTitle = parsed.signerTitle;
  if (parsed.signerEmail && !block.signerEmail) block.signerEmail = parsed.signerEmail;
}

/** Entity — Name, Title, email, address inline clauses (TEST479 Aurora-style intake). */
export function parseEntityInlineContactBlocks(raw: string): LabeledPartyBlock[] {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const blocks: LabeledPartyBlock[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split("\n")) {
    const line = stripIntakeBulletPrefix(rawLine.trim());
    if (!line) continue;
    const parsedLine = parseEntityInlineContactLine(line);
    if (!parsedLine) continue;
    const legalEntity = parsedLine.legalEntity;
    if (legalEntity.length < 4 || !looksLikeStackedPartyLegalEntityLine(legalEntity)) continue;
    const key = legalEntity.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = parseInlineContactTail(parsedLine.tail);
    const hasEmail = Boolean(parsed.signerEmail);
    const hasHumanName =
      Boolean(parsed.signerName) && looksLikeStackedPartyPersonNameLine(parsed.signerName);
    if (!hasEmail && !hasHumanName) continue;
    blocks.push({
      index: blocks.length + 1,
      roleLabel: "",
      legalEntity,
      ...parsed,
    });
  }
  return blocks;
}

/** Labeled Party N blocks plus entity-heading contact blocks (deduped by legal entity). */
export function parseAllStructuredPartyContactBlocks(raw: string): LabeledPartyBlock[] {
  const labeled = parseLabeledPartyBlocks(raw);
  const entityHeaders = parseEntityHeaderContactBlocks(raw);
  const inlineEntity = parseEntityInlineContactBlocks(raw);
  const mergedSources = [...labeled, ...entityHeaders, ...inlineEntity];
  if (mergedSources.length === 0) return [];

  const seen = new Set<string>();
  const merged: LabeledPartyBlock[] = [];
  for (const block of mergedSources) {
    const key = block.legalEntity.toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      const idx = merged.findIndex((b) => b.legalEntity.toLowerCase() === key);
      if (idx >= 0) {
        const target = merged[idx]!;
        if (!target.signerName && block.signerName) target.signerName = block.signerName;
        if (!target.signerTitle && block.signerTitle) target.signerTitle = block.signerTitle;
        if (!target.signerEmail && block.signerEmail) target.signerEmail = block.signerEmail;
        if (!target.address && block.address) target.address = block.address;
        if (!target.legalEntity && block.legalEntity) target.legalEntity = block.legalEntity;
      }
      continue;
    }
    seen.add(key);
    merged.push({ ...block, index: merged.length + 1 });
  }
  return merged.sort((a, b) => a.index - b.index);
}

/** Ordered full legal entity names from labeled party blocks. */
export function labeledPartyLegalEntities(raw: string): string[] {
  return parseLabeledPartyBlocks(raw).map((b) => b.legalEntity);
}

/** Role labels from labeled party blocks when intake declares them explicitly. */
export function labeledPartyRoleLabels(raw: string): string[] {
  return parseLabeledPartyBlocks(raw).map((b) => b.roleLabel.trim());
}

/** Resolve role label for a labeled block — explicit intake role beats generic Party N. */
export function labeledPartyBlockRoleLabel(block: LabeledPartyBlock, intakeText?: string | null): string {
  const explicit = block.roleLabel.trim();
  if (explicit.length >= 2) return explicit;
  return labeledPartyRoleLabelForPartyIndex(block.index - 1, intakeText);
}

/**
 * Parse role-label party blocks (`Client:`, `Service Provider:`, etc.) followed by entity lines
 * or inline `Client: Acme LLC` forms (Test375 free starter).
 */
export function roleLabelPartyLegalEntities(raw: string): string[] {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const entities: string[] = [];
  let expectingEntity = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (PARTY_BLOCK_HEADER_RE.test(line) || COORDINATOR_BLOCK_HEADER_RE.test(line)) {
      expectingEntity = false;
      continue;
    }

    if (ROLE_LABEL_PARTY_HEADER_RE.test(line)) {
      expectingEntity = true;
      continue;
    }

    const inline = line.match(ROLE_LABEL_INLINE_RE);
    if (inline?.[1]) {
      const entity = cleanFieldValue(inline[1]);
      if (entity.length >= 2 && looksLikeStackedPartyLegalEntityLine(entity)) {
        entities.push(entity);
      }
      expectingEntity = false;
      continue;
    }

    if (expectingEntity && looksLikeStackedPartyLegalEntityLine(line)) {
      entities.push(cleanFieldValue(line));
      expectingEntity = false;
    }
  }

  return entities;
}

/** Labeled Party N blocks, quoted-role lines, role-label Client/Provider blocks, else resolved legal entities from prose. */
export function resolveStarterGatePartyLegalEntities(raw: string): string[] {
  const intake = String(raw || "").trim();
  const labeled = labeledPartyLegalEntities(intake);
  if (labeled.length >= 3) return labeled;
  const numbered = extractNumberedListPartyLegalEntities(intake);
  if (numbered.length >= 3) return numbered;
  const quoted = quotedRolePartyLegalEntities(intake);
  if (quoted.length >= 3) return dedupeEntityCandidatesToLegalParties(quoted);
  const roleLabeled = roleLabelPartyLegalEntities(intake);
  const merged = dedupeEntityCandidatesToLegalParties([...labeled, ...quoted, ...roleLabeled, ...numbered]);
  if (merged.length >= 3) return merged;

  const resolved = resolveLegalIdentitiesFromExtraction({
    candidates: merged,
    intakeText: intake,
  }).map((r) => r.legalEntityName);
  if (resolved.length >= 3) return resolved;
  if (resolved.length >= 2 && numbered.length < 3) return resolved;

  const fromProse = dedupeEntityCandidatesToLegalParties(extractAgreementEntityCandidates(intake));
  const combined = dedupeEntityCandidatesToLegalParties([...merged, ...fromProse]);
  const fallbackResolved = resolveLegalIdentitiesFromExtraction({
    candidates: combined,
    intakeText: intake,
  }).map((r) => r.legalEntityName);
  if (fallbackResolved.length >= 3) return fallbackResolved;
  if (fallbackResolved.length >= 2) return fallbackResolved;

  const betweenAuthoritative = extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName);
  if (betweenAuthoritative.length >= 2) {
    return dedupeEntityCandidatesToLegalParties(betweenAuthoritative);
  }
  return fallbackResolved;
}

export const TRIPARTITE_LABELED_PARTY_ROLE_LABELS = [
  "Client",
  "Service Provider",
  "Analytics Provider",
] as const;

/** Tripartite labeled-party intakes — exactly three labeled Party blocks are authoritative. */
export function isTripartiteLabeledPartiesIntake(raw: string): boolean {
  return parseLabeledPartyBlocks(raw).length === 3;
}

/** Quadripartite (4+) labeled-party intakes — four labeled Party blocks are authoritative. */
export function isQuadripartiteLabeledPartiesIntake(raw: string): boolean {
  return parseLabeledPartyBlocks(raw).length >= 4;
}

/** N-party labeled intake with at least `minimum` labeled Party blocks. */
export function isLabeledMultiPartyIntake(raw: string, minimum = 3): boolean {
  return parseLabeledPartyBlocks(raw).length >= minimum;
}

export function tripartiteRoleLabelForPartyIndex(index: number): string {
  return TRIPARTITE_LABELED_PARTY_ROLE_LABELS[index] ?? `Party ${index + 1}`;
}

/** Role label for labeled N-party intakes — quadripartite uses Party N only (no client/provider collapse). */
export function labeledPartyRoleLabelForPartyIndex(index: number, intakeText?: string | null): string {
  if (intakeText && isQuadripartiteLabeledPartiesIntake(intakeText)) {
    return `Party ${index + 1}`;
  }
  if (intakeText && isTripartiteLabeledPartiesIntake(intakeText)) {
    return tripartiteRoleLabelForPartyIndex(index);
  }
  return index === 0 ? "Client" : index === 1 ? "Service Provider" : `Party ${index + 1}`;
}

export function tripartiteExecutionBlockHeading(index: number): string {
  const label = tripartiteRoleLabelForPartyIndex(index).toLowerCase();
  if (label === "client") return "CLIENT";
  if (label.includes("service") && label.includes("provider")) return "SERVICE PROVIDER";
  if (label.includes("analytics") && label.includes("provider")) return "ANALYTICS PROVIDER";
  return `PARTY ${index + 1}`;
}

/** Execution-block heading for labeled N-party intakes. */
export function multiPartyExecutionBlockHeading(index: number, intakeText?: string | null): string {
  if (intakeText && isQuadripartiteLabeledPartiesIntake(intakeText)) {
    return `PARTY ${index + 1}`;
  }
  if (intakeText && isTripartiteLabeledPartiesIntake(intakeText)) {
    return tripartiteExecutionBlockHeading(index);
  }
  if (index === 0) return "CLIENT";
  if (index === 1) return "SERVICE PROVIDER";
  return `PARTY ${index + 1}`;
}

export function labeledPartyBlocksForSignerMetadata(raw: string): LabeledPartyBlock[] {
  return parseAllStructuredPartyContactBlocks(raw);
}
