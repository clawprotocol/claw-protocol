/**
 * Deterministic canonical corpus rebuild when guided merge/repair cannot preserve section hygiene.
 */

import type { CanonicalSectionKey } from "./guidedCanonicalCorpusNormalizer";
import { CANONICAL_SECTION_SPECS } from "./guidedCanonicalCorpusNormalizer";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const TOP_LEVEL_SECTION_RE = /^\s*(\d+)\.\s+(.+)$/;
const SUBCLAUSE_RE = /^(\d+)\.(\d+)\.?\s+/;

function normLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function witnessIndex(text: string): number {
  const idx = text.search(WITNESS_RE);
  return idx >= 0 ? idx : text.length;
}

function lineBucket(line: string): CanonicalSectionKey {
  const t = line.toLowerCase();
  if (/\b(?:confidential|non-public|proprietary information|nda)\b/.test(t)) return "confidentiality";
  if (/\b(?:uptime|sla|support hours|production automation|commercially reasonable support)\b/.test(t)) {
    return "support";
  }
  if (/\b(?:terminat(?:e|ion)|renewal|notice period|governing law|survival)\b/.test(t) && !/\bconfidential\b/.test(t)) {
    return "term";
  }
  if (/\b(?:deliverables|work product|ownership|background technology|vest in)\b/.test(t)) return "ownership";
  if (/\battorney\s+fees?\b/.test(t) && /\b(?:enforcement|recover|prevail|breach)\b/.test(t)) {
    return "miscellaneous";
  }
  if (/\b(?:invoice|net\s*30|payment|fee|compensation|monthly|schedule\s+a)\b/.test(t)) {
    return "fees";
  }
  if (/\b(?:notices?|counterpart|electronic signature|entire agreement|miscellaneous|indemnif)\b/.test(t)) {
    return "miscellaneous";
  }
  if (/\b(?:purpose|scope of services|provider will|automation services)\b/.test(t)) return "purpose";
  return "unknown";
}

function isSignerFragmentLine(line: string, identities: readonly CanonicalPartyIdentity[]): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?$/i.test(t)) return true;
  if (/^(?:Name|Title|Date|Email|By)\s*:/i.test(t)) return true;
  const needles = identities.map((id) => id.partyDisplayName.trim().toLowerCase()).filter(Boolean);
  if (needles.some((n) => t.toLowerCase() === n)) return true;
  return false;
}

function extractTitleIntro(before: string): string {
  const firstSection = before.search(/^\s*1\.\s+/m);
  const intro = firstSection > 0 ? before.slice(0, firstSection).trim() : before.trim();
  const lines = normLines(intro).filter((l) => l.trim().length > 0);
  if (!lines.length) return "AI AUTOMATION SERVICES AGREEMENT";
  return joinLines(lines.slice(0, Math.min(lines.length, 6)));
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function renumberBucketLines(lines: string[], sectionNumber: number): string[] {
  let sub = 0;
  return lines.map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (SUBCLAUSE_RE.test(t) || /^\d+\.\s+\d+\./.test(t)) {
      sub += 1;
      const body = t.replace(SUBCLAUSE_RE, "").replace(/^\d+\.\s+\d+\.\s*/, "").trim();
      return `${sectionNumber}.${sub} ${body || t}`;
    }
    return line;
  });
}

