import { signaturePatchStartIndex } from "../components/agreements/guidedDealCompletion/signatureRegion";

const PARTY_BLOCK_HEADING_RE =
  /^\s*(?:CLIENT|SERVICE\s+PROVIDER|PROVIDER|COUNTERPARTY|PARTY\s+\d+)\s*:?\s*$/i;

/** Locale-aware display for witness-block Date lines (signer local date at signing time). */
export function formatSigningDateDisplayFromIso(iso: string, locale?: string): string {
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

function partyIndexAtLine(lines: readonly string[], lineIndex: number, patchStart: number): number {
  let partyIndex = -1;
  let offset = 0;
  for (let i = 0; i <= lineIndex; i += 1) {
    if (offset < patchStart) {
      offset += lines[i]!.length + 1;
      continue;
    }
    const trimmed = lines[i]!.trim();
    if (PARTY_BLOCK_HEADING_RE.test(trimmed)) {
      partyIndex += 1;
    }
    offset += lines[i]!.length + 1;
  }
  return Math.max(0, partyIndex);
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
): { text: string; stamped: boolean } {
  const iso = signingDateIso.trim() || new Date().toISOString().slice(0, 10);
  const display = formatSigningDateDisplayFromIso(iso);
  if (!display) return { text: corpusPlain, stamped: false };

  const patchStart = signaturePatchStartIndex(corpusPlain);
  const lines = corpusPlain.split("\n");
  let stamped = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (lineStart < patchStart) continue;

    const trimmed = lines[i]!.trim();
    if (!witnessDateLineIsBlank(trimmed)) continue;

    const idx = partyIndexAtLine(lines, i, patchStart);
    if (idx !== partyIndex) continue;

    const indent = lines[i]!.match(/^\s*/)?.[0] ?? "";
    lines[i] = `${indent}Date: ${display}`;
    stamped = true;
    break;
  }

  return { text: lines.join("\n"), stamped };
}
