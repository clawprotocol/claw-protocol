import { signaturePatchStartIndex } from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  extractRoleEntityNamesFromPortableRoles,
  isEntityLegalNameHeadingLine,
  isWitnessBlockMarkerLine,
  partyIndexAtWitnessLine,
} from "./vs01ExecutionBlockHeading";

/** Scan start for witness execution stamping — prefer final witness/entity block cluster. */
export function resolveWitnessExecutionScanStart(corpusPlain: string): number {
  const len = corpusPlain.length;
  const tailGuard = Math.floor(len * 0.45);
  const lines = corpusPlain.split("\n");

  let clusterTopIdx = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]!.trim();
    if (isEntityLegalNameHeadingLine(trimmed)) {
      clusterTopIdx = clusterTopIdx < 0 ? i : Math.min(clusterTopIdx, i);
      continue;
    }
    if (clusterTopIdx < 0) continue;
    if (!trimmed) continue;
    if (/^(?:By|Name|Title|Date|Signature)\s*:/i.test(trimmed)) continue;
    if (isWitnessBlockMarkerLine(trimmed)) {
      clusterTopIdx = Math.min(clusterTopIdx, i);
      break;
    }
    break;
  }

  const entityClusterStart =
    clusterTopIdx < 0
      ? -1
      : clusterTopIdx === 0
        ? 0
        : lines.slice(0, clusterTopIdx).join("\n").length + 1;

  let witnessStart = -1;
  const witnessMatches = [...corpusPlain.matchAll(/\bIN WITNESS WHEREOF\b/gi)];
  for (let i = witnessMatches.length - 1; i >= 0; i -= 1) {
    const idx = witnessMatches[i]!.index ?? -1;
    if (idx >= tailGuard) {
      witnessStart = idx;
      break;
    }
  }
  if (witnessStart < 0 && witnessMatches.length > 0) {
    witnessStart = witnessMatches[witnessMatches.length - 1]!.index ?? -1;
  }

  if (entityClusterStart >= tailGuard && entityClusterStart > witnessStart) {
    return entityClusterStart;
  }
  if (witnessStart >= 0) return witnessStart;
  if (entityClusterStart >= tailGuard) return entityClusterStart;
  return signaturePatchStartIndex(corpusPlain);
}

/** Locale-aware display for witness-block Date lines (signer local date at signing time). */
export function formatSigningDateDisplayFromIso(iso: string, locale?: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function witnessDateLineIsBlank(trimmed: string): boolean {
  if (!/^date\s*:/i.test(trimmed)) return false;
  const value = trimmed.replace(/^date\s*:\s*/i, "").trim();
  return !value || /_{2,}/.test(value);
}

/**
 * Stamp one party's witness-block Date line after that party signs.
 * Does not mutate other parties' date lines or prefill before signing.
 */
export function stampWitnessBlockPartySigningDate(
  corpusPlain: string,
  partyIndex: number,
  signingDateIso: string,
  roleEntityNames?: readonly string[],
): { text: string; stamped: boolean } {
  const iso = signingDateIso.trim() || new Date().toISOString().slice(0, 10);
  const display = formatSigningDateDisplayFromIso(iso);
  if (!display) return { text: corpusPlain, stamped: false };

  const stampIn = (text: string): { text: string; stamped: boolean } => {
    const patchStart = resolveWitnessExecutionScanStart(text);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      if (lineStart < patchStart) continue;

      const trimmed = lines[i]!.trim();
      if (!witnessDateLineIsBlank(trimmed)) continue;

      const idx = partyIndexAtWitnessLine(lines, i, patchStart, roleEntityNames);
      if (idx !== partyIndex) continue;

      const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
      lines[i] = `${indent}Date: ${display}`;
      return { text: lines.join("\n"), stamped: true };
    }
    return stampNthBlankWitnessDate(text, partyIndex, display);
  };

  return stampWithTailFallback(corpusPlain, stampIn);
}

function witnessByLineIsBlank(trimmed: string): boolean {
  if (!/^by\s*:/i.test(trimmed)) return false;
  const value = trimmed.replace(/^by\s*:\s*/i, "").trim();
  return !value || /_{2,}/.test(value);
}

function stampNthBlankWitnessBy(
  corpusPlain: string,
  partyIndex: number,
  signatureText: string,
): { text: string; stamped: boolean } {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  let blankByIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    if (!witnessByLineIsBlank(trimmed)) continue;
    blankByIndex += 1;
    if (blankByIndex !== partyIndex) continue;
    const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
    lines[i] = `${indent}By: ${signatureText.trim()}`;
    return { text: lines.join("\n"), stamped: true };
  }
  return { text: corpusPlain, stamped: false };
}

function stampNthBlankWitnessDate(
  corpusPlain: string,
  partyIndex: number,
  display: string,
): { text: string; stamped: boolean } {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  let blankDateIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    if (!witnessDateLineIsBlank(trimmed)) continue;
    blankDateIndex += 1;
    if (blankDateIndex !== partyIndex) continue;
    const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
    lines[i] = `${indent}Date: ${display}`;
    return { text: lines.join("\n"), stamped: true };
  }
  return { text: corpusPlain, stamped: false };
}

