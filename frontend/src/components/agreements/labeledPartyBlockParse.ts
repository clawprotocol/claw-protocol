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
