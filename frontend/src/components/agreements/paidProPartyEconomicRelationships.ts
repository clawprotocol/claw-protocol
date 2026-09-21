/**
 * Preserve party-to-obligation and party-to-amount bindings from intake
 * through payment-section transforms. Do not invent a payer.
 */
import { paymentSectionText } from "./proAgreementCompleteness/revisionQuestionEngine";

export type PartyReceiveAllocation = {
  entity: string;
  amounts: string[];
  sentence: string;
};

export type PartyRevenueShare = {
  entity: string;
  percent: string;
};

const RECEIVE_LINE_RE =
  /([A-Z][A-Za-z0-9.,'& -]{2,90}?)\s+receives?\s+((?:\$[\d,]+(?:\s+upon\s+[^.;\n]+)?(?:,\s*(?:and\s+)?)?)+)/gi;
const AMOUNT_RE = /\$[\d,]+/g;
const SHARE_LINE_RE = /([A-Z][A-Za-z0-9.,'& -]{2,90}?):\s*(\d{1,2})\s*%/g;

const NEXT_TOP_LEVEL_HEADING_RE = /(?:^|\n|(?<=\.))(?:\d{1,2})\.(?!\d)\s+\S/;

function normalizeEntity(name: string): string {
  return name.replace(/\s+/g, " ").replace(/,+$/g, "").trim();
}

export function partyReceiveAllocationsFromIntake(intake: string): PartyReceiveAllocation[] {
  const out: PartyReceiveAllocation[] = [];
  const seen = new Set<string>();
  const text = intake || "";
  RECEIVE_LINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RECEIVE_LINE_RE.exec(text))) {
    const entity = normalizeEntity(match[1] || "");
    const clause = (match[2] || "").trim();
    const amounts = clause.match(AMOUNT_RE) || [];
    if (!entity || amounts.length === 0) continue;
    if (seen.has(entity)) continue;
    seen.add(entity);
    const sentence = `${entity} receives ${clause.replace(/\s+/g, " ").replace(/[.,]+$/g, "")}.`;
    out.push({ entity, amounts, sentence });
  }
  return out;
}

export function partyRevenueSharesFromIntake(intake: string): PartyRevenueShare[] {
  const out: PartyRevenueShare[] = [];
  const seen = new Set<string>();
  SHARE_LINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SHARE_LINE_RE.exec(intake || ""))) {
    const entity = normalizeEntity(match[1] || "");
    const percent = (match[2] || "").trim();
    if (!entity || !percent || seen.has(entity)) continue;
    seen.add(entity);
    out.push({ entity, percent });
  }
  return out;
}

export function windowsForEntity(text: string, entity: string): string[] {
  const name = normalizeEntity(entity);
  if (!name) return [];
  const pieces = (text || "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const windows: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    if (!pieces[i]!.includes(name)) continue;
    windows.push(pieces[i]!);
    if (pieces[i + 1]) windows.push(`${pieces[i]} ${pieces[i + 1]}`);
    if (i > 0) windows.push(`${pieces[i - 1]} ${pieces[i]}`);
  }
  return windows;
}

export function entityBoundTo(text: string, entity: string, cue: RegExp): boolean {
  return windowsForEntity(text, entity).some((window) => cue.test(window));
}

function indexesOf(text: string, needle: string): number[] {
  const out: number[] = [];
  const name = needle || "";
  if (!name) return out;
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(name, from);
    if (idx < 0) break;
    out.push(idx);
    from = idx + name.length;
  }
  return out;
}

function cueIndexes(text: string, cue: RegExp): number[] {
  const flags = cue.flags.includes("g") ? cue.flags : `${cue.flags}g`;
  const global = new RegExp(cue.source, flags);
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = global.exec(text))) {
    out.push(match.index);
    if (match[0].length === 0) global.lastIndex += 1;
  }
  return out;
}

function isSentenceBoundary(text: string, index: number): boolean {
  const ch = text[index];
  if (ch === "\n") return true;
  if (ch !== "." && ch !== "!" && ch !== "?") return false;
  const next = text[index + 1];
  if (next != null && !/\s/.test(next)) return false;
  if (
    ch === "." &&
    /(?:\bInc|\bLtd|\bCorp|\bCo|\bLLC|\bL\.L\.C|\bMr|\bDr|\bMs|\bU\.S)$/i.test(text.slice(Math.max(0, index - 8), index))
  ) {
    return false;
  }
  return true;
}