function stampWithTailFallback(
  corpusPlain: string,
  stampFull: (text: string) => { text: string; stamped: boolean },
): { text: string; stamped: boolean } {
  const primary = stampFull(corpusPlain);
  if (primary.stamped) return primary;
  if (corpusPlain.length < 8000) return primary;
  const tailLen = Math.min(corpusPlain.length, 8000);
  const offset = corpusPlain.length - tailLen;
  const tail = corpusPlain.slice(offset);
  const tailStamp = stampFull(tail);
  if (!tailStamp.stamped) return primary;
  return { text: corpusPlain.slice(0, offset) + tailStamp.text, stamped: true };
}

/**
 * Stamp one party's witness-block By line with the signer's adopted signature text.
 */
export function stampWitnessBlockPartySignature(
  corpusPlain: string,
  partyIndex: number,
  signatureText: string,
  roleEntityNames?: readonly string[],
): { text: string; stamped: boolean } {
  const sig = signatureText.trim();
  if (!sig) return { text: corpusPlain, stamped: false };

  const stampIn = (text: string): { text: string; stamped: boolean } => {
    const patchStart = resolveWitnessExecutionScanStart(text);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      if (lineStart < patchStart) continue;
      const trimmed = lines[i]!.trim();
      if (!witnessByLineIsBlank(trimmed)) continue;
      const idx = partyIndexAtWitnessLine(lines, i, patchStart, roleEntityNames);
      if (idx !== partyIndex) continue;
      const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
      lines[i] = `${indent}By: ${sig}`;
      return { text: lines.join("\n"), stamped: true };
    }
    return stampNthBlankWitnessBy(text, partyIndex, sig);
  };

  return stampWithTailFallback(corpusPlain, stampIn);
}

/**
 * Reset filled witness-block By/Date lines to blank placeholders before audit replay.
 * Preserves Name/Title and clause body — execution overlay only.
 */
export function stripWitnessExecutionOverlays(corpusPlain: string): string {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
    if (/^by\s*:/i.test(trimmed) && !witnessByLineIsBlank(trimmed)) {
      lines[i] = `${indent}By: ______________________________`;
    } else if (/^date\s*:/i.test(trimmed) && !witnessDateLineIsBlank(trimmed)) {
      lines[i] = `${indent}Date: ______________________________`;
    }
  }
  return lines.join("\n");
}

/** True when witness-block By: line for partyIndex is filled (prior signer completed). */
export function witnessBlockPartyHasFilledSignature(
  corpusPlain: string,
  partyIndex: number,
  roleEntityNames?: readonly string[],
): boolean {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    if (!/^by\s*:/i.test(trimmed)) continue;
    const value = trimmed.replace(/^by\s*:\s*/i, "").trim();
    if (!value || /_{2,}/.test(value)) continue;
    const idx = partyIndexAtWitnessLine(lines, i, patchStart, roleEntityNames);
    if (idx === partyIndex) return true;
  }
  return false;
}

function countSignedWitnessBlocksAt(
  corpusPlain: string,
  roleEntityNames?: readonly string[],
): { signed: number; total: number } {
  const patchStart = resolveWitnessExecutionScanStart(corpusPlain);
  const lines = corpusPlain.split("\n");
  const partyBySigned = new Map<number, { by: boolean; date: boolean }>();

  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    const partyIndex = partyIndexAtWitnessLine(lines, i, patchStart, roleEntityNames);
    const entry = partyBySigned.get(partyIndex) ?? { by: false, date: false };
    if (/^by\s*:/i.test(trimmed) && !witnessByLineIsBlank(trimmed)) entry.by = true;
    if (/^date\s*:/i.test(trimmed) && !witnessDateLineIsBlank(trimmed)) entry.date = true;
    partyBySigned.set(partyIndex, entry);
  }

  const blocks = [...partyBySigned.values()];
  return {
    total: blocks.length,
    signed: blocks.filter((b) => b.by && b.date).length,
  };
}

/** Count witness blocks with filled By + Date lines (fully executed when signed === total). */
export function countSignedWitnessBlocks(
  corpusPlain: string,
  roleEntityNames?: readonly string[],
): { signed: number; total: number } {
  const primary = countSignedWitnessBlocksAt(corpusPlain, roleEntityNames);
  if (primary.total >= 4 || corpusPlain.length < 8000) return primary;
  const tail = corpusPlain.slice(-Math.min(corpusPlain.length, 8000));
  const tailCount = countSignedWitnessBlocksAt(tail, roleEntityNames);
  return {
    total: Math.max(primary.total, tailCount.total),
    signed: Math.max(primary.signed, tailCount.signed),
  };
}

export { extractRoleEntityNamesFromPortableRoles };
