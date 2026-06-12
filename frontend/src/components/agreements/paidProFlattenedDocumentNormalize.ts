/**
 * Repair flattened Pro server bodies for review display and acceptance:
 * - isolate embedded section headings into their own blocks
 * - strip stale server "SIGNATURES The parties have caused…" tails before LawDog witness blocks
 */

import { stripPreWitnessExecutionPollutionFromPrefix } from "./paidProExecutionBlockNormalization";

function expandInlineSignatureMarkersToLines(prefix: string): string {
  return prefix
    .replace(/\s+(\bSIGNATURES\b\s+The\s+parties)/gi, "\n\n$1")
    .replace(/\s+(\bSIGNATURES\b\s*:)/gi, "\n\n$1")
    .replace(/\s+(\bCLIENT\s*:)/gi, "\n$1")
    .replace(/\s+(\bSERVICE\s+PROVIDER\s*:)/gi, "\n$1")
    .replace(/\s+(By\s*:)/gi, "\n$1")
    .replace(/\s+(Name\s*:)/gi, "\n$1")
    .replace(/\s+(Title\s*:)/gi, "\n$1")
    .replace(/\s+(Date\s*:)/gi, "\n$1");
}

/** Insert paragraph breaks before glued title / numbered section headings. */
export function normalizeFlattenedPaidProDocumentBlocks(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n").trim();
  if (!out) return { text: out, repairs };

  const before = out;

  out = out.replace(
    /^([A-Z][A-Z0-9\s/&—–'()-]{4,80})\s+(This\s+(?:Services\s+)?Agreement\b)/,
    "$1\n\n$2",
  );

  out = out.replace(
    /([.!?)"])\s+(\d+\.\s+(?!\d+\.\d)(?:[A-Z][^\n]{2,160}?))(?=\s+\d+(?:\.\d+)?\s+)/g,
    "$1\n\n$2",
  );

  out = out.replace(/([a-z0-9])\s+(\d+\.\s+(?!\d+\.\d)[A-Z][A-Za-z])/g, "$1\n\n$2");

  // "1. Services and Scope 1.1 Services" → main heading + subsection on separate blocks.
  out = out.replace(
    /(\d+\.\s+(?!\d+\.\d)(?:[A-Za-z][^\n]{2,160}?))\s+(\d+\.\d+\s+)/g,
    "$1\n\n$2",
  );

  out = out.replace(/(\d+\.\d+\s+[^.\n]{4,220}?\.?)\s+(\d+\.\d+\s+)/g, "$1\n\n$2");

  out = out.replace(/(\d+\.\d+\s+[^.\n]{4,220}?\.?)\s+(\d+\.\s+(?!\d+\.\d))/g, "$1\n\n$2");

  if (out !== before) repairs.push("normalize:flattened_section_breaks");
  out = out.replace(/\n{3,}/g, "\n\n");
  return { text: out, repairs };
}

/**
 * Remove server-generated signature tails (SIGNATURES / CLIENT: / SERVICE PROVIDER: with By: lines)
 * that appear before the canonical LawDog IN WITNESS WHEREOF block.
 */
export function stripInlineStaleServerSignatureTailBeforeWitness(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = working.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return { text: working.trim(), repairs };

  const tail = working.slice(witnessIdx);
  let prefix = working.slice(0, witnessIdx);
  const minPos = Math.max(0, Math.floor(working.length * 0.25));

  const expanded = expandInlineSignatureMarkersToLines(prefix);
  if (expanded !== prefix) {
    repairs.push("normalize:expand_inline_signature_markers");
    prefix = expanded;
  }

  const stalePatterns = [
    /(?:^|\n)\s*SIGNATURES\b\s+The\s+parties\s+have\s+caused[\s\S]*$/i,
    /\bSIGNATURES\b\s+The\s+parties\s+have\s+caused[\s\S]*$/i,
    /(?:^|\n)\s*SIGNATURES\b[\s\S]*?\bSERVICE\s+PROVIDER\s*:[\s\S]*$/i,
  ];
  for (const re of stalePatterns) {
    const m = prefix.match(re);
    if (m && m.index != null && m.index >= minPos && /\bBy\s*:/i.test(m[0])) {
      prefix = prefix.slice(0, m.index).trimEnd();
      repairs.push("strip:inline_stale_server_signature_block");
      break;
    }
  }

  const lineStrip = stripPreWitnessExecutionPollutionFromPrefix(prefix);
  if (lineStrip.repairs.length > 0) {
    prefix = lineStrip.text;
    repairs.push(...lineStrip.repairs);
  }

  const merged = `${prefix}\n\n${tail}`.replace(/\n{3,}/g, "\n\n").trim();
  return { text: merged, repairs: [...new Set(repairs)] };
}

/** Display + acceptance prep: section breaks then stale signature tail removal. */
export function preparePaidProReviewDisplayPlain(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const norm = normalizeFlattenedPaidProDocumentBlocks(text);
  let out = norm.text;
  repairs.push(...norm.repairs);
  const stripped = stripInlineStaleServerSignatureTailBeforeWitness(out);
  out = stripped.text;
  repairs.push(...stripped.repairs);
  return { text: out, repairs: [...new Set(repairs)] };
}
