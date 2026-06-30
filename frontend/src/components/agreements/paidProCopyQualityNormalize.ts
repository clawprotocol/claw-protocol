/**
 * Deterministic Pro copy repairs for malformed premium server bodies (TEST480).
 */

import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";

export type PaidProCopyQualityNormalizeResult = {
  text: string;
  repairs: string[];
};

const STANDALONE_ALL_CAPS_HEADING_RE = /^\s*[A-Z][A-Z0-9\s/&-]{3,80}\s*$/;
const PAYMENT_MICRO_FRAGMENT_RE =
  /^\s*(?:Commission|rate:|Trigger:|earned|Exclusions:|house|timing:)\s*$/i;
const LAWS_OF_PAREN_JURISDICTION_RE = /\blaws of\s*\(\s*([A-Za-z .]+?)\s*\)/gi;

function repairStandaloneAllCapsMidDocumentHeadings(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const lines = head.split("\n");
  const out: string[] = [];
  let pendingNumber: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      pendingNumber = numbered[1]!;
      out.push(lines[i]!);
      continue;
    }
    if (
      STANDALONE_ALL_CAPS_HEADING_RE.test(trimmed) &&
      trimmed.length >= 6 &&
      !/^(?:SERVICES AGREEMENT|MUTUAL|IN WITNESS|IF TO)\b/.test(trimmed)
    ) {
      const prev = out[out.length - 1]?.trim() ?? "";
      const next = lines[i + 1]?.trim() ?? "";
      const sandwiched =
        /^\d+\.\s+/.test(prev) &&
        (/^\d+\.\s+/.test(next) || /^\d+\.\d+\s+/.test(next) || /^[a-z(]/.test(next));
      if (sandwiched) {
        const attachNum = pendingNumber ?? String(out.filter((l) => /^\d+\.\s+/.test(l.trim())).length + 1);
        out.push(`${attachNum}. ${trimmed.replace(/\s+/g, " ")}`);
        repairs.push(`standalone_all_caps_heading:${trimmed.slice(0, 32)}`);
        continue;
      }
    }
    out.push(lines[i]!);
  }

  const joined = `${out.join("\n")}${tail}`;
  return repairs.length ? { text: joined, repairs } : { text, repairs };
}

function repairPaymentMicroFragments(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!PAYMENT_MICRO_FRAGMENT_RE.test(trimmed)) {
      out.push(lines[i]!);
      continue;
    }
    const next = lines[i + 1]?.trim() ?? "";
    if (!next) {
      out.push(lines[i]!);
      continue;
    }
    const glue = trimmed.endsWith(":") ? `${trimmed} ${next}` : `${trimmed}: ${next}`;
    out.push(glue);
    repairs.push(`payment_micro_fragment:${trimmed}`);
    i += 1;
  }
  return repairs.length ? { text: out.join("\n"), repairs } : { text, repairs };
}

function repairParentheticalJurisdiction(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const next = text.replace(LAWS_OF_PAREN_JURISDICTION_RE, (_m, jurisdiction: string) => {
    repairs.push(`jurisdiction_paren:${jurisdiction.trim()}`);
    return `laws of ${jurisdiction.trim()}`;
  });
  return repairs.length ? { text: next, repairs } : { text, repairs };
}

/** Normalize malformed Pro premium copy without changing substantive legal meaning. */
export function normalizePaidProCopyQuality(text: string): PaidProCopyQualityNormalizeResult {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n").trim();
  if (!out) return { text: out, repairs };

  const split = repairSplitPaidProHeadingFragments(out);
  if (split.repairs.length) {
    out = split.text;
    repairs.push(...split.repairs);
  }

  const payment = repairPaymentMicroFragments(out);
  if (payment.repairs.length) {
    out = payment.text;
    repairs.push(...payment.repairs);
  }

  const caps = repairStandaloneAllCapsMidDocumentHeadings(out);
  if (caps.repairs.length) {
    out = caps.text;
    repairs.push(...caps.repairs);
  }

  const jurisdiction = repairParentheticalJurisdiction(out);
  if (jurisdiction.repairs.length) {
    out = jurisdiction.text;
    repairs.push(...jurisdiction.repairs);
  }

  out = out.replace(/\n{3,}/g, "\n\n");
  return { text: out, repairs: [...new Set(repairs)] };
}
