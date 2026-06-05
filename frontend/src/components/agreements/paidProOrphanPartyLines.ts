/**
 * Remove bare legal-entity lines stranded between general provisions and
 * Section 12 / IN WITNESS WHEREOF (signature-stub / manifest leakage).
 */

import { PARTY_ENTITY_SUFFIX_RE } from "./canonicalPartyIdentityResolver";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";

const EXECUTION_TAIL_BOUNDARY_RE =
  /^\s*(?:IN WITNESS WHEREOF\b|\d{1,2}\.\s+[A-Z][A-Z\s/&-]{2,})/i;

export type RemoveOrphanPartyLinesResult = {
  text: string;
  detected: boolean;
  removedLines: string[];
  repairs: string[];
};

function normalizePartyKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, "");
}

function buildPartyNameSet(partyLegalNames: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of partyLegalNames) {
    const t = (raw || "").trim();
    if (t.length < 3 || !isAuthoritativeLegalEntityName(t)) continue;
    out.add(normalizePartyKey(t));
  }
  return out;
}

function lineIsStandaloneOrphanPartyLine(line: string, partyNames: ReadonlySet<string>): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 160) return false;
  if (!PARTY_ENTITY_SUFFIX_RE.test(trimmed)) return false;
  if (/^\d+\.\s/.test(trimmed)) return false;
  if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:/i.test(trimmed)) return false;
  if (/^(?:BY|NAME|TITLE|EMAIL|ADDRESS|DATE)\s*:/i.test(trimmed)) return false;
  if (/_{2,}/.test(trimmed)) return false;
  if (/\b(?:shall|will|may|must|agrees?|between|entered)\b/i.test(trimmed)) return false;
  return partyNames.has(normalizePartyKey(trimmed));
}

function lineIsSubstantiveContext(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\d+\.\d+\s/.test(t)) return true;
  if (/^\d+\.\s+[A-Z]/.test(t)) return true;
  if (t.length >= 48) return true;
  if (t.endsWith(".") && t.length >= 20 && /\b(?:shall|will|may|must|agrees?|effective|binding|governs)\b/i.test(t)) {
    return true;
  }
  return /\b(?:counterpart|severab|governing law|electronic\s+signatures?|entire agreement|amendment)\b/i.test(t);
}

function substantiveContextAboveOrphans(lines: string[], firstOrphanIndex: number): string {
  let k = firstOrphanIndex - 1;
  for (let step = 0; k >= 0 && step < 14; step += 1, k -= 1) {
    const t = (lines[k] ?? "").trim();
    if (!t) continue;
    if (lineIsSubstantiveContext(t)) return t;
  }
  return "";
}

function lineCharOffset(lines: string[], lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    offset += (lines[i] ?? "").length + 1;
  }
  return offset;
}

function snippetAround(text: string, charOffset: number): string {
  const start = Math.max(0, charOffset - 72);
  const end = Math.min(text.length, charOffset + 96);
  return text.slice(start, end).replace(/\r\n/g, "↵").replace(/\n/g, "↵");
}

function logOrphanPartyLineDiagnostics(args: {
  surface: string;
  detected: boolean;
  removedLines: string[];
  beforeHash: string;
  afterHash: string;
  firstOffset: number | null;
  surroundingSnippet: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  const payload = {
    surface: args.surface,
    count: args.removedLines.length,
    removedLines: args.removedLines.slice(0, 8),
    beforeHash: args.beforeHash,
    afterHash: args.afterHash,
    firstOffset: args.firstOffset,
    surroundingSnippet: args.surroundingSnippet,
  };
  if (args.detected && args.removedLines.length > 0) {
    if (
      shouldLogPaidProAuthoritySurfaceEvent({
        event: "orphan-party-lines-removed",
        surface: args.surface,
        hash: args.afterHash,
        source: "orphan_party_lines",
        payloadSignature: JSON.stringify(args.removedLines),
      })
    ) {
      // eslint-disable-next-line no-console
      console.info("[orphan-party-lines-detected]", payload);
      // eslint-disable-next-line no-console
      console.info("[orphan-party-lines-removed]", payload);
    }
    return;
  }
  if (
    args.detected &&
    shouldLogPaidProAuthoritySurfaceEvent({
      event: "orphan-party-lines-detected",
      surface: args.surface,
      hash: args.beforeHash,
      source: "orphan_party_lines",
      payloadSignature: "detected-no-remove",
    })
  ) {
    // eslint-disable-next-line no-console
    console.info("[orphan-party-lines-detected]", { ...payload, count: 0 });
  }
}

/**
 * Strip consecutive standalone party-entity lines that sit immediately before
 * a numbered tail section (e.g. 12. ACCEPTANCE…) or IN WITNESS WHEREOF.
 */
export function removeOrphanPartyLinesBeforeExecutionTail(
  text: string,
  partyLegalNames: readonly string[],
  opts?: { surface?: string },
): RemoveOrphanPartyLinesResult {
  const surface = opts?.surface ?? "orphan_party_lines";
  const partySet = buildPartyNameSet(partyLegalNames);
  if (partySet.size < 2) {
    return { text, detected: false, removedLines: [], repairs: [] };
  }

  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const beforeHash = hashPaidProCorpus(normalized);
  const lines = normalized.split("\n");
  const removedLines: string[] = [];
  let firstRemovedIndex: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const boundaryTrimmed = (lines[i] ?? "").trim();
    if (!boundaryTrimmed || !EXECUTION_TAIL_BOUNDARY_RE.test(boundaryTrimmed)) continue;

    let j = i - 1;
    while (j >= 0 && !(lines[j] ?? "").trim()) j -= 1;

    const orphanIndices: number[] = [];
    while (j >= 0) {
      const lt = (lines[j] ?? "").trim();
      if (!lt) {
        j -= 1;
        continue;
      }
      if (lineIsStandaloneOrphanPartyLine(lt, partySet)) {
        orphanIndices.unshift(j);
        j -= 1;
        continue;
      }
      break;
    }
    if (orphanIndices.length === 0) continue;

    const contextLine =
      substantiveContextAboveOrphans(lines, orphanIndices[0]) ||
      (j >= 0 ? (lines[j] ?? "").trim() : "");
    if (!contextLine || !lineIsSubstantiveContext(contextLine)) continue;

    for (const idx of orphanIndices) {
      const removed = (lines[idx] ?? "").trim();
      if (removed) removedLines.push(removed);
      lines[idx] = "";
      if (firstRemovedIndex == null) firstRemovedIndex = idx;
    }
  }

  const detected = removedLines.length > 0;
  const repairs = detected ? ["orphan_party_lines:pre_execution_tail"] : [];
  const out = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const afterHash = hashPaidProCorpus(out);

  const firstOffset =
    firstRemovedIndex != null ? lineCharOffset(lines, firstRemovedIndex) : null;
  logOrphanPartyLineDiagnostics({
    surface,
    detected: detected || removedLines.length > 0,
    removedLines,
    beforeHash,
    afterHash,
    firstOffset,
    surroundingSnippet: firstOffset != null ? snippetAround(normalized, firstOffset) : null,
  });

  return { text: out, detected, removedLines, repairs };
}