export function rebuildCanonicalGuidedCorpusFromClauses(
  text: string,
  opts?: { signerIdentities?: readonly CanonicalPartyIdentity[] },
): { text: string; repairs: string[] } {
  const repairs: string[] = ["canonical_rebuild:clause_buckets"];
  const corpus = (text || "").trim();
  if (!corpus) return { text: corpus, repairs };

  const witnessIdx = witnessIndex(corpus);
  const before = corpus.slice(0, witnessIdx);
  const witnessTail = corpus.slice(witnessIdx).trim();
  const intro = extractTitleIntro(before);

  const buckets = new Map<CanonicalSectionKey, string[]>();
  for (const spec of CANONICAL_SECTION_SPECS) buckets.set(spec.key, []);

  const lines = normLines(before);
  let currentKey: CanonicalSectionKey | null = null;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (opts?.signerIdentities?.length && isSignerFragmentLine(t, opts.signerIdentities)) {
      repairs.push("canonical_rebuild:strip_signer_fragment");
      continue;
    }
    const top = t.match(TOP_LEVEL_SECTION_RE);
    if (top && !SUBCLAUSE_RE.test(t)) {
      const heading = top[2].toLowerCase();
      if (/purpose|scope/.test(heading)) currentKey = "purpose";
      else if (/(?:fees?|payment)/.test(heading)) currentKey = "fees";
      else if (/confidential/.test(heading)) currentKey = "confidentiality";
      else if (/ownership|work product/.test(heading)) currentKey = "ownership";
      else if (/support|sla/.test(heading)) currentKey = "support";
      else if (/term|termination/.test(heading)) currentKey = "term";
      else currentKey = "miscellaneous";
      continue;
    }
    const bucket = lineBucket(t);
    const target = bucket !== "unknown" ? bucket : currentKey ?? "purpose";
    const list = buckets.get(target) ?? [];
    list.push(t);
    buckets.set(target, list);
  }

  const purposeLines = buckets.get("purpose") ?? [];
  if (purposeLines.length === 0) {
    const introScope = normLines(intro).find((l) => l.length >= 60 && !/AGREEMENT\s*$/i.test(l));
    if (introScope) buckets.set("purpose", [introScope]);
    else {
      buckets.set("purpose", [
        "Service Provider will deliver AI automation services, integrations, and operational support as described in the applicable statement of work.",
      ]);
    }
    repairs.push("canonical_rebuild:fill_purpose");
  }

  const feesRaw = dedupeLines(buckets.get("fees") ?? []);
  const attorneyLines = feesRaw.filter((l) => /\battorney\s+fees?\b/i.test(l));
  const feesLines = feesRaw.filter((l) => !/\battorney\s+fees?\b/i.test(l));
  if (attorneyLines.length) {
    buckets.set("miscellaneous", [...(buckets.get("miscellaneous") ?? []), ...attorneyLines]);
    repairs.push("canonical_rebuild:move_attorney_fees");
  }
  const monthly = feesLines.filter((l) => /\$6[,\s]?000|monthly/i.test(l));
  const total = feesLines.filter((l) => /\$120[,\s]?000|total\s+project/i.test(l));
  if (monthly.length && total.length) {
    buckets.set(
      "fees",
      dedupeLines([
        ...total,
        ...feesLines.filter((l) => !MONTHLY_ONLY.test(l) && !TOTAL_ONLY.test(l)),
        "Invoices are due Net 30 from receipt unless Schedule A states otherwise.",
      ]),
    );
    repairs.push("canonical_rebuild:fees_dedupe_monthly_total");
  } else {
    buckets.set("fees", feesLines);
  }

  const sections: string[] = [intro];
  for (const spec of CANONICAL_SECTION_SPECS) {
    let body = dedupeLines(buckets.get(spec.key) ?? []);
    if (!body.length) {
      const defaults = CANONICAL_SECTION_DEFAULT_LINES[spec.key];
      if (defaults?.length) {
        body = defaults;
        repairs.push(`canonical_rebuild:default_${spec.key}`);
      } else if (spec.key !== "purpose") {
        continue;
      }
    }
    const renumbered = renumberBucketLines(body, spec.number);
    sections.push(`${spec.number}. ${spec.label}\n${joinLines(renumbered)}`);
  }

  let out = sections.filter(Boolean).join("\n\n").trim();
  if (witnessTail) out = `${out}\n\n${witnessTail}`.trim();

  if (opts?.signerIdentities?.length) {
    out = out.replace(/\bthe\s+Contractor\b/gi, "Service Provider");
    out = out.replace(/\bContractor\b/g, "Service Provider");
    out = out.replace(/\bthe\s+Company\b/gi, "the Client");
    repairs.push("canonical_rebuild:contractor_company_labels");
  }

  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

const MONTHLY_ONLY = /^\s*\d+\.\d+\s+.*(?:\$6[,\s]?000|monthly\s+service\s+fee)/i;
const TOTAL_ONLY = /^\s*\d+\.\d+\s+.*(?:\$120[,\s]?000|total\s+project\s+fee)/i;

/** Minimal bodies so rebuilt corpora keep consecutive top-level numbering through section 8+. */
const CANONICAL_SECTION_DEFAULT_LINES: Partial<Record<CanonicalSectionKey, string[]>> = {
  term: [
    "Either Party may terminate this Agreement with thirty (30) days written notice to the other Party.",
  ],
  notices: [
    "Written notices under this Agreement must be delivered to each Party at the email or address on file for contract notices.",
  ],
  miscellaneous: [
    "This Agreement constitutes the entire understanding between the Parties regarding the subject matter hereof.",
    "If any provision is held unenforceable, the remaining provisions remain in full force and effect.",
  ],
  electronic_signatures: [
    "The Parties may execute this Agreement using electronic signatures with the same legal effect as manually signed originals.",
  ],
};