function sentenceBoundsAt(text: string, index: number): { start: number; end: number } {
  const hay = text || "";
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (isSentenceBoundary(hay, i)) {
      start = i + 1;
      break;
    }
  }
  let end = hay.length;
  for (let i = index; i < hay.length; i += 1) {
    if (isSentenceBoundary(hay, i)) {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

/** The legal entity nearest this cue in the same sentence. Rejects swapped allocations. */
export function closestEntityToCue(
  text: string,
  entities: readonly string[],
  cue: RegExp,
): string | null {
  const hay = text || "";
  const cueAt = cueIndexes(hay, cue);
  if (!cueAt.length) return null;
  const votes = new Map<string, number>();
  for (const at of cueAt) {
    const { start, end } = sentenceBoundsAt(hay, at);
    const clauseStart = Math.max(start, hay.lastIndexOf(",", at) + 1);
    const nextComma = hay.indexOf(",", at);
    const clauseEnd = nextComma >= 0 && nextComma < end ? nextComma : end;
    const clauseHits = entities.filter((entity) =>
      indexesOf(hay, entity).some((idx) => idx >= clauseStart && idx < clauseEnd),
    );
    let winner: string | null = clauseHits.length === 1 ? clauseHits[0]! : null;
    if (!winner) {
      let best = Number.POSITIVE_INFINITY;
      for (const entity of entities) {
        for (const idx of indexesOf(hay, entity)) {
          const entityEnd = idx + entity.length;
          if (entityEnd <= start || idx >= end) continue;
          const dist =
            at >= idx && at < entityEnd ? 0 : Math.min(Math.abs(idx - at), Math.abs(entityEnd - at));
          if (dist < best) {
            best = dist;
            winner = entity;
          }
        }
      }
    }
    if (winner) votes.set(winner, (votes.get(winner) || 0) + 1);
  }
  if (!votes.size) return null;
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export function cueAssignedToExpectedEntity(
  text: string,
  expected: string,
  entities: readonly string[],
  cue: RegExp,
): boolean {
  return closestEntityToCue(text, entities, cue) === expected;
}

function replaceDocumentSection(doc: string, section: string, next: string): string {
  const start = doc.indexOf(section);
  if (start < 0) return doc;
  const after = doc.slice(start + section.length);
  const gluedHeading = /^(?:\d{1,2})\.(?!\d)\s+\S/.test(after);
  const sep = gluedHeading && !/\n$/.test(next) ? "\n\n" : "";
  return `${doc.slice(0, start)}${next}${sep}${after}`;
}

function appendPaymentSentence(section: string, sentence: string): string {
  const next = section.replace(/\s+$/g, "");
  const spacer = next && !/[.!?]$/.test(next) ? ". " : next ? " " : "";
  return `${next}${spacer}${sentence}`.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * If intake binds amounts to named parties, keep those sentences in the
 * payment section. Do not invent who pays.
 */
export function preservePartyEconomicRelationshipsInPaymentSection(
  documentText: string,
  intakeText: string,
): string {
  const allocations = partyReceiveAllocationsFromIntake(intakeText);
  const shares = partyRevenueSharesFromIntake(intakeText);
  if (!allocations.length && !shares.length) return documentText;
  const doc = (documentText || "").replace(/\r\n/g, "\n");
  const section = paymentSectionText(doc);
  if (!section.trim()) return doc;
  let next = section;
  for (const row of allocations) {
    const amountCue = new RegExp(row.amounts[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!entityBoundTo(next, row.entity, amountCue)) {
      next = appendPaymentSentence(next, row.sentence);
    }
  }
  for (const row of shares) {
    const cue = new RegExp(`\\b${row.percent}\\s*%`);
    if (!entityBoundTo(next, row.entity, cue)) {
      next = appendPaymentSentence(next, `${row.entity} receives ${row.percent}% of customer subscription revenue.`);
    }
  }
  if (next === section) return doc;
  return replaceDocumentSection(doc, section, next);
}

export function paymentSectionHasUnboundListedAmounts(documentText: string, intakeText: string): boolean {
  const allocations = partyReceiveAllocationsFromIntake(intakeText);
  if (!allocations.length) return false;
  const section = paymentSectionText(documentText || "");
  return allocations.some((row) => {
    const amountCue = new RegExp(row.amounts[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return !entityBoundTo(section || documentText, row.entity, amountCue);
  });
}

export { NEXT_TOP_LEVEL_HEADING_RE };
