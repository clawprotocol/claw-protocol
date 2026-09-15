/**
 * Restore a declared Consultant/Client opening and execution headings when a
 * later display/hydration pass rebuilt index-default Client/Service Provider paper.
 * Does not invent parties or rewrite frozen operative clauses.
 */

import { executionTailBindsPartyNames, partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";

export function corpusDeclaresConsultantClientOpening(text: string): boolean {
  const head = openingSlice((text || "").replace(/\r\n/g, "\n"));
  return /\(\s*["']?Consultant["']?\s*\)/i.test(head) && /\(\s*["']?Client["']?\s*\)/i.test(head);
}

function openingSlice(text: string): string {
  const sec1 = text.search(/^\s*1\.\s+(?!\d)/m);
  return sec1 >= 0 ? text.slice(0, sec1) : text.slice(0, 2_500);
}

function legalBoundToRole(opening: string, role: string): string | null {
  const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = opening.match(
    new RegExp(
      `\\b([A-Z][A-Za-z0-9&.'’\\-]*(?:\\s+[A-Z][A-Za-z0-9&.'’\\-]*)*(?:\\s+(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Ltd\\.?))?)\\s*\\(\\s*["'“”‘’]?${escaped}["'“”‘’]?\\s*\\)`,
      "i",
    ),
  );
  const name = match?.[1]?.replace(/\s+/g, " ").trim();
  return name && name.length >= 2 ? name : null;
}

function remapInvertedConsultantExecutionHeadings(text: string, sourceOpening: string): string {
  const consultant = legalBoundToRole(sourceOpening, "Consultant");
  const client = legalBoundToRole(sourceOpening, "Client");
  if (!consultant || !client) return text;
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness < 0) return text;
  const head = text.slice(0, witness);
  let tail = text.slice(witness);
  const consultantEsc = consultant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const clientEsc = client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  tail = tail.replace(
    new RegExp(`^(\\s*)CLIENT\\s*:\\s*${consultantEsc}\\s*$`, "im"),
    `$1CONSULTANT:\n${consultant}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)CLIENT\\s*:\\s*\\n\\s*${consultantEsc}\\s*$`, "im"),
    `$1CONSULTANT:\n${consultant}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)SERVICE\\s+PROVIDER\\s*:\\s*${clientEsc}\\s*$`, "im"),
    `$1CLIENT:\n${client}`,
  );
  tail = tail.replace(
    new RegExp(`^(\\s*)SERVICE\\s+PROVIDER\\s*:\\s*\\n\\s*${clientEsc}\\s*$`, "im"),
    `$1CLIENT:\n${client}`,
  );
  return `${head}${tail}`;
}

/** Keep an already-bound Consultant/Client + Advisor tail instead of rebuilding it. */
export function shouldPreserveApprovedAddedPartyExecutionTail(
  corpus: string,
  names: readonly string[] = [],
): boolean {
  if (names.length !== 3) return false;
  if (!corpusDeclaresConsultantClientOpening(corpus)) return false;
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = corpus.slice(witnessIdx);
  if (!/^\s*CONSULTANT\s*:/im.test(tail) || !/^\s*CLIENT\s*:/im.test(tail) || !/^\s*ADVISOR\s*:/im.test(tail)) {
    return false;
  }
  const advisorEntity =
    tail
      .slice(tail.search(/^\s*ADVISOR\s*:/im))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)[1] || "";
  const advisorWords = advisorEntity.split(/\s+/);
  if (
    advisorWords.length < 2 ||
    advisorWords.length > 4 ||
    advisorWords.some((word) => !/^[A-Z][A-Za-z'-]+$/.test(word)) ||
    /\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?)\b/i.test(advisorEntity)
  ) {
    return false;
  }
  if (names.length >= 2 && !executionTailBindsPartyNames(corpus, names)) return false;
  return true;
}

/**
 * Display-only: fill blank execution-tail Name: lines from persisted signer names.
 * Matches the entity line already on the paper — does not rebuild headings or
 * rewrite the accepted digest.
 */
export function fillBlankPreservedAddedPartySignerNames(
  corpus: string,
  parties: readonly { partyLegalName?: string; signerName?: string; name?: string }[],
): string {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return corpus;
  const named = parties
    .map((party) => ({
      legal: String(party.partyLegalName ?? party.name ?? "").trim(),
      signer: String(party.signerName ?? "").trim(),
    }))
    .filter((party) => party.legal.length >= 2 && party.signer.length >= 2);
  if (!named.length) return corpus;

  const head = corpus.slice(0, witnessIdx);
  const lines = corpus.slice(witnessIdx).split("\n");
  let currentSigner = "";
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    const entity = trimmed.replace(/:\s*$/, "");
    const match = named.find((party) => partyLegalNamesMatch(entity, party.legal));
    if (match) {
      currentSigner = match.signer;
      continue;
    }
    const nameLine = (lines[i] ?? "").match(/^(\s*)Name:\s*(.*)$/i);
    if (!nameLine || !currentSigner) continue;
    const value = (nameLine[2] ?? "").trim();
    if (value && !/^_{2,}$/.test(value)) continue;
    lines[i] = `${nameLine[1]}Name: ${currentSigner}`;
  }
  return `${head}${lines.join("\n")}`;
}

/** Keep a declared Consultant/Client opening and CONSULTANT execution tail when a later pass rebuilt Client/SP. */
export function restoreDeclaredConsultantClientPaper(current: string, accepted: string): string {
  const source = (accepted || "").replace(/\r\n/g, "\n");
  let out = (current || "").replace(/\r\n/g, "\n");
  if (!source.trim() || !out.trim()) return current;
  const sourceSec1 = source.search(/^\s*1\.\s+(?!\d)/m);
  const outSec1 = out.search(/^\s*1\.\s+(?!\d)/m);
  const sourceHead = openingSlice(source);
  if (!/\(\s*["']?Consultant["']?\s*\)/i.test(sourceHead)) return current;
  if (outSec1 >= 0 && sourceSec1 >= 0 && !/\(\s*["']?Consultant["']?\s*\)/i.test(out.slice(0, outSec1))) {
    out = `${source.slice(0, sourceSec1).trimEnd()}\n\n${out.slice(outSec1).trimStart()}`;
  }
  const sourceWitness = source.search(/\bIN WITNESS WHEREOF\b/i);
  const outWitness = out.search(/\bIN WITNESS WHEREOF\b/i);
  if (
    sourceWitness >= 0 &&
    outWitness >= 0 &&
    /^\s*CONSULTANT\s*:/im.test(source.slice(sourceWitness)) &&
    !/^\s*CONSULTANT\s*:/im.test(out.slice(outWitness))
  ) {
    out = `${out.slice(0, outWitness).trimEnd()}\n\n${source.slice(sourceWitness).trimStart()}`;
  } else {
    out = remapInvertedConsultantExecutionHeadings(out, sourceHead);
  }
  return out;
}
