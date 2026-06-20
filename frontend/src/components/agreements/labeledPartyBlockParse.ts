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
import { extractAgreementEntityCandidates, dedupeEntityCandidatesToLegalParties } from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";

export type LabeledPartyBlock = {
  /** 1-based index from the prompt ("Party 1" → 1). */
  index: number;
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  address: string;
};

const UNKNOWN_VALUE_RE =
  /^(?:unknown|n\/?a|tbd|tba|none|—|–|-|\[not\s+yet\s+specified\]|\[?\s*not\s+yet\s+specified\s*\]?)$/i;

const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;
const COORDINATOR_BLOCK_HEADER_RE = /^\s*coordinator\s*[:\-]?\s*$/i;

const ROLE_LABEL_PARTY_HEADER_RE =
  /^\s*(?:client|service\s+provider|provider|contractor|consultant|subcontractor|prime\s+contractor)\s*:\s*$/i;
const ROLE_LABEL_INLINE_RE =
  /^\s*(?:client|service\s+provider|provider|contractor|consultant|subcontractor|prime\s+contractor)\s*:\s*(.+)$/i;

const QUOTED_ROLE_LINE_RE =
  /^\s*([A-Z][^("\n]{2,120}?)\s*\(\s*["“”']([^"”'\n]{2,72})["”']\s*\)\s*\.?\s*$/;
const INLINE_QUOTED_ROLE_RE =
  /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\s*\(\s*["“”']([^"”'\n]{2,72})["”']\s*\)/g;

const LABELED_FIELD_RES: ReadonlyArray<{ key: keyof Omit<LabeledPartyBlock, "index">; re: RegExp }> = [
  { key: "legalEntity", re: /^\s*legal\s+entity\s*[:\-]\s*(.+)$/i },
  { key: "signerName", re: /^\s*signer\s+name\s*[:\-]\s*(.+)$/i },
  { key: "signerTitle", re: /^\s*signer\s+title\s*[:\-]\s*(.+)$/i },
  { key: "signerEmail", re: /^\s*signer\s+email\s*[:\-]\s*(.+)$/i },
  { key: "address", re: /^\s*address\s*[:\-]\s*(.+)$/i },
];

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
  return isUnknownIntakePlaceholderValue(t) ? "" : t;
}

function emptyBlock(index: number): LabeledPartyBlock {
  return {
    index,
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
  if (!block.signerTitle && looksLikeStackedPartyTitleLine(t)) {
    block.signerTitle = cleanFieldValue(t);
    return;
  }
  if (!block.address) {
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

  const flushField = (line: string) => {
    if (currentIndex == null) return;
    const block = blocksByIndex.get(currentIndex) ?? emptyBlock(currentIndex);
    let labeled = false;
    for (const { key, re } of LABELED_FIELD_RES) {
      const m = line.match(re);
      if (!m?.[1]) continue;
      block[key] = cleanFieldValue(m[1]);
      labeled = true;
      break;
    }
    if (!labeled) {
      applyStackedPartyLine(block, line);
    }
    blocksByIndex.set(currentIndex, block);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

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
      flushField(line);
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

/** Ordered full legal entity names from labeled party blocks. */
export function labeledPartyLegalEntities(raw: string): string[] {
  return parseLabeledPartyBlocks(raw).map((b) => b.legalEntity);
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

/** Labeled Party N blocks, quoted-role lines, role-label Client/Provider blocks, else entity names from prose. */
export function resolveStarterGatePartyLegalEntities(raw: string): string[] {
  const labeled = labeledPartyLegalEntities(raw);
  if (labeled.length >= 3) return labeled;
  const quoted = quotedRolePartyLegalEntities(raw);
  if (quoted.length >= 3) return dedupeEntityCandidatesToLegalParties(quoted);
  const roleLabeled = roleLabelPartyLegalEntities(raw);
  const merged = dedupeEntityCandidatesToLegalParties([...labeled, ...quoted, ...roleLabeled]);
  if (merged.length >= 3) return merged;
  if (merged.length >= 2) return merged;
  const betweenAuthoritative = extractBetweenPartyNameList(raw).filter(isAuthoritativeLegalEntityName);
  if (betweenAuthoritative.length === 2) {
    return dedupeEntityCandidatesToLegalParties(betweenAuthoritative);
  }
  const fromProse = dedupeEntityCandidatesToLegalParties(extractAgreementEntityCandidates(raw));
  const combined = dedupeEntityCandidatesToLegalParties([...merged, ...fromProse]);
  return combined.length >= 2 ? combined : dedupeEntityCandidatesToLegalParties(merged);
}

export const TRIPARTITE_LABELED_PARTY_ROLE_LABELS = [
  "Client",
  "Service Provider",
  "Analytics Provider",
] as const;

/** Tripartite labeled-party intakes — three labeled Party blocks are authoritative. */
export function isTripartiteLabeledPartiesIntake(raw: string): boolean {
  return parseLabeledPartyBlocks(raw).length >= 3;
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
  return parseLabeledPartyBlocks(raw);
}
